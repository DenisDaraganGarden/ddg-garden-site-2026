'use strict';
(() => {
  const hero = document.querySelector('.hero');
  const image = hero?.querySelector('.hero-image');
  // These depth and occlusion maps belong to this photograph only. The editor
  // can choose a different cover; that cover must keep its normal still image.
  if (!image || !image.getAttribute('src').endsWith('/p04-i01-1600.webp')) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const button = document.createElement('button');
  button.className = 'cover-motion';
  button.hidden = true;
  hero.append(button);
  const canvas = document.createElement('canvas');
  canvas.className = 'living-cover';
  canvas.setAttribute('aria-hidden', 'true');
  image.after(canvas);

  const vertex = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * .5 + .5;
      gl_Position = vec4(a_position, 0., 1.);
    }
  `;
  const fragment = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_photo;
    uniform sampler2D u_control;
    uniform sampler2D u_under;
    uniform vec2 u_crop;
    uniform vec2 u_camera;
    uniform float u_time;
    uniform float u_arrival;

    // Control channels: R = near depth, G = inpaint region, B = original tree.
    vec3 control(vec2 p) { return texture2D(u_control, p).rgb; }
    float backgroundDepth(vec2 p) {
      vec3 c = control(p);
      return mix(c.r, .34, c.g);
    }
    vec2 projectBackground(vec2 p, vec2 view) {
      vec2 q = p;
      // Small view changes preserve the authored composition. Iteration keeps
      // depth contours attached to the photographed surfaces.
      for (int i = 0; i < 3; ++i) q = p + view * (backgroundDepth(q) - .23);
      return q;
    }
    vec3 background(vec2 p) {
      float removal = smoothstep(.015, .45, control(p).g);
      return mix(texture2D(u_photo, p).rgb, texture2D(u_under, p).rgb, removal);
    }
    float bell(vec2 p, vec2 center, vec2 size) {
      vec2 d = (p - center) / size;
      return exp(-dot(d, d) * 2.);
    }
    void main() {
      vec2 screen = vec2(v_uv.x, 1. - v_uv.y);
      vec2 uv = screen * u_crop + (1. - u_crop) * vec2(.52, .5);
      vec2 drift = vec2(sin(u_time * .19) * .34, sin(u_time * .13 + .7) * .18);
      vec2 view = (u_camera + drift) * u_crop * vec2(.024, .015) * u_arrival;
      vec2 q = projectBackground(uv, view);
      vec3 still = background(q);

      // Only green foliage bends. The path and the trunk have no wind warp.
      float green = smoothstep(.045, .23, still.g * 2. - still.r - still.b);
      float crown = 1. - smoothstep(.23, .43, q.y);
      float fern = smoothstep(.59, .9, q.y)
        * smoothstep(.19, .38, q.x) * (1. - smoothstep(.78, .92, q.x));
      float gust = .55 + .45 * sin(u_time * .43 + q.x * 5. - q.y * 3.);
      float branch = sin(u_time * 1.07 + q.x * 27. + q.y * 9.);
      float leaf = sin(u_time * 2.18 + q.x * 118. - q.y * 67.);
      float wind = green * (crown * .85 + fern) * u_arrival;
      vec2 bend = vec2((branch * .7 + leaf * .3) * .00125, branch * .00028)
        * wind * gust;
      vec2 plantUV = q + bend;
      vec3 color = background(plantUV);
      float depth = backgroundDepth(plantUV);

      // The tree's colour is sampled from the untouched source, not generated.
      // Its base is fixed to the planting plane; only the fine upper wood yields.
      vec2 treeUV = uv + view * (.60 - .23);
      float tip = clamp((.65 - treeUV.y) / .52, 0., 1.);
      treeUV.x += sin(u_time * .62) * .00025 * tip * tip * u_arrival;
      float tree = smoothstep(.08, .8, control(treeUV).b);
      color = mix(color, texture2D(u_photo, treeUV).rgb, tree);
      depth = mix(depth, .60, tree);

      // One slow, irregular light wave travels from the opening toward us.
      // Work in linear light so the original greens retain their character.
      float cycle = mod(u_time + 1., 17.);
      float waveTime = cycle - 2.8 - depth * 4.6;
      float pulse = exp(-waveTime * waveTime / 3.2) * u_arrival;
      float opening = bell(uv, vec2(.555, .28), vec2(.23, .37));
      float passage = bell(uv, vec2(.565, .60), vec2(.12, .32));
      float litLeaf = smoothstep(.13, .55, dot(color, vec3(.22, .70, .08)));
      float dapple = sin(q.x * 93. + q.y * 57. + u_time * .48)
        * sin(q.x * 31. - q.y * 46. - u_time * .31);
      float light = pulse * (.30 * opening + .20 * passage + .065 * green)
        + dapple * .033 * (crown + fern) * litLeaf * u_arrival;
      vec3 linear = pow(max(color, vec3(0.)), vec3(2.2));
      linear *= exp2(light);
      linear += vec3(.58, .47, .25) * pulse * opening * (1. - depth) * .011;
      gl_FragColor = vec4(pow(linear, vec3(1. / 2.2)), 1.);
    }
  `;

  let renderer = null, loading = null, failed = false;
  let visible = false, pageActive = true, dialogOpen = false;
  let paused = reduced.matches, userChoice = false;
  let frame = 0, last = 0, elapsed = 0;
  let pointerX = 0, pointerY = 0, cameraX = 0, cameraY = 0;
  let releaseTouch = 0;
  const resources = [];
  const tilt = window.LivingTilt?.attach(hero, {
    className: 'cover-tilt',
    onEnable: () => {userChoice = true; paused = false; sync();},
  });
  const asset = name => new URL(`./assets/${name}`, location.href).href;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Living cover asset did not load'));
      img.src = url;
    });
  }

  async function createRenderer() {
    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL is unavailable');
    const shader = (type, source) => {
      const item = gl.createShader(type);
      gl.shaderSource(item, source);
      gl.compileShader(item);
      if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(item);
        gl.deleteShader(item);
        throw new Error(message);
      }
      return item;
    };
    const vs = shader(gl.VERTEX_SHADER, vertex);
    const fs = shader(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    resources.push(() => gl.deleteProgram(program));
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    resources.push(() => gl.deleteBuffer(buffer));

    const images = await Promise.all([
      loadImage(asset('hero-garden.jpg')),
      loadImage(asset('hero-control.webp')),
      loadImage(asset('hero-under-tree.webp')),
    ]);
    if (gl.isContextLost()) throw new Error('Living cover context was lost');
    for (const [i, img] of images.entries()) {
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (img.naturalWidth > maxSize || img.naturalHeight > maxSize) throw new Error('Source exceeds texture capacity');
      const texture = gl.createTexture();
      resources.push(() => gl.deleteTexture(texture));
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // WebGL 1 also supports the non-power-of-two source at its native size.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Living cover texture could not be uploaded');
      gl.uniform1i(gl.getUniformLocation(program, ['u_photo', 'u_control', 'u_under'][i]), i);
    }
    const uniforms = Object.fromEntries(['u_crop', 'u_camera', 'u_time', 'u_arrival']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    const aspect = images[0].naturalWidth / images[0].naturalHeight;
    return {
      resize() {
        const width = hero.clientWidth, height = hero.clientHeight;
        const budget = coarse.matches ? 1100000 : 2200000;
        const ratio = Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(budget / (width * height)));
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        const viewAspect = width / height;
        // A small guard area prevents exposing an edge during camera movement.
        gl.uniform2f(uniforms.u_crop,
          Math.min(1, viewAspect / aspect) / 1.035,
          Math.min(1, aspect / viewAspect) / 1.035);
      },
      draw() {
        gl.uniform2f(uniforms.u_camera, cameraX, cameraY);
        gl.uniform1f(uniforms.u_time, elapsed);
        gl.uniform1f(uniforms.u_arrival, Math.min(1, elapsed / 2.4));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, .06) : 0;
    // Respect both phone batteries and high-refresh desktop displays.
    const interval = (coarse.matches ? 1000 / 30 : 1000 / 60) - .75;
    if (last && now - last < interval) return;
    last = now;
    elapsed += dt;
    const follow = 1. - Math.exp(-dt * 3.2);
    const inclination = tilt?.read();
    cameraX += ((inclination ? inclination.x : pointerX) - cameraX) * follow;
    cameraY += ((inclination ? inclination.y : pointerY) - cameraY) * follow;
    renderer.draw();
  }
  function updateButton() {
    button.textContent = paused ? 'Движение ▶' : 'Движение Ⅱ';
    button.setAttribute('aria-label', paused ? 'Оживить сад' : 'Приостановить движение сада');
    button.setAttribute('aria-pressed', String(!paused));
  }
  function sync() {
    stop();
    updateButton();
    const canRun = visible && pageActive && !document.hidden && !dialogOpen && !paused;
    tilt?.update(canRun && !failed, !failed);
    hero.dataset.motion = failed ? 'unavailable' : paused ? 'paused' : canRun ? 'playing' : 'sleeping';
    if (failed || !canRun) return;
    if (renderer) {
      renderer.resize();
      renderer.draw();
      frame = requestAnimationFrame(tick);
      return;
    }
    if (loading) return;
    hero.dataset.motion = 'loading';
    loading = createRenderer().then(result => {
      renderer = result;
      result.resize();
      result.draw();
      hero.classList.add('has-living-cover');
      sync();
    }).catch(error => {
      fail();
      console.warn('Living cover uses the still image:', error.message);
    });
  }
  function fail() {
    failed = true;
    renderer = null;
    stop();
    hero.classList.remove('has-living-cover');
    hero.dataset.motion = 'unavailable';
    button.hidden = true;
    tilt?.update(false, false);
    resources.splice(0).forEach(dispose => dispose());
  }
  function move(event) {
    if (paused || !visible || event.target.closest('button,a') || !event.isPrimary) return;
    const box = hero.getBoundingClientRect();
    pointerX = ((event.clientX - box.left) / box.width - .5) * 2.;
    pointerY = ((event.clientY - box.top) / box.height - .5) * 2.;
  }
  function release() {
    clearTimeout(releaseTouch);
    releaseTouch = setTimeout(() => {pointerX = 0; pointerY = 0;}, 1200);
  }
  button.addEventListener('click', () => {
    userChoice = true;
    paused = !paused;
    sync();
  });
  hero.addEventListener('pointermove', move, {passive: true});
  hero.addEventListener('pointerdown', event => {clearTimeout(releaseTouch); move(event);}, {passive: true});
  hero.addEventListener('pointerup', release, {passive: true});
  hero.addEventListener('pointercancel', release, {passive: true});
  hero.addEventListener('pointerleave', () => {pointerX = 0; pointerY = 0;}, {passive: true});
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].intersectionRatio > .1;
    sync();
  }, {root: document.querySelector('.folio'), threshold: [0, .1]});
  observer.observe(hero);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => {pageActive = false; sync();});
  window.addEventListener('pageshow', () => {pageActive = true; sync();});
  new ResizeObserver(() => {
    if (renderer && visible) {renderer.resize(); renderer.draw();}
  }).observe(hero);
  new MutationObserver(() => {
    dialogOpen = !!document.querySelector('dialog[open]');
    sync();
  }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open']});
  reduced.addEventListener('change', () => {
    if (!userChoice) paused = reduced.matches;
    sync();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fail();
  });
  // If context recovery is possible, rebuild the textures in the restored one.
  canvas.addEventListener('webglcontextrestored', () => {
    failed = false;
    renderer = null;
    loading = null;
    button.hidden = false;
    sync();
  });
  button.hidden = false;
  updateButton();
})();
