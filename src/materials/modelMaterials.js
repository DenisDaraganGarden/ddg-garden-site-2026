import * as THREE from 'three';
import { glassDefaults, looksLikeGlass, tuneGlass, unmakeGlass } from './glass.js';
import { createSharedTextureCache } from './sharedTextureCache.js';

// Материал модели SketchUp → материал библиотеки: цвет, нормали, матовость,
// затенение щелей. Раскладка текстуры — та, что Денис задал в SketchUp: его
// координаты текстуры (UV) остаются, меняется только сколько метров в плитке.
// Где координат нет (грань без текстуры), они строятся проекцией на ближайшую
// плоскость модели — как у SketchUp по умолчанию.
//
// Текстуры библиотеки читаются как в glTF (flipY = false): картинка ложится
// так же, как лежала текстура SketchUp; поэтому у нормалей Y с обратным знаком,
// как делает загрузчик glTF (three.js #11438).

const loader = new THREE.TextureLoader();
export const libraryFile = (id, file) => `/__library/materials/${encodeURIComponent(id)}/${file}`;
const MAPS = Object.freeze({ map: ['albedo.webp', true], normalMap: ['normal.png', false], roughnessMap: ['roughness.webp', false], aoMap: ['ao.webp', false] });
const KEPT = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap'];

const toRoot = new THREE.Matrix4();
const relative = (mesh, root) => toRoot.copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
// Сетки модели по материалам — один обход на всю модель.
export function meshesByMaterial(root) {
    const found = new Map();
    root.traverse((object) => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (!found.has(material)) found.set(material, []);
            found.get(material).push(object);
        }
    });
    return found;
}

const median = (values, fallback) => {
    if (!values.length) return fallback;
    const sorted = values.sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
};

// Сколько метров модели в одной единице координат текстуры — отдельно по u и
// по v (текстура SketchUp бывает не квадратной): длины ∂P/∂u и ∂P/∂v по
// треугольникам, медиана.
export function uvScale(meshes, root) {
    const us = [], vs = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), du = new THREE.Vector3(), dv = new THREE.Vector3();
    root.updateMatrixWorld(true);
    for (const mesh of meshes) {
        const geometry = mesh.userData.sourceGeometry ?? mesh.geometry;
        const { position, uv } = geometry.attributes;
        if (!uv || geometry.userData.boxUv) continue;
        const matrix = relative(mesh, root).clone();
        const index = geometry.index;
        const count = index ? index.count : position.count;
        const step = Math.max(3, Math.floor(count / 3 / 400) * 3);
        for (let i = 0; i + 2 < count; i += step) {
            const [i0, i1, i2] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
            a.fromBufferAttribute(position, i0).applyMatrix4(matrix);
            b.fromBufferAttribute(position, i1).applyMatrix4(matrix);
            c.fromBufferAttribute(position, i2).applyMatrix4(matrix);
            const u1 = uv.getX(i1) - uv.getX(i0), v1 = uv.getY(i1) - uv.getY(i0), u2 = uv.getX(i2) - uv.getX(i0), v2 = uv.getY(i2) - uv.getY(i0);
            const det = u1 * v2 - u2 * v1;
            if (Math.abs(det) < 1e-12) continue;
            e1.subVectors(b, a);
            e2.subVectors(c, a);
            du.copy(e1).multiplyScalar(v2).addScaledVector(e2, -v1).divideScalar(det);
            dv.copy(e2).multiplyScalar(u1).addScaledVector(e1, -u2).divideScalar(det);
            us.push(du.length());
            vs.push(dv.length());
        }
    }
    return [median(us, 1), median(vs, 1)];
}

// Координаты текстуры проекцией: грань берёт ту плоскость модели, к которой
// ближе её нормаль; метры модели делятся на масштаб, чтобы плитка на таких
// гранях была той же величины, что на гранях с координатами из SketchUp.
export function boxUvGeometry(geometry, matrix, [mu, mv] = [1, 1]) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const position = flat.attributes.position;
    const uv = new Float32Array(position.count * 2);
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const n = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i + 2 < position.count; i += 3) {
        p.forEach((point, k) => point.fromBufferAttribute(position, i + k).applyMatrix4(matrix));
        n.subVectors(p[1], p[0]).cross(e.subVectors(p[2], p[0]));
        const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
        p.forEach((point, k) => {
            // Стена: u — вдоль, v — вверх (минус: картинка стоит головой вверх).
            // Пол и крыша — как план: u — восток, v — юг.
            const [u, v] = ax >= ay && ax >= az ? [point.z, -point.y] : ay >= az ? [point.x, point.z] : [point.x, -point.y];
            uv[(i + k) * 2] = u / mu;
            uv[(i + k) * 2 + 1] = v / mv;
        });
    }
    flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    flat.userData.boxUv = true;
    return flat;
}

const loadTexture = (url, color) => new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
    }, undefined, reject);
});

// Карты материала библиотеки — [[ключ материала three, текстура], …]: их же
// показывает лаборатория «Материалы».
const loadSharedTexture = createSharedTextureCache(loadTexture);
export async function loadLibraryMaps(id) {
    const results = await Promise.allSettled(Object.entries(MAPS).map(async ([key, [file, color]]) => [key, await loadSharedTexture(libraryFile(id, file), color)]));
    const failed = results.find((result) => result.status === 'rejected');
    const loaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    if (failed) {
        loaded.forEach(([, texture]) => texture.dispose());
        throw failed.reason;
    }
    return loaded;
}

function remember(material) {
    if (material.userData.original) return material.userData.original;
    material.userData.original = {
        ...Object.fromEntries(KEPT.map((key) => [key, material[key]])),
        color: material.color.clone(), roughness: material.roughness, metalness: material.metalness,
        normalScale: material.normalScale?.clone(), aoMapIntensity: material.aoMapIntensity,
    };
    return material.userData.original;
}

function restore(material) {
    const original = material.userData.original;
    if (!original) return;
    for (const key of KEPT) {
        if (material[key] && material[key] !== original[key]) material[key].dispose();
        material[key] = original[key];
    }
    material.color.copy(original.color);
    material.roughness = original.roughness;
    material.metalness = original.metalness;
    if (original.normalScale) material.normalScale.copy(original.normalScale);
    material.aoMapIntensity = original.aoMapIntensity;
    delete material.userData.original;
    delete material.userData.override;
    material.needsUpdate = true;
}

// Раскладка текстур материала: у сгенерированной — плитка tile метров по
// масштабу координат SketchUp; у «только карт» (tile: null) — ровно как было.
function placeTextures(material, override, scale) {
    const original = material.userData.original;
    const [mu, mv] = scale;
    for (const key of Object.keys(MAPS)) {
        const texture = material[key];
        if (!texture || texture === original[key]) continue;
        const source = original.map;
        if (override.tile === null && source) {
            texture.offset.copy(source.offset);
            texture.repeat.copy(source.repeat);
            texture.rotation = source.rotation;
            texture.center.copy(source.center);
        } else {
            // Раскладка SketchUp несёт и его поворот текстуры; «по граням» — свой, прямой.
            const straight = override.projection === 'box';
            texture.offset.set(0, 0);
            texture.repeat.set(mu / (override.tile ?? 1), mv / (override.tile ?? 1));
            texture.rotation = straight ? 0 : source?.rotation ?? 0;
            texture.center.copy(!straight && source?.center ? source.center : new THREE.Vector2(0, 0));
        }
    }
    material.normalScale.set(override.normal, -override.normal);
    material.roughness = override.roughness;
}

// Координаты текстуры сетки: свои из SketchUp или проекция — там, где своих
// нет, и везде при раскладке «прямо по граням» (в метрах: плитка = tile).
// Своя геометрия сетки (общая у копий компонента) не меняется: проекция —
// отдельная копия, снятая подмена возвращает свою.
function layOut(mesh, root, projection, scale) {
    const source = mesh.userData.sourceGeometry ?? mesh.geometry;
    const box = projection === 'box' || !source.attributes.uv;
    const size = projection === 'box' ? [1, 1] : scale;
    const key = box ? `box:${size.join(',')}` : 'source';
    if (mesh.userData.uvKey === key || (!box && mesh.geometry === source)) return;
    if (mesh.geometry !== source) mesh.geometry.dispose();
    mesh.userData.sourceGeometry = source;
    mesh.geometry = box ? boxUvGeometry(source, relative(mesh, root).clone(), size) : source;
    mesh.userData.uvKey = key;
}
function layOutBack(mesh) {
    const source = mesh.userData.sourceGeometry;
    if (!source) return;
    if (mesh.geometry !== source) mesh.geometry.dispose();
    mesh.geometry = source;
    delete mesh.userData.sourceGeometry;
    delete mesh.userData.uvKey;
}

// Подмены по граням (override.faces): в SketchUp один материал бывает на
// разном — торцы плит, потолки свесов и полы одной «бетонной» краской, пол
// террасы и дубовые панели одним деревом. Правило берёт грани по
// направлению (up — пол, down — потолок, side — стена), по высоте (y, метры
// модели) и мимо частей skip (начало имени части, как у скрытых частей);
// первое подходящее красит грань своим материалом библиотеки прямо по
// граням, плитка — в метрах. Сетка получает свою копию геометрии с группами:
// свои координаты SketchUp остаются в uv основному материалу, раскладка по
// граням — в uv1 для материалов правил (texture.channel = 1).
const FACE = { up: (n) => n.y > 0.7, down: (n) => n.y < -0.7, side: (n) => Math.abs(n.y) <= 0.7 };
const partsOf = (mesh, root) => {
    const names = [];
    for (let node = mesh.parent; node && node !== root; node = node.parent) if (node.name) names.push(node.name);
    return names;
};
// Какое правило берёт треугольник с нормалью normal на высоте y: номер правила + 1, 0 — ни одно.
export function faceClass(rules, normal, y, parts = []) {
    for (let k = 0; k < rules.length; k += 1) {
        const rule = rules[k];
        if (rule.skip?.some((prefix) => parts.some((name) => name.startsWith(prefix)))) continue;
        if (!rule.faces.some((side) => FACE[side](normal))) continue;
        if (rule.y && (y < rule.y[0] || y > rule.y[1])) continue;
        return k + 1;
    }
    return 0;
}
// Геометрия с группами по правилам (треугольники по порядку групп) и uv1 по
// граням; ни одна грань не подошла — null.
export function splitFaces(geometry, matrix, rules, parts = []) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const position = flat.attributes.position, count = Math.floor(position.count / 3);
    const buckets = Array.from({ length: rules.length + 1 }, () => []), plane = new Float32Array(count * 6);
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), e = new THREE.Vector3();
    for (let t = 0; t < count; t += 1) {
        p.forEach((point, k) => point.fromBufferAttribute(position, t * 3 + k).applyMatrix4(matrix));
        n.subVectors(p[1], p[0]).cross(e.subVectors(p[2], p[0]));
        const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
        // Как boxUvGeometry: стена — вдоль и вверх, пол — план; метры.
        p.forEach((point, k) => {
            const [u, v] = ax >= ay && ax >= az ? [point.z, -point.y] : ay >= az ? [point.x, point.z] : [point.x, -point.y];
            plane[t * 6 + k * 2] = u;
            plane[t * 6 + k * 2 + 1] = v;
        });
        buckets[n.lengthSq() > 0 ? faceClass(rules, n.normalize(), (p[0].y + p[1].y + p[2].y) / 3, parts) : 0].push(t);
    }
    if (buckets.slice(1).every((bucket) => !bucket.length)) { flat.dispose(); return null; }
    const order = buckets.flat(), out = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(flat.attributes)) {
        const size = attribute.itemSize, from = attribute.array, to = new from.constructor(order.length * 3 * size);
        order.forEach((t, i) => to.set(from.subarray(t * 3 * size, (t + 1) * 3 * size), i * 3 * size));
        out.setAttribute(name, new THREE.BufferAttribute(to, size, attribute.normalized));
    }
    const uv1 = new Float32Array(order.length * 6);
    order.forEach((t, i) => uv1.set(plane.subarray(t * 6, t * 6 + 6), i * 6));
    out.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    let start = 0;
    buckets.forEach((bucket, k) => { if (bucket.length) out.addGroup(start * 3, bucket.length * 3, k); start += bucket.length; });
    flat.dispose();
    return out;
}
function unsplit(mesh) {
    const split = mesh.userData.faceSplit;
    if (!split) return;
    mesh.geometry.dispose();
    mesh.geometry = split.geometry;
    mesh.material = split.material;
    delete mesh.userData.faceSplit;
}
function disposeRuled(material) {
    material.userData.disposed = true;
    for (const texture of material.userData.loaded ?? []) texture.dispose();
    material.userData.loaded = [];
    material.dispose();
}

// Only release derivatives owned by this instance. GLTF source geometry and
// maps are shared by all copies of the imported model and must stay alive.
export function disposeModelMaterials(prepared) {
    prepared.root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        unsplit(mesh);
        layOutBack(mesh);
    });
    for (const material of prepared.materials) {
        material.userData.faceRules?.materials.forEach(disposeRuled);
        delete material.userData.faceRules;
        restore(material);
    }
}

// Подмены материалов одной модели. Возвращает отмену: пока текстуры грузятся,
// подмену могли поменять снова. onChange — перерисовать кадр.
export function applyModelMaterials(prepared, overrides, { root, anisotropy = 4, onChange } = {}) {
    let cancelled = false;
    const jobs = [];
    const byMaterial = meshesByMaterial(root);
    // Материал правила: копия материала SketchUp (без его userData — там
    // текстуры и стекло), до загрузки карт выглядит как он.
    const ruleMaterial = (base, rule) => {
        const saved = base.userData;
        base.userData = {};
        const material = base.clone();
        base.userData = saved;
        material.userData = { faceRule: rule };
        jobs.push(loadLibraryMaps(rule.material).then((loaded) => {
            // Материал правила живёт, пока правило то же (кеш у материала
            // SketchUp), а не до следующего прохода: отмена прохода его не снимает.
            if (material.userData.disposed) { loaded.forEach(([, texture]) => texture.dispose()); return; }
            for (const [key, texture] of loaded) {
                texture.anisotropy = anisotropy;
                texture.channel = 1;
                texture.repeat.set(1 / rule.tile, 1 / rule.tile);
                material[key] = texture;
            }
            material.userData.loaded = loaded.map(([, texture]) => texture);
            material.metalnessMap = null;
            material.metalness = 0;
            material.color.set('#ffffff');
            material.aoMapIntensity = 1;
            material.normalScale.set(rule.normal, -rule.normal);
            material.roughness = rule.roughness;
            material.needsUpdate = true;
            onChange?.();
        }, () => onChange?.()));
        return material;
    };
    const applyFaces = (material, rules, meshes) => {
        const key = rules?.length && material.isMeshStandardMaterial && !material.userData.glassOn ? JSON.stringify(rules) : '';
        const cache = material.userData.faceRules;
        if (cache && cache.key !== key) {
            cache.materials.forEach((ruled) => { ruled.userData.disposed = true; disposeRuled(ruled); });
            delete material.userData.faceRules;
        }
        if (!key) return;
        material.userData.faceRules ??= { key, materials: rules.map((rule) => ruleMaterial(material, rule)) };
        const ruled = material.userData.faceRules.materials;
        for (const mesh of meshes) {
            if (mesh.material !== material) continue;
            const geometry = splitFaces(mesh.geometry, relative(mesh, root).clone(), rules, partsOf(mesh, root));
            if (!geometry) continue;
            mesh.userData.faceSplit = { geometry: mesh.geometry, material };
            mesh.geometry = geometry;
            mesh.material = [material, ...ruled];
        }
    };
    for (const material of prepared.materials) {
        const override = overrides?.[material.name];
        const meshes = byMaterial.get(material) ?? [];
        // Прежняя разбивка по граням снимается: основной материал и его
        // раскладка ставятся на свою геометрию, разбивка — заново поверх.
        meshes.forEach(unsplit);
        applyBase(material, override, meshes);
        applyFaces(material, override?.faces, meshes);
    }
    onChange?.();
    return { cancel: () => { cancelled = true; }, ready: Promise.all(jobs) };

    function applyBase(material, override, meshes) {
        // Стекло: как сказано в окне материала, иначе — узнанное само (glass.js).
        const glass = material.isMeshStandardMaterial && (override?.glass ? override.glass.on : looksLikeGlass(material, meshes, root));
        if (glass) tuneGlass(material, meshes, { ...glassDefaults(material), ...(override?.glass ?? {}) });
        else unmakeGlass(material, meshes);
        // Скан без света сцены (MeshBasicMaterial) карт рельефа не знает.
        if (!override?.material || !material.isMeshStandardMaterial) {
            if (material.userData.original) meshes.forEach(layOutBack);
            restore(material);
            return;
        }
        const original = remember(material);
        if (!material.userData.scale) material.userData.scale = uvScale(meshes, root);
        const projection = override.tile !== null && override.projection === 'box' ? 'box' : 'uv';
        for (const mesh of meshes) layOut(mesh, root, projection, material.userData.scale);
        const scale = projection === 'box' ? [1, 1] : material.userData.scale;
        const same = material.userData.override?.material === override.material;
        material.userData.override = override;
        if (same) {
            placeTextures(material, override, scale);
            onChange?.();
            return;
        }
        jobs.push(loadLibraryMaps(override.material)
            .then((loaded) => {
                if (cancelled || material.userData.override !== override) { loaded.forEach(([, texture]) => texture.dispose()); return; }
                for (const [key, texture] of loaded) {
                    if (material[key] && material[key] !== original[key]) material[key].dispose();
                    texture.anisotropy = anisotropy;
                    material[key] = texture;
                }
                material.metalnessMap = null;
                material.metalness = 0;
                material.color.set('#ffffff');
                material.aoMapIntensity = 1;
                placeTextures(material, override, scale);
                material.needsUpdate = true;
                onChange?.();
            }, () => {
                // Файла нет (материал удалён из библиотеки) — остаётся материал SketchUp.
                if (material.userData.override === override) restore(material);
                onChange?.();
            }));
    }
}

// Текущая текстура материала (из SketchUp, до подмены) — картинкой для ИИ и
// для «только карт». Нет текстуры — null.
export function textureDataUrl(material, limit = 2048) {
    const image = (material.userData.original?.map ?? material.map)?.image;
    if (!image?.width) return null;
    const scale = Math.min(1, limit / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}
