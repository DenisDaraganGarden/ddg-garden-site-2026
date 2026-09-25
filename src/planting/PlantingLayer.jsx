import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { plantingInstances } from './fillBed.js';
import { bakeGroundTiles, bedGroundGeometry, groundSeason, makeGroundMaterial, plantGroundMaps, plantMapTextures } from './bedGround.js';
import { bakeLawnTile, makeLawnMaterial, setLawnUniforms } from './lawnGround.js';
import { plantCardUrl, plantSeasonUrl, useBedFills, usePlantLibrary } from './plantLibrary.js';
import { seasonImage, seasonLook } from './season.js';
import VineLayer from './VineLayer.jsx';
import { gardenWind, GARDEN_WIND_GLSL, plantFlex } from './wind.js';

// Посадки в сцене: одна пачка карточек на вид (InstancedMesh), а не на
// цветник, — сколько бы цветников ни было, вызовов отрисовки столько, сколько
// видов. Карточка — 2D-картинка из библиотеки, повёрнутая к камере вокруг
// вертикали; в проходе теней «камера» — солнце, и тень падает от всей
// картинки. На ветру (wind.js) верх карточки ходит по ветру, низ стоит —
// с гибкостью и частотой её вида; тень качается вместе с ней. План — шапки
// легенды Дениса вместо картинок. Сезон — картинками, нарисованными по
// карточке (season-<фаза>.webp, scripts/plantSeasons.mjs); где картинки фазы
// нет — правкой самой карточки (seasonLook).

// Карточка чуть утоплена: на неровной земле низ не висит в воздухе.
const SINK = 0.03;
const CARD_SHADER_KEY = 'planting-card-v3';

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
uniform vec2 uGrow, uCard, uFlex;
varying float vPlantTone;
${GARDEN_WIND_GLSL}
float plantYaw() {
    vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec2 toView = cameraPosition.xz - root.xz;
    return dot(toView, toView) > 1e-8 ? atan(toView.x, toView.y) : 0.0;
}`;
const CARD_COMMON_FRAGMENT = /* glsl */`
uniform float uBloom, uSeed, uTintAmount, uBare, uSeasonMix;
uniform sampler2D uSeasonA, uSeasonB;
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
// Листопад пятнами размером с кисть листвы (≈9 пикселей картинки), а не
// по пикселю: в переходный месяц часть кроны уже с картинки следующей фазы.
float plantHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float plantDissolve(vec2 uv) {
    vec2 p = uv * uCardPx / 9.0, i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(plantHash(i), plantHash(i + vec2(1.0, 0.0)), f.x), mix(plantHash(i + vec2(0.0, 1.0)), plantHash(i + 1.0), f.x), f.y);
}
vec3 plantShade(vec3 target, float lum) { return target * (lum / max(plantLum(target), 0.02)); }`;
// Картинка сезона вместо карточки: фаза A, в переходный месяц пятнами — B.
// Та же замена стоит и в тени (материал глубины), чтобы тень была от неё.
const CARD_MAP_FRAGMENT = /* glsl */`
#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    #ifdef PLANT_SEASON
        vec4 plantA = texture2D( uSeasonA, vMapUv ), plantB = texture2D( uSeasonB, vMapUv );
        sampledDiffuseColor = mix( plantA, plantB, step( plantDissolve( vMapUv ), uSeasonMix ) );
    #endif
    diffuseColor *= sampledDiffuseColor;
#endif`;
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
        uGrow: { value: new THREE.Vector2(1, 1) }, uCard: { value: new THREE.Vector2(plant.height, SINK) }, uFlex: { value: new THREE.Vector2(...plantFlex(plant.category)) }, uCardPx: { value: new THREE.Vector2(...(plant.card.px ?? [512, 512])) },
        uBloom: { value: 1 }, uSeed: { value: 0 }, uTintAmount: { value: 0 }, uBare: { value: 0 },
        uTint: { value: new THREE.Color() }, uTwig: { value: new THREE.Color() }, uLeaf: { value: new THREE.Color(plant.leafColor ?? '#4a5e34') },
        uFlowerA: { value: flowerUniform(plant.bloomColor) }, uFlowerB: { value: flowerUniform(plant.bloomColor2) },
        uSeasonA: { value: texture }, uSeasonB: { value: texture }, uSeasonMix: { value: 0 },
    };
    const compile = (shader) => {
        Object.assign(shader.uniforms, uniforms, gardenWind);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${CARD_COMMON_VERTEX}`)
            .replace('#include <beginnormal_vertex>', `float plantNormalYaw = plantYaw();
    vec3 objectNormal = normalize(vec3(sin(plantNormalYaw), 0.9, cos(plantNormalYaw)));`)
            .replace('#include <begin_vertex>', `float plantTurn = plantYaw();
    float plantX = position.x * aVary.x * uGrow.x;
    vec3 transformed = vec3(plantX * cos(plantTurn), position.y * uGrow.y, -plantX * sin(plantTurn));
    vPlantTone = aVary.y;
    // Ветер: высота карточки uCard.x, низ утоплен на uCard.y её доли.
    float plantScale = length(instanceMatrix[0].xyz);
    float plantBendAt = clamp(position.y / uCard.x + uCard.y, 0.0, 1.0);
    transformed.xz += gardenSway((modelMatrix * instanceMatrix[3]).xz, uCard.x * uGrow.y * plantScale, uFlex.x, uFlex.y) * plantBendAt * plantBendAt / plantScale;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${CARD_COMMON_FRAGMENT}`)
            .replace('#include <map_fragment>', `${CARD_MAP_FRAGMENT}\n${CARD_SEASON_FRAGMENT}`);
    };
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity });
    const depth = new THREE.MeshDepthMaterial({ map: texture, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    for (const m of [material, depth]) {
        m.onBeforeCompile = compile;
        m.customProgramCacheKey = () => CARD_SHADER_KEY;
        // Есть картинки сезона — карточка смешивает их; нет — как было, одна выборка.
        if (plant.seasons) m.defines = { ...m.defines, PLANT_SEASON: '' };
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

const NOTHING = () => {};

// Картинки сезона вида: грузятся, когда месяц их просит; пока новые грузятся,
// на экране прежние (а не правка карточки на кадр). Ненужные — освобождаются.
function useSeasonPictures(plant, image, invalidate) {
    const wanted = [image.phase, image.next].filter((phase) => phase && phase !== 'card');
    const ready = image.visible && wanted.every((phase) => plant.seasons?.[phase]);
    const ids = ready ? wanted.map((phase) => `${phase}@${plant.seasons[phase]}`) : [];
    const key = `${plant.id}|${ids.join(',')}`;
    const cache = useRef(new Map());
    const [shown, setShown] = useState(null);
    useEffect(() => {
        if (!ready) { setShown(null); return undefined; }
        const store = cache.current;
        let live = true;
        const done = () => {
            if (!live || !ids.every((id) => store.get(id)?.image)) return;
            setShown({ key, image, maps: Object.fromEntries(ids.map((id) => [id.split('@')[0], store.get(id)])) });
            invalidate();
        };
        for (const id of ids) {
            if (store.has(id)) continue;
            const map = new THREE.TextureLoader().load(plantSeasonUrl(plant, id.split('@')[0]), done);
            map.colorSpace = THREE.SRGBColorSpace;
            map.anisotropy = 4;
            store.set(id, map);
        }
        done();
        return () => { live = false; };
    // ids и image — из key и месяца; картинки перечитываются только с ними.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, ready, image]);
    useEffect(() => {
        const keep = new Set([...ids, ...Object.entries(shown?.maps ?? {}).map(([phase]) => `${phase}@${plant.seasons?.[phase]}`)]);
        for (const [id, map] of cache.current) if (!keep.has(id)) { map.dispose(); cache.current.delete(id); }
    });
    useEffect(() => () => { cache.current.forEach((map) => map.dispose()); cache.current.clear(); }, []);
    return ready ? shown : null;
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
    const image = useMemo(() => seasonImage(plant, month), [plant, month]);
    const pictures = useSeasonPictures(plant, image, invalidate);
    useLayoutEffect(() => {
        if (!resources) return;
        const u = resources.uniforms;
        if (pictures) {
            // Всё уже нарисовано: карточка — только рост и зимний тон вечнозелёных.
            const { image: shown, maps } = pictures;
            u.uSeasonA.value = maps[shown.phase] ?? texture;
            u.uSeasonB.value = shown.next ? maps[shown.next] ?? texture : u.uSeasonA.value;
            u.uSeasonMix.value = shown.next ? shown.mix : 0;
            u.uGrow.value.set(shown.grow[0], shown.grow[1]);
            u.uBloom.value = 1;
            u.uSeed.value = 0;
            u.uBare.value = 0;
            u.uTintAmount.value = shown.tint ? shown.tintAmount : 0;
            if (shown.tint) u.uTint.value.set(shown.tint);
        } else {
            u.uSeasonA.value = texture;
            u.uSeasonB.value = texture;
            u.uSeasonMix.value = 0;
            u.uGrow.value.set(look.grow[0], look.grow[1]);
            u.uBloom.value = look.bloom;
            u.uSeed.value = look.seed;
            u.uTintAmount.value = look.tint ? look.tintAmount : 0;
            if (look.tint) u.uTint.value.set(look.tint);
            u.uBare.value = look.bare;
            u.uTwig.value.set(look.twig);
        }
        invalidate();
    }, [look, pictures, texture, resources, invalidate]);

    if (!resources) return null;
    return <instancedMesh ref={mesh} name={`planting-${plant.id}`} args={[resources.geometry, resources.material, capacity]} customDepthMaterial={resources.depth}
        visible={pictures ? pictures.image.visible : look.visible} castShadow receiveShadow frustumCulled={false} raycast={() => {}} />;
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

// Площадка цветника — по ней цветник выбирается кликом; видна она только на
// плане (бумага). Сам грунт рисует BedGround. Дырки (приствольные круги) — дырки.
function BedSurface({ bed, selected, plan }) {
    const geometry = useMemo(() => {
        const shape = new THREE.Shape(bed.points.map(([x, z]) => new THREE.Vector2(x, -z)));
        for (const hole of bed.holes ?? []) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
        return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    }, [bed.points, bed.holes]);
    const outlines = useMemo(() => [bed.points, ...(bed.holes ?? [])].map((ring) => new THREE.BufferGeometry().setFromPoints(ring.map(([x, z]) => new THREE.Vector3(x, 0, z)))), [bed.points, bed.holes]);
    useEffect(() => () => { geometry.dispose(); outlines.forEach((outline) => outline.dispose()); }, [geometry, outlines]);
    // Бумага плана на поверхности модели не проверяет глубину — иначе её
    // прячет сама неровная земля; но только сверху: сбоку её закрывают стены.
    const topOnly = plan && bed.surface ? (renderer, scene, camera, _geometry, material) => { material.depthTest = camera.matrixWorld.elements[9] < 0.9; } : NOTHING;
    return <group position={[0, bed.y, 0]}>
        <mesh name={`planting-bed-${bed.id}`} userData={{ plantingBed: bed.id }} geometry={geometry} position={[0, bed.surface ? 0.03 : 0.012, 0]} receiveShadow={!plan && !bed.surface} renderOrder={plan ? 1 : 0} onBeforeRender={topOnly}>
            {plan ? <meshBasicMaterial color={bed.kind === 'lawn' ? '#dfe7cc' : '#ece6d6'} toneMapped={false} depthTest={!bed.surface} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
                : <meshBasicMaterial transparent opacity={0} depthWrite={false} />}
        </mesh>
        {selected || plan ? outlines.map((outline, i) => <lineLoop key={i} geometry={outline} position={[0, 0.04, 0]} raycast={() => {}} renderOrder={5} onBeforeRender={selected ? NOTHING : topOnly}>
            <lineBasicMaterial color={selected ? '#f2c14e' : '#3b3326'} depthTest={!selected && !bed.surface} toneMapped={false} />
        </lineLoop>) : null}
    </group>;
}

// Грунт цветника (bedGround.js): кора с землёй, с глубиной, по рельефу
// цветника — и на поверхности модели (поверх её газона или коры), и на
// берегу; опад и тень — от растений этого цветника, влага и иней — от месяца.
function BedGround({ bed, fill, library, month }) {
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    const shapeKey = JSON.stringify([bed.points, bed.holes ?? null, bed.ground ?? null, bed.y]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- форма цветника по значению
    const geometry = useMemo(() => bedGroundGeometry(bed), [shapeKey]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    const ground = useMemo(() => makeGroundMaterial(bakeGroundTiles(gl)), [gl]);
    useEffect(() => () => ground.material.dispose(), [ground]);
    const maps = useMemo(() => plantGroundMaps(bed, fill ?? [], library, month), [bed, fill, library, month]);
    const textures = useRef(null);
    useLayoutEffect(() => {
        textures.current = plantMapTextures(maps, textures.current);
        const u = ground.uniforms, season = groundSeason(month);
        u.uPlantLitter.value = textures.current.litter;
        u.uPlantKind.value = textures.current.kind;
        u.uPlantFrame.value.set(...maps.frame);
        u.uMoisture.value = season.moisture;
        u.uFrost.value = season.frost;
        u.uAged.value = season.aged;
        invalidate();
    }, [maps, month, ground, invalidate]);
    useEffect(() => () => { textures.current?.litter.dispose(); textures.current?.kind.dispose(); }, []);
    return <mesh name={`planting-ground-${bed.id}`} geometry={geometry} material={ground.material} receiveShadow raycast={NOTHING} />;
}

// Газон (lawnGround.js): само покрытие — трава с глубиной, стрижка полосами,
// цвет месяца; опад и тень — от деревьев и кустов, посаженных поштучно.
function LawnGround({ bed, points, library, month }) {
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    const shapeKey = JSON.stringify([bed.points, bed.holes ?? null, bed.ground ?? null, bed.y]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- форма газона по значению
    const geometry = useMemo(() => bedGroundGeometry(bed), [shapeKey]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    const lawn = useMemo(() => makeLawnMaterial(bakeLawnTile(gl), bakeGroundTiles(gl).litter), [gl]);
    useEffect(() => () => lawn.material.dispose(), [lawn]);
    const maps = useMemo(() => plantGroundMaps(bed, points, library, month), [bed, points, library, month]);
    const textures = useRef(null);
    useLayoutEffect(() => {
        textures.current = plantMapTextures(maps, textures.current);
        const u = lawn.uniforms;
        u.uPlantLitter.value = textures.current.litter;
        u.uPlantKind.value = textures.current.kind;
        u.uPlantFrame.value.set(...maps.frame);
        setLawnUniforms(u, bed.lawn, month, bed.seed);
        invalidate();
    }, [maps, month, lawn, bed.lawn, bed.seed, invalidate]);
    useEffect(() => () => { textures.current?.litter.dispose(); textures.current?.kind.dispose(); }, []);
    return <mesh name={`planting-lawn-${bed.id}`} geometry={geometry} material={lawn.material} receiveShadow raycast={NOTHING} />;
}

export default function PlantingLayer({ settings, selectedBedId = null, selectedVineId = null, envMapIntensity = 1 }) {
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
        {plan ? null : beds.map((bed, i) => (bed.kind === 'lawn'
            ? <LawnGround key={bed.id} bed={bed} points={points} library={library} month={settings.plantingMonth} />
            : <BedGround key={bed.id} bed={bed} fill={bedFills[i]} library={library} month={settings.plantingMonth} />))}
        {plan ? <PlanCaps instances={all} library={library} />
            : [...bySpecies].map(([id, instances]) => (library.has(id)
                ? <SpeciesCards key={id} plant={library.get(id)} instances={instances} month={settings.plantingMonth} envMapIntensity={envMapIntensity} />
                : null))}
        {settings.plantingVines?.length ? <VineLayer vines={settings.plantingVines} library={library} month={settings.plantingMonth} plan={plan} selectedId={selectedVineId} envMapIntensity={envMapIntensity} /> : null}
    </group>;
}
