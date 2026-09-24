import { useSyncExternalStore } from 'react';
import * as THREE from 'three';

// A SketchUp model in the scene (imported with «+ SketchUp .glb», prepared by
// scripts/sketchupGlb.mjs). Its parts are its SketchUp components, kept by the
// exporter as glTF nodes with their own names; copies of a component share one
// geometry. The 2D plants SketchUp keeps turned to the camera carry
// userData.faceCamera: here they turn to whichever camera draws them and to
// the sun for their shadow, about the component's own upright axis.

// SketchUp's lens (35° high on a 16:9 view) through the engine's 2.78:1 band:
// the same width of picture. The exporter writes the views without a lens.
export const SKETCHUP_VIEW_FOV = 22.8;
const VIEW_NAME = /^(Сцена|Scene)[\s№]/;

// The glTF node each object stands for, kept on the object: the loader's own
// map of it does not survive the clone every placed copy gets.
export function tagNodes(gltf) {
    gltf.scene.traverse((object) => {
        const node = gltf.parser.associations.get(object)?.nodes;
        if (node !== undefined) object.userData.gltfNode = node;
    });
}

const base = new THREE.Matrix4();
const turn = new THREE.Matrix4();
const spin = new THREE.Matrix4();
const pivot = new THREE.Vector3();
const toward = new THREE.Vector3();
const facing = new THREE.Vector3();
// World matrix of a cut-out turned about its component's upright axis so its
// face looks at the camera: from its place for a perspective camera, against
// the light for a shadow camera (they are orthographic).
function faceTo(mesh, camera) {
    base.multiplyMatrices(mesh.parent.matrixWorld, mesh.matrix);
    pivot.setFromMatrixPosition(mesh.parent.matrixWorld);
    if (camera.isOrthographicCamera) toward.set(0, 0, 1).transformDirection(camera.matrixWorld);
    else toward.setFromMatrixPosition(camera.matrixWorld).sub(pivot);
    facing.copy(mesh.userData.faceNormal).transformDirection(base);
    toward.y = 0;
    facing.y = 0;
    if (toward.lengthSq() < 1e-8 || facing.lengthSq() < 1e-8) return mesh.matrixWorld.copy(base);
    const angle = Math.atan2(facing.z * toward.x - facing.x * toward.z, facing.x * toward.x + facing.z * toward.z);
    turn.makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(spin.makeRotationY(angle))
        .multiply(spin.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    return mesh.matrixWorld.multiplyMatrices(turn, base);
}

// Every mesh of a marked node turns while `set(true)`. Three draws with the
// matrix onBeforeRender leaves (WebGLRenderer renderObject), but a shadow's
// model-view is taken before onBeforeShadow, so it is taken again here. A
// turned card takes no shadow: its own, cast by the card turned to the sun,
// would lie across it. Culling sees the card as it lies in the file, so its
// sphere is widened to hold every turn about the pivot.
//
// Beside the card a SketchUp 2D tree often carries its crown drawn for the
// plan: a flat see-through disc at crown height. In a perspective view it is
// a beige plate over the tree, or a band across the frame at eye level; it is
// marked here (userData.crownPlan) for the model's own switch.
export function makeFaceCamera(root) {
    const state = { on: false };
    const cards = [];
    let crowns = 0;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3(), size = new THREE.Vector3();
    root.traverse((node) => {
        if (!node.userData.faceCamera) return;
        node.traverse((mesh) => {
            if (!mesh.isMesh || !mesh.parent || !mesh.geometry.attributes.normal) return;
            mesh.userData.faceNormal = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0);
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            const around = new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(mesh.matrix).invert());
            const sphere = mesh.geometry.boundingSphere;
            mesh.boundingSphere = new THREE.Sphere(around, sphere.radius + sphere.center.distanceTo(around));
            mesh.onBeforeRender = (renderer, scene, camera) => { if (state.on) faceTo(mesh, camera); };
            mesh.onBeforeShadow = (renderer, object, camera, shadowCamera) => {
                if (!state.on) return;
                faceTo(mesh, shadowCamera);
                mesh.modelViewMatrix.multiplyMatrices(shadowCamera.matrixWorldInverse, mesh.matrixWorld);
            };
            cards.push(mesh);
        });
        node.parent?.traverse((mesh) => {
            if (!mesh.isMesh || mesh.userData.faceNormal || mesh.userData.crownPlan || !mesh.material?.transparent) return;
            box.setFromObject(mesh).getSize(size);
            if (size.y < 0.05 && Math.max(size.x, size.z) > 0.3) { mesh.userData.crownPlan = true; crowns += 1; }
        });
    });
    return {
        count: cards.length,
        crowns,
        set(on) {
            state.on = on;
            for (const mesh of cards) mesh.receiveShadow = !on;
        },
    };
}

// Parts: the model's own top level is where its components sit, under the
// exporter's single wrappers (SimLab: a Z-up root and one «Assembly»).
export function topLevel(root) {
    let level = root.children;
    while (level.length === 1 && level[0].children.length) level = level[0].children;
    return level;
}

const isPart = (object) => object.userData.gltfNode !== undefined;

// The part a click hit, as the chain of parts from the top level down to it.
export function partChain(root, hit) {
    const top = new Set(topLevel(root));
    const chain = [];
    for (let object = hit; object && object !== root; object = object.parent) {
        if (isPart(object)) chain.unshift(object);
        if (top.has(object)) return chain;
    }
    return [];
}

export const findPart = (root, node) => {
    let found = null;
    root.traverse((object) => { if (!found && object.userData.gltfNode === node) found = object; });
    return found;
};

// SketchUp's own name; an unnamed group says how much it holds, so a chain of
// them can be told apart.
export const partName = (object, ru = true) => {
    const name = object.userData.name;
    if (name && !/^Geom3D_?$/.test(name)) return name;
    if (object.isMesh || name) return ru ? 'Геометрия' : 'Geometry';
    return `${ru ? 'Группа' : 'Group'} · ${object.children.length}`;
};

// Copies of a component share its geometry; a part is known by what it draws.
const signature = (object) => {
    const ids = new Set();
    object.traverse((child) => { if (child.isMesh) ids.add(child.geometry.uuid); });
    return [...ids].sort().join(',');
};

// Every part drawing the same as this one, without the ones inside another
// match (a component and its single inner mesh are one copy).
export function copiesOf(root, part) {
    const key = signature(part);
    if (!key) return [part];
    const found = [];
    root.traverse((object) => {
        if (isPart(object) && signature(object) === key) found.push(object);
    });
    const set = new Set(found);
    return found.filter((object) => {
        for (let up = object.parent; up; up = up.parent) if (set.has(up)) return false;
        return true;
    });
}

// Hidden to the eye and to the click: the picker and the solid and waterline
// probes look at each mesh's own visibility, not its parents'.
export function applyHidden(root, hidden, crowns = true) {
    const set = new Set(hidden);
    root.traverse((object) => { object.visible = crowns || !object.userData.crownPlan; });
    root.traverse((object) => { if (set.has(object.userData.gltfNode)) object.traverse((inner) => { inner.visible = false; }); });
}

// SketchUp scenes: empty nodes looking down their −Z. They are read once per
// model relative to its placed group, and put where the object stands from its
// own numbers: the scene's group may still hold the last frame's place while
// the panel draws. The target is where the view ray passes the model's
// middle: the pivot the orbit turns about.
export function sketchupSceneNodes(root) {
    root.updateWorldMatrix(true, true);
    const toGroup = root.parent ? root.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
    const middle = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()).applyMatrix4(toGroup);
    const nodes = [];
    root.traverse((node) => {
        const name = node.userData.name ?? '';
        if (node.isMesh || node.children.length || !VIEW_NAME.test(name)) return;
        nodes.push({ name, matrix: toGroup.clone().multiply(node.matrixWorld) });
    });
    return { middle, nodes: nodes.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true })) };
}

export function sketchupViews({ middle, nodes }, object) {
    const place = new THREE.Matrix4().compose(
        new THREE.Vector3(object.x, object.y, object.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(object.tiltX), THREE.MathUtils.degToRad(object.rotation), THREE.MathUtils.degToRad(object.tiltZ), 'YXZ')),
        new THREE.Vector3(object.scale, object.scale, object.scale),
    );
    const center = middle.clone().applyMatrix4(place);
    const round = (vector) => ({ x: +vector.x.toFixed(4), y: +vector.y.toFixed(4), z: +vector.z.toFixed(4) });
    return nodes.map(({ name, matrix }) => {
        const world = place.clone().multiply(matrix);
        const position = new THREE.Vector3().setFromMatrixPosition(world);
        const forward = new THREE.Vector3(0, 0, -1).transformDirection(world);
        const target = position.clone().addScaledVector(forward, Math.max(1, center.clone().sub(position).dot(forward)));
        return { name, cameraPosition: round(position), cameraTarget: round(target), cameraFov: SKETCHUP_VIEW_FOV };
    });
}

// The loaded SketchUp models by placed id, for the editor's panel: it reads
// the parts, their copies and the scene views from the model as drawn, and
// redraws when one arrives or goes.
const loaded = new Map();
const listeners = new Set();
const changed = () => listeners.forEach((listener) => listener());
export const registerSketchupModel = (placedId, entry) => {
    loaded.set(placedId, entry);
    changed();
    return () => {
        if (loaded.get(placedId) !== entry) return;
        loaded.delete(placedId);
        changed();
    };
};
export const sketchupModelEntry = (placedId) => loaded.get(placedId) ?? null;
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useSketchupModel = (placedId) => useSyncExternalStore(subscribe, () => loaded.get(placedId) ?? null);
