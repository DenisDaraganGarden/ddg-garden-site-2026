import * as THREE from 'three';
import { EDITOR_THUMBNAIL_READY, requestEditorThumbnail } from '../components/effects/editorThumbnailCapture.js';
import { fillBed, plantingInstances } from '../planting/fillBed.js';
import { isVegetationPhotoMaterial } from './prompt.js';

const rounded = (v) => Math.round(v * 100) / 100;
const positionText = (point) => `${Math.round((point.x + 1) * 50)}%, ${Math.round((1 - point.y) * 50)}%`;
const isHelper = (o) => o.isLine || o.isTransformControlsRoot || o.type?.startsWith('TransformControls') || o.isBoxHelper || o.userData?.editorOnly
    || ['annotations', 'walk-start', 'lighting-connections', 'cursor-flashlight', 'cursor-flashlight-glint'].includes(o.name);
const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

function textureReference(material) {
    // The live map includes library overrides. Never substitute the original
    // SketchUp map after the author has changed that surface.
    const source = material.map?.image;
    if (!source?.width || source.data) return null;
    try {
        const canvas = document.createElement('canvas');
        const k = Math.min(1, 512 / Math.max(source.width, source.height));
        canvas.width = Math.max(1, Math.round(source.width * k)); canvas.height = Math.max(1, Math.round(source.height * k));
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
        return { name: material.name || 'Surface', image: canvas.toDataURL('image/png') };
    } catch { return null; }
}

export function collectPhotoContext(scene, camera, { settings, library = new Map(), cameraName = '' }) {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const point = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
    const sphere = new THREE.Sphere(), box = new THREE.Box3(), ray = new THREE.Raycaster();
    const occluders = [], materials = new Map(), plants = [], objects = [];
    for (const placed of settings.placedEnabled === false ? [] : settings.placedObjects ?? []) {
        const root = scene.getObjectByName(`placed-visual-${placed.id}`);
        if (!root || !visible(root)) continue;
        box.setFromObject(root);
        if (!frustum.intersectsBox(box)) continue;
        box.getCenter(point).project(camera);
        objects.push({ name: placed.name || placed.species || placed.kind, position: positionText(point) });
        if (placed.kind !== 'model') continue;
        root.traverseVisible((mesh) => {
            if (!mesh.isMesh || mesh.isInstancedMesh) return;
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
            if (!frustum.intersectsSphere(sphere)) return;
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            if (list.every((m) => !m.transparent && !m.transmission && !m.userData?.glass)) occluders.push(mesh);
            const weight = sphere.radius / Math.max(0.1, eye.distanceTo(sphere.center));
            for (const material of list) {
                const before = materials.get(material.uuid);
                if (!before || before.weight < weight) materials.set(material.uuid, { material, weight });
            }
        });
    }
    // Botanical identity comes from the same library as the rendered instances.
    // A few rays against opaque architecture remove fully hidden candidates.
    let rays = 0;
    const unobstructed = (at, radius) => {
        if (!occluders.length || rays++ > 2400) return true;
        ray.set(eye, at.clone().sub(eye).normalize()); ray.far = Math.max(0, eye.distanceTo(at) - radius);
        return !ray.intersectObjects(occluders, false).length;
    };
    const beds = settings.plantingBeds ?? [];
    const planInstances = settings.plantingPlan && settings.plantingEnabled !== false
        ? plantingInstances(beds, beds.map((bed) => fillBed(bed, library)), settings.plantingPoints ?? []) : null;
    if (settings.plantingEnabled !== false) for (const [id, plant] of library) {
        const mesh = scene.getObjectByName(`planting-${id}`);
        const instances = planInstances?.get(id);
        if (!instances && (!mesh?.isInstancedMesh || !visible(mesh))) continue;
        const row = { id, name: plant.ru || plant.en || id, latin: plant.latin || '', height: rounded(plant.height || 1), count: 0, positions: [], season: `month ${settings.plantingMonth || 6}` };
        for (let i = 0; i < (instances?.length ?? mesh.count); i++) {
            if (instances) { const p = instances[i]; matrix.makeScale(p.scale, p.scale, p.scale).setPosition(p.x, p.y, p.z); }
            else { mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); }
            matrix.decompose(point, rotation, scale);
            const height = (plant.height || 1) * scale.y;
            const radius = Math.max((plant.spread || 0.5) * scale.x / 2, height / 2);
            sphere.center.copy(point).add(new THREE.Vector3(0, height / 2, 0)); sphere.radius = radius;
            if (!frustum.intersectsSphere(sphere)) continue;
            const middle = sphere.center.clone();
            if (!unobstructed(middle, radius * 0.25) && !unobstructed(middle.clone().add(new THREE.Vector3(0, height * 0.4, 0)), radius * 0.25)) continue;
            point.copy(middle).project(camera);
            row.count++;
            if (row.positions.length < 16) row.positions.push(positionText(point));
        }
        if (row.count) plants.push({ ...row, positions: row.positions.join('; ') });
    }
    const selected = [...materials.values()].filter(({ material }) => !isVegetationPhotoMaterial(material)).sort((a, b) => b.weight - a.weight).slice(0, 24);
    const references = selected.filter(({ material }) => material.map).slice(0, 6).map(({ material }) => textureReference(material)).filter(Boolean);
    return {
        context: {
            camera: { name: cameraName, fov: camera.fov, position: eye.toArray().map(rounded), quaternion: camera.quaternion.toArray(), aspect: camera.aspect },
            month: settings.plantingMonth, hour: settings.timeOfDay,
            plants, objects, materials: selected.map(({ material }) => ({ name: material.name || 'Surface', color: material.color ? `#${material.color.getHexString()}` : '', roughness: material.roughness })),
        }, references,
    };
}

export function capturePhotoFrame(options) {
    return new Promise((resolve, reject) => {
        const key = `photo:${crypto.randomUUID()}`;
        let metadata, issue;
        const timer = setTimeout(() => { cleanup(); reject(new Error('Кадр не получен. Дождитесь загрузки сцены и повторите захват.')); }, 20000);
        const cleanup = () => { clearTimeout(timer); window.removeEventListener(EDITOR_THUMBNAIL_READY, receive); };
        const receive = (event) => {
            if (event.detail?.key !== key) return;
            cleanup();
            if (issue) reject(issue); else resolve({ image: event.detail.image, ...metadata });
        };
        window.addEventListener(EDITOR_THUMBNAIL_READY, receive);
        requestEditorThumbnail(key, {
            width: 2560, format: 'image/png', aspect: options.aspect,
            prepare: ({ scene, camera }) => {
                const hidden = [];
                scene.traverse((object) => { if (object.visible && isHelper(object)) { hidden.push(object); object.visible = false; } });
                try { metadata = collectPhotoContext(scene, photoCaptureCamera(camera, options.aspect), options); } catch (error) { issue = error; }
                return () => hidden.forEach((object) => { object.visible = true; });
            },
        });
    });
}

// Match the centre crop of the capture without changing the live camera.
export function photoCaptureCamera(camera, aspect) {
    if (!(aspect > 0) || !camera.isPerspectiveCamera) return camera;
    const copy = camera.clone();
    camera.getWorldPosition(copy.position); camera.getWorldQuaternion(copy.quaternion); copy.scale.set(1, 1, 1);
    const x = Math.max(1, camera.aspect / aspect), y = Math.max(1, aspect / camera.aspect);
    const m = copy.projectionMatrix.elements;
    m[0] *= x; m[8] *= x; m[5] *= y; m[9] *= y;
    copy.projectionMatrixInverse.copy(copy.projectionMatrix).invert();
    copy.aspect = aspect;
    copy.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / y));
    return copy;
}
