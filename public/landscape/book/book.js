import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { createPaperMaterial, updatePaperMaterial } from './paper-material.js?v=20261009-editorial';
import { createCoverMaterial, updateCoverMaterial, createCutMaterial, loadEmblem, configureLeatherFiltering } from './cover-material.js?v=20261009-editorial';
import { bookContent, paperStyle } from './content/book-content.js?v=20261009-editorial';
import { ScenePhoto } from './scene-photo.js?v=20261009-editorial';

const canvas = document.querySelector('#book-canvas');
const loading = document.querySelector('#loading');
const failure = document.querySelector('#fallback');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const url = new URL(location.href);
const embedded = url.searchParams.has('embed');
const editorMode = document.body.dataset.mode!=='reader' && !embedded && !url.searchParams.has('reader');
document.body.classList.toggle('reader', !editorMode);
document.body.classList.toggle('embedded', embedded);
const defaults = { edgeWear: .32, edgeFibres: .56, leatherScale: .8, leatherRelief: .055, leatherGloss: .38, leatherPatches: .48, leatherWear: .22, embossDepth: .24,
  photoGrain: .12, photoGrainSize: .85, aberration: .25, dustDensity: .22, dustSize: 1.3, dustOpacity: .1, lensFibres: .15, fibreLength: 16, lensVignette: 0, opticalSeed: 11,
  pressure: 1, coverWarp:.35, coverDents:.3, coverEdgeWear:.65, coverThickness:3,
  leatherScaleCrush:.32, leatherScaleCrushSize:48, leatherScaleCrushSeed:23,
  leatherGlossVariation:.4, leatherMatteShare:.45, leatherSeed:11, embossGloss:.35, leatherScratches:.18, leatherScratchDensity:.15, leatherScratchLength:18, leatherScratchWidth:.07, leatherScratchDepth:.025, leatherScratchSeed:17, ...paperStyle.material };
// This edition starts from Denis's supplied preset. The earlier study's saved
// material remains untouched; subsequent edits of this book have their own key.
const storageKey = 'daragan-book-material-preset4-v1';
const inputBounds = input => [Number(input.dataset.min ?? input.min), Number(input.dataset.max ?? input.max)];
const sliderToValue = input => {
  const [min, max] = inputBounds(input);
  return input.dataset.scale === 'log' ? Number((min * (max / min) ** Number(input.value)).toPrecision(5)) : Number(input.value);
};
const valueToSlider = (input, value) => {
  const [min, max] = inputBounds(input);
  return input.dataset.scale === 'log' ? Math.log(value / min) / Math.log(max / min) : value;
};
const viewportWidth = () => document.body.classList.contains('material-open') && innerWidth > 900 ? innerWidth - 330 : innerWidth;
let saved = {};
try { if(editorMode) saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { /* Local storage is optional. */ }
const settings = { ...defaults };
for (const [key, value] of Object.entries(saved)) {
  const input = document.getElementById(key);
  if (key in defaults && input && Number.isFinite(value)) settings[key] = THREE.MathUtils.clamp(value, ...inputBounds(input));
}
const pageWidth = 2.68;
const pageHeight = 3.02;
const endpapers = 2;
const leafSpacing = .0038, leafThickness = .0033;
let leafBase = .065 + settings.coverThickness/200 + leafThickness + .0015;
const maxStack = bookContent.spreads.length - 1 + endpapers;
const bindingHeight = opening => leafBase + Math.max(opening + endpapers, bookContent.spreads.length - 1 - opening + endpapers) * leafSpacing + .018;
let topBase = bindingHeight(0), sewnSpine, stitches, closedBook, emblemMap, stampedMaterial, spineShell, spineJoint, spineMaterial;
const leafCounts = { '-1': endpapers, '1': bookContent.spreads.length - 1 + endpapers };
let renderer, scene, camera, controls, book, keyLight, fillLight, ambientShadow, scenePhoto;
let pageMaterials, coverMaterial, inkMaterials, whiteMaterial, blackPaperMaterial, grainMap;
let printIndex = 0, blankPrint = false, navigating = false;
let blockAtlas;
const textureCache = new Map();
let environment, defaultEnvironment;
let currentView = new URL(location.href).searchParams.has('spread') ? 'spread' : 'cover';
let cameraTween = null;
let coverMotion = null, imageFocus = null;
let coverProgress = currentView === 'cover' ? 0 : 1, orbitMode = false;
const boardGeometries = new Set();
let turning = null;
let gesture = null;
let turnMesh = null;
let lastFrame = 0;
let visible = true;
let hover = { side: 0, u:.8, v: .5, strength: 0, target:0 };
const topLeaves = [];
const stackLeaves = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();
const diagnostics = { ready: false, revision: THREE.REVISION, frameCount: 0, error: null, preset: 'spread' };
window.bookStudy = { settings, diagnostics, content: bookContent, leafCounts, get camera() { return camera; }, get scene() { return scene; }, get book() { return book; }, get renderer() { return renderer; }, get turning() { return Boolean(turning); }, get turnProgress() { return turning?.progress ?? null; }, get cover() { return closedBook; }, get openingCover() { return Boolean(coverMotion); }, get focusedImage() { return imageFocus?.asset || null; }, get controls() { return controls; }, get photo() { return scenePhoto; }, get surfaces() { return [...stackLeaves, ...topLeaves]; }, get texture() { return blankPrint ? 'blank' : printIndex; } };

function fail(error) {
  diagnostics.error = String(error?.message || error);
  loading.hidden = true;
  failure.hidden = false;
  console.error(error);
}
document.querySelector('#reload').addEventListener('click', () => location.reload());
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); visible = false; fail('WebGL context lost'); });
canvas.addEventListener('webglcontextrestored', () => location.reload());
let parentVisible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden && parentVisible; });
addEventListener('message', event => {
  if(!embedded || event.origin !== location.origin || event.source !== parent) return;
  if(event.data?.type === 'book-visibility') { parentVisible=Boolean(event.data.active);visible=parentVisible&&!document.hidden; }
  if(event.data?.type === 'book-contents') document.querySelector('#contents-toggle').click();
  if(event.data?.type === 'book-language') {
    const en=event.data.language==='en';document.documentElement.lang=en?'en':'ru';
    document.querySelector('#contents-toggle').textContent=en?'CONTENTS':'СОДЕРЖАНИЕ';
    document.querySelector('#contents-heading').textContent=en?'Contents':'Содержание';
    document.querySelector('#text-reader>button').setAttribute('aria-label',en?'Return to the book':'Вернуться к книге');
    document.querySelectorAll('[data-opening] span').forEach((span,i)=>{span.firstChild.textContent=en?bookContent.chapters[i].title_en:bookContent.chapters[i].title;});
  }
});

// Fine backing/cover texture. Printed paper has independent procedural layers.
function paperTextures() {
  let seed = 54891;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const grain = document.createElement('canvas'); grain.width = grain.height = 512;
  const gc = grain.getContext('2d'); const img = gc.createImageData(512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const value = 110 + Math.floor(random() * 36);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = value; img.data[i + 3] = 255;
  }
  gc.putImageData(img, 0, 0);
  gc.strokeStyle = '#878787'; gc.lineWidth = .4;
  for (let i = 0; i < 1900; i++) {
    const x = random() * 512, y = random() * 512;
    gc.beginPath(); gc.moveTo(x, y); gc.lineTo(x + .4, y + 2 + random() * 4); gc.stroke();
  }
  grainMap = new THREE.CanvasTexture(grain);
  grainMap.wrapS = grainMap.wrapT = THREE.RepeatWrapping;
  grainMap.repeat.set(7, 9);
}

function bindingForSide(side) {
  return topBase - (turning && side===-turning.side ? leafSpacing*turning.progress : 0);
}
function leafProfile(side, u, v, layer, time = 0, count = leafCounts[side], bindingY = bindingForSide(side)) {
  const isTop = layer === count;
  const phase = layer * 2.39996 + (side < 0 ? 1.2 : 0);
  // Worn sheets drift in the plane of the book; no independent vertical wave
  // can cut through the sheet above. The hinge stays attached to the sewing.
  const edge = Math.pow(u, 2.8);
  const drift = settings.edges * (.012 * Math.sin(phase) * Math.pow(u, 4) + .006 * edge * (Math.sin(v * 13 + phase) + .4 * Math.sin(v * 27 - phase)));
  const x = side * (u * pageWidth + drift);
  const z = (v - .5) * pageHeight + settings.edges * u * (.012 * Math.cos(phase) + .005 * Math.sin(v * 11 + phase));
  // Heights are evaluated at physical x, not at each sheet's drifting UV. At
  // any common x,z the minimum front/back separation is spacing - thickness.
  const physicalU = Math.abs(x) / pageWidth;
  const outerBase = leafBase + layer * leafSpacing;
  const bindingRise = bindingY - leafBase - count * leafSpacing;
  // The first left face stays on its board; the cloth joint bends separately.
  if(side < 0 && printIndex === 0 && layer === leafCounts[-1] && count === leafCounts[-1]) {
    return pastedPoint(u,v);
  }
  const arch = (.10 + settings.bend * .39) * Math.sin(Math.PI * physicalU) * Math.exp(-1.25 * physicalU) * (layer / maxStack);
  const boardShape=side>0 ? boardOffset(x-pageWidth/2-.029,z) : -boardOffset(-x-pageWidth/2-.029,z);
  const bindingBlend=Math.exp(-physicalU*12);
  const base = outerBase + bindingRise*bindingBlend + boardShape*(1-bindingBlend);
  const flutter = isTop && !reducedMotion.matches ? settings.motion * .005 * edge * (.5 + .5 * Math.sin(time * .9 + v * 5.3 + side)) : 0;
  const radius = ((u-hover.u)**2)/.045 + ((v-hover.v)**2)/.025;
  // A slight pressure dent surrounded by lifted paper. Its downward travel is
  // bounded by the real interleaf clearance, so it cannot enter the next leaf.
  const contact = isTop && hover.side === side ? hover.strength * settings.pressure : 0;
  const pointerCurl = Math.pow(u,.7) * (contact*.012*radius*Math.exp(-radius*1.5)-Math.min(contact,1)*.00022*Math.exp(-radius*4));
  return [x + side*Math.min(contact,1)*.0006*u*Math.exp(-radius), base + arch + flutter + pointerCurl, z];
}

function boardOffset(x,z) {
  const u=x/(pageWidth/2+.06),v=z/(pageHeight/2+.07);
  const warp=settings.coverWarp*.012*(.55*Math.sin(u*2.4+v*.7)+.45*u*v);
  const dent=settings.coverDents*.012*(Math.exp(-((u-.84)**2+(v-.7)**2)*23)+.7*Math.exp(-((u+.7)**2+(v+.88)**2)*34));
  return warp-dent;
}

function boardGeometry() {
  // RoundedBox's segments subdivide its bevel, leaving one enormous flat
  // centre quad. Uniform face tessellation lets the board and pasted paper
  // share the same gentle curvature without crossing each other.
  const g=new THREE.BoxGeometry(pageWidth+.12,.064,pageHeight+.14,80,4,80);
  const p=g.attributes.position,half=new THREE.Vector3(pageWidth/2+.06,.032,pageHeight/2+.07),radius=.009;
  const point=new THREE.Vector3(),inner=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    point.fromBufferAttribute(p,i);
    inner.set(THREE.MathUtils.clamp(point.x,-half.x+radius,half.x-radius),THREE.MathUtils.clamp(point.y,-half.y+radius,half.y-radius),THREE.MathUtils.clamp(point.z,-half.z+radius,half.z-radius));
    normal.subVectors(point,inner).normalize();point.copy(inner).addScaledVector(normal,radius);
    p.setXYZ(i,point.x,point.y,point.z);
  }
  g.setAttribute('paperUv',g.attributes.uv.clone());
  g.userData.original=new Float32Array(g.attributes.position.array);boardGeometries.add(g);deformBoard(g);return g;
}

function pastedPoint(u,v) {
  const x=-u*pageWidth,z=(v-.5)*pageHeight;
  // The opened front board is the closed lid rotated through 180 degrees.
  const pasted=.0665+settings.coverThickness/200-boardOffset(-(x+pageWidth/2+.029),z);
  return [x,pasted,z];
}

function bindingShellGeometry() {
  const g=new THREE.PlaneGeometry(1,1,24,40),count=25*41,original=g.attributes.position.array;
  const positions=new Float32Array(original.length*2);positions.set(original);positions.set(original,original.length);
  g.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const originalUv=g.attributes.uv.array,uv=new Float32Array(originalUv.length*2);uv.set(originalUv);uv.set(originalUv,originalUv.length);g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const indices=[...g.index.array];
  for(let i=0;i<g.index.count;i+=3)indices.push(g.index.array[i]+count,g.index.array[i+2]+count,g.index.array[i+1]+count);
  const rim=[];
  for(let i=0;i<=24;i++)rim.push(i);
  for(let j=1;j<=40;j++)rim.push(j*25+24);
  for(let i=23;i>=0;i--)rim.push(40*25+i);
  for(let j=39;j>=0;j--)rim.push(j*25);
  for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];indices.push(a,b,a+count,b,b+count,a+count);}
  g.setIndex(indices);g.deleteAttribute('normal');return g;
}

function makeBinding() {
  spineMaterial=createCoverMaterial(settings,emblemMap);spineMaterial.side=THREE.DoubleSide;
  spineShell=new THREE.Mesh(bindingShellGeometry(),spineMaterial);
  spineJoint=new THREE.Mesh(new THREE.PlaneGeometry(1,1,24,40),new THREE.MeshStandardMaterial({color:0x101010,roughness:.9,side:THREE.DoubleSide,bumpMap:grainMap,bumpScale:.00015}));
  for(const mesh of [spineShell,spineJoint]) {mesh.castShadow=mesh.receiveShadow=true;book.add(mesh);}
  updateBinding();
}

function updateBinding() {
  if(!spineShell) return;
  const progress=closedBook.visible?coverProgress:1,angle=Math.PI*progress,cs=Math.cos(angle),sn=Math.sin(angle);
  const lidPoint=point=>closedBook.visible?[(-point[0])*cs-(.065-point[1])*sn,closedBook.userData.pivot.position.y+(-point[0])*sn+(.065-point[1])*cs,point[2]]:point;
  const length=THREE.MathUtils.lerp(.11,.026,progress);
  for(const [mesh,inside] of [[spineShell,false],[spineJoint,true]]) {
    const p=mesh.geometry.attributes.position;
    for(let j=0;j<=40;j++) {
      const v=j/40,z=(v-.5)*(inside?pageHeight:pageHeight+.10);
      const open=inside?pastedPoint(.014/pageWidth,v):[-.04,.065-settings.coverThickness/200-boardOffset(pageWidth/2+.029-.04,z),z];
      const a=lidPoint(open),b=inside?[0,topBase-leafThickness-.0007,z]:[.04,.065-settings.coverThickness/200+boardOffset(.04-pageWidth/2-.029,z),z];
      const reach=inside?.028:length;
      const c=[a[0]-cs*reach,a[1]-sn*reach-(inside?0:.006*progress),z];
      const d=[b[0]-(inside?.028:length),b[1]-(inside?0:.006*progress),z];
      for(let i=0;i<=24;i++) {
        const t=i/24,s=1-t;
        p.setXYZ(j*25+i,s*s*s*a[0]+3*s*s*t*c[0]+3*s*t*t*d[0]+t*t*t*b[0],s*s*s*a[1]+3*s*s*t*c[1]+3*s*t*t*d[1]+t*t*t*b[1],z);
      }
    }
    if(!inside) {
      // A leather skin with closed head/tail caps. Its inner wall is offset
      // towards the book, leaving no infinitely thin protruding ribbon.
      const count=25*41,wall=.003;
      for(let j=0;j<=40;j++)for(let i=0;i<=24;i++) {
        const n=j*25+i,a=j*25+Math.max(0,i-1),b=j*25+Math.min(24,i+1);
        const dx=p.getX(b)-p.getX(a),dy=p.getY(b)-p.getY(a),length=Math.max(Math.hypot(dx,dy),.000001);
        p.setXYZ(n+count,p.getX(n)-dy/length*wall,p.getY(n)+dx/length*wall,p.getZ(n));
      }
    }
    p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
  }
  spineShell.visible=true;spineJoint.visible=printIndex===0&&progress>.08;
}

function updateCoverPaper() {
  const g=closedBook.userData.pasted.geometry,p=g.attributes.position;
  const {nx,nz,thick}=g.userData,count=(nx+1)*(nz+1);
  for(let j=0;j<=nz;j++) for(let i=0;i<=nx;i++) {
    const point=pastedPoint(i/nx,j/nz),n=j*(nx+1)+i;
    // Store it in the moving lid's coordinates. At the open endpoint this
    // is exactly the same surface as the static pasted endpaper.
    p.setXYZ(n,-point[0],.065-point[1],point[2]);
    p.setXYZ(n+count,-point[0],.065-point[1]+thick,point[2]);
  }
  p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
}

function deformBoard(g) {
  const p=g.attributes.position,a=g.userData.original;
  for(let i=0;i<p.count;i++) {
    const x=a[i*3],y=a[i*3+1],z=a[i*3+2];
    const edge=Math.pow(Math.max(Math.abs(x)/(pageWidth/2+.06),Math.abs(z)/(pageHeight/2+.07)),12);
    const nick=settings.coverDents*.004*edge*(Math.sin(x*23+z*17)+.4*Math.sin(z*51-x*33));
    p.setXYZ(i,x+nick*Math.sign(x),y*settings.coverThickness/6.4+boardOffset(x,z),z+nick*.6*Math.sign(z));
  }
  p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
}

function leafPoint(side, u, v, layer, time = 0, turn = null) {
  let [x, y, z] = leafProfile(side, u, v, layer, time,leafCounts[side],turn===null?bindingForSide(side):turning.startBinding);
  if (turn !== null) {
    const angle = turn * Math.PI, lift = Math.sin(angle);
    const destinationCount = leafCounts[-side] + 1;
    const destinationBinding = bindingHeight(turning?.next ?? printIndex);
    const destination = leafProfile(-side, u, v, destinationCount, time, destinationCount, destinationBinding);
    const hinge = THREE.MathUtils.lerp(turning.startBinding, destinationBinding, turn);
    const sheetHeight = THREE.MathUtils.lerp(y - turning.startBinding, destination[1] - destinationBinding, turn);
    const grabV = turning?.grab?.v ?? .72;
    const grabU = turning?.grab?.u ?? .92;
    // A bending ruled surface: integrate its tangent to preserve paper length.
    // The held corner leads, while the far edge lags. Lift vanishes at both ends.
    let bentX = 0, bentY = 0;
    const segments = 12, step = u / segments;
    for (let i = 0; i < segments; i++) {
      const t = (i + .5) * step;
      const lag = lift * (.58 * (t - .45) + .32 * (v - grabV) * Math.min(1, grabU + .2));
      const a = angle + lag;
      bentX += Math.cos(a) * step * pageWidth;
      bentY += Math.sin(a) * step * pageWidth;
    }
    const drift=THREE.MathUtils.lerp(Math.abs(x)-u*pageWidth,Math.abs(destination[0])-u*pageWidth,turn);
    // The sewn fold rolls over a radius of half the sheet thickness. Both
    // print faces rotate about its neutral mid-plane, so their inner corners
    // clear the rising neighbouring sheets and still exchange at the endpoints.
    x = side * (bentX + drift*Math.cos(angle) - sheetHeight * Math.sin(angle) - leafThickness*.5*Math.sin(angle));
    y = hinge + bentY + sheetHeight * Math.abs(Math.cos(angle)) + .04 * lift * Math.sin(Math.PI * u) + leafThickness*.5*(lift-1+Math.cos(angle));
    const targetZ = THREE.MathUtils.lerp(z, destination[2], turn);
    z = targetZ + lift * .035 * u * Math.sin((v - grabV) * Math.PI);
  }
  return [x, y, z];
}

function atlasUv(page, x, y) {
  const rect = bookContent.atlas.rects[page < 0 || page >= bookContent.pages.length ? bookContent.atlas.blank : page];
  return [rect.x + x * rect.w, rect.y + y * rect.h];
}

function sheetPages(side, layer) {
  const sheet = side < 0 ? layer - endpapers : bookContent.spreads.length + endpapers - layer;
  return side < 0 ? [sheet * 2, sheet * 2 - 1] : [sheet * 2 - 1, sheet * 2];
}

function makeLeaf(side, layer, nx, nz, thick, isTurning = false, atlas = false, pages = sheetPages(side, layer)) {
  const positions = [], uv = [], paperUv = [], colors = [], indices = [];
  const count = (nx + 1) * (nz + 1);
  for (let face = 0; face < 2; face++) {
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / nz;
      const p = leafPoint(side, u, v, layer);
      positions.push(p[0], p[1] - face * thick, p[2]);
      const tx = (side < 0) !== Boolean(face) ? 1 - u : u;
      uv.push(...(atlas === true || (atlas === 'back' && face) ? atlasUv(pages[face], tx, 1 - v) : [tx, 1 - v]));
      paperUv.push(.5 + (face ? -side : side) * u * .5, 1 - v);
      const ao = 1 - .16 * Math.exp(-u * 38) * (layer / leafCounts[side]);
      colors.push(ao, ao, ao);
    }
  }
  for (let face = 0; face < 2; face++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i + face * count, b = a + 1, c = a + nx + 1, d = c + 1;
    const reverse = (side < 0) !== Boolean(face);
    if (reverse) indices.push(a, b, c, b, d, c); else indices.push(a, c, b, b, c, d);
  }
  const faceIndexCount = indices.length;
  const edgeBoundary = [];
  if (isTurning) {
    for (let i = 0; i <= nx; i++) edgeBoundary.push([i / nx, 0]);
    for (let i = 1; i <= nz; i++) edgeBoundary.push([1, i / nz]);
    for (let i = nx - 1; i >= 0; i--) edgeBoundary.push([i / nx, 1]);
    // The sewn edge is inside the binding, not an exposed white cut wall.
    for (let face = 0; face < 2; face++) {
      const start = positions.length / 3;
      for (const [u, v] of edgeBoundary) {
        const p = leafPoint(side, u, v, layer);
        positions.push(p[0], p[1] - face * thick / 2, p[2], p[0], p[1] - (face + 1) * thick / 2, p[2]);
        const tx = (side < 0) !== Boolean(face) ? 1 - u : u;
        const a = atlasUv(pages[face], tx, 1 - v); uv.push(...a, ...a);
        paperUv.push(.5 + side * u * .5, 1 - v, .5 + side * u * .5, 1 - v);
        colors.push(1, 1, 1, 1, 1, 1);
      }
      for (let i = 0; i < edgeBoundary.length - 1; i++) {
        const a = start + i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('paperUv', new THREE.Float32BufferAttribute(paperUv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.addGroup(0, nx * nz * 6, 0); geometry.addGroup(nx * nz * 6, nx * nz * 6, 1);
  if (isTurning) geometry.addGroup(faceIndexCount, indices.length - faceIndexCount, 2);
  geometry.computeVertexNormals();
  geometry.userData = { side, layer, nx, nz, thick, isTurning, edgeBoundary };
  return geometry;
}

function updateLeaf(geometry, time = 0, turn = null) {
  const { side, layer, nx, nz, thick, edgeBoundary } = geometry.userData;
  const position = geometry.attributes.position;
  const count = (nx + 1) * (nz + 1);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const p = leafPoint(side, i / nx, j / nz, layer, time, turn);
    const n = j * (nx + 1) + i;
    position.setXYZ(n, p[0], p[1], p[2]);
    const angle = turn === null ? 0 : turn * Math.PI;
    position.setXYZ(n + count, p[0] + side * Math.sin(angle) * thick, p[1] - Math.cos(angle) * thick, p[2]);
  }
  const angle = turn === null ? 0 : turn * Math.PI;
  for (let face = 0; face < 2; face++) for (const [i, [u, v]] of edgeBoundary.entries()) {
    const p = leafPoint(side, u, v, layer, time, turn);
    const start = count * 2 + face * edgeBoundary.length * 2 + i * 2;
    for (let j = 0; j < 2; j++) {
      const offset = (face + j) * thick / 2;
      position.setXYZ(start + j, p[0] + side * Math.sin(angle) * offset, p[1] - Math.cos(angle) * offset, p[2]);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function makePageBlock(side) {
  const position = [], uv = [], color = [], indices = [];
  const count = leafCounts[side] - (turning?.side === side ? 1 : 0);
  for (let layer = 0; layer < count; layer++) {
    const leaf = makeLeaf(side, layer, 32, 12, leafThickness, false, true);
    const offset = position.length / 3;
    for (const value of leaf.attributes.position.array) position.push(value);
    for (const value of leaf.attributes.uv.array) uv.push(value);
    for (const value of leaf.attributes.color.array) color.push(value);
    for (const value of leaf.index.array) indices.push(value + offset);
    leaf.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function makeEdges(side) {
  // Separate thickness faces: sharp paper edges, without smoothing the top normal.
  const points = [], uv = [], indices = [];
  const count = leafCounts[side] - (turning?.side === side ? 1 : 0);
  for (let layer = 0; layer <= count; layer++) {
    const boundaries = [];
    for (let i = 0; i <= 32; i++) boundaries.push([i / 32, 0]);
    for (let i = 1; i <= 24; i++) boundaries.push([1, i / 24]);
    for (let i = 31; i >= 0; i--) boundaries.push([i / 32, 1]);
    const pages = sheetPages(side, layer);
    // The two print faces tint separate halves of the cut edge, with a paper
    // core mixed into the edge shader. There is no texture stretched vertically
    // through the whole block, nor an exposed wall along the sewn central fold.
    for (let face = 0; face < 2; face++) {
      const start = points.length / 3;
      for (const [u, v] of boundaries) {
        const p = leafPoint(side, u, v, layer);
        const tx = (side < 0) !== Boolean(face) ? 1 - u : u;
        points.push(p[0], p[1] - face * leafThickness / 2, p[2], p[0], p[1] - (face + 1) * leafThickness / 2, p[2]);
        const a = atlasUv(pages[face], tx, 1 - v); uv.push(...a, ...a);
      }
      for (let i = 0; i < boundaries.length - 1; i++) {
        const a = start + i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, inkMaterials.edge); mesh.userData.side = side; mesh.receiveShadow = true; book.add(mesh);
  return mesh;
}
let edgeMeshes = [];
function rebuildEdges() {
  for (const mesh of edgeMeshes) { book.remove(mesh); mesh.geometry.dispose(); }
  edgeMeshes = [makeEdges(-1), makeEdges(1)];
}

function rebuildPageBlocks() {
  leafCounts[-1] = printIndex + endpapers;
  leafCounts[1] = bookContent.spreads.length - 1 - printIndex + endpapers;
  topBase = bindingHeight(printIndex);
  updateSewing();
  stitches.position.y = topBase + .0006;
  for (const [i, side] of [-1, 1].entries()) {
    stackLeaves[i].geometry.dispose(); stackLeaves[i].geometry = makePageBlock(side);
    topLeaves[i].geometry.dispose(); topLeaves[i].geometry = makeLeaf(side, leafCounts[side], 96, 40, leafThickness, false, 'back');
  }
  rebuildEdges();
  stackLeaves[0].visible=printIndex!==0;
  if(printIndex===0) {stackLeaves[0].visible=false;edgeMeshes[0].visible=false;}
  diagnostics.physicalLeaves = leafCounts[-1] + leafCounts[1] + 2;
}

function updateSewing() {
  const top=topBase-leafThickness-.0007;
  sewnSpine.scale.y=Math.max(.001,top-leafBase);sewnSpine.position.y=(leafBase+top)/2;
}
function updateTurnBinding() {
  topBase=THREE.MathUtils.lerp(turning.startBinding,bindingHeight(turning.next),turning.progress);
  for(const mesh of [...stackLeaves,...edgeMeshes]) {
    if(!mesh.userData.turnRest) mesh.userData.turnRest=new Float32Array(mesh.geometry.attributes.position.array);
    const p=mesh.geometry.attributes.position,rest=mesh.userData.turnRest,side=mesh.userData.side;
    const delta=bindingForSide(side)-turning.startBinding;
    for(let i=0;i<p.count;i++) p.setY(i,rest[i*3+1]+delta*Math.exp(-Math.abs(rest[i*3])/pageWidth*12));
    p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
  }
  for(const mesh of topLeaves) updateLeaf(mesh.geometry,0);
  updateSewing();stitches.position.y=topBase+.0006;updateBinding();
}

function buildBook() {
  book = new THREE.Group(); scene.add(book);
  coverMaterial = createCoverMaterial(settings, emblemMap);
  stampedMaterial = createCoverMaterial(settings, emblemMap, true);
  const boardGeo = boardGeometry();
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(boardGeo, coverMaterial);
    board.userData.side = side; board.userData.board = true;
    if(side<0) board.rotation.z=Math.PI;
    board.position.set(side * (pageWidth / 2 + .029), .065, 0); board.castShadow = board.receiveShadow = true; book.add(board);
  }
  sewnSpine = new THREE.Mesh(new THREE.BoxGeometry(.0035, 1, pageHeight - .06), new THREE.MeshStandardMaterial({ color: 0x111110, roughness: .98 }));
  sewnSpine.scale.y = topBase - .105; sewnSpine.position.y = (.105 + topBase) / 2 - .0035; book.add(sewnSpine);
  whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f8f5, roughness: .78, vertexColors: true });
  inkMaterials = { leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .58, vertexColors: true, map: blockAtlas }), edge: createCutMaterial(settings, blockAtlas) };
  pageMaterials = [createPaperMaterial(settings, grainMap), createPaperMaterial(settings, grainMap)];
  blackPaperMaterial=createPaperMaterial(settings,grainMap);blackPaperMaterial.color.set(0x101010);blackPaperMaterial.userData.paperUniforms.uMonochrome.value=1;
  for (const side of [-1, 1]) {
    const block = new THREE.Mesh(makePageBlock(side), inkMaterials.leaf);
    block.userData.side = side; block.castShadow = block.receiveShadow = true; book.add(block); stackLeaves.push(block);
    const top = new THREE.Mesh(makeLeaf(side, leafCounts[side], 96, 40, leafThickness, false, 'back'), [pageMaterials[side < 0 ? 0 : 1], inkMaterials.leaf]);
    top.castShadow = top.receiveShadow = true; book.add(top); topLeaves.push(top);
  }
  rebuildEdges();
  makeStitches();
  makeClosedBook();
  makeBinding();
  makeContactShadow();
}

function makeStitches() {
  const thread = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.009, 0, -.001), new THREE.Vector3(-.004, .0017, 0),
    new THREE.Vector3(.004, .0017, 0), new THREE.Vector3(.009, 0, .001)
  ]);
  stitches = new THREE.InstancedMesh(new THREE.TubeGeometry(thread, 8, .0009, 5, false), new THREE.MeshStandardMaterial({color:0xc4c0b5,roughness:.86}), 9);
  const matrix = new THREE.Matrix4();
  for (let i=0;i<9;i++) { matrix.makeTranslation(0,0,(i-4)*.29); stitches.setMatrixAt(i,matrix); }
  stitches.position.y=topBase+.0006; stitches.castShadow=stitches.receiveShadow=true; book.add(stitches);
}

function makeClosedBook() {
  closedBook=new THREE.Group(); closedBook.visible=false; book.add(closedBook);
  closedBook.position.x=pageWidth/2+.029;
  const sheets=bookContent.spreads.length+endpapers*2+1;
  const height=sheets*leafSpacing;
  const boardGeo=boardGeometry();
  const core=new THREE.Group();closedBook.add(core);
  const bottom=new THREE.Mesh(boardGeo,coverMaterial);bottom.position.y=.065;bottom.castShadow=bottom.receiveShadow=true;core.add(bottom);
  const pivot=new THREE.Group();pivot.position.set(-pageWidth/2-.029,leafBase+height+settings.coverThickness/200,0);closedBook.add(pivot);
  const top=new THREE.Mesh(boardGeo,[coverMaterial,coverMaterial,stampedMaterial,coverMaterial,coverMaterial,coverMaterial]);
  top.position.x=pageWidth/2+.029;top.castShadow=top.receiveShadow=true;pivot.add(top);
  const pasted=new THREE.Mesh(makeLeaf(-1,endpapers,96,40,leafThickness),[pageMaterials[0],blackPaperMaterial]);
  pasted.castShadow=pasted.receiveShadow=true;pivot.add(pasted);
  closedBook.userData={pivot,core,pasted,topY:pivot.position.y};updateCoverPaper();
  rebuildClosedCuts();
}
function rebuildClosedCuts() {
  const core=closedBook.userData.core,previous=closedBook.userData.edge;
  if(previous){core.remove(previous);previous.geometry.dispose();}
  const sheets=bookContent.spreads.length+endpapers*2+1,points=[],uv=[],indices=[];
  const perimeter=[];
  for(let i=0;i<=40;i++)perimeter.push([i/40,0]);
  for(let i=1;i<=40;i++)perimeter.push([1,i/40]);
  for(let i=39;i>=0;i--)perimeter.push([i/40,1]);
  for(let i=39;i>=0;i--)perimeter.push([0,i/40]);
  for(let i=0;i<sheets;i++) {
    const front=i*2-endpapers*2,back=front+1;
    for(let face=0;face<2;face++) {
      const start=points.length/3;
      for(const [u,v] of perimeter) {
        const x=(u-.5)*pageWidth-.029+settings.edges*.006*Math.sin(i*2.4)*u;
        const z=(v-.5)*pageHeight+settings.edges*.004*Math.cos(i*1.9)*u;
        const y=leafBase+i*leafSpacing+boardOffset(x,z);
        points.push(x,y-face*leafThickness/2,z,x,y-(face+1)*leafThickness/2,z);
        const a=atlasUv(face?back:front,u,1-v);uv.push(...a,...a);
      }
      for(let j=0;j<perimeter.length-1;j++){const a=start+j*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const edge=new THREE.Mesh(g,inkMaterials.edge);edge.castShadow=edge.receiveShadow=true;core.add(edge);closedBook.userData.edge=edge;

}

let contactResources;
function makeContactShadow() {
  const width = 6.5, height = 4.5, size = 768;
  const raw = new THREE.WebGLRenderTarget(size, size);
  const blurred = new THREE.WebGLRenderTarget(size, size);
  const scratch = new THREE.WebGLRenderTarget(size, size);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - fragCoordZ) * .65);');
  };
  const capture = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .001, .9);
  const blur = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { image: { value: raw.texture }, direction: { value: new THREE.Vector2(2 / size, 0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D image; uniform vec2 direction;
      void main(){ vec4 c=texture2D(image,vUv)*.227027;
      c+=(texture2D(image,vUv+direction*1.384615)+texture2D(image,vUv-direction*1.384615))*.316216;
      c+=(texture2D(image,vUv+direction*3.230769)+texture2D(image,vUv-direction*3.230769))*.070270;
      gl_FragColor=c; }`
  });
  const blurScene = new THREE.Scene(); blurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur));
  contactResources = { raw, blurred, scratch, depth, capture, blur, blurScene, quadCamera: new THREE.Camera(), size };
  ambientShadow = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: blurred.texture, transparent: true, depthWrite: false, opacity: settings.shadow, side: THREE.DoubleSide }));
  ambientShadow.rotation.x = Math.PI / 2; ambientShadow.position.y = .004; book.add(ambientShadow);
}

function renderContactShadow() {
  const r = contactResources;
  if (!r) return;
  const previousTarget = renderer.getRenderTarget();
  const previousBackground = scene.background, previousOverride = scene.overrideMaterial;
  const shadows = renderer.shadowMap.enabled;
  const table = scene.children.find(child => child.material?.isShadowMaterial);
  const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
  ambientShadow.visible = false; table.visible = false;
  scene.background = null; scene.overrideMaterial = r.depth; renderer.shadowMap.enabled = false;
  book.updateMatrixWorld(true);
  r.capture.position.copy(book.localToWorld(new THREE.Vector3(0,.003,0)));
  r.capture.up.set(0,0,1).applyQuaternion(book.quaternion);
  r.capture.lookAt(book.localToWorld(new THREE.Vector3(0,1,0)));r.capture.updateMatrixWorld();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(r.raw); renderer.clear(); renderer.render(scene, r.capture);
  scene.overrideMaterial = previousOverride; scene.background = previousBackground; table.visible = true;
  r.blur.uniforms.image.value = r.raw.texture; r.blur.uniforms.direction.value.set(2 / r.size, 0);
  renderer.setRenderTarget(r.scratch); renderer.clear(); renderer.render(r.blurScene, r.quadCamera);
  r.blur.uniforms.image.value = r.scratch.texture; r.blur.uniforms.direction.value.set(0, 2 / r.size);
  renderer.setRenderTarget(r.blurred); renderer.clear(); renderer.render(r.blurScene, r.quadCamera);
  renderer.shadowMap.enabled = shadows; renderer.setClearColor(clearColor, clearAlpha); renderer.setRenderTarget(previousTarget);
  ambientShadow.visible = true;
}

async function setEnvironment(texture, name) {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const previous = environment;
  environment = pmrem.fromEquirectangular(texture);
  scene.environment = environment.texture;
  if (previous) previous.dispose();
  pmrem.dispose();
  document.querySelector('#environment-name').textContent = name;
  applySettings();
}

async function pageTexture(page) {
  const record = bookContent.pages[page];
  if (!record || record.blank) return null;
  if (!textureCache.has(record.file)) {
    const entry = { texture: null };
    entry.promise = new THREE.TextureLoader().loadAsync('./' + record.file).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      entry.texture = texture;
      if (textureCache.get(record.file) !== entry) texture.dispose();
      return texture;
    });
    textureCache.set(record.file, entry);
  }
  return textureCache.get(record.file).promise;
}

function openingTextures(index) { return Promise.all(bookContent.spreads[index].pages.map(pageTexture)); }

function trimTextureCache() {
  const keep = new Set();
  for (const index of [printIndex - 1, printIndex, printIndex + 1]) {
    if (!bookContent.spreads[index]) continue;
    for (const page of bookContent.spreads[index].pages) keep.add(bookContent.pages[page].file);
  }
  for (const [file, entry] of textureCache) if (!keep.has(file)) { entry.texture?.dispose(); textureCache.delete(file); }
  diagnostics.cachedPageTextures = textureCache.size;
}

function updateNavigation() {
  const spread = bookContent.spreads[printIndex];
  const chapter = bookContent.chapters.find(item => item.id === spread.chapter);
  document.querySelector('#contents-toggle').textContent = document.documentElement.lang==='en'?'CONTENTS':'СОДЕРЖАНИЕ';
  const busy=navigating||Boolean(turning)||Boolean(coverMotion)||Boolean(cameraTween);
  document.querySelector('#previous').disabled = busy || closedBook?.visible || printIndex === 0;
  document.querySelector('#turn').disabled = busy || (!closedBook?.visible && printIndex === bookContent.spreads.length - 1);
  document.querySelector('#turn').textContent = closedBook?.visible ? 'Открыть' : 'Лист →';
  document.querySelector('#turn').setAttribute('aria-label',closedBook?.visible ? 'Открыть книгу' : 'Следующий разворот');
  document.querySelector('#blank-toggle').setAttribute('aria-pressed', String(blankPrint));
  for (const button of document.querySelectorAll('[data-opening]')) button.setAttribute('aria-current', Number(button.dataset.opening) === chapter.start ? 'true' : 'false');
  diagnostics.opening = spread.id;
  diagnostics.layout = spread.layout;
  diagnostics.visiblePages = [...spread.pages];
}

function applyPrint(index = printIndex) {
  const changed = index !== printIndex;
  printIndex = index;
  for (const [i, page] of bookContent.spreads[index].pages.entries()) {
    const record = bookContent.pages[page];
    pageMaterials[i].map = blankPrint || record.blank ? null : textureCache.get(record.file)?.texture;
    assignPageSurface(pageMaterials[i],page);
    pageMaterials[i].needsUpdate = true;
  }
  for (const material of Object.values(inkMaterials)) { material.map = blankPrint ? null : blockAtlas; material.needsUpdate = true; }
  if (changed) { rebuildPageBlocks(); updateBinding(); renderContactShadow(); }
  updateNavigation(); trimTextureCache();
  for (const adjacent of [index - 1, index + 1]) if (bookContent.spreads[adjacent]) openingTextures(adjacent).catch(error => { console.error(error); });
}

function assignPageSurface(material,page) {
  const record=bookContent.pages[page];
  const spread=bookContent.spreads.find(s=>s.id===record?.spread),side=record?.side==='right'?1:0;
  const hasImage=spread?.images?.some(image=>image.box[0]<(side+1)*268&&image.box[0]+image.box[2]>side*268);
  material.userData.paperUniforms.uTextInk.value=spread?.textPages?.[side]&&!hasImage?1:0;
  material.userData.paperUniforms.uPhotoBleed.value=record?.fullBleed?1:0;
  material.color.set(record?.paper==='black'?0x101010:0xffffff);
  material.userData.paperUniforms.uPageSeed.value=page+1;
  material.userData.paperUniforms.uMonochrome.value=record?.monochrome||record?.paper==='black'?1:0;
}

async function goToOpening(index) {
  if (navigating || turning || coverMotion || cameraTween) return;
  if (imageFocus) await restoreSpread();
  if (closedBook.visible) fitCamera('spread', false);
  if (index === printIndex) return;
  navigating = true; updateNavigation();
  try { await openingTextures(index); applyPrint(index); }
  catch (error) { fail(error); }
  finally { navigating = false; updateNavigation(); }
}

function applySettings(shapeChanged = false) {
  if (!renderer || !pageMaterials) return;
  renderer.toneMappingExposure = settings.exposure;
  scenePhoto?.update(settings);
  scene.environmentIntensity = .65;
  scene.environmentRotation.y = THREE.MathUtils.degToRad(settings.studio);
  keyLight.intensity = 2.6 * settings.light;
  fillLight.intensity = .7 * settings.light;
  const angle = THREE.MathUtils.degToRad(settings.studio);
  keyLight.position.set(-3.2 * Math.cos(angle) + 2 * Math.sin(angle), 6.5, 2 * Math.cos(angle) + 3.2 * Math.sin(angle));
  const t = clock.getElapsedTime();
  for (const material of [...pageMaterials,blackPaperMaterial, ...(turnMesh?.material.slice(0, 2) ?? [])]) updatePaperMaterial(material, settings);
  ambientShadow.material.opacity = settings.shadow;
  updateCoverMaterial(coverMaterial, settings); updateCoverMaterial(stampedMaterial, settings);
  if(spineMaterial) updateCoverMaterial(spineMaterial,settings);
  inkMaterials.edge.userData.cutUniforms.uEdgeWear.value = settings.edgeWear;
  inkMaterials.edge.userData.cutUniforms.uEdgeFibres.value = settings.edgeFibres;
  if (shapeChanged) {
    leafBase=.065+settings.coverThickness/200+leafThickness+.0015;
    for(const g of boardGeometries) deformBoard(g);
    rebuildClosedCuts();
    closedBook.userData.topY=leafBase+(bookContent.spreads.length+endpapers*2+1)*leafSpacing+settings.coverThickness/200;
    if(closedBook.visible&&!coverMotion) closedBook.userData.pivot.position.y=closedBook.userData.topY;
    updateCoverPaper();
    rebuildPageBlocks();
    for (const mesh of topLeaves) updateLeaf(mesh.geometry, t);
    if(closedBook.visible) setCoverPose(coverProgress);
    updateBinding();
    renderContactShadow();
  }
}

function fitCamera(view = 'spread', animate = true) {
  if (turning || gesture || coverMotion) return;
  cameraTween?.resolve?.();
  imageFocus = null;
  diagnostics.focusedImage = null;
  const coverSurface = view === 'surface' && closedBook.visible;
  const coverMode = view === 'cover' || coverSurface;
  closedBook.userData.pivot.rotation.z=0;
  closedBook.userData.pivot.position.y=closedBook.userData.topY;
  closedBook.userData.core.visible=true;
  coverProgress=coverMode?0:1;
  for (const child of book.children) if (child !== ambientShadow) child.visible = coverMode ? child === closedBook : child !== closedBook;
  currentView = view; diagnostics.preset = view;
  // A fixed, longer lens keeps the lifted sheet inside the original framing.
  camera.fov = view === 'spread' || view === 'cover' ? 17 : 31; camera.updateProjectionMatrix();
  book.rotation.y = innerWidth < innerHeight * .78 && !coverMode ? Math.PI / 2 : 0;
  book.position.set(coverMode?-pageWidth/2:0,0,0);
  const target = new THREE.Vector3(0, .2, 0);
  let position;
  if (view === 'surface' && coverSurface) {
    target.set(.22, leafBase + (bookContent.spreads.length + endpapers * 2 + 1) * leafSpacing + .064, -.54);
    position = target.clone().add(new THREE.Vector3(0,.65,.14));
  } else if (view === 'surface') {
    target.set(-1.25, .33, -.72).applyQuaternion(book.quaternion);
    const direction = new THREE.Vector3(.03, .97, .24).normalize().applyQuaternion(book.quaternion);
    position = target.clone().addScaledVector(direction, .65);
  } else if (view === 'detail') {
    target.set(1.76, .19, pageHeight / 2 - .08).applyQuaternion(book.quaternion);
    const direction = new THREE.Vector3(.6, .54, .73).normalize().applyQuaternion(book.quaternion);
    position = target.clone().addScaledVector(direction, 2.5);
  } else {
    // A tiny pole offset keeps OrbitControls stable; visually this is directly overhead.
    const direction = view === 'profile' ? new THREE.Vector3(0, .13, 1).normalize().applyQuaternion(book.quaternion) : new THREE.Vector3(0, 1, .000001).normalize();
    const frameRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),innerWidth<innerHeight*.78?Math.PI/2:0);
    const bounds = [];
    for (const x of [-2.81, 2.81]) for (const y of [.032, .58]) for (const z of [-(pageHeight + .18) / 2, (pageHeight + .18) / 2]) bounds.push(new THREE.Vector3(x, y, z).applyQuaternion(view==='cover'?frameRotation:book.quaternion));
    const probe = camera.clone();
    let min = 1, max = 32;
    const verticalLimit = Math.max(.48, 1 - (innerHeight < 480 ? 115 : 180) / innerHeight);
    for (let i = 0; i < 25; i++) {
      const d = (min + max) / 2;
      probe.position.copy(target).addScaledVector(direction, d); probe.lookAt(target); probe.updateMatrixWorld();
      const fits = bounds.every(corner => { const p = corner.clone().project(probe); return Math.abs(p.x) < .935 && Math.abs(p.y) < verticalLimit; });
      if (fits) max = d; else min = d;
    }
    position = target.clone().addScaledVector(direction, max);
  }
  if (!animate || reducedMotion.matches) { camera.position.copy(position); controls.target.copy(target); camera.lookAt(target); cameraTween = null; }
  else cameraTween = { start: performance.now(), from: camera.position.clone(), to: position, fromTarget: controls.target.clone(), toTarget: target };
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  controls.update();syncOrbit();
  if(!coverMode&&printIndex===0){stackLeaves[0].visible=false;edgeMeshes[0].visible=false;}
  updateBinding();
  updateNavigation(); renderContactShadow();
}

function resize() {
  if (coverMotion) finishCoverOpening((coverMotion.to??coverMotion.target)>.5);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setViewport(0, 0, viewportWidth(), innerHeight);
  camera.aspect = viewportWidth() / innerHeight; camera.updateProjectionMatrix();
  scenePhoto?.resize(innerWidth,innerHeight,viewportWidth());
  // Keep the printed text upright; a single page is framed vertically in cover view.
  book.rotation.y = innerWidth < innerHeight * .78 && currentView !== 'cover' ? Math.PI / 2 : 0;
  fitCamera(currentView, false);
  renderContactShadow();
}

function setCoverPose(progress) {
  coverProgress=progress;diagnostics.coverProgress=progress;
  const angle=(innerWidth<innerHeight*.78?Math.PI/2:0)*progress;
  book.rotation.y=angle;
  book.position.set(-pageWidth/2*(1-progress)*Math.cos(angle),0,pageWidth/2*(1-progress)*Math.sin(angle));
  closedBook.visible=true;
  closedBook.userData.pivot.rotation.z=Math.PI*progress;
  const lowering=THREE.MathUtils.smoothstep(progress,.58,1);
  closedBook.userData.pivot.position.y=THREE.MathUtils.lerp(closedBook.userData.topY,.065,lowering);
  closedBook.userData.core.visible=progress<=.12;
  for (const child of book.children) {
    if (child===closedBook||child===ambientShadow) continue;
    const side=child.userData.side??child.geometry?.userData.side;
    child.visible=side<0 ? false : progress>.12;
    if (child.userData.board&&side<0) child.visible=false;
  }
  updateBinding();
}

function finishCoverOpening(open = true) {
  coverMotion=null;coverProgress=open?1:0;currentView=open?'spread':'cover';diagnostics.preset=currentView;diagnostics.coverProgress=coverProgress;
  setCoverPose(coverProgress);
  for (const child of book.children) if(child!==ambientShadow) child.visible=open?child!==closedBook:child===closedBook;
  if(open&&printIndex===0){stackLeaves[0].visible=false;edgeMeshes[0].visible=false;}
  updateBinding();
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed',String(b.dataset.view===currentView));
  syncOrbit();updateNavigation();renderContactShadow();
}

function settleCover(target) {
  coverMotion={start:performance.now(),from:coverProgress,to:target,duration:reducedMotion.matches?170:Math.max(180,780*Math.abs(target-coverProgress))};
  updateNavigation();
}

async function openCover() {
  if (!closedBook.visible||turning||navigating||coverMotion) return;
  if (currentView!=='cover') fitCamera('cover',false);
  navigating=true;updateNavigation();
  try {await openingTextures(0);applyPrint(0);}
  catch(error){navigating=false;fail(error);return;}
  navigating=false;cameraTween=null;setCoverPose(0);
  settleCover(1);
  diagnostics.coverProgress=0;updateNavigation();
}

async function closeCover() {
  if(turning||navigating||coverMotion||cameraTween) return;
  if(imageFocus) await restoreSpread();
  await goToOpening(0);setCoverPose(1);settleCover(0);
}

function syncOrbit() {
  if(!controls) return;
  const enabled=editorMode&&orbitMode&&!turning&&!gesture&&!coverMotion&&!cameraTween;
  controls.enabled=enabled;controls.enableRotate=enabled;controls.enablePan=enabled;controls.enableZoom=enabled;
  document.querySelector('#orbit-toggle')?.setAttribute('aria-pressed',String(orbitMode));
}

function moveCamera(position,target,rotation,resolve=()=>{}) {
  cameraTween?.resolve?.();
  cameraTween={start:performance.now(),duration:reducedMotion.matches?0:480,from:camera.position.clone(),to:position,
    fromTarget:controls.target.clone(),toTarget:target,fromRotation:book.rotation.y,toRotation:rotation,resolve};
  updateNavigation();
}

function restoreSpread(animate=true) {
  if (!imageFocus) return Promise.resolve();
  const original=imageFocus.original;imageFocus=null;diagnostics.focusedImage=null;
  if (!animate) {
    camera.position.copy(original.position);controls.target.copy(original.target);book.rotation.y=original.rotation;
    camera.lookAt(controls.target);cameraTween?.resolve?.();cameraTween=null;updateNavigation();return Promise.resolve();
  }
  return new Promise(resolve=>moveCamera(original.position,original.target,original.rotation,resolve));
}

function zoomPrintedContent(local) {
  if (imageFocus) {restoreSpread();return true;}
  if (currentView!=='spread'||blankPrint) return false;
  const spread=bookContent.spreads[printIndex],x=268+local.x*100,y=151+local.z*100;
  const side=x>=268?1:0;
  const image=spread.images?.find(item=>x>=item.box[0]&&x<=item.box[0]+item.box[2]&&y>=item.box[1]&&y<=item.box[1]+item.box[3]);
  if (!image&&!spread.textPages?.[side]) return false;
  const box=image?.box||[side*268+18,18,232,266];
  const left=Math.max(side*268,box[0]),right=Math.min((side+1)*268,box[0]+box[2]);
  const target=new THREE.Vector3(((left+right)/2-268)/100,.30,(box[1]+box[3]/2-151)/100);
  // A single-page close view is upright on a phone. The spread orientation
  // and precise camera state are retained for the second tap / Escape.
  const original={position:camera.position.clone(),target:controls.target.clone(),rotation:book.rotation.y};
  const verticalLimit=Math.max(.5,1-(innerHeight<480?115:180)/innerHeight);
  const distance=Math.max(1.2,Math.max(box[3]/100/verticalLimit,(right-left)/100/camera.aspect/.9)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.04);
  imageFocus={asset:image?.asset||'text:'+spread.id,original};diagnostics.focusedImage=imageFocus.asset;
  moveCamera(target.clone().add(new THREE.Vector3(0,distance,.00001)),target,0);
  if(innerWidth<=600&&spread.readingText?.[side]) {
    const reader=document.querySelector('#text-reader'),text=spread.readingText[side];
    reader.querySelector('h2').textContent=text.title;reader.querySelector('p').textContent=text.body;
    reader.showModal();const readingBody=reader.querySelector('.text-reader-body');readingBody.scrollTop=0;readingBody.focus({preventScroll:true});
  }
  return true;
}

async function beginTurn(direction = 1, grab = null) {
  const next = printIndex + direction;
  if (turning || navigating || closedBook?.visible || !bookContent.spreads[next]) return false;
  navigating = true; updateNavigation();
  let nextTextures;
  try { nextTextures = await openingTextures(next); }
  catch (error) { navigating = false; updateNavigation(); fail(error); return false; }
  const side = direction > 0 ? 1 : -1;
  const frontIndex = side > 0 ? 1 : 0, backIndex = 1 - frontIndex;
  const material = createPaperMaterial(settings, grainMap), back = createPaperMaterial(settings, grainMap);
  material.map = pageMaterials[frontIndex].map;
  back.map = blankPrint ? null : nextTextures[backIndex];
  assignPageSurface(material,bookContent.spreads[printIndex].pages[frontIndex]);
  assignPageSurface(back,bookContent.spreads[next].pages[backIndex]);
  updatePaperMaterial(material, settings); updatePaperMaterial(back, settings);
  const printedPages = [bookContent.spreads[printIndex].pages[frontIndex], bookContent.spreads[next].pages[backIndex]];
  turnMesh = new THREE.Mesh(makeLeaf(side, leafCounts[side], 96, 40, leafThickness, true, false, printedPages), [material, back, inkMaterials.edge]);
  turnMesh.castShadow = turnMesh.receiveShadow = true; book.add(turnMesh);
  pageMaterials[frontIndex].map = blankPrint ? null : nextTextures[frontIndex]; pageMaterials[frontIndex].needsUpdate = true;
  assignPageSurface(pageMaterials[frontIndex],bookContent.spreads[next].pages[frontIndex]);
  topLeaves[frontIndex].geometry.dispose(); topLeaves[frontIndex].geometry = makeLeaf(side, leafCounts[side] - 1, 96, 40, leafThickness, false, 'back');
  turning = { next, side, grab, progress: 0, target: 0, settle: null, startBinding:topBase };
  cameraTween = null; hover.strength = hover.target = 0;
  stackLeaves[frontIndex].geometry.dispose(); stackLeaves[frontIndex].geometry = makePageBlock(side);
  rebuildEdges();
  if(printIndex===0) {stackLeaves[0].visible=false;edgeMeshes[0].visible=false;}
  navigating = false; updateNavigation(); return true;
}

function settleTurn(target) {
  if (!turning) return;
  const distance = Math.abs(target-turning.progress);
  turning.settle = { start: performance.now(), from: turning.progress, to: target, duration: reducedMotion.matches ? 170 : Math.max(170, 650 * distance) };
}

async function turnPage(direction = 1) {
  if (navigating||turning||coverMotion||cameraTween) return;
  if (closedBook.visible) {if(direction>0) await openCover();return;}
  if(direction<0 && printIndex===0) {await closeCover();return;}
  if (coverMotion) return;
  if (imageFocus) await restoreSpread();
  if (await beginTurn(direction)) settleTurn(1);
}

function finishTurn(completed = true) {
  const next = completed ? turning.next : printIndex;
  topBase=bindingHeight(next);
  for(const mesh of [...stackLeaves,...edgeMeshes])delete mesh.userData.turnRest;
  turnMesh.geometry.dispose();
  for (const m of turnMesh.material.slice(0, 2)) m.dispose();
  book.remove(turnMesh); turnMesh = null; turning = null;
  // A cancelled grab restores the original high-resolution faces and blocks.
  if (!completed) rebuildPageBlocks();
  applyPrint(next); updateNavigation(); syncOrbit();
}

function pointerRay(event) {
  const r = canvas.getBoundingClientRect();
  mouse.set((event.clientX-r.left)/viewportWidth()*2-1,-(event.clientY-r.top)/r.height*2+1);
  raycaster.setFromCamera(mouse,camera);
}

function pointerOnPaper(event) {
  pointerRay(event); book.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0,1,0).applyQuaternion(book.quaternion);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal,book.localToWorld(new THREE.Vector3(0,topBase,0)));
  const point = raycaster.ray.intersectPlane(plane,new THREE.Vector3());
  return point ? book.worldToLocal(point) : null;
}

function dragTarget(event) {
  const point = pointerOnPaper(event);
  if (!point || !gesture) return;
  const ratio = THREE.MathUtils.clamp(gesture.side * point.x / gesture.radius,-1,1);
  gesture.target = Math.acos(ratio)/Math.PI;
  gesture.distance = Math.max(gesture.distance,Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y));
  if (turning && gesture.distance > 5) turning.target=gesture.target;
}

function connectPageDrag() {
  let backgroundGesture=null;
  // A short tap inspects the print; only a deliberate drag picks up a sheet.
  // Capture the gesture before controls so the table never moves the camera.
  const startDrag=async token=>{
    token.started=true;
    if (await beginTurn(token.side,token.grab)) {
      if (token.released) settleTurn(token.cancelled?0:token.target>.43?1:0);
      else turning.target=token.target;
    }
  };
  const startCoverDrag=async token=>{
    token.started=true;
    if(printIndex!==0) {
      navigating=true;updateNavigation();
      try{await openingTextures(0);applyPrint(0);}catch(error){fail(error);return;}finally{navigating=false;}
    }
    setCoverPose(token.coverStart);
    coverMotion={drag:true,progress:token.coverStart,target:token.target};
    if(token.released) settleCover(token.cancelled?token.coverStart:token.target>.5?1:0);
    updateNavigation();
  };
  const coverTarget=event=>{
    const delta=(event.clientX-gesture.x)*gesture.axis.x+(event.clientY-gesture.y)*gesture.axis.y;
    gesture.target=THREE.MathUtils.clamp(gesture.coverStart-delta/(gesture.span*1.5),0,1);
    if(coverMotion?.drag) coverMotion.target=gesture.target;
  };
  canvas.addEventListener('pointerdown',event=>{
    if(!event.isPrimary) backgroundGesture=null;
    if (event.button!==0 || !event.isPrimary || gesture) return;
    if(editorMode&&orbitMode) return;
    if (turning || navigating || coverMotion || cameraTween) { event.stopImmediatePropagation(); return; }
    pointerRay(event);
    book.updateMatrixWorld(true);
    let kind=imageFocus?'focus':closedBook.visible?'cover':'paper';
    const hit=kind==='cover'?raycaster.intersectObject(closedBook,true)[0]:raycaster.intersectObjects(topLeaves)[0];
    if (!hit && kind!=='focus') {
      if(embedded&&event.pointerType==='touch') backgroundGesture={id:event.pointerId,x:event.clientX,y:event.clientY};
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation(); hover.strength=hover.target=0;
    const local=hit?book.worldToLocal(hit.point.clone()):null;
    const side=hit?.object.geometry.userData.side;
    if(kind==='paper'&&side<0&&printIndex===0) kind='cover';
    if(event.pointerType==='touch'&&kind==='paper') {hover.side=side;hover.u=Math.abs(local.x)/pageWidth;hover.v=local.z/pageHeight+.5;hover.target=THREE.MathUtils.clamp(event.pressure*2,.25,1);}
    const a=book.localToWorld(new THREE.Vector3(0,topBase,0)).project(camera),b=book.localToWorld(new THREE.Vector3(pageWidth,topBase,0)).project(camera);
    const axis=new THREE.Vector2((b.x-a.x)*viewportWidth(),-(b.y-a.y)*innerHeight),span=axis.length()/2;axis.normalize();
    gesture={id:event.pointerId,kind,local,side,x:event.clientX,y:event.clientY,
      coverStart:coverProgress,axis,span,target:coverProgress,
      radius:Math.max(.16,Math.abs(local?.x??0)),distance:0,released:false,cancelled:false,started:false,
      grab:local?{u:THREE.MathUtils.clamp(Math.abs(local.x)/pageWidth,.05,1),v:THREE.MathUtils.clamp(local.z/pageHeight+.5,0,1)}:null};
    canvas.setPointerCapture(event.pointerId);
  },true);
  canvas.addEventListener('pointermove',event=>{
    if (!gesture || event.pointerId!==gesture.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    gesture.distance=Math.max(gesture.distance,Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y));
    if(gesture.kind==='cover') {
      coverTarget(event);
      if(gesture.distance>6&&!gesture.started) startCoverDrag(gesture);
      return;
    }
    if (gesture.kind!=='paper') return;
    if(event.pointerType==='touch'&&!gesture.started) {const point=pointerOnPaper(event);if(point){hover.u=Math.abs(point.x)/pageWidth;hover.v=point.z/pageHeight+.5;hover.target=THREE.MathUtils.clamp(event.pressure*2,.25,1);}}
    dragTarget(event);
    if (gesture.distance>6&&!gesture.started&&bookContent.spreads[printIndex+gesture.side]) startDrag(gesture);
  },true);
  const release=(event,cancelled=false)=>{
    if(backgroundGesture?.id===event.pointerId) {
      const dx=event.clientX-backgroundGesture.x,dy=event.clientY-backgroundGesture.y;
      if(!cancelled&&Math.abs(dy)>45&&Math.abs(dy)>Math.abs(dx)*1.2) parent.postMessage({type:'book-swipe',direction:dy<0?1:-1},location.origin);
      backgroundGesture=null;return;
    }
    if (!gesture || event.pointerId!==gesture.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!cancelled&&gesture.kind==='paper') dragTarget(event);
    if(!cancelled&&gesture.kind==='cover') coverTarget(event);
    if(event.pointerType==='touch') hover.target=0;
    const token=gesture; token.released=true; token.cancelled=cancelled;
    if (turning) settleTurn(cancelled?0:token.target>.43?1:0);
    if(coverMotion?.drag) settleCover(cancelled?token.coverStart:token.target>.5?1:0);
    gesture=null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!cancelled&&!token.started&&token.distance<=6) {
      if (token.kind==='cover') token.coverStart===0?openCover():closeCover();
      else if (token.kind==='focus') restoreSpread();
      else if (!zoomPrintedContent(token.local)) turnPage(token.side);
    }
  };
  canvas.addEventListener('pointerup',event=>release(event),true);
  canvas.addEventListener('pointercancel',event=>release(event,true),true);
  canvas.addEventListener('lostpointercapture',event=>{ if(gesture?.id===event.pointerId) release(event,true); },true);
}

function connectUI() {
  const textReader=document.querySelector('#text-reader');
  textReader.querySelector('button').addEventListener('click',()=>textReader.close());
  textReader.addEventListener('close',()=>restoreSpread());
  const panel = document.querySelector('#material-panel');
  const contents = document.querySelector('#contents-panel');
  const toggleContents = open => {
    if (open && innerWidth <= 900 && !panel.hidden) togglePanel(false);
    contents.hidden = !open; document.querySelector('#contents-toggle').setAttribute('aria-expanded', String(open));
  };
  for (const chapter of bookContent.chapters) {
    const button = document.createElement('button');
    button.dataset.opening = chapter.start;
    const preview = document.createElement('img'); preview.src = './' + bookContent.spreads[chapter.start].preview; preview.alt = ''; preview.loading = 'lazy';
    const name = document.createElement('span'); name.textContent = chapter.title;
    button.append(preview, name);
    if (chapter.credit) { const credit = document.createElement('small'); credit.textContent = chapter.credit; name.append(credit); }
    button.addEventListener('click', () => { toggleContents(false); goToOpening(chapter.start); });
    document.querySelector('#chapter-list').append(button);
  }
  document.querySelector('#contents-toggle').addEventListener('click', () => toggleContents(contents.hidden));
  document.querySelector('#reader-menu').addEventListener('click', () => toggleContents(contents.hidden));
  document.querySelector('#contents-cover').addEventListener('click', () => {toggleContents(false);closeCover();});
  document.querySelector('#contents-close').addEventListener('click', () => { toggleContents(false); document.querySelector('#contents-toggle').focus(); });
  function togglePanel(open) {
    if (open && innerWidth <= 900) toggleContents(false);
    panel.hidden = !open;
    document.querySelector('#material-toggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('material-open', open);
    resize();
  }
  document.querySelector('#material-toggle').addEventListener('click', () => togglePanel(panel.hidden));
  document.querySelector('#orbit-toggle').addEventListener('click',()=>{orbitMode=!orbitMode;hover.target=0;syncOrbit();});
  document.querySelector('#material-close').addEventListener('click', () => { togglePanel(false); document.querySelector('#material-toggle').focus(); });
  document.addEventListener('keydown', e => {
    if(textReader.open) return;
    if (e.key === 'Escape' && imageFocus) restoreSpread();
    if (e.key === 'Escape' && !panel.hidden) { togglePanel(false); document.querySelector('#material-toggle').focus(); }
    if (e.key === 'Escape' && !contents.hidden) { toggleContents(false); document.querySelector('#contents-toggle').focus(); }
    if (e.target.matches('input')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); turnPage(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); turnPage(-1); }
    if (e.key === 'Home') fitCamera('spread');
  });
  const setInputs = () => {
    for (const [name, value] of Object.entries(settings)) {
      const input = document.getElementById(name);
      input.value = valueToSlider(input, value);
      input.setAttribute('aria-valuetext', ['mm','px'].includes(input.dataset.unit) ? `${Number(value.toPrecision(5))} ${input.dataset.unit==='mm'?'мм':'px'}` : input.dataset.unit === 'deg' ? `${Math.round(value)}°` : input.dataset.unit === 'percent' ? `${Math.round(value * 100)}%` : String(value));
      const numeric = document.querySelector(`[data-value-for="${name}"]`);
      if (numeric) numeric.value = Number(value.toPrecision(5));
      else {
        const unit = input.dataset.unit;
        document.querySelector(`output[for="${name}"]`).value = unit === 'deg' ? `${Math.round(value)}°` : unit === 'percent' ? `${Math.round(value * 100)}%` : ['pattern','opticalSeed','leatherSeed','leatherScratchSeed','leatherScaleCrushSeed'].includes(name) ? String(value) : Number(value).toFixed(2);
      }
    }
  };
  const changeSetting = (name, value) => {
    if (!Number.isFinite(value)) { setInputs(); return; }
    settings[name] = THREE.MathUtils.clamp(value, ...inputBounds(document.getElementById(name)));
    setInputs(); applySettings(['bend', 'edges','coverWarp','coverDents','coverThickness'].includes(name));
    try { localStorage.setItem(storageKey, JSON.stringify({ ...settings, version: 6 })); } catch { /* Optional. */ }
  };
  setInputs();
  document.querySelector('#material-form').addEventListener('submit', e => e.preventDefault());
  for (const input of document.querySelectorAll('input[type=range]')) input.addEventListener('input', () => {
    changeSetting(input.id, sliderToValue(input));
  });
  for (const input of document.querySelectorAll('[data-value-for]')) {
    input.addEventListener('change', () => changeSetting(input.dataset.valueFor, input.valueAsNumber));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
  }
  document.querySelector('#reset').addEventListener('click', () => { Object.assign(settings, defaults); setInputs(); applySettings(true); try { localStorage.removeItem(storageKey); } catch { /* Optional. */ } });
  document.querySelector('#save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 6, units: 'mm', opticalUnits: { photoGrainSize:'css-px',aberration:'css-px',dustSize:'css-px',fibreLength:'css-px' }, spread: { width: 536, height: 302 }, material: settings, environment: document.querySelector('#environment-name').textContent }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'denis-daragan-paper-style.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.querySelector('#hdri').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const label = document.querySelector('#environment-name'); label.textContent = 'Загрузка…';
    try {
      const buffer = await file.arrayBuffer();
      const loader = /\.exr$/i.test(file.name) ? new EXRLoader() : new HDRLoader();
      const data = loader.parse(buffer);
      const texture = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
      texture.colorSpace = THREE.LinearSRGBColorSpace; texture.needsUpdate = true;
      await setEnvironment(texture, file.name); texture.dispose();
    } catch { label.textContent = 'Файл не открылся. Предыдущий свет сохранён.'; }
    e.target.value = '';
  });
  document.querySelector('#default-hdri').addEventListener('click', () => setEnvironment(defaultEnvironment, 'Studio / softboxes'));
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => fitCamera(button.dataset.view));
  document.querySelector('#blank-toggle').addEventListener('click', () => { if (turning || navigating || gesture || coverMotion) return; if(imageFocus)restoreSpread(false); blankPrint = !blankPrint; applyPrint(); });
  document.querySelector('#turn').addEventListener('click', () => turnPage(1));
  document.querySelector('#previous').addEventListener('click', () => turnPage(-1));
  connectPageDrag();
  canvas.addEventListener('pointermove', event => {
    if (turning || closedBook.visible || imageFocus || orbitMode) { hover.target = 0; return; }
    const r = canvas.getBoundingClientRect();
    mouse.set((event.clientX - r.left) / viewportWidth() * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(topLeaves)[0];
    if (hit) { const local=book.worldToLocal(hit.point.clone());hover.side = hit.object.geometry.userData.side; hover.u=Math.abs(local.x)/pageWidth;hover.v=local.z/pageHeight+.5;hover.target=1; }
    else hover.target = 0;
  });
  canvas.addEventListener('pointerleave', () => { hover.target = 0; });
  canvas.addEventListener('pointerdown', () => toggleContents(false));
  addEventListener('resize', resize);
  if(embedded) canvas.addEventListener('wheel',event=>{if(editorMode)return;event.preventDefault();parent.postMessage({type:'book-wheel',x:event.deltaX,y:event.deltaY,mode:event.deltaMode},location.origin);},{passive:false});
}

let lastDrawTime=0;
function draw(now) {
  requestAnimationFrame(draw);
  if (!visible || document.querySelector('#text-reader').open || now - lastFrame < 1000 / 45) return;
  lastFrame = now;
  const delta = Math.min(.08,(now-lastDrawTime)/1000 || .022); lastDrawTime=now;
  const time = clock.getElapsedTime();
  if (cameraTween) {
    const tween=cameraTween;
    const t = Math.min(1, (now - tween.start) / ((tween.duration??700) || 1)), ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(cameraTween.from, cameraTween.to, ease);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, ease);
    if (tween.toRotation!==undefined) book.rotation.y=THREE.MathUtils.lerp(tween.fromRotation,tween.toRotation,ease);
    if (t >= 1) {cameraTween = null;updateNavigation();tween.resolve?.();}
  }
  if (coverMotion) {
    const t=coverMotion.drag?0:Math.min(1,(now-coverMotion.start)/coverMotion.duration),ease=t*t*(3-2*t);
    if(coverMotion.drag) {coverMotion.progress+=(coverMotion.target-coverMotion.progress)*(1-Math.exp(-delta*25));setCoverPose(coverMotion.progress);}
    else setCoverPose(THREE.MathUtils.lerp(coverMotion.from,coverMotion.to,ease));
    if (now-(coverMotion.shadowFrame??0)>100) {renderContactShadow();coverMotion.shadowFrame=now;}
    if (t>=1) finishCoverOpening(coverMotion.to===1);
  }
  hover.strength+=(hover.target-hover.strength)*(1-Math.exp(-delta*20));
  if (!turning && !closedBook.visible && (settings.motion > 0 || hover.strength>.0001 || hover.target===0)) for (const mesh of topLeaves) updateLeaf(mesh.geometry, time);
  if (turning) {
    if (turning.settle) {
      const t=Math.min(1,(now-turning.settle.start)/turning.settle.duration), ease=t*t*(3-2*t);
      turning.progress=THREE.MathUtils.lerp(turning.settle.from,turning.settle.to,ease);
      updateTurnBinding();updateLeaf(turnMesh.geometry,time,turning.progress);
      if (t>=1) finishTurn(turning.settle.to===1);
    } else {
      turning.progress+=(turning.target-turning.progress)*(1-Math.exp(-delta*24));
      updateTurnBinding();updateLeaf(turnMesh.geometry,time,turning.progress);
    }
  }
  if(controls.enabled) controls.update();
  else camera.lookAt(controls.target);
  const metrics=scenePhoto.render(scene,camera);
  diagnostics.frameCount++; diagnostics.drawCalls = metrics.calls; diagnostics.triangles = metrics.triangles;
  diagnostics.cachedPageTextures = textureCache.size;
}

async function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  configureLeatherFiltering(renderer.capabilities.getMaxAnisotropy());
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = settings.exposure;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff);
  camera = new THREE.PerspectiveCamera(31, innerWidth / innerHeight, .04, 100);
  camera.position.set(0, 9, 3.2);
  controls = new OrbitControls(camera, canvas);
  controls.enabled=false;controls.enableRotate=false;controls.enablePan=false;controls.enableZoom=false;controls.enableDamping=false;
  controls.minPolarAngle = .001; controls.maxPolarAngle = Math.PI - .001;
  controls.minDistance = .35; controls.maxDistance = 26; controls.rotateSpeed = .42;
  controls.target.set(0, .2, 0);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .21 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);
  keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(-3.2, 6.5, 2); keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(innerWidth < 600 ? 1024 : 2048, innerWidth < 600 ? 1024 : 2048);
  keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -4.6; keyLight.shadow.camera.right = keyLight.shadow.camera.top = 4.6;
  keyLight.shadow.camera.near = .1; keyLight.shadow.camera.far = 16; keyLight.shadow.bias = -.00013; keyLight.shadow.normalBias = .003; keyLight.shadow.radius = 3.6;
  scene.add(keyLight);
  fillLight = new THREE.DirectionalLight(0xf7f9ff, .7); fillLight.position.set(4, 5, -4); scene.add(fillLight);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbb8b0, .3));
  paperTextures();
  const textureLoader = new THREE.TextureLoader();
  const requestedOpening = Number(new URL(location.href).searchParams.get('spread') || 0);
  printIndex = Number.isInteger(requestedOpening) ? THREE.MathUtils.clamp(requestedOpening, 0, bookContent.spreads.length - 1) : 0;
  topBase = bindingHeight(printIndex);
  leafCounts[-1] = printIndex + endpapers; leafCounts[1] = bookContent.spreads.length - 1 - printIndex + endpapers;
  const results = await Promise.all([loadEmblem(), textureLoader.loadAsync('./' + bookContent.atlas.file), new HDRLoader().loadAsync('./assets/studio-softboxes.hdr'), openingTextures(printIndex)]);
  emblemMap = results[0];
  blockAtlas = results[1]; blockAtlas.colorSpace = THREE.SRGBColorSpace; blockAtlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  defaultEnvironment = results[2];
  buildBook();
  scenePhoto=new ScenePhoto(renderer,settings);
  diagnostics.physicalLeaves = leafCounts[-1] + leafCounts[1] + 2;
  await setEnvironment(defaultEnvironment, 'Studio / softboxes');
  applyPrint(printIndex); resize(); connectUI();
  diagnostics.ready = true;
  if(embedded) parent.postMessage({type:'book-ready'},location.origin);
  renderer.compile(scene, camera);
  loading.style.opacity = '0'; setTimeout(() => { loading.hidden = true; }, 350);
  requestAnimationFrame(draw);
}
init().catch(fail);
