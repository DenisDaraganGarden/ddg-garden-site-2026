import * as THREE from 'three';

// Optical defects belong to the photograph of the whole scene, not to the
// paper material. Their coordinates and seed stay fixed while a sheet moves.
export class ScenePhoto {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.uniforms = {
      image: { value: this.target.texture }, dust: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      grain: { value: settings.photoGrain }, grainSize: { value: settings.photoGrainSize },
      aberration: { value: settings.aberration }, dustOpacity: { value: settings.dustOpacity },
      vignette: { value: settings.lensVignette }, seed: { value: settings.opticalSeed }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: /* glsl */`
        #include <common>
        varying vec2 vUv;
        uniform sampler2D image, dust;
        uniform vec2 resolution;
        uniform float grain, grainSize, aberration, dustOpacity, vignette, seed;
        float hashPhoto(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
          q+=dot(q,q.yzx+33.33+seed);return fract((q.x+q.y)*q.z);
        }
        float grainPhoto(vec2 p) {
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hashPhoto(i),hashPhoto(i+vec2(1.,0.)),f.x),
            mix(hashPhoto(i+vec2(0.,1.)),hashPhoto(i+1.),f.x),f.y)-.5;
        }
        void main(){
          vec2 radial=vUv-.5;
          vec2 offset=radial*dot(radial,radial)*8.*aberration/resolution;
          vec3 c=vec3(texture2D(image,clamp(vUv+offset,0.,1.)).r,
            texture2D(image,vUv).g,texture2D(image,clamp(vUv-offset,0.,1.)).b);
          float alpha=texture2D(image,vUv).a;
          gl_FragColor=vec4(c/max(alpha,.0001),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb=mix(vec3(1.),gl_FragColor.rgb,alpha);
          float n=grainPhoto(vUv*resolution/max(.4,grainSize));
          gl_FragColor.rgb+=n*grain*.15;
          float mark=texture2D(dust,vUv).a*dustOpacity;
          gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.035),mark);
          float edge=smoothstep(.05,.52,dot(radial,radial));
          gl_FragColor.rgb*=1.-edge*vignette*.5;
          gl_FragColor.rgb=clamp(gl_FragColor.rgb,0.,1.);
        }`
    });
    this.quadScene = new THREE.Scene();
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.quadCamera = new THREE.Camera();
    this.width = this.height = this.viewWidth = 1;
    this.update(settings);
  }

  resize(width, height, viewWidth) {
    this.width = width; this.height = height; this.viewWidth = viewWidth;
    const ratio = this.renderer.getPixelRatio();
    this.target.setSize(Math.round(width * ratio), Math.round(height * ratio));
    this.target.viewport.set(0, 0, Math.round(viewWidth * ratio), Math.round(height * ratio));
    this.uniforms.resolution.value.set(width, height);
    this.update(this.settings);
  }

  update(settings) {
    this.settings = settings;
    for (const [uniform, key] of [['grain','photoGrain'],['grainSize','photoGrainSize'],
      ['aberration','aberration'],['dustOpacity','dustOpacity'],['vignette','lensVignette'],['seed','opticalSeed']]) {
      this.uniforms[uniform].value = settings[key];
    }
    // Keep the authored desktop lens; colour fringes must stay subtle on a phone.
    if (matchMedia('(pointer:coarse)').matches) this.uniforms.aberration.value *= .2;
    const key = JSON.stringify([this.width,this.height,settings.opticalSeed,settings.dustDensity,
      settings.dustSize,settings.lensFibres,settings.fibreLength]);
    if (key === this.dustKey) return;
    this.dustKey = key;
    let state = Math.round(settings.opticalSeed * 7919) >>> 0;
    const random = () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1.5,this.renderer.getPixelRatio());
    canvas.width = Math.max(1,Math.round(this.width*ratio)); canvas.height = Math.max(1,Math.round(this.height*ratio));
    const ctx = canvas.getContext('2d'); ctx.scale(ratio,ratio);
    const area = this.width*this.height/900000;
    for (let i=0;i<Math.round(140*settings.dustDensity*area);i++) {
      const x=random()*this.width,y=random()*this.height,r=settings.dustSize*(.22+random()*.8);
      ctx.fillStyle=`rgba(0,0,0,${.3+random()*.65})`;
      ctx.beginPath();ctx.ellipse(x,y,r,r*(.55+random()*.45),random()*Math.PI,0,Math.PI*2);ctx.fill();
    }
    // Curved, tapered lint. The same seed makes a stationary lens overlay,
    // with length in screen pixels independent of the book's physical scale.
    for (let i=0;i<Math.round(55*settings.lensFibres*area);i++) {
      const x=random()*this.width,y=random()*this.height,a=random()*Math.PI*2;
      const length=settings.fibreLength*(.35+random()*.85),bend=(random()-.5)*length*.45;
      ctx.save();ctx.translate(x,y);ctx.rotate(a);
      ctx.strokeStyle=`rgba(0,0,0,${.35+random()*.5})`;ctx.lineWidth=.35+random()*.4;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-length*.5,0);ctx.bezierCurveTo(-length*.2,bend,length*.2,-bend,length*.5,0);ctx.stroke();ctx.restore();
    }
    this.uniforms.dust.value?.dispose();
    this.uniforms.dust.value = new THREE.CanvasTexture(canvas);
  }

  render(scene, camera) {
    const renderer = this.renderer;
    // Keep the studio backdrop truly white; it is not an exposed surface.
    const background=scene.background,clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
    scene.background=null;renderer.setClearColor(0x000000,0);
    renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(scene,camera);
    const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
    scene.background=background;renderer.setClearColor(clearColor,clearAlpha);
    renderer.setRenderTarget(null); renderer.setViewport(0,0,this.width,this.height);
    renderer.render(this.quadScene,this.quadCamera);
    renderer.setViewport(0,0,this.viewWidth,this.height);
    return {calls:calls+renderer.info.render.calls,triangles:triangles+renderer.info.render.triangles};
  }
}
