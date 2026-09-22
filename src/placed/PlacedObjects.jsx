import React, { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
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

// One geometry per rock variant, shared by every placed rock of that variant.
function PlacedRocks({ objects, lowPower, lighting, selectedId }) {
    const materials = useCoastRockMaterials(lowPower, lighting);
    const variantsKey = [...new Set(objects.map((object) => object.variant))].sort((a, b) => a - b).join(',');
    const geometries = useMemo(() => {
        const out = {};
        for (const variant of variantsKey.split(',').filter((v) => v !== '').map(Number)) {
            out[variant] = makeRockGeometry({ variant, detail: lowPower ? 4 : 8 });
            out[variant].computeBoundingBox();
        }
        return out;
    }, [variantsKey, lowPower]);
    useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries]);
    return objects.map((object) => {
        const geometry = geometries[object.variant];
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

export default function PlacedObjects({ objects, selectedId = null, treeAsset, shrubAsset, qualityProfile, lighting, envMapIntensity = 1 }) {
    const lowPower = Boolean(qualityProfile?.isLowPower || qualityProfile?.isMobileDevice);
    const rocks = objects.filter((object) => object.kind === 'rock');
    return <group name="placed">
        {objects.map((object) => object.kind === 'tree'
            ? <PlacedTree key={object.id} object={object} asset={treeAsset} lowPower={lowPower} envMapIntensity={envMapIntensity} selected={object.id === selectedId} />
            : object.kind === 'shrub'
                ? <PlacedShrub key={object.id} object={object} asset={shrubAsset} lowPower={lowPower} envMapIntensity={envMapIntensity} selected={object.id === selectedId} />
                : null)}
        {rocks.length ? <Suspense fallback={null}><PlacedRocks objects={rocks} lowPower={lowPower} lighting={lighting} selectedId={selectedId} /></Suspense> : null}
    </group>;
}
