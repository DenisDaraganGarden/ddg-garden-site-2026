import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { activeProjectId, projectModelUrl } from '../features/engine/projectApi.js';
import { setWakeObstacles, waterWake } from '../components/effects/water/waterWake.js';
import { waterlineCircles, waterlineCrossings } from './waterline.js';
import { setSolid, solidHeightfield } from './solidSurface.js';
import { PLACED_TRANSFORM_DEFAULT } from './settings.js';
import { applyHidden, findPart, makeFaceCamera, registerSketchupModel, tagNodes } from './sketchupModel.js';
import { makeCoastTree } from '../plants/treeModel.js';
import { TREE_SPECIES } from '../plants/treeSpecies.js';
import { makeOleaster } from '../plants/oleasterModel.js';
import { usePlantAtlas, LEAF_ATLAS, BARK_TILE, barkAtlasSpec } from '../plants/usePlantAtlas.js';
import PlantPopulation from '../plants/PlantPopulation.jsx';
import { makeRockGeometry } from '../terrain/terrainRocks.js';
import { useCoastRockMaterials } from '../terrain/CoastRocksPBR.jsx';

// Placed objects are the library's generators with one instance each: a tree
// or a shrub is a PlantPopulation of a single placement built from the
// object's own knobs, a rock is one mesh of the coast's rock geometry. The
// anchor is what the gizmo holds and the camera frames: an empty at the
// object's place. The visual stands beside it in world space (populations
// place their own instances) and carries the id, so a click on a leaf selects
// the object the way a click on a hedge does.
const NO_RAYCAST = () => {};
const deg = THREE.MathUtils.degToRad;

function Anchor({ object, selected, radius }) {
    return <object3D name={`placed-${object.id}`} position={[object.x, object.y, object.z]} rotation={[0, deg(object.rotation), 0]} scale={object.scale}>
        {selected ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .05, 0]} raycast={NO_RAYCAST} renderOrder={5}>
            <ringGeometry args={[radius * .88, radius, 48]} />
            <meshBasicMaterial color="#d9ca8c" transparent opacity={.7} depthTest={false} />
        </mesh> : null}
    </object3D>;
}

const placementOf = (object, exposure) => [{ x: object.x, y: object.y, z: object.z, yaw: deg(object.rotation), scale: object.scale, exposure, habitat: .5 }];

function PlacedTree({ object, asset, lowPower, envMapIntensity, selected }) {
    const species = TREE_SPECIES[object.species] ?? TREE_SPECIES.elm;
    const atlas = usePlantAtlas(useMemo(() => ({ ...LEAF_ATLAS, bark: barkAtlasSpec(species.bark, lowPower) }), [species.bark, lowPower]));
    // The species gives the form, the object's knobs sit on top of it: a placed
    // willow starts as the table's willow and becomes this one willow.
    const shapeKey = JSON.stringify({
        ...species.form, seed: object.seed, height: object.height, spread: object.spread, lean: object.lean, twist: object.twist,
        density: object.density, leafSize: object.leafSize, deadwood: object.deadwood,
        windBearing: asset.windBearing, midEvery: lowPower ? 4 : 2, midSkipsThin: lowPower, barkTile: BARK_TILE[species.bark], species: species.latin || species.ru,
    });
    const model = useMemo(() => makeCoastTree(JSON.parse(shapeKey)), [shapeKey]);
    const settings = useMemo(() => ({
        ...asset, leafTint: species.leafTint, barkColor: species.barkColor, barkBleach: species.barkBleach ?? 0, blossom: 0,
        translucency: object.translucency, renderDistance: Math.min(asset.renderDistance, lowPower ? 260 : 1200),
    }), [asset, species, object.translucency, lowPower]);
    const placements = useMemo(() => placementOf(object, asset.flex), [object, asset.flex]);
    return <>
        <Anchor object={object} selected={selected} radius={Math.max(.6, object.spread * .5)} />
        {atlas ? <group name={`placed-visual-${object.id}`} userData={{ placedId: object.id }}>
            <PlantPopulation model={model} atlas={atlas} settings={settings} placements={placements} sceneTime lowPower={lowPower} statsKey="placedStats" envMapIntensity={envMapIntensity} />
        </group> : null}
    </>;
}

function PlacedShrub({ object, asset, lowPower, envMapIntensity, selected }) {
    const atlas = usePlantAtlas(useMemo(() => ({ ...LEAF_ATLAS, bark: barkAtlasSpec('oleaster', lowPower) }), [lowPower]));
    const shapeKey = JSON.stringify({ seed: object.seed, height: object.height, spread: object.spread, density: object.density, leafSize: object.leafSize, barkTile: BARK_TILE.oleaster });
    const model = useMemo(() => makeOleaster(JSON.parse(shapeKey)), [shapeKey]);
    const settings = useMemo(() => ({
        ...asset, dryness: object.dryness, translucency: object.translucency, renderDistance: Math.min(asset.renderDistance, lowPower ? 110 : 300),
    }), [asset, object.dryness, object.translucency, lowPower]);
    const placements = useMemo(() => placementOf(object, 1), [object]);
    return <>
        <Anchor object={object} selected={selected} radius={Math.max(.4, object.spread * .5)} />
        {atlas ? <group name={`placed-visual-${object.id}`} userData={{ placedId: object.id }}>
            <PlantPopulation model={model} atlas={atlas} settings={settings} placements={placements} sceneTime lowPower={lowPower} statsKey="placedStats" envMapIntensity={envMapIntensity} />
        </group> : null}
    </>;
}

// A rock's «Вариант» (seed) is another stone of its «Форма» (variant); at the
// default seed it is the coast's own rock of that form, as it always was. One
// geometry per form and seed, shared by every placed rock that has both.
// ponytail: any change rebuilds them all (~2.5 ms a stone, 48 at most); keep a cache if that shows.
const rockShape = (object) => `${object.variant}:${object.seed}`;
function PlacedRocks({ objects, lowPower, lighting, selectedId }) {
    const materials = useCoastRockMaterials(lowPower, lighting);
    const shapesKey = [...new Set(objects.map(rockShape))].sort().join(',');
    const geometries = useMemo(() => {
        const out = {};
        for (const shape of shapesKey.split(',').filter(Boolean)) {
            const [variant, seed] = shape.split(':').map(Number);
            out[shape] = makeRockGeometry({ variant, detail: lowPower ? 4 : 8, take: seed - PLACED_TRANSFORM_DEFAULT.seed });
            out[shape].computeBoundingBox();
        }
        return out;
    }, [shapesKey, lowPower]);
    useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries]);
    return objects.map((object) => {
        const geometry = geometries[rockShape(object)];
        if (!geometry) return null;
        const size = object.size * object.scale;
        const scale = [size * object.stretch, size * object.squash, size];
        // Seated: the lowest vertex sits a little under the ground, so a rock
        // rests on the place rather than floating at its centre.
        const seat = -geometry.boundingBox.min.y * scale[1] * .85;
        return <React.Fragment key={object.id}>
            <Anchor object={object} selected={object.id === selectedId} radius={Math.max(.3, size * object.stretch * .6)} />
            <mesh name={`placed-visual-${object.id}`} userData={{ placedId: object.id }} geometry={geometry} material={materials[object.species] ?? materials.limestone}
                position={[object.x, object.y + seat, object.z]} rotation={[deg(object.tilt), deg(object.rotation), 0]} scale={scale} castShadow receiveShadow />
        </React.Fragment>;
    });
}

// --- imported models -------------------------------------------------------------
// A model's file, seen from this editor: the project's own folder on the local
// server (projectStore.mjs). The site's own scene is no project and has none.
const modelUrl = (object) => {
    const project = activeProjectId();
    return project ? projectModelUrl(project, object.model) : null;
};

// Wet where the sea reaches it: under the still line and a ragged splash band
// over it the scan goes darker and glossier, as the Azov rocks do. The band is
// this high (m) over the still water at y = 0.
const WET_SPLASH = .35;
function wetMaterial(material) {
    const wet = new THREE.Vector3(0, WET_SPLASH, 1);
    material.userData.placedWet = wet;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uPlacedWet = { value: wet };
        shader.vertexShader = `varying vec3 vPlacedWorld;\n${shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
            vPlacedWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`)}`;
        shader.fragmentShader = `uniform vec3 uPlacedWet;\nvarying vec3 vPlacedWorld;\n${shader.fragmentShader
            .replace('#include <map_fragment>', `#include <map_fragment>
            float placedEdge = uPlacedWet.x + uPlacedWet.y * (.6 + .4 * sin(vPlacedWorld.x * 1.9 + sin(vPlacedWorld.z * 1.3) * 2.));
            float placedWet = uPlacedWet.z * (1. - smoothstep(placedEdge - .05, placedEdge + .2, vPlacedWorld.y));
            diffuseColor.rgb *= mix(1., .58, placedWet);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, .28, placedWet);`)}`;
    };
    material.customProgramCacheKey = () => 'placed-model-wet-v1';
}

// One instance of a loaded model: its own materials (so its switches are its
// own), shadows both ways, and its own middle over the place with its lowest
// point on it — a scan's origin is wherever the scanner stood, often metres
// away. `origin`, kept from the import, is that point once and for all: a new
// version of the file with other extents stands where the old one stood. A scan's unlit material (its light baked in) is lit by the scene when
// asked: then it takes shadows and the wet line, a little darker in shade.
function prepareModel(scene, lit, origin = null) {
    const root = scene.clone(true);
    const converted = new Map();
    const convert = (material) => {
        if (converted.has(material)) return converted.get(material);
        const next = lit && material.isMeshBasicMaterial
            ? new THREE.MeshStandardMaterial({
                name: material.name, map: material.map, color: material.color, roughness: .92, metalness: 0, vertexColors: material.vertexColors,
                transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest, side: material.side,
            })
            : material.clone();
        wetMaterial(next);
        converted.set(material, next);
        return next;
    };
    root.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const at = origin ?? { x: (box.min.x + box.max.x) / 2, y: box.min.y, z: (box.min.z + box.max.z) / 2 };
    root.position.set(-at.x, -at.y, -at.z);
    return { root, materials: [...converted.values()], size: box.getSize(new THREE.Vector3()) };
}

// Loaded once per file for the session and shared by its instances. Its own
// loading manager: a model imported into a scene already on screen must not
// read as the scene loading again (drei's progress, SceneReadyBeacon), and
// loading outside render keeps React from being told about it mid-render.
const models = new Map();
const modelLoader = new GLTFLoader(new THREE.LoadingManager());
function loadModel(url) {
    if (!models.has(url)) {
        models.set(url, modelLoader.loadAsync(url).then((gltf) => { tagNodes(gltf); return gltf; }).catch((error) => { models.delete(url); throw error; }));
    }
    return models.get(url);
}
function useModel(url) {
    const [state, setState] = useState({ url: null, gltf: null });
    useEffect(() => {
        let live = true;
        // A file gone or not parsing draws nothing, not a broken scene; its
        // anchor stays, so it can still be selected and deleted.
        loadModel(url).then((gltf) => { if (live) setState({ url, gltf }); }, (error) => { if (import.meta.env.DEV) console.warn('placed model', url, error); });
        return () => { live = false; };
    }, [url]);
    return state.url === url ? state.gltf : null;
}

// The SketchUp part picked in the editor, boxed the way the anchor's ring is
// drawn: over everything, never in the way of a click.
function PartBox({ root, node, stamp }) {
    const helper = useMemo(() => {
        const box = new THREE.Box3Helper(new THREE.Box3(), '#d9ca8c');
        box.material.depthTest = false;
        box.material.transparent = true;
        box.renderOrder = 5;
        box.raycast = NO_RAYCAST;
        return box;
    }, []);
    useEffect(() => () => { helper.geometry.dispose(); helper.material.dispose(); }, [helper]);
    const invalidate = useThree((state) => state.invalidate);
    useLayoutEffect(() => {
        const part = findPart(root, node);
        root.updateWorldMatrix(true, true);
        helper.box.makeEmpty();
        if (part) helper.box.setFromObject(part);
        helper.visible = !helper.box.isEmpty();
        invalidate();
    }, [helper, root, node, stamp, invalidate]);
    return <primitive object={helper} />;
}

function PlacedModel({ object, url, selected, sketchup, selectedPart, plan = false }) {
    const gltf = useModel(url);
    const lit = object.species !== 'scan';
    const originKey = object.origin ? `${object.origin.x},${object.origin.y},${object.origin.z}` : '';
    const prepared = useMemo(() => (gltf ? prepareModel(gltf.scene, lit, originKey ? object.origin : null) : null), [gltf, lit, originKey]); // eslint-disable-line react-hooks/exhaustive-deps -- origin by value
    const group = useRef();
    const invalidate = useThree((state) => state.invalidate);
    useEffect(() => () => prepared?.materials.forEach((material) => material.dispose()), [prepared]);
    useEffect(() => { prepared?.materials.forEach((material) => { material.userData.placedWet.z = object.wet ? 1 : 0; }); }, [prepared, object.wet]);
    // A SketchUp model: its 2D plants turn to the camera, its hidden parts are
    // gone for the eye and the click, and the editor's panel can read it.
    const isSketchup = Boolean(sketchup);
    const cards = useMemo(() => (prepared && isSketchup ? makeFaceCamera(prepared.root) : null), [prepared, isSketchup]);
    const faceCamera = sketchup?.faceCamera ?? false;
    useEffect(() => { cards?.set(faceCamera); invalidate(); }, [cards, faceCamera, invalidate]);
    const hiddenParts = sketchup?.hidden.join(',') ?? '';
    // План (у камеры, как у генплана): круги крон вместо 2D-деревьев — сверху
    // картинка на ребре видна чертой.
    const crowns = (sketchup?.crowns ?? true) || plan;
    useLayoutEffect(() => {
        if (!prepared || !isSketchup) return;
        applyHidden(prepared.root, hiddenParts ? hiddenParts.split(',').map(Number) : [], crowns, plan);
        invalidate();
    }, [prepared, isSketchup, hiddenParts, crowns, plan, cards, invalidate]);
    useEffect(() => (prepared && isSketchup ? registerSketchupModel(object.id, { root: prepared.root, cards: cards?.count ?? 0, crowns: cards?.crowns ?? 0 }) : undefined), [prepared, isSketchup, cards, object.id]);
    // Wet by the sea, it also breaks the water: its waterline, found again
    // whenever it moves, is where the foam field whitens the water running at it.
    const { id, x, y, z, rotation, tiltX, tiltZ, scale, wet, hidden, collision } = object;
    useEffect(() => {
        if (!prepared || !group.current || !wet || hidden) { setWakeObstacles(waterWake, id, null); return undefined; }
        setWakeObstacles(waterWake, id, waterlineCircles(waterlineCrossings(group.current)));
        return () => setWakeObstacles(waterWake, id, null);
    }, [prepared, id, x, y, z, rotation, tiltX, tiltZ, scale, wet, hidden, hiddenParts]);
    // Solid: its top surface is ground for the board, the rider and planting.
    useEffect(() => {
        if (!prepared || !group.current || !collision || hidden) { setSolid(id, null); return undefined; }
        setSolid(id, solidHeightfield(group.current));
        return () => setSolid(id, null);
    }, [prepared, id, x, y, z, rotation, tiltX, tiltZ, scale, collision, hidden, hiddenParts]);
    if (!prepared) return <Anchor object={object} selected={selected} radius={1} />;
    return <>
        <Anchor object={object} selected={selected} radius={Math.max(.3, Math.max(prepared.size.x, prepared.size.z) * .55)} />
        <group ref={group} name={`placed-visual-${object.id}`} userData={{ placedId: object.id }} position={[object.x, object.y, object.z]}
            rotation={[deg(object.tiltX), deg(object.rotation), deg(object.tiltZ), 'YXZ']} scale={object.scale}>
            <primitive object={prepared.root} />
        </group>
        {selectedPart !== null && selectedPart !== undefined ? <PartBox root={prepared.root} node={selectedPart} stamp={`${x},${y},${z},${rotation},${tiltX},${tiltZ},${scale}`} /> : null}
    </>;
}

export default function PlacedObjects({ objects, selectedId = null, selectedPart = null, sketchupModels = {}, plan = false, treeAsset, shrubAsset, qualityProfile, lighting, envMapIntensity = 1 }) {
    const lowPower = Boolean(qualityProfile?.isLowPower || qualityProfile?.isMobileDevice);
    // A hidden object keeps its anchor: it can still be picked from the list,
    // framed and moved, it only draws nothing.
    const shown = objects.filter((object) => !object.hidden);
    const rocks = shown.filter((object) => object.kind === 'rock');
    return <group name="placed">
        {objects.filter((object) => object.hidden).map((object) => <Anchor key={object.id} object={object} selected={object.id === selectedId} radius={1} />)}
        {shown.map((object) => {
            const selected = object.id === selectedId;
            if (object.kind === 'tree') return <PlacedTree key={object.id} object={object} asset={treeAsset} lowPower={lowPower} envMapIntensity={envMapIntensity} selected={selected} />;
            if (object.kind === 'shrub') return <PlacedShrub key={object.id} object={object} asset={shrubAsset} lowPower={lowPower} envMapIntensity={envMapIntensity} selected={selected} />;
            if (object.kind !== 'model') return null;
            const url = modelUrl(object);
            return url ? <PlacedModel key={object.id} object={object} url={url} selected={selected} sketchup={sketchupModels[object.id]} plan={plan}
                selectedPart={selectedPart?.id === object.id ? selectedPart.node : null} />
                : <Anchor key={object.id} object={object} selected={selected} radius={1} />;
        })}
        {rocks.length ? <Suspense fallback={null}><PlacedRocks objects={rocks} lowPower={lowPower} lighting={lighting} selectedId={selectedId} /></Suspense> : null}
    </group>;
}
