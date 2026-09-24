import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { flowerShape, leafShape } from './vineLeaves.js';
import { growVine, vineParams, vineRoot } from './vines.js';
import { seasonLook } from './season.js';
import { gardenWind, GARDEN_WIND_GLSL } from './wind.js';

// Лианы в сцене (правило роста — vines.js). На вид — атлас из четырёх
// клеток: три варианта листа и цветок или плод, серые: цвет у каждого листа
// свой — лето, осень, весна (season.js). Листья и цветки — пачками
// (InstancedMesh, по пачке на клетку), ветки — одной сеткой, трёхгранными
// прутиками. Лист лежит на стене лицом наружу и отбрасывает свою тень. Клик
// по листу выбирает лиану (sceneObjects.js: plantingVines у пачки). План —
// шапка легенды у корня, как у остальных растений.
const CELL = 256, PAD = 8;
const NO_RAYCAST = () => {};

function drawAtlas(plant) {
    const params = vineParams(plant);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CELL * 2;
    const ctx = canvas.getContext('2d');
    // Фон — тот же серый, почти прозрачный: в дальних уровнях мипмапа края
    // листа не чернеют.
    ctx.fillStyle = 'rgba(214, 214, 214, 0.004)';
    ctx.fillRect(0, 0, CELL * 2, CELL * 2);
    const path = (points, close) => { ctx.beginPath(); points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); };
    const cell = (index, draw) => {
        ctx.save();
        ctx.translate((index % 2) * CELL + PAD, Math.floor(index / 2) * CELL + PAD);
        ctx.scale(CELL - PAD * 2, CELL - PAD * 2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        draw();
        ctx.restore();
    };
    for (let variant = 0; variant < 3; variant += 1) cell(variant, () => {
        const shape = leafShape(params.leaf, variant);
        ctx.strokeStyle = '#8a8a8a';
        ctx.lineWidth = 0.024;
        shape.stems.forEach((line) => { path(line); ctx.stroke(); });
        const fill = ctx.createRadialGradient(0.5, 0.42, 0.02, 0.5, 0.5, 0.56);
        fill.addColorStop(0, '#ffffff');
        fill.addColorStop(1, '#d2d2d2');
        ctx.fillStyle = fill;
        shape.fills.forEach((polygon) => { path(polygon, true); ctx.fill(); });
        ctx.strokeStyle = 'rgba(80, 80, 80, 0.45)';
        ctx.lineWidth = 0.008;
        shape.fills.forEach((polygon) => { path(polygon, true); ctx.stroke(); });
        // Светлые жилки — у плюща; у остальных чуть темнее пластинки.
        ctx.strokeStyle = params.veins === 'pale' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(110, 110, 110, 0.5)';
        ctx.lineWidth = params.veins === 'pale' ? 0.014 : 0.01;
        shape.veins.forEach((line) => { path(line); ctx.stroke(); });
    });
    const extra = params.flower ?? params.fruit;
    if (extra) cell(3, () => {
        const shape = flowerShape(extra);
        ctx.fillStyle = '#f2f2f2';
        shape.fills.forEach((polygon) => { path(polygon, true); ctx.fill(); });
        ctx.strokeStyle = 'rgba(90, 90, 90, 0.35)';
        ctx.lineWidth = 0.008;
        shape.fills.forEach((polygon) => { path(polygon, true); ctx.stroke(); });
        for (const [x, y, r] of shape.dots) {
            const berry = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            berry.addColorStop(0, '#ffffff');
            berry.addColorStop(1, '#9c9c9c');
            ctx.fillStyle = berry;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

// Квадрат листа: черешок в начале координат, кончик по +Y, лицо по +Z.
function cellGeometry(index) {
    const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const uv = geometry.attributes.uv, col = index % 2, row = Math.floor(index / 2);
    const pad = PAD / (CELL * 2), size = (CELL - PAD * 2) / (CELL * 2);
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, col * 0.5 + pad + uv.getX(i) * size, 1 - row * 0.5 - pad - (1 - uv.getY(i)) * size);
    return geometry;
}

// Прутики: трёхгранник вдоль каждого побега, тоньше к кончику. owners — чья
// лиана каждый треугольник: зимой, без листьев, лиану выбирают по веткам.
function stemGeometry(stems) {
    const positions = [], normals = [], index = [], owners = [];
    const t = new THREE.Vector3(), n = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), dir = new THREE.Vector3();
    for (const stem of stems) {
        const { points } = stem, count = points.length, base = positions.length / 3;
        for (let k = 0; k < count; k += 1) {
            const a = points[Math.max(0, k - 1)], b = points[Math.min(count - 1, k + 1)];
            t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
            n.fromArray(stem.normals[k]);
            side.crossVectors(t, n).normalize();
            up.crossVectors(side, t).normalize();
            const r = (stem.width[0] + (stem.width[1] - stem.width[0]) * (k / Math.max(1, count - 1))) / 2;
            for (let j = 0; j < 3; j += 1) {
                const angle = (j * Math.PI * 2) / 3;
                dir.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle));
                positions.push(points[k][0] + dir.x * r, points[k][1] + dir.y * r, points[k][2] + dir.z * r);
                normals.push(dir.x, dir.y, dir.z);
            }
            if (k) for (let j = 0; j < 3; j += 1) {
                const p0 = base + (k - 1) * 3 + j, p1 = base + (k - 1) * 3 + ((j + 1) % 3), q0 = p0 + 3, q1 = p1 + 3;
                index.push(p0, q0, p1, p1, q0, q1);
                owners.push(stem.owner, stem.owner);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(index);
    geometry.userData.owners = owners;
    return geometry;
}

// Листья (и цветки) трепещут на ветру (wind.js): приподнимаются от стены на
// черешке и поворачиваются вокруг него — по порывам, у каждого свой такт.
// Тот же сдвиг — в тени (depth), побеги стоят.
function leafWind(material, key) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, gardenWind);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${GARDEN_WIND_GLSL}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
    {
        vec2 leafSway = gardenSway((modelMatrix * instanceMatrix[3]).xz, 1.0, 0.3, 2.6);
        float lift = min(length(leafSway) * 1.8, 0.7), twist = clamp((leafSway.x - leafSway.y) * 1.2, -0.45, 0.45);
        transformed = vec3(transformed.x * cos(twist), transformed.y * cos(lift), transformed.y * sin(lift) + transformed.x * sin(twist));
    }
    #endif`);
    };
    material.customProgramCacheKey = () => key;
    return material;
}

const inMonths = (months, month) => Array.isArray(months) && (months[0] <= months[1] ? month >= months[0] && month <= months[1] : month >= months[0] || month <= months[1]);
const frac = (value) => value - Math.floor(value);

function SpeciesVines({ plant, vines, month, plan, envMapIntensity }) {
    const { invalidate } = useThree();
    const params = vineParams(plant);
    const grown = useMemo(() => vines.map((vine) => ({ vine, growth: growVine(vine, plant) })), [vines, plant]);
    const resources = useMemo(() => {
        const atlas = drawAtlas(plant);
        const leaf = leafWind(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: params.gloss ? 0.42 : 0.74, metalness: 0 }), 'vine-leaf-wind');
        const depth = leafWind(new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), 'vine-leaf-wind-depth');
        const twig = new THREE.MeshStandardMaterial({ color: plant.twigColor ?? '#6b5a4a', roughness: 0.9, metalness: 0 });
        return { atlas, leaf, depth, twig, cells: [0, 1, 2, 3].map(cellGeometry) };
    // params выводятся из plant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plant]);
    useEffect(() => () => { resources.atlas.dispose(); resources.leaf.dispose(); resources.depth.dispose(); resources.twig.dispose(); resources.cells.forEach((cell) => cell.dispose()); }, [resources]);
    useEffect(() => { resources.leaf.envMapIntensity = envMapIntensity; invalidate(); }, [resources, envMapIntensity, invalidate]);

    const twigs = useMemo(() => stemGeometry(grown.flatMap(({ vine, growth }) => growth.stems.map((stem) => ({ ...stem, owner: vine.id })))), [grown]);
    useEffect(() => () => twigs.dispose(), [twigs]);
    // Листья по клеткам атласа и цветки (или плоды) — с лианой, которой они принадлежат.
    const batches = useMemo(() => {
        const out = [[], [], [], []];
        for (const { vine, growth } of grown) {
            for (const leaf of growth.leaves) out[leaf.k].push({ item: leaf, vine: vine.id });
            for (const item of params.flower ? growth.flowers : growth.fruits) out[3].push({ item, vine: vine.id });
        }
        return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grown]);
    const meshes = useRef([]);
    const look = useMemo(() => seasonLook(plant, month), [plant, month]);

    useLayoutEffect(() => {
        const matrix = new THREE.Matrix4(), x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
        const color = new THREE.Color(), base = new THREE.Color(plant.leafColor ?? '#4a5e34'), tint = new THREE.Color(), tint2 = new THREE.Color();
        const autumn = look.tint && look.tint === (plant.autumnColor ?? null);
        if (look.tint) tint.set(look.tint);
        if (autumn && plant.autumnColor2) tint2.set(plant.autumnColor2);
        // Весной, в месяц распускания, листья ещё маленькие.
        const young = plant.foliage === 'deciduous' && month === (plant.leafOut ?? 4) ? 0.6 : 1;
        const shows = params.flower ? look.bloom > 0 : inMonths(params.fruitMonths, month);
        const extraColor = new THREE.Color(params.flower ? plant.bloomColor ?? '#f2f0e8' : params.fruitColor ?? '#2b2b3a');
        batches.forEach((batch, cell) => {
            const mesh = meshes.current[cell];
            if (!mesh) return;
            batch.forEach(({ item }, i) => {
                const visible = !plan && (cell === 3 ? shows : item.r >= look.bare);
                const size = visible ? item.s * (cell === 3 ? 1 : young) : 0;
                z.fromArray(item.n); y.fromArray(item.t); x.crossVectors(y, z);
                matrix.makeBasis(x, y, z).scale(new THREE.Vector3(size, size, size)).setPosition(item.p[0], item.p[1], item.p[2]);
                mesh.setMatrixAt(i, matrix);
                if (cell === 3) color.copy(extraColor).offsetHSL(0, 0, (frac(item.r * 7.3) - 0.5) * 0.08);
                else {
                    color.copy(base).offsetHSL((frac(item.q * 13.7) - 0.5) * 0.035, 0, (frac(item.r * 7.3) - 0.5) * 0.1);
                    if (look.tint) {
                        const amount = autumn ? Math.min(1, Math.max(0, look.tintAmount * 1.5 - item.q * 0.9)) : look.tintAmount;
                        color.lerp(autumn && plant.autumnColor2 ? tint.clone().lerp(tint2, frac(item.r * 5.1)) : tint, amount);
                    }
                }
                mesh.setColorAt(i, color);
            });
            mesh.count = batch.length;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
        });
        invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batches, look, plan, month, plant, invalidate]);

    return <group>
        <mesh geometry={twigs} material={resources.twig} visible={!plan} castShadow receiveShadow name={`planting-vine-${plant.id}-twigs`} userData={{ plantingVineFaces: twigs.userData.owners }} />
        {batches.map((batch, cell) => (batch.length ? <instancedMesh key={`${cell}:${batch.length}`} ref={(mesh) => { meshes.current[cell] = mesh; }}
            args={[resources.cells[cell], resources.leaf, batch.length]} customDepthMaterial={resources.depth} castShadow receiveShadow frustumCulled={false}
            name={`planting-vine-${plant.id}-${cell}`} userData={{ plantingVines: batch.map((entry) => entry.vine) }} /> : null))}
    </group>;
}

// Выбранная лиана: её побеги жёлтой линией поверх всего.
function VineOutline({ vine, plant }) {
    const geometry = useMemo(() => {
        const segments = [];
        for (const stem of growVine(vine, plant).stems) for (let k = 1; k < stem.points.length; k += 1) segments.push(...stem.points[k - 1], ...stem.points[k]);
        return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    }, [vine, plant]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <lineSegments geometry={geometry} raycast={NO_RAYCAST} renderOrder={6}>
        <lineBasicMaterial color="#f2c14e" depthTest={false} transparent opacity={0.9} toneMapped={false} />
    </lineSegments>;
}

export default function VineLayer({ vines, library, month, plan, selectedId = null, envMapIntensity = 1 }) {
    const bySpecies = useMemo(() => {
        const map = new Map();
        for (const vine of vines) if (library.has(vine.plant)) (map.get(vine.plant) ?? map.set(vine.plant, []).get(vine.plant)).push(vine);
        return map;
    }, [vines, library]);
    const selected = vines.find((vine) => vine.id === selectedId);
    return <group name="planting-vines">
        {[...bySpecies].map(([id, list]) => <SpeciesVines key={id} plant={library.get(id)} vines={list} month={month} plan={plan} envMapIntensity={envMapIntensity} />)}
        {plan ? vines.filter((vine) => library.has(vine.plant)).map((vine) => {
            const [x, y, z] = vineRoot(vine);
            return <mesh key={vine.id} position={[x, y + 0.1, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST} renderOrder={3}>
                <circleGeometry args={[0.28, 28]} />
                <meshBasicMaterial color={library.get(vine.plant).cap ?? '#9a6fb0'} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
            </mesh>;
        }) : null}
        {selected && library.has(selected.plant) ? <VineOutline vine={selected} plant={library.get(selected.plant)} /> : null}
    </group>;
}
