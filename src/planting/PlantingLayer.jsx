import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { plantingInstances } from './fillBed.js';
import { plantCardUrl, useBedFills, usePlantLibrary } from './plantLibrary.js';
import { seasonLook } from './season.js';

// Посадки в сцене: одна пачка карточек на вид (InstancedMesh), а не на
// цветник, — сколько бы цветников ни было, вызовов отрисовки столько, сколько
// видов. Карточка — 2D-картинка из библиотеки, повёрнутая к камере вокруг
// вертикали; в проходе теней «камера» — солнце, и тень падает от всей
// картинки. План — шапки легенды Дениса вместо картинок.

// Карточка чуть утоплена: на неровной земле низ не висит в воздухе.
const SINK = 0.03;
const CARD_SHADER_KEY = 'planting-card-v1';

const hexHsv = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, max ? d / max : 0, max];
};
// Цвет цветения → (оттенок, насыщенность, белый ли, есть ли) для шейдера.
const flowerUniform = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(String(hex ?? ''))) return new THREE.Vector4(0, 0, 0, 0);
    const [h, s] = hexHsv(hex);
    return new THREE.Vector4(h, s, s < 0.18 ? 1 : 0, 1);
};

const CARD_COMMON_VERTEX = /* glsl */`
attribute vec2 aVary;
uniform vec2 uGrow;
varying float vPlantTone;
float plantYaw() {
    vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec2 toView = cameraPosition.xz - root.xz;
    return dot(toView, toView) > 1e-8 ? atan(toView.x, toView.y) : 0.0;
}`;
const CARD_COMMON_FRAGMENT = /* glsl */`
uniform float uBloom, uSeed, uTintAmount, uBare;
uniform vec2 uCardPx;
uniform vec3 uTint, uTwig, uLeaf;
uniform vec4 uFlowerA, uFlowerB;
varying float vPlantTone;
vec3 plantHsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
// Тем же правилом цветки считает импорт (import-plant-library.mjs).
float plantFlower(vec3 hsv, vec4 f) {
    if (f.w < 0.5) return 0.0;
    if (f.z > 0.5) return (1.0 - smoothstep(0.16, 0.26, hsv.y)) * smoothstep(0.45, 0.6, hsv.z);
    float d = abs(hsv.x - f.x);
    d = min(d, 1.0 - d);
    return (1.0 - smoothstep(0.06, 0.1, d)) * smoothstep(0.45 * f.y, 0.75 * f.y, hsv.y) * smoothstep(0.25, 0.36, hsv.z);
}
float plantLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 plantShade(vec3 target, float lum) { return target * (lum / max(plantLum(target), 0.02)); }`;
// Сезон поверх картинки (season.js): цветки вне цветения — листвой или
// сухими головками, общий тон (осень, солома), голые ветки — редкой сеткой
// из точек картинки цвета веточек; ствол и ветви (бурое и тёмное) остаются.
const CARD_SEASON_FRAGMENT = /* glsl */`
{
    vec3 plantHsvC = plantHsv(pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)));
    float plantL = plantLum(diffuseColor.rgb);
    float flower = max(plantFlower(plantHsvC, uFlowerA), plantFlower(plantHsvC, uFlowerB));
    vec3 hiddenFlower = mix(uLeaf, vec3(0.13, 0.085, 0.05), uSeed);
    diffuseColor.rgb = mix(diffuseColor.rgb, plantShade(hiddenFlower, min(plantL, plantLum(hiddenFlower) * 1.3)), flower * (1.0 - uBloom));
    diffuseColor.rgb = mix(diffuseColor.rgb, plantShade(uTint, plantLum(diffuseColor.rgb)), uTintAmount);
    if (uBare > 0.0) {
        float woody = max(step(plantHsvC.y, 0.18) * step(plantHsvC.z, 0.5), step(0.02, plantHsvC.x) * step(plantHsvC.x, 0.13) * step(plantHsvC.z, 0.55));
        // Решётка — по текселям картинки: вблизи — веточки, вдали — дымка.
        float grain = fract(sin(dot(floor(vMapUv * uCardPx), vec2(12.9898, 78.233))) * 43758.5453);
        if (woody < 0.5 && grain < uBare * 0.85) discard;
        // Цвет веточек — когда листвы почти нет; в распускание — своя листва.
        diffuseColor.rgb = mix(diffuseColor.rgb, plantShade(uTwig, plantLum(diffuseColor.rgb) * 0.8), smoothstep(0.4, 1.0, uBare) * (1.0 - 0.6 * woody));
    }
    diffuseColor.rgb *= vPlantTone;
}`;

function makeCardMaterials(texture, plant, envMapIntensity) {
    const uniforms = {
        uGrow: { value: new THREE.Vector2(1, 1) }, uCardPx: { value: new THREE.Vector2(...(plant.card.px ?? [512, 512])) },
        uBloom: { value: 1 }, uSeed: { value: 0 }, uTintAmount: { value: 0 }, uBare: { value: 0 },
        uTint: { value: new THREE.Color() }, uTwig: { value: new THREE.Color() }, uLeaf: { value: new THREE.Color(plant.leafColor ?? '#4a5e34') },
        uFlowerA: { value: flowerUniform(plant.bloomColor) }, uFlowerB: { value: flowerUniform(plant.bloomColor2) },
    };
    const compile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${CARD_COMMON_VERTEX}`)
            .replace('#include <beginnormal_vertex>', `float plantNormalYaw = plantYaw();
    vec3 objectNormal = normalize(vec3(sin(plantNormalYaw), 0.9, cos(plantNormalYaw)));`)
            .replace('#include <begin_vertex>', `float plantTurn = plantYaw();
    float plantX = position.x * aVary.x * uGrow.x;
    vec3 transformed = vec3(plantX * cos(plantTurn), position.y * uGrow.y, -plantX * sin(plantTurn));
    vPlantTone = aVary.y;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${CARD_COMMON_FRAGMENT}`)
            .replace('#include <map_fragment>', `#include <map_fragment>\n${CARD_SEASON_FRAGMENT}`);
    };
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity });
    const depth = new THREE.MeshDepthMaterial({ map: texture, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    for (const m of [material, depth]) {
        m.onBeforeCompile = compile;
        m.customProgramCacheKey = () => CARD_SHADER_KEY;
    }
    return { material, depth, uniforms };
}

function cardGeometry(plant) {
    const k = plant.height / plant.card.height;
    const width = plant.card.width * k, height = plant.card.height * k;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate((0.5 - plant.card.anchorX) * width, height * (0.5 - SINK), 0);
    return geometry;
}

const capacityFor = (count) => 2 ** Math.ceil(Math.log2(Math.max(8, count)));

function SpeciesCards({ plant, instances, month, envMapIntensity }) {
    const { invalidate } = useThree();
    const mesh = useRef();
    const capacity = capacityFor(instances.length);
    // Картинка грузится после отрисовки: загрузчик сообщает о себе общему
    // счётчику загрузок сцены, а из отрисовки чужое состояние не трогают.
    const [texture, setTexture] = useState(null);
    useEffect(() => {
        const map = new THREE.TextureLoader().load(plantCardUrl(plant), () => invalidate());
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 4;
        setTexture(map);
        return () => map.dispose();
    }, [plant, invalidate]);
    const resources = useMemo(() => {
        if (!texture) return null;
        const geometry = cardGeometry(plant);
        geometry.setAttribute('aVary', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
        return { geometry, ...makeCardMaterials(texture, plant, envMapIntensity) };
    // envMapIntensity правится ниже, без новой сборки шейдера.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plant, texture, capacity]);
    useEffect(() => () => { if (resources) { resources.geometry.dispose(); resources.material.dispose(); resources.depth.dispose(); } }, [resources]);
    useEffect(() => { if (resources) { resources.material.envMapIntensity = envMapIntensity; invalidate(); } }, [resources, envMapIntensity, invalidate]);

    useLayoutEffect(() => {
        const target = mesh.current;
        if (!target || !resources) return;
        const matrix = new THREE.Matrix4(), vary = resources.geometry.attributes.aVary;
        instances.forEach((p, i) => {
            matrix.makeScale(p.scale, p.scale, p.scale).setPosition(p.x, p.y, p.z);
            target.setMatrixAt(i, matrix);
            vary.setXY(i, p.flip, 0.9 + ((i * 0.618034) % 1) * 0.2);
        });
        target.count = instances.length;
        target.instanceMatrix.needsUpdate = true;
        vary.needsUpdate = true;
        invalidate();
    }, [instances, resources, invalidate]);

    const look = useMemo(() => seasonLook(plant, month), [plant, month]);
    useLayoutEffect(() => {
        if (!resources) return;
        const u = resources.uniforms;
        u.uGrow.value.set(look.grow[0], look.grow[1]);
        u.uBloom.value = look.bloom;
        u.uSeed.value = look.seed;
        u.uTintAmount.value = look.tint ? look.tintAmount : 0;
        if (look.tint) u.uTint.value.set(look.tint);
        u.uBare.value = look.bare;
        u.uTwig.value.set(look.twig);
        invalidate();
    }, [look, resources, invalidate]);

    if (!resources) return null;
    return <instancedMesh ref={mesh} name={`planting-${plant.id}`} args={[resources.geometry, resources.material, capacity]} customDepthMaterial={resources.depth}
        visible={look.visible} castShadow receiveShadow frustumCulled={false} raycast={() => {}} />;
}

// План: шапка на каждое растение — круг цвета категории (легенда библиотеки
// Дениса, прозрачность 0.61) диаметром в ширину растения. Деревья над
// кустами, кусты над травами, как на его чертежах.
const CAP_LAYER = { tree: 0.09, conifer: 0.06, shrub: 0.06, topiary: 0.06 };
function PlanCaps({ instances, library }) {
    const { invalidate } = useThree();
    const fill = useRef(), ring = useRef();
    const capacity = capacityFor(instances.length);
    const resources = useMemo(() => {
        const disc = new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2);
        const edge = new THREE.RingGeometry(0.47, 0.5, 40).rotateX(-Math.PI / 2);
        const fillMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.61, depthWrite: false, toneMapped: false });
        const ringMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
        return { disc, edge, fillMaterial, ringMaterial, core: new THREE.CircleGeometry(0.09, 20).rotateX(-Math.PI / 2), coreMaterial: new THREE.MeshBasicMaterial({ color: '#2d2f2c', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }) };
    }, []);
    useEffect(() => () => Object.values(resources).forEach((item) => item.dispose()), [resources]);
    useLayoutEffect(() => {
        if (!fill.current || !ring.current) return;
        const matrix = new THREE.Matrix4(), color = new THREE.Color(), dark = new THREE.Color();
        const ordered = [...instances].sort((a, b) => (CAP_LAYER[library.get(a.plant)?.category] ?? 0.03) - (CAP_LAYER[library.get(b.plant)?.category] ?? 0.03));
        ordered.forEach((p, i) => {
            const plant = library.get(p.plant);
            const size = (plant?.spread ?? 0.5) * p.scale;
            matrix.makeScale(size, 1, size).setPosition(p.x, p.y + (CAP_LAYER[plant?.category] ?? 0.03) + i * 1e-6, p.z);
            fill.current.setMatrixAt(i, matrix);
            ring.current.setMatrixAt(i, matrix);
            // Существующее дерево — белая шапка с тёмным кольцом, как в легенде библиотеки.
            color.set(p.existing ? '#f4f3ee' : plant?.cap ?? '#888888');
            fill.current.setColorAt(i, color);
            ring.current.setColorAt(i, p.existing ? dark.set('#2d2f2c') : dark.copy(color).multiplyScalar(0.55));
        });
        for (const target of [fill.current, ring.current]) {
            target.count = ordered.length;
            target.instanceMatrix.needsUpdate = true;
            if (target.instanceColor) target.instanceColor.needsUpdate = true;
        }
        invalidate();
    }, [instances, library, capacity, invalidate]);
    // Тёмный центр существующих деревьев — отдельной пачкой поверх шапок.
    const existing = instances.filter((p) => p.existing);
    return <group>
        <instancedMesh ref={fill} args={[resources.disc, resources.fillMaterial, capacity]} frustumCulled={false} raycast={() => {}} renderOrder={2} />
        <instancedMesh ref={ring} args={[resources.edge, resources.ringMaterial, capacity]} frustumCulled={false} raycast={() => {}} renderOrder={3} />
        {existing.map((p, i) => <mesh key={i} geometry={resources.core} material={resources.coreMaterial} position={[p.x, p.y + 0.12, p.z]} scale={Math.max(1, (library.get(p.plant)?.spread ?? 1) * p.scale * 0.6)} raycast={() => {}} renderOrder={4} />)}
    </group>;
}

// Земля цветника — мульча под растениями; по ней цветник выбирается кликом.
function BedSurface({ bed, selected, plan }) {
    const geometry = useMemo(() => {
        const shape = new THREE.Shape(bed.points.map(([x, z]) => new THREE.Vector2(x, -z)));
        return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    }, [bed.points]);
    const outline = useMemo(() => new THREE.BufferGeometry().setFromPoints(bed.points.map(([x, z]) => new THREE.Vector3(x, 0, z))), [bed.points]);
    useEffect(() => () => { geometry.dispose(); outline.dispose(); }, [geometry, outline]);
    return <group position={[0, bed.y, 0]}>
        <mesh name={`planting-bed-${bed.id}`} userData={{ plantingBed: bed.id }} geometry={geometry} position={[0, 0.012, 0]} receiveShadow={!plan}>
            {plan ? <meshBasicMaterial color="#ece6d6" toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
                : <meshStandardMaterial color="#4d3d2c" roughness={1} metalness={0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />}
        </mesh>
        {selected || plan ? <lineLoop geometry={outline} position={[0, 0.03, 0]} raycast={() => {}}>
            <lineBasicMaterial color={selected ? '#f2c14e' : '#3b3326'} depthTest={!selected} toneMapped={false} />
        </lineLoop> : null}
    </group>;
}

export default function PlantingLayer({ settings, selectedBedId = null, envMapIntensity = 1 }) {
    const { plants: library, status } = usePlantLibrary();
    const beds = settings.plantingBeds, points = settings.plantingPoints;
    const bedFills = useBedFills(beds, library);
    const bySpecies = useMemo(() => plantingInstances(beds, bedFills, points), [beds, bedFills, points]);
    const all = useMemo(() => [...bySpecies.values()].flat(), [bySpecies]);
    const plan = settings.plantingPlan;
    // Без библиотеки (сайт, чужая машина) посадок нет совсем — и мульчи тоже.
    if (status !== 'ready') return null;
    return <group name="planting">
        {beds.map((bed) => <BedSurface key={bed.id} bed={bed} selected={bed.id === selectedBedId} plan={plan} />)}
        {plan ? <PlanCaps instances={all} library={library} />
            : [...bySpecies].map(([id, instances]) => (library.has(id)
                ? <SpeciesCards key={id} plant={library.get(id)} instances={instances} month={settings.plantingMonth} envMapIntensity={envMapIntensity} />
                : null))}
    </group>;
}
