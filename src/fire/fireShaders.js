import * as THREE from 'three';
import { TRAIL_TEXELS } from './trail.js';

// Пламя и дым — по образцу брызг прибоя (water/spray.js): тысячи квадратов,
// у каждого один атрибут — номер. Вся жизнь частицы — замкнутая функция
// номера и часов: где на горящей полосе она родилась, когда, куда поднялась.
// Никакой симуляции, буферов и чтения назад; стоп-кадр лаборатории и пауза
// редактора работают сами собой. Шум читается в мировых координатах, чтобы
// соседние частицы сливались в одно тело, а не стояли двумя дисками.
//
// Бюджет: три уровня по тиру устройства. Число живых частиц — от длины
// горящей полосы, не от расстояния: далёкий костёр рисуется теми же
// частицами, но пиксельный пол не даёт им пропасть.
export const FIRE_TIERS = Object.freeze({
  low: { flamePool: 1024, smokePool: 384, flameRate: 30, smokeRate: 3, minPx: 3 },
  medium: { flamePool: 2560, smokePool: 768, flameRate: 60, smokeRate: 5, minPx: 2.5 },
  high: { flamePool: 6144, smokePool: 1536, flameRate: 110, smokeRate: 9, minPx: 2.5 },
});
export const FLAME_CYCLE = 1.25; // секунд: самая долгая жизнь языка пламени

// Сколько частиц держать живыми: рождаемость на метр полосы в секунду ×
// средняя жизнь в секундах. Полоса для дыма — та, что горела за его жизнь,
// поэтому дым не пропадает в миг, когда гаснет последний язык.
export function fireInstanceCount({ band, rate, life, pool, width = 0.55, amount = 1 }) {
  if (!(band > 0) || !(amount > 0) || !(life > 0)) return 0;
  const lanes = THREE.MathUtils.clamp(width / 0.55, 0.5, 2.5);
  return Math.min(pool, Math.round(band * rate * life * lanes * amount));
}

// Полоса, горевшая за последние `life` секунд: от хвоста тех времён до фронта.
export function burntBand({ front, tail, speed, life }) {
  if (!(front > 0)) return 0;
  return Math.max(0, front - Math.max(0, tail - speed * life));
}

export function buildParticleGeometry(pool) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geometry.setAttribute('aId', new THREE.InstancedBufferAttribute(Float32Array.from({ length: pool }, (_, i) => i), 1));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geometry;
}

export const fireNoiseShader = /* glsl */`
float fireHash(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float fireHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fireNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fireHash2(i), fireHash2(i + vec2(1.0, 0.0)), f.x), mix(fireHash2(i + vec2(0.0, 1.0)), fireHash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fireFbm(vec2 p) { return fireNoise(p) * 0.6 + fireNoise(p * 2.13 + 7.7) * 0.28 + fireNoise(p * 4.7 + 3.1) * 0.12; }
// След по длине дуги: два соседних текселя и линейная смесь между ними.
vec4 trailAt(sampler2D trail, float u, float len) {
  float t = clamp(u / max(len, 0.001), 0.0, 1.0) * ${(TRAIL_TEXELS - 1).toFixed(1)};
  float i = floor(t);
  vec4 a = texture2D(trail, vec2((i + 0.5) / ${TRAIL_TEXELS.toFixed(1)}, 0.5));
  vec4 b = texture2D(trail, vec2((min(i + 1.0, ${(TRAIL_TEXELS - 1).toFixed(1)}) + 0.5) / ${TRAIL_TEXELS.toFixed(1)}, 0.5));
  return mix(a, b, t - i);
}
`;

// Общая вершинная половина: пламя без SMOKE, дым с ним.
export const particleVertexShader = /* glsl */`
attribute float aId;
uniform sampler2D uTrail;
uniform float uLength;
uniform float uSpeed;
uniform float uBurn;
uniform float uT;            // секунд с поджига в этом цикле; отрицательное — ещё не горит
uniform float uTime;
uniform float uCycle;
uniform float uWidth;
uniform float uHeight;
uniform float uTurbulence;
uniform vec3 uWind;
uniform float uRise;
uniform float uSize;
uniform float uOpacity;
uniform float uViewport;
uniform float uMinPx;
varying vec2 vQuad;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vView;
varying float vRadius;
varying float vOpacity;
varying float vSpan;
varying float vSeed;
varying float vDetail;
#include <fog_pars_vertex>
${fireNoiseShader}
void main() {
  vQuad = position.xy * 2.0;
  float ph = fireHash(aId * 0.6180339887) * uCycle;
  float t0 = uTime - ph;
  float age = mod(t0, uCycle);
  float cycle = floor(t0 / uCycle);
  float seed = fireHash(aId * 0.6180339887 + cycle * 7.7771 + 1.0);
  float life = uCycle * mix(0.55, 1.0, fireHash(seed + 3.1));
  // Полоса горения в момент рождения — теми же формулами, что fireFront в
  // trail.js (birthBand): фронт бежит и останавливается на конце, хвост идёт
  // через uBurn секунд следом. Рождённые до поджига (tb < 0) не существуют.
  float tb = uT - age;
  float bornFront = clamp(tb * uSpeed, 0.0, uLength);
  float bornTail = uBurn > 0.0 ? clamp((tb - uBurn) * uSpeed, 0.0, uLength) : 0.0;
  if (tb < 0.0 || age > life || bornFront - bornTail < 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // Свежее горючее горит сильнее: больше рождений у фронта.
  float su = fireHash(seed + 5.7);
  su = 1.0 - su * su * 0.85;
  float u = mix(bornTail, bornFront, su);
  vec4 p0 = trailAt(uTrail, u, uLength);
  vec4 p1 = trailAt(uTrail, u + 0.5, uLength);
  vec2 tangent = p1.xz - p0.xz;
  float tl = length(tangent);
  tangent = tl > 1e-4 ? tangent / tl : vec2(1.0, 0.0);
  vec2 side = vec2(-tangent.y, tangent.x);
  // Две покрышки: горючее лежит по двум колеям, между ними его меньше.
  float ac = fireHash(seed + 6.2) * 2.0 - 1.0;
  float across = (sign(ac) * 0.55 + ac * 0.45) * uWidth * 0.5;
  vec3 born = p0.xyz + vec3(side.x, 0.0, side.y) * across;
  // Сколько это место уже горит: к концу fireBurn горючее иссякает.
  float fuelAge = uT - u / uSpeed;
  float fuel = uBurn > 0.0 ? 1.0 - smoothstep(0.55, 1.0, fuelAge / uBurn) : 1.0;
  float span = age / max(life, 0.01);
  vec3 flight;
  float radius;
  float opacity;
#ifdef SMOKE
  // Ветер набирает частицу с постоянной времени 1.2 с: v = w·(1 − e^(−t/τ)).
  vec2 drift = uWind.xz * (age - 1.2 * (1.0 - exp(-age / 1.2)));
  // Подъём замедляется по мере остывания.
  float lift = uRise * age / (1.0 + 0.08 * age);
  vec2 turb = vec2(fireNoise(born.xz * 0.35 + vec2(age * 0.3, seed * 10.0)), fireNoise(born.zx * 0.35 + vec2(seed * 7.0, age * 0.3))) - 0.5;
  flight = vec3(drift.x, lift, drift.y) + vec3(turb.x, 0.0, turb.y) * uTurbulence * 1.8 * age;
  radius = uSize * (0.2 + 1.0 * span) * mix(0.7, 1.3, fireHash(seed + 11.3));
  opacity = uOpacity * fuel * smoothstep(0.0, 0.08, span) * (1.0 - smoothstep(0.5, 1.0, span));
#else
  // Язык взлетает быстро и зависает: span·(2 − span).
  float reach = uHeight * fuel * (0.45 + 0.65 * fireHash(seed + 8.8));
  vec2 turb = vec2(fireNoise(born.xz * 2.1 + vec2(uTime * 1.3, seed * 9.0)), fireNoise(born.zx * 2.1 + vec2(seed * 5.0, uTime * 1.1))) - 0.5;
  flight = vec3(uWind.x, 0.0, uWind.z) * 0.06 * age + vec3(0.0, reach * span * (2.0 - span), 0.0) + vec3(turb.x, 0.0, turb.y) * uTurbulence * 0.55 * span;
  radius = max(uHeight, 0.2) * (0.08 + 0.12 * fireHash(seed + 11.3)) * (0.55 + 0.9 * sin(span * 3.14159));
  opacity = 0.45 * fuel * smoothstep(0.0, 0.06, span) * pow(1.0 - span, 1.4);
#endif
  vec3 world = born + flight;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  float dist = -mvPosition.z;
  opacity *= smoothstep(0.0, 0.6, dist);
  if (opacity <= 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // Пиксельный пол, как у брызг: тонкая частица рисуется крупнее и бледнее.
  float pxRadius = radius * projectionMatrix[1][1] * 0.5 * uViewport / max(dist, 0.05);
  float grow = clamp(uMinPx / max(pxRadius, 0.001), 1.0, 2.5);
  vRadius = radius;
  vOpacity = opacity / (grow * grow);
  vDetail = smoothstep(2.5, 9.0, pxRadius);
  vSpan = span;
  vSeed = seed;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
#ifdef SMOKE
  float roll = fireHash(seed + 12.7) * 6.28318530718 + age * 0.15 * (fireHash(seed + 2.2) - 0.5);
  float cr = cos(roll), sr = sin(roll);
  vec2 viewQuad = vec2(cr * vQuad.x - sr * vQuad.y, sr * vQuad.x + cr * vQuad.y);
  vRight = right * cr + up * sr;
  vUp = up * cr - right * sr;
#else
  // Язык стоит, не крутится: вытянут вверх и растёт от точки рождения.
  vec2 viewQuad = vec2(vQuad.x * 0.7, vQuad.y * 1.6 + 0.6);
  vRight = right;
  vUp = up;
#endif
  vView = normalize(cameraPosition - world);
  vWorld = world;
  gl_Position = projectionMatrix * (mvPosition + vec4(viewQuad * radius * grow, 0.0, 0.0));
  #include <fog_vertex>
}
`;

const fogFactorShader = /* glsl */`
  float fogFactor = 0.0;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #endif
`;

// Пламя: складывается (premultiplied add). Сквозь туман гаснет, а не сереет.
export const flameFragmentShader = /* glsl */`
uniform vec3 uHot;
uniform vec3 uCool;
uniform float uIntensity;
uniform float uTime;
varying vec2 vQuad;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying float vRadius;
varying float vOpacity;
varying float vSpan;
varying float vSeed;
varying float vDetail;
#include <fog_pars_fragment>
${fireNoiseShader}
void main() {
  float rad2 = dot(vQuad, vQuad);
  if (rad2 > 1.0) discard;
  vec3 here = vWorld + (vRight * vQuad.x + vUp * vQuad.y) * vRadius;
  // Срез через объём: поперёк — мир, вдоль — высота, и всё течёт вверх.
  float n = fireFbm(here.xz * 3.2 + vec2(here.y * 1.1, -uTime * 2.6) + vSeed * 0.37);
  float body = 1.0 - rad2;
  float dens = smoothstep(0.32, 0.95, body * 0.78 + n * 0.55);
  dens = mix(body * 0.6, dens, vDetail);
  float alpha = dens * vOpacity;
  if (alpha < 0.004) discard;
  // Жар: у основания и в молодости — белое ядро, к вершине — красный дым.
  float heat = clamp((1.0 - vSpan) * 1.15 - 0.4 * rad2 + (n - 0.5) * 0.3 - vQuad.y * 0.15, 0.0, 1.0);
  vec3 color = mix(uCool, uHot, heat * heat) * uIntensity * (0.5 + 1.0 * heat);
  gl_FragColor = vec4(color * alpha, alpha);
  ${fogFactorShader}
  gl_FragColor.rgb *= 1.0 - fogFactor;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Дым: обычная смесь (premultiplied). Светится небом и солнцем, как брызги,
// а снизу — огнём, пока молод и низко: без этого ночью дыма нет.
export const smokeFragmentShader = /* glsl */`
uniform vec3 uSmokeColor;
uniform vec3 uSun;
uniform vec3 uSunRadiance;
uniform vec3 uFill;
uniform vec3 uGlow;
uniform float uTime;
varying vec2 vQuad;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vView;
varying float vRadius;
varying float vOpacity;
varying float vSpan;
varying float vSeed;
varying float vDetail;
#include <fog_pars_fragment>
${fireNoiseShader}
void main() {
  float rad2 = dot(vQuad, vQuad);
  if (rad2 > 1.0) discard;
  vec3 here = vWorld + (vRight * vQuad.x + vUp * vQuad.y) * vRadius;
  float n = fireFbm(here.xz * 2.3 + vec2(here.y * 1.1, uTime * 0.12) + vSeed * 0.21);
  float body = 1.0 - rad2;
  float dens = smoothstep(0.34, 1.05, body * 0.78 + n * 0.6);
  dens = mix(body * 0.45, dens, vDetail);
  float alpha = dens * vOpacity;
  if (alpha < 0.003) discard;
  vec3 nS = normalize(vRight * vQuad.x + vUp * vQuad.y + vView * sqrt(max(1.0 - rad2, 0.0)));
  float sunFace = max(dot(nS, uSun), 0.0);
  vec3 lit = uSmokeColor * (uFill * (0.7 + 0.5 * (0.5 + 0.5 * nS.y)) + uSunRadiance * (0.12 + 0.55 * sunFace)) / 3.14159265;
  float under = 0.5 + 0.5 * max(-nS.y, 0.0);
  lit += uGlow * pow(1.0 - vSpan, 4.0) * under * (0.5 + 0.9 * n);
  gl_FragColor = vec4(lit * alpha, alpha);
  ${fogFactorShader}
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * alpha, fogFactor);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Колея на земле: до огня — след покрышек и разлив, в огне — угли,
// после — копоть. Одна лента, три состояния по длине дуги.
export const trackVertexShader = /* glsl */`
attribute float aU;
attribute float aV;
varying float vU;
varying float vV;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vU = aU;
  vV = aV;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  // Лента лежит на аналитической высоте, сетка берега — на интерполированной;
  // разница растёт с крупностью ячеек, то есть с расстоянием. Подтягиваем ленту
  // к камере на долю расстояния — то, что делал бы polygonOffset, который под
  // логарифмической глубиной (gl_FragDepth пишется) не работает.
  mvPosition.xyz *= 0.997;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const trackFragmentShader = /* glsl */`
uniform float uFront;
uniform float uTail;
uniform float uSpeed;
uniform float uBurn;
uniform float uSootFade;
uniform float uT;
uniform float uTime;
uniform float uDark;
uniform float uIntensity;
uniform vec3 uCool;
varying float vU;
varying float vV;
varying vec3 vWorld;
#include <fog_pars_fragment>
${fireNoiseShader}
void main() {
  float d = abs(vV);
  float grain = fireFbm(vWorld.xz * 6.0);
  float tyre = exp(-pow((d - 0.62) / 0.16, 2.0)) * (0.7 + 0.3 * grain);
  float pool = (1.0 - smoothstep(0.35, 1.0, d)) * (0.55 + 0.45 * fireFbm(vWorld.xz * 2.2 + 5.0));
  float edge = 1.0 - smoothstep(0.82, 1.0, d + (grain - 0.5) * 0.3);
  float burning = step(uTail, vU) * (1.0 - step(uFront, vU));
  float burnt = step(vU, uTail) * step(0.001, uTail);
  float fuelAge = uT - vU / uSpeed;
  float fuel = uBurn > 0.0 ? 1.0 - smoothstep(0.55, 1.0, fuelAge / uBurn) : 1.0;
  float sootAge = max(fuelAge - uBurn, 0.0);
  float soot = uSootFade > 0.0 ? exp(-sootAge / uSootFade) : 1.0;
  // Мокрое горючее темнит песок; копоть — чернее и шире; угли светят сами.
  float wet = max(tyre, pool * 0.8) * (1.0 - burnt);
  float ash = (pool * 0.95 + tyre * 0.4) * soot * burnt;
  float alpha = clamp(uDark * max(wet, ash) * edge, 0.0, 1.0);
  vec3 base = mix(vec3(0.05, 0.035, 0.02), vec3(0.012, 0.01, 0.008), burnt);
  float flicker = 0.55 + 0.45 * fireNoise(vWorld.xz * 4.0 + vec2(uTime * 3.1, -uTime * 2.3));
  vec3 ember = uCool * uIntensity * 2.2 * flicker * fuel * pool * edge * burning;
  gl_FragColor = vec4(base * alpha + ember, alpha);
  ${fogFactorShader}
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * alpha, fogFactor);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createFireUniforms() {
  return {
    // fog: true у ShaderMaterial требует свои uniforms тумана — иначе рендер падает в refreshFogUniforms.
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTrail: { value: null },
    uLength: { value: 1 },
    uFront: { value: 0 },
    uTail: { value: 0 },
    uSpeed: { value: 4 },
    uBurn: { value: 7 },
    uT: { value: -1 },
    uTime: { value: 0 },
    uWidth: { value: 0.55 },
    uHeight: { value: 1.3 },
    uTurbulence: { value: 0.6 },
    uWind: { value: new THREE.Vector3() },
    uViewport: { value: 800 },
    uMinPx: { value: 2.5 },
    uIntensity: { value: 1 },
    uHot: { value: new THREE.Color('#fff1c2') },
    uCool: { value: new THREE.Color('#ff4d0f') },
    uSmokeColor: { value: new THREE.Color('#3b3634') },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunRadiance: { value: new THREE.Vector3(1, 1, 1) },
    uFill: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
    uGlow: { value: new THREE.Color() },
    uSootFade: { value: 0 },
    uDark: { value: 0.7 },
  };
}
