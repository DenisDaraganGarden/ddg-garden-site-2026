'use strict';
(() => {
  const source = '/p06-i01-1600.webp';
  const still = document.querySelector('#french-manor img');
  if (!still?.getAttribute('src').endsWith(source)) return;
  const controllers = [];
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userChoice = false;

  function mount(hero, image, controls, owner = null) {
  hero.classList.add('living-manor-stage');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const button = document.createElement('button');
  button.className = 'manor-motion';
  button.hidden = true;
  const motionControls = document.createElement('div');
  motionControls.className = 'manor-motion-controls';
  controls.append(motionControls);
  motionControls.append(button);
  const canvas = document.createElement('canvas');
  canvas.className = 'living-manor';
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
  // This pass displaces the existing photograph; no generated colour is shown.
  // Solid architecture is distant and excluded from the wind region.
  const fragment = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_photo;
    uniform sampler2D u_control;
    uniform vec2 u_crop;
    uniform vec2 u_camera;
    uniform float u_time;
    uniform float u_arrival;
    float depthAt(vec2 uv) { return texture2D(u_control, uv).r; }
    float bell(vec2 p, vec2 center, vec2 size) {
      vec2 d = (p - center) / size;
      return exp(-dot(d, d) * 2.);
    }
    void main() {
      vec2 uv = (vec2(v_uv.x, 1. - v_uv.y) - .5) * u_crop + .5;
      vec2 drift = vec2(sin(u_time * .19) * .36, sin(u_time * .13 + .7) * .18);
      vec2 view = (u_camera + drift) * vec2(.020, .013) * u_arrival;
      vec2 q = uv;
      for (int i = 0; i < 3; ++i) q = uv + view * (depthAt(q) - .27);
      float depth = depthAt(q);
      // Flowers of every colour move together. The clipped hedge and house stay solid.
      float flowers = smoothstep(.54, .71, q.y) * smoothstep(.48, .78, depth);
      float gust = .55 + .45 * sin(u_time * .43 + q.x * 4. - q.y * 2.);
      float stem = sin(u_time * 1.03 + q.x * 22. + q.y * 7.);
      float leaf = sin(u_time * 2.05 + q.x * 106. - q.y * 52.);
      float rooted = 1. - smoothstep(.93, 1.02, q.y);
      q += vec2((stem * .8 + leaf * .2) * .0014, stem * .00025)
        * flowers * rooted * gust * u_arrival;
      vec3 color = texture2D(u_photo, q).rgb;
      float phase = mod(u_time + 1., 17.) - 3. - depth * 4.6;
      float pulse = exp(-phase * phase / 4.) * u_arrival;
      float warmLight = bell(q, vec2(.35, .78), vec2(.70, .50));
      float highlights = smoothstep(.16, .60, dot(color, vec3(.22,.70,.08)));
      float dapple = sin(q.x * 62. + q.y * 43. + u_time * .41)
        * sin(q.x * 25. - q.y * 35. - u_time * .27);
      float exposure = pulse * warmLight * highlights * .22
        + dapple * .027 * flowers * highlights * u_arrival;
      vec3 linear = pow(max(color, vec3(0.)), vec3(2.2));
      linear *= exp2(exposure);
      gl_FragColor = vec4(pow(linear, vec3(1. / 2.2)), 1.);
    }
  `;

  let renderer = null, loading = null, failed = false;
  let visible = false, pageActive = true, dialogOpen = false;
  let frame = 0, last = 0, elapsed = 0;
  let pointerX = 0, pointerY = 0, cameraX = 0, cameraY = 0;
  let releaseTouch = 0;
  const resources = [];
  const tilt = window.LivingTilt?.attach(motionControls, {
    onEnable: () => {userChoice = true; paused = false; controllers.forEach(update => update());},
  });
  const asset = name => new URL(`./assets/${name}`, location.href).href;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Living manor asset did not load'));
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
      loadImage(asset('p06-i01-1600.webp')),
      loadImage(asset('manor-depth.webp')),
    ]);
    if (gl.isContextLost()) throw new Error('Living manor context was lost');
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
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Living manor texture could not be uploaded');
      gl.uniform1i(gl.getUniformLocation(program, ['u_photo', 'u_control'][i]), i);
    }
    const uniforms = Object.fromEntries(['u_crop', 'u_camera', 'u_time', 'u_arrival']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    const aspect = images[0].naturalWidth / images[0].naturalHeight;
    return {
      resize() {
        const availableWidth = hero.clientWidth, availableHeight = hero.clientHeight;
        const width = Math.min(availableWidth, availableHeight * aspect);
        const height = width / aspect;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.style.left = (availableWidth - width) / 2 + 'px';
        canvas.style.top = (availableHeight - height) / 2 + 'px';
        const budget = coarse.matches ? 1100000 : 2200000;
        const ratio = Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(budget / (width * height)));
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        // The whole portrait remains contained, with 3.5% movement overscan.
        gl.uniform2f(uniforms.u_crop, 1. / 1.035, 1. / 1.035);
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
    const matches = image.getAttribute('src')?.endsWith(source);
    button.hidden = failed || !matches || (owner && !owner.open);
    if (!matches) hero.classList.remove('has-living-manor');
    else if (renderer && !failed) hero.classList.add('has-living-manor');
    const canRun = matches && visible && pageActive && !document.hidden && !dialogOpen && !paused;
    tilt?.update(canRun && !failed, !failed && matches && (!owner || owner.open));
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
      hero.classList.add('has-living-manor');
      sync();
    }).catch(error => {
      fail();
      console.warn('Living manor uses the still image:', error.message);
    });
  }
  function fail() {
    failed = true;
    renderer = null;
    stop();
    hero.classList.remove('has-living-manor');
    hero.dataset.motion = 'unavailable';
    button.hidden = true;
    tilt?.update(false, false);
    resources.splice(0).forEach(dispose => dispose());
  }
  function move(event) {
    if (paused || !visible || event.target.closest('.manor-motion,.tilt-toggle,a') || !event.isPrimary) return;
    const box = canvas.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - .5) * 2.));
    pointerY = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - .5) * 2.));
  }
  function release() {
    clearTimeout(releaseTouch);
    releaseTouch = setTimeout(() => {pointerX = 0; pointerY = 0;}, 1200);
  }
  button.addEventListener('click', () => {
    userChoice = true;
    paused = !paused;
    controllers.forEach(update => update());
  });
  hero.addEventListener('pointermove', move, {passive: true});
  hero.addEventListener('pointerdown', event => {clearTimeout(releaseTouch); move(event);}, {passive: true});
  hero.addEventListener('pointerup', release, {passive: true});
  hero.addEventListener('pointercancel', release, {passive: true});
  hero.addEventListener('pointerleave', () => {pointerX = 0; pointerY = 0;}, {passive: true});
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].intersectionRatio > .1;
    sync();
  }, {root: owner ? null : document.querySelector('.folio'), threshold: [0, .1]});
  observer.observe(hero);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => {pageActive = false; sync();});
  window.addEventListener('pageshow', () => {pageActive = true; sync();});
  new ResizeObserver(() => {
    if (renderer && visible) {renderer.resize(); renderer.draw();}
  }).observe(hero);
  new MutationObserver(() => {
    dialogOpen = owner ? !owner.open : !!document.querySelector('dialog[open]');
    sync();
  }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open', 'src']});
  reduced.addEventListener('change', () => {
    if (!userChoice) paused = reduced.matches;
    controllers.forEach(update => update());
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
  controllers.push(sync);
  sync();
  }

  mount(still.closest('.image-open'), still, document.querySelector('#french-manor .work-tools'));
  const viewer = document.querySelector('.image-dialog');
  mount(viewer.querySelector('.image-canvas'), viewer.querySelector('img'), viewer, viewer);
})();
