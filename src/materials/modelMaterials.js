import * as THREE from 'three';

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
const meshesOf = (root, material) => {
    const found = [];
    root.traverse((object) => {
        if (object.isMesh && (Array.isArray(object.material) ? object.material.includes(material) : object.material === material)) found.push(object);
    });
    return found;
};

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

// Подмены материалов одной модели. Возвращает отмену: пока текстуры грузятся,
// подмену могли поменять снова. onChange — перерисовать кадр.
export function applyModelMaterials(prepared, overrides, { root, anisotropy = 4, onChange } = {}) {
    let cancelled = false;
    const jobs = [];
    for (const material of prepared.materials) {
        const override = overrides?.[material.name];
        // Скан без света сцены (MeshBasicMaterial) карт рельефа не знает.
        if (!override || !material.isMeshStandardMaterial) {
            if (material.userData.original) meshesOf(root, material).forEach(layOutBack);
            restore(material);
            continue;
        }
        const original = remember(material);
        const meshes = meshesOf(root, material);
        if (!material.userData.scale) material.userData.scale = uvScale(meshes, root);
        const projection = override.tile !== null && override.projection === 'box' ? 'box' : 'uv';
        for (const mesh of meshes) layOut(mesh, root, projection, material.userData.scale);
        const scale = projection === 'box' ? [1, 1] : material.userData.scale;
        const same = material.userData.override?.material === override.material;
        material.userData.override = override;
        if (same) {
            placeTextures(material, override, scale);
            onChange?.();
            continue;
        }
        jobs.push(Promise.all(Object.entries(MAPS).map(([key, [file, color]]) => loadTexture(libraryFile(override.material, file), color).then((texture) => [key, texture])))
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
    return { cancel: () => { cancelled = true; }, ready: Promise.all(jobs) };
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
