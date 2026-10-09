import * as THREE from 'three';

// The spread is 536 × 302 mm. Marks use its untransformed print UVs,
// so changing a photograph, camera, or page curvature never stretches the ageing.
const parameters = [
  'edgeWear', 'edgeFibres', 'grain', 'grainSize', 'grainDepth', 'grainDensity',
  'wear', 'wearSize', 'wearDensity', 'wearInk',
  'scratches', 'scratchWidth', 'scratchLength', 'scratchDepth',
  'scratchDensity', 'scratchDirection', 'scratchScatter', 'scratchInk', 'scratchPolish',
  'spots', 'spotSize', 'spotDensity', 'spotEdge', 'spotInk',
  'spotTone', 'spotPolish', 'spotRelief', 'pattern', 'reflections'
];
const uniformName = name => 'u' + name[0].toUpperCase() + name.slice(1);

let scratchMap, scratchNormalMap, scratchSignature = '', scratchTimer;
const textureParameters = ['scratchWidth', 'scratchLength', 'scratchDensity', 'scratchScatter', 'pattern'];
const textureSignature = settings => textureParameters.map(name => settings[name]).join('/');

// A seamless, mipmapped 2048² height/roughness texture, covering 32 × 32 mm.
// R: signed groove height around .5; G: groove coverage; B: raised shoulder.
// The many curved strokes have tapered ends and independently varied pressure.
function drawScratchTexture(settings) {
  const size = 2048, tileMM = 32, pixelsPerMM = size / tileMM;
  let seed = (settings.pattern * 85423 + 97117) >>> 0;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const height = make(), mask = make(), shoulder = make();
  const hc = height.getContext('2d'), mc = mask.getContext('2d'), sc = shoulder.getContext('2d');
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, size, size);
  for (const context of [mc, sc]) { context.fillStyle = '#000'; context.fillRect(0, 0, size, size); }
  const count = Math.round(settings.scratchDensity * 96);
  for (let i = 0; i < count; i++) {
    const x = random() * size, y = random() * size;
    const length = settings.scratchLength * (.38 + .62 * random()) * pixelsPerMM;
    const width = settings.scratchWidth * (.55 + .45 * random()) * pixelsPerMM;
    const angle = (random() - .5) * settings.scratchScatter * Math.PI;
    const pressure = .4 + .6 * random();
    const bow = (random() - .5) * length * .055;
    const startX = -length * .5, endX = length * .5;
    const copies = Math.max(1, Math.ceil((length * .5 + width * 2 + Math.abs(bow)) / size));
    for (let oy = -copies; oy <= copies; oy++) for (let ox = -copies; ox <= copies; ox++) {
      for (const [context, thickness, color] of [
        [hc, width * 2.2, '174,174,174'], [sc, width * 2.2, '255,255,255'],
        [hc, width, '3,3,3'], [mc, width, '255,255,255']
      ]) {
        context.save(); context.translate(x + ox * size, y + oy * size); context.rotate(angle);
        const gradient = context.createLinearGradient(startX, 0, endX, 0);
        for (const [stop, opacity] of [[0, 0], [.1, pressure * .55], [.27, pressure], [.72, pressure * .88], [.93, pressure * .32], [1, 0]]) gradient.addColorStop(stop, `rgba(${color},${opacity})`);
        context.strokeStyle = gradient; context.lineWidth = thickness; context.lineCap = 'round';
        context.beginPath(); context.moveTo(startX, 0);
        context.bezierCurveTo(-length * .19, bow, length * .21, -bow * .4, endX, 0);
        context.stroke(); context.restore();
      }
    }
  }
  const h = hc.getImageData(0, 0, size, size).data;
  const m = mc.getImageData(0, 0, size, size).data;
  const s = sc.getImageData(0, 0, size, size).data;
  const canvas = scratchMap?.image ?? make(), context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = h[i]; image.data[i + 1] = m[i];
    image.data[i + 2] = Math.max(0, s[i] - m[i]); image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const normalCanvas = scratchNormalMap?.image ?? make(), nc = normalCanvas.getContext('2d');
  const normals = nc.createImageData(size, size);
  // Sobel derivatives smooth across the groove, so normals are filtered in UV
  // space rather than reconstructed from adjacent screen pixels as dashed edges.
  const heightAt = (x, y) => h[((y + size) % size * size + (x + size) % size) * 4] / 255;
  const gradientScale = .01 * pixelsPerMM;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = (heightAt(x + 1, y - 1) + heightAt(x + 1, y) * 2 + heightAt(x + 1, y + 1)
      - heightAt(x - 1, y - 1) - heightAt(x - 1, y) * 2 - heightAt(x - 1, y + 1)) * .25 * gradientScale;
    const gy = (heightAt(x - 1, y + 1) + heightAt(x, y + 1) * 2 + heightAt(x + 1, y + 1)
      - heightAt(x - 1, y - 1) - heightAt(x, y - 1) * 2 - heightAt(x + 1, y - 1)) * .25 * gradientScale;
    const inverseLength = 1 / Math.hypot(gx, gy, 1), i = (y * size + x) * 4;
    normals.data[i] = 128 - gx * inverseLength * 127;
    normals.data[i + 1] = 128 + gy * inverseLength * 127;
    normals.data[i + 2] = 128 + inverseLength * 127; normals.data[i + 3] = 255;
  }
  nc.putImageData(normals, 0, 0);
  if (!scratchMap) {
    scratchMap = new THREE.CanvasTexture(canvas);
    scratchNormalMap = new THREE.CanvasTexture(normalCanvas);
    for (const map of [scratchMap, scratchNormalMap]) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = 8; map.colorSpace = THREE.NoColorSpace;
    }
  }
  scratchMap.needsUpdate = scratchNormalMap.needsUpdate = true;
  scratchSignature = textureSignature(settings);
}

function scheduleScratchTexture(settings) {
  if (textureSignature(settings) === scratchSignature) { clearTimeout(scratchTimer); return; }
  clearTimeout(scratchTimer);
  // Keep slider movement responsive; the last value rebuilds the shared map.
  const next = { ...settings };
  scratchTimer = setTimeout(() => drawScratchTexture(next), 70);
}

const surfaceShader = /* glsl */`
varying vec2 vPaperUv;
uniform float uPageSeed, uMonochrome, uTextInk, uPhotoBleed;
uniform sampler2D uScratchMap;
uniform sampler2D uScratchNormalMap;
${parameters.map(name => `uniform float ${uniformName(name)};`).join('\n')}

vec2 paperHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float paperNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(paperHash(cell).x, paperHash(cell + vec2(1., 0.)).x, s.x),
             mix(paperHash(cell + vec2(0., 1.)).x, paperHash(cell + vec2(1.)).x, s.x), s.y);
}

float paperGradientNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 s = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 g00 = normalize(paperHash(cell) * 2. - 1. + .00001);
  vec2 g10 = normalize(paperHash(cell + vec2(1., 0.)) * 2. - 1. + .00001);
  vec2 g01 = normalize(paperHash(cell + vec2(0., 1.)) * 2. - 1. + .00001);
  vec2 g11 = normalize(paperHash(cell + vec2(1.)) * 2. - 1. + .00001);
  return .5 + .7 * mix(mix(dot(g00, f), dot(g10, f - vec2(1., 0.)), s.x),
                      mix(dot(g01, f - vec2(0., 1.)), dot(g11, f - 1.), s.x), s.y);
}

vec2 paperRotate(vec2 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Screen derivatives integrate a narrow groove instead of dropping it between
// texture texels. Its physical width is independent of the number of marks.
float paperLine(vec2 p, float halfLength, float halfWidth, float aa) {
  float distanceToLine = length(vec2(p.x, max(abs(p.y) - halfLength, 0.)));
  return (1. - smoothstep(max(0., halfWidth - aa), halfWidth + aa, distanceToLine))
    * min(1., halfWidth / max(aa * .55, .0001));
}

vec3 paperScratches(vec2 p) {
  float angle = radians(uScratchDirection);
  vec4 first = texture2D(uScratchMap, paperRotate(p, angle) / 32.);
  vec4 second = texture2D(uScratchMap, paperRotate(p, angle + uScratchScatter * .17) / 32. + vec2(.417, .729));
  return vec3(max(first.g, second.g), max(first.b, second.b), (first.r + second.r) * .5 - .5019607843);
}

vec3 paperScratchNormal(vec2 p, out float variance) {
  float angle = radians(uScratchDirection), secondAngle = angle + uScratchScatter * .17;
  vec3 first = texture2D(uScratchNormalMap, paperRotate(p, angle) / 32.).rgb;
  vec3 second = texture2D(uScratchNormalMap, paperRotate(p, secondAngle) / 32. + vec2(.417, .729)).rgb;
  first = vec3((first.xy - .5019607843) * 2., first.z * 2. - 1.);
  second = vec3((second.xy - .5019607843) * 2., second.z * 2. - 1.);
  variance = max(0., 1. - min(length(first), length(second)));
  vec2 slope = (paperRotate(first.xy / max(first.z, .15), -angle)
    + paperRotate(second.xy / max(second.z, .15), -secondAngle)) * .5;
  return normalize(vec3(slope * uScratches * uScratchDepth / .01, 1.));
}

vec3 paperTextureNormal(vec3 position, vec3 n, vec3 mapNormal) {
  vec3 dx = dFdx(position), dy = dFdy(position);
  vec2 ux = dFdx(vPaperUv), uy = dFdy(vPaperUv);
  vec3 perpendicularX = cross(dy, n), perpendicularY = cross(n, dx);
  vec3 tangent = normalize(perpendicularX * ux.x + perpendicularY * uy.x);
  vec3 bitangent = normalize(perpendicularX * ux.y + perpendicularY * uy.y);
  return normalize(mat3(tangent, bitangent, n) * mapNormal);
}

vec2 paperStains(vec2 p, float aa) {
  vec2 pitch = vec2(89.333333, 75.5), home = floor(p / pitch);
  vec2 marks = vec2(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = home + vec2(float(x), float(y));
    if (cell.x < 0. || cell.x >= 6. || cell.y < 0. || cell.y >= 4.) continue;
    vec2 seed = cell + vec2(72.9 + uPageSeed * 71.17, uPattern * 31.41 + uPageSeed * 137.23);
    vec2 h = paperHash(seed), h2 = paperHash(seed + 18.4);
    float markEnabled = step(h2.x, uSpotDensity) * step(.0001, uSpotDensity);
    if (markEnabled < .5) continue;
    vec2 center = (cell + .08 + h * .84) * pitch;
    vec2 q = paperRotate(p - center, h2.y * 6.2831853);
    float radius = uSpotSize * .5 * (.55 + .45 * h.y);
    vec2 local = q / max(radius, .001);
    if (length(local) > 1.4 + aa / radius) continue;
    float contour = length(local / vec2(1., .63 + .37 * h.x));
    // Two frequencies break up the outline, with a darker tide line inside it.
    contour += (paperNoise(local * 3.7 + seed) - .5) * .17;
    contour += (paperNoise(local * 13.1 + seed) - .5) * .055;
    float edge = mix(.19, .009, uSpotEdge) + aa / max(radius, .001);
    float body = (1. - smoothstep(1. - edge, 1. + edge, contour)) * markEnabled;
    float tide = smoothstep(.71, .88, contour) * body;
    float deposit = .56 + .44 * paperNoise(local * 8. + seed);
    marks = max(marks, vec2(body * deposit, tide));
  }
  return marks;
}

float paperAbrasion(vec2 p, float aa) {
  vec2 pitch = vec2(134., 100.666667), home = floor(p / pitch);
  float marks = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = home + vec2(float(x), float(y));
    if (cell.x < 0. || cell.x >= 4. || cell.y < 0. || cell.y >= 3.) continue;
    vec2 seed = cell + vec2(91.8 + uPageSeed * 39.11, uPattern * 13.7 + uPageSeed * 81.79);
    vec2 h = paperHash(seed), h2 = paperHash(seed + 7.1);
    float markEnabled = step(h2.x, uWearDensity) * step(.0001, uWearDensity);
    if (markEnabled < .5) continue;
    vec2 q = paperRotate(p - (cell + .1 + h * .8) * pitch, h2.y * 6.2831853);
    float radius = uWearSize * .5 * (.6 + .4 * h.x);
    vec2 local = q / max(radius, .001);
    if (length(local) > 1.5 + aa / radius) continue;
    float contour = length(local / vec2(1., .45 + .4 * h.y));
    contour += (paperNoise(local * 6. + seed) - .5) * .38;
    float abrasionRegion = 1. - smoothstep(.9 - aa / radius, 1. + aa / radius, contour);
    // A rubbed surface is continuous. Fine texture comes from the microgrooves,
    // not thresholded lattice noise that would produce square white islands.
    float rubbed = .65 + .35 * paperGradientNoise(paperRotate(local, .61) * 3.31 + seed);
    marks = max(marks, abrasionRegion * rubbed * markEnabled);
  }
  return marks;
}

vec2 paperFibres(vec2 p, float aa) {
  float pitch = uGrainSize * 1.55;
  vec2 cell = floor(p / pitch), h = paperHash(cell + uPattern * 11.43 + uPageSeed * 23.37);
  vec2 q = p - (cell + .34 + h * .32) * pitch;
  q = paperRotate(q, (h.y - .5) * 2.3);
  float markEnabled = step(paperHash(cell + 42.8).x, uGrainDensity) * step(.0001, uGrainDensity);
  float fibre = paperLine(q, uGrainSize * (.25 + .22 * h.x), uGrainSize * .029, aa) * markEnabled;
  float resolved = 1. - smoothstep(.25, .95, aa / uGrainSize);
  float tooth = (paperNoise(p / (uGrainSize * .31)) - .5) * resolved;
  return vec2(fibre, tooth);
}

// Physical height gradients: no extra mesh tessellation needed for micron-scale
// grooves. Unnormalised position derivatives keep relief consistent with zoom.
vec3 paperReliefNormal(vec3 position, vec3 surfaceNormal, vec2 heightGradient, float face) {
  vec3 dx = dFdx(position), dy = dFdy(position);
  vec3 rx = cross(dy, surfaceNormal), ry = cross(surfaceNormal, dx);
  float determinant = dot(dx, rx) * face;
  vec3 gradient = sign(determinant) * (heightGradient.x * rx + heightGradient.y * ry);
  return normalize(max(abs(determinant), 1.e-12) * surfaceNormal - gradient);
}
`;

export function createPaperMaterial(settings, grainMap) {
  if (!scratchMap) drawScratchTexture(settings);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .5, metalness: 0, ior: 1.48,
    clearcoat: .32, clearcoatRoughness: .23,
    // UV support is also present on a blank page; relief comes from the shader.
    bumpMap: grainMap, bumpScale: 0, vertexColors: true, side: THREE.FrontSide
  });
  const uniform = Object.fromEntries(parameters.map(name => [uniformName(name), { value: settings[name] }]));
  uniform.uPageSeed = {value:0}; uniform.uMonochrome = {value:0}; uniform.uTextInk = {value:0}; uniform.uPhotoBleed = {value:0};
  material.userData.paperUniforms = uniform;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniform, { uScratchMap: { value: scratchMap }, uScratchNormalMap: { value: scratchNormalMap } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 paperUv;\nvarying vec2 vPaperUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaperUv = paperUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + surfaceShader)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float printedTextInk=uTextInk*(1.-smoothstep(.12,.9,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))));
        vec2 paperPoint = vPaperUv * vec2(536., 302.);
        float paperAA = max(length(fwidth(paperPoint)) * .58, .0002);
        vec3 scratchSample = paperScratches(paperPoint);
        float scratchVariance;
        vec3 scratchNormal = paperScratchNormal(paperPoint, scratchVariance);
        vec2 paperScratch = scratchSample.xy * uScratches;
        vec2 paperStain = paperStains(paperPoint, paperAA) * uSpots;
        vec2 paperFibre = paperFibres(paperPoint, paperAA) * uGrain;
        float paperWear = paperAbrasion(paperPoint, paperAA) * uWear;
        vec3 stainPigment = mix(vec3(.51), vec3(.59, .39, .19), uSpotTone);
        float pigment = clamp((paperStain.x * .65 + paperStain.y * .42) * uSpotInk, 0., 1.);
        diffuseColor.rgb *= mix(vec3(1.), stainPigment, pigment);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.82, .80, .75),
          clamp(paperScratch.x * uScratchInk * .7 + paperWear * uWearInk * .14, 0., .9));
        diffuseColor.rgb *= 1. - paperFibre.x * .045;
        float fibreHeight = (paperFibre.y * .35 + paperFibre.x * .65) * uGrainDepth / 100.;
        float stainHeight = paperStain.y * uSpotRelief / 100.;
        // The fold reads as a narrow, softened printed/pressed groove. The
        // geometry meets exactly at the sewing; there is no open central slot.
        float foldDistance = abs(paperPoint.x - 268.);
        float foldLine = exp(-pow(foldDistance / (.18 + paperAA * .3), 2.));
        float foldShoulder = exp(-foldDistance / 1.15);
        diffuseColor.rgb *= 1. - foldLine * .34 - foldShoulder * .07;
        float foldHeight = -.00045 * foldLine - .00018 * foldShoulder;
        float edgeDistance = min(min(paperPoint.x, 536. - paperPoint.x), min(paperPoint.y, 302. - paperPoint.y));
        float fray = paperGradientNoise(paperPoint / .83 + uPattern * 17.3 + uPageSeed * 49.7);
        float edgeWidth = mix(.06, 3.2, uEdgeFibres);
        float edgeMask = 1. - smoothstep(.02, edgeWidth + paperAA, edgeDistance - fray * uEdgeFibres * 1.1);
        float edgeAbrasion = edgeMask * uEdgeWear;
        float edgeFibre = (fray - .5) * edgeMask * uEdgeFibres;
        // Full-bleed ink reaches the face boundary; the physical cut remains paper.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.93), (1.-uPhotoBleed) * edgeMask * (.07 * uEdgeFibres + .86 * uEdgeWear));
        float paperHeight = fibreHeight + stainHeight + foldHeight + edgeFibre * .0007;
        float coatHeight = fibreHeight * .22 + stainHeight + foldHeight;
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
        float paperRoughness = paperWear * .54 + paperScratch.x * mix(.5, -.5, uScratchPolish) + paperScratch.y * .12 + sqrt(scratchVariance) * .5 * uScratches
          + paperStain.x * mix(.5, -.34, uSpotPolish) + paperFibre.x * .19;
        roughnessFactor = clamp(roughnessFactor + paperRoughness + edgeAbrasion * .27, .065, .98);
        roughnessFactor=mix(roughnessFactor,.88,printedTextInk);
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = paperReliefNormal(-vViewPosition, normal, vec2(dFdx(paperHeight), dFdy(paperHeight)), faceDirection);
        normal = paperTextureNormal(-vViewPosition, normal, scratchNormal);
      `)
      .replace('#include <clearcoat_normal_fragment_maps>', /* glsl */`#include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
          clearcoatNormal = paperReliefNormal(-vViewPosition, clearcoatNormal, vec2(dFdx(coatHeight), dFdy(coatHeight)), faceDirection);
          clearcoatNormal = paperTextureNormal(-vViewPosition, clearcoatNormal, scratchNormal);
        #endif
      `)
      .replace('#include <lights_physical_fragment>', /* glsl */`#include <lights_physical_fragment>
        material.specularColor*=1.-printedTextInk*.85;
        material.specularColorBlended*=1.-printedTextInk*.85;
        #ifdef USE_CLEARCOAT
          material.clearcoatRoughness = clamp(material.clearcoatRoughness + paperRoughness * .8, .065, .98);
          material.clearcoat *= (1.-printedTextInk*.95) * uReflections * (1. - clamp(paperWear * .75 + edgeMask * (.15 * uEdgeFibres + .85 * uEdgeWear), 0., 1.));
        #endif
      `)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(.2126,.7152,.0722))), uMonochrome);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'paper-physical-ageing-full-bleed-v7';
  return material;
}

export function updatePaperMaterial(material, settings) {
  scheduleScratchTexture(settings);
  material.roughness = THREE.MathUtils.lerp(.85, .15, settings.gloss);
  material.clearcoat = settings.coat;
  material.clearcoatRoughness = THREE.MathUtils.lerp(.36, .16, settings.gloss);
  material.specularIntensity = settings.reflections;
  for (const name of parameters) material.userData.paperUniforms[uniformName(name)].value = settings[name];
}
