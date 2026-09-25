import * as THREE from 'three';

// Тени светильников сада (docs/garden-lighting-2026-09-25.md): атлас глубины —
// одна большая текстура, у каждого света свои плитки. Спот — одна плитка
// перспективы по оси луча; широкий свет (боллард, настенный, фонарь) — грани
// куба, которых касается его конус (боллард вниз — пять, без верхней).
// Плитка — глубина сцены от светильника: модель, посадки, лианы, изгороди,
// деревья; листва и 2D-деревья — по вырезу, стекло тени не даёт. Рисуется не
// каждый кадр, а когда свет переставили или сцена изменилась, по нескольку
// плиток за кадр; шейдер (gardenLightShader.js) читает атлас одной текстурой.
//
// Камера плитки — свой базис, одинаковый здесь и в шейдере: смотрит по dir,
// «вверх» — мировой Y (для взгляда почти отвесно — Z).
export const SHADOW_TILE = 256;
export const SHADOW_LAYER = 7;
export const SHADOW_NEAR = 0.03;
export const CUBE_FACES = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
// Уже 60° от оси — одна плитка перспективы; шире — грани куба.
const SPOT_LIMIT = (60 * Math.PI) / 180;
// Профиль протекает на шаг за cutoff (lightField.js): конус плитки шире на него.
const PROFILE_STEP = Math.PI / 127;
// От центра грани куба до её угла.
const FACE_REACH = Math.acos(1 / Math.sqrt(3));
// Корни сцены, которые отбрасывают тень от светильников.
export const SHADOW_ROOTS = Object.freeze(['placed', 'planting', 'topiary', 'surroundings', 'coastal-trees', 'coastal-oleaster', 'beach-house']);

export function tileBasis(dir) {
    const up = Math.abs(dir[1]) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const fz = new THREE.Vector3(-dir[0], -dir[1], -dir[2]).normalize();
    const fx = new THREE.Vector3().crossVectors(up, fz).normalize();
    const fy = new THREE.Vector3().crossVectors(fz, fx);
    return { fx, fy, fz };
}

// Плитки по светам: сильные первыми; не влезшие в атлас — без тени.
// Результат по номеру света: { base, mask (0 — спот, иначе биты граней),
// tan (тангенс половины угла плитки), tiles: [{ dir, tan }] } или null.
export function allocateShadows(lights, capacity) {
    const out = new Array(lights.length).fill(null);
    const order = lights.map((_, i) => i).sort((a, b) => (lights[b].peak ?? 0) - (lights[a].peak ?? 0) || a - b);
    let next = 0;
    for (const i of order) {
        const { axis, cutoff, range } = lights[i];
        if (!(range > 0) || !axis) continue;
        let plan;
        if (cutoff + PROFILE_STEP <= SPOT_LIMIT) {
            const tan = Math.tan(cutoff + PROFILE_STEP) * 1.02;
            plan = { mask: 0, tan, tiles: [{ dir: axis, tan }] };
        } else {
            const faces = CUBE_FACES.map((face, f) => [face, f]).filter(([face]) => Math.acos(Math.max(-1, Math.min(1, face[0] * axis[0] + face[1] * axis[1] + face[2] * axis[2]))) <= cutoff + PROFILE_STEP + FACE_REACH);
            plan = { mask: faces.reduce((mask, [, f]) => mask | (1 << f), 0), tan: 1, tiles: faces.map(([face]) => ({ dir: face, tan: 1 })) };
        }
        if (next + plan.tiles.length > capacity) continue;
        out[i] = { base: next, ...plan };
        next += plan.tiles.length;
    }
    return out;
}

// Камера плитки: перспектива квадратная, базис tileBasis, дальность света.
export function tileCamera(camera, position, dir, tan, far) {
    const { fx, fy, fz } = tileBasis(dir);
    camera.fov = (2 * Math.atan(tan) * 180) / Math.PI;
    camera.aspect = 1;
    camera.near = SHADOW_NEAR;
    camera.far = Math.max(far, SHADOW_NEAR * 10);
    camera.updateProjectionMatrix();
    camera.matrixWorld.makeBasis(fx, fy, fz).setPosition(position[0], position[1], position[2]);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    return camera;
}

// Где мировая точка в плитке — зеркало шейдера (для проверки): ndc плитки и
// глубина взгляда w (м). null — позади камеры.
export function tileProject(position, dir, tan, point) {
    const { fx, fy, fz } = tileBasis(dir);
    const d = new THREE.Vector3(point[0] - position[0], point[1] - position[1], point[2] - position[2]);
    const w = -d.dot(fz);
    if (w <= SHADOW_NEAR) return null;
    return { x: d.dot(fx) / (w * tan), y: d.dot(fy) / (w * tan), w };
}

// Атлас: цвет не нужен (R8 — чтобы у рендер-цели был цвет), глубина — float.
export function createShadowAtlas(size) {
    const depthTexture = new THREE.DepthTexture(size, size, THREE.FloatType);
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    const target = new THREE.WebGLRenderTarget(size, size, {
        format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: true, depthTexture,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    });
    target.texture.generateMipmaps = false;
    return { target, size, perRow: Math.floor(size / SHADOW_TILE), capacity: Math.floor(size / SHADOW_TILE) ** 2 };
}

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const depthMaterials = new WeakMap();
// Материал глубины для материала сцены: вырез — по карте и alphaTest;
// прозрачное без выреза (стекло) тени не даёт; обе стороны — тонкая грань
// SketchUp не пропускает свет с изнанки.
function depthFor(material) {
    if (!material || material.visible === false || (material.transparent && !(material.alphaTest > 0))) return HIDDEN;
    if (!depthMaterials.has(material)) {
        const cut = material.alphaTest > 0 ? material.alphaTest : material.alphaToCoverage ? 0.5 : 0;
        depthMaterials.set(material, new THREE.MeshDepthMaterial({ map: cut > 0 ? material.map ?? null : null, alphaTest: cut, side: THREE.DoubleSide }));
    }
    return depthMaterials.get(material);
}

// Нарисовать плитки jobs [{ tile, position, dir, tan, far }] за один проход:
// тенеотбрасыватели получают слой SHADOW_LAYER и материал глубины (своя
// customDepthMaterial — ветер и поворот карточки — главнее), камера плитки
// видит только этот слой; состояние рендера и материалы возвращаются.
const camera = new THREE.PerspectiveCamera();
camera.matrixAutoUpdate = false;
camera.matrixWorldAutoUpdate = false;
camera.layers.set(SHADOW_LAYER);
export function renderShadowTiles(renderer, scene, atlas, jobs) {
    if (!jobs.length) return;
    const casters = [];
    for (const name of SHADOW_ROOTS) {
        scene.getObjectByName(name)?.traverseVisible((object) => {
            if (!object.isMesh || object.isSkinnedMesh) return;
            casters.push([object, object.material]);
            object.material = Array.isArray(object.material) ? object.material.map(depthFor) : object.customDepthMaterial ?? depthFor(object.material);
            object.layers.enable(SHADOW_LAYER);
        });
    }
    const state = {
        target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
        shadowAuto: renderer.shadowMap.autoUpdate, shadowNeeds: renderer.shadowMap.needsUpdate, background: scene.background,
    };
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    scene.background = null;
    try {
        const { target, perRow } = atlas;
        target.scissorTest = true;
        for (const job of jobs) {
            const x = (job.tile % perRow) * SHADOW_TILE, y = Math.floor(job.tile / perRow) * SHADOW_TILE;
            target.viewport.set(x, y, SHADOW_TILE, SHADOW_TILE);
            target.scissor.set(x, y, SHADOW_TILE, SHADOW_TILE);
            renderer.setRenderTarget(target);
            renderer.clear(false, true, false);
            renderer.render(scene, tileCamera(camera, job.position, job.dir, job.tan, job.far));
        }
    } finally {
        for (const [object, material] of casters) {
            object.material = material;
            object.layers.disable(SHADOW_LAYER);
        }
        renderer.setRenderTarget(state.target);
        renderer.autoClear = state.autoClear;
        renderer.shadowMap.autoUpdate = state.shadowAuto;
        renderer.shadowMap.needsUpdate = state.shadowNeeds;
        scene.background = state.background;
    }
}

// Плитки, которые надо перерисовать: сравнение с прошлой раскладкой по
// подписи (место, направление, угол, дальность) — перенос одного светильника
// перерисовывает только его плитки.
export function shadowJobs(lights, plans, previous = new Map()) {
    const jobs = [], signatures = new Map();
    lights.forEach((light, i) => {
        const plan = plans[i];
        if (!plan) return;
        plan.tiles.forEach(({ dir, tan }, k) => {
            const tile = plan.base + k;
            const job = { tile, position: [light.x, light.y, light.z], dir, tan, far: light.range };
            const signature = [...job.position, ...dir, tan, light.range].map((v) => Math.round(v * 1000)).join(',');
            signatures.set(tile, signature);
            if (previous.get(tile) !== signature) jobs.push(job);
        });
    });
    return { jobs, signatures };
}
