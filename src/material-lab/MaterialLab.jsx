import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabFacts, LabGroup, LabModes, LabRange, LabSelect, LabSwatches, LabText, LabToggle } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import { listMaterials, removeMaterial, updateMaterial } from '../materials/api.js';
import { libraryFile, loadLibraryMaps, setLibraryTransform } from '../materials/modelMaterials.js';
import { MATERIAL_RANGES } from '../materials/settings.js';
import { categoryOf, MATERIAL_CATEGORIES } from '../materials/recipe.js';

// Библиотека материалов (~/Ouroboros/library/materials) на шаре, кубе, стене и
// плитке — те же карты и то же наложение, что на модели SketchUp (src/materials).
// Плитка, рельеф и матовость здесь — умолчания материала: «Сохранить» пишет их
// в библиотеку, и «Применить» в окне материала редактора кладёт его с ними.
// На уже положенные в проектах материалы они не влияют.
const VIEWS = {
    sphere: { landscape: { position: [1.25, 0.95, 1.75], target: [0, 0.5, 0] }, portrait: { position: [1.7, 1.2, 2.5], target: [0, 0.5, 0] } },
    cube: { landscape: { position: [1.5, 1.25, 1.95], target: [0, 0.5, 0] }, portrait: { position: [2, 1.6, 2.7], target: [0, 0.5, 0] } },
    wall: { landscape: { position: [0.9, 1.15, 3.9], target: [0, 1, 0] }, portrait: { position: [1.2, 1.3, 5.6], target: [0, 1, 0] } },
    tile: { landscape: { position: [0, 3.1, 0.01], target: [0, 0, 0] }, portrait: { position: [0, 4.6, 0.01], target: [0, 0, 0] } },
};
const LIMITS = { minDistance: 0.4, maxDistance: 9, minPolarAngle: 0, maxPolarAngle: Math.PI / 2 - 0.02 };
// Сколько метров поверхности у формы вдоль u и v: по ним плитка в метрах.
const SHAPES = {
    sphere: { size: [Math.PI, Math.PI / 2], make: () => new THREE.SphereGeometry(0.5, 128, 64), position: [0, 0.5, 0] },
    cube: { size: [1, 1], make: () => new THREE.BoxGeometry(1, 1, 1), position: [0, 0.5, 0] },
    wall: { size: [3, 2], make: () => new THREE.PlaneGeometry(3, 2), position: [0, 1, 0] },
    tile: { size: [2, 2], make: () => new THREE.PlaneGeometry(2, 2), position: [0, 0.004, 0], rotation: [-Math.PI / 2, 0, 0] },
};
const MAP_KEYS = { color: 'map', normal: 'normalMap', roughness: 'roughnessMap', ao: 'aoMap', height: 'heightMap' };
const DEFAULT_LOOK = { tile: 1, tileY: 1, rotation: 0, metalness: 0, normal: 1, roughness: 1, ao: true, exposure: 1.04, environmentIntensity: 0.8 };
const TEXT = {
    ru: {
        title: 'Материалы', subtitle: 'Библиотека текстур · все карты на шаре, кубе, стене и плитке',
        sphere: 'Шар', cube: 'Куб', wall: 'Стена', tile: 'Плитка',
        library: 'Библиотека', material: 'Материал', light: 'Свет', show: 'Карта',
        all: 'Всё', color: 'Цвет', normal: 'Нормали', roughness: 'Шероховатость', ao: 'AO', height: 'Высота',
        name: 'Имя', tileSize: 'Плитка', tileShow: 'Плитка (показ)', relief: 'Рельеф', matte: 'Матовость', shade: 'Затенение щелей',
        exposure: 'Экспозиция', environment: 'Отражения среды',
        save: 'Сохранить умолчания', saved: 'Сохранено', revert: 'Как в библиотеке', remove: 'Удалить',
        confirm: (name) => `Удалить «${name}» из библиотеки? В проектах, где он положен, вернётся материал SketchUp.`,
        empty: 'Пока пусто. Материалы появляются здесь, когда их делают в редакторе: правый щелчок по модели SketchUp → «Сгенерировать / доработать текстуру…».',
        offline: 'Библиотека не отвечает: лабораторию нужно перезапустить (41215) — сервер старее этой страницы.',
        mapsOnly: 'Карты к текстуре SketchUp: на модели она лежит, как лежала, плитка здесь — только для показа.',
        note: 'Умолчания — с ними «Применить» в окне материала кладёт его на модель. Уже положенные материалы не меняются.',
        metres: 'м', pixels: 'пикс', seam: 'шов', madeBy: 'откуда', ai: 'ИИ', mapsMode: 'только карты', created: 'сделан', materials: 'материалов',
    },
    en: {
        title: 'Materials', subtitle: 'Texture library · every map on a sphere, cube, wall and tile',
        sphere: 'Sphere', cube: 'Cube', wall: 'Wall', tile: 'Tile',
        library: 'Library', material: 'Material', light: 'Light', show: 'Map',
        all: 'All', color: 'Colour', normal: 'Normals', roughness: 'Roughness', ao: 'AO', height: 'Height',
        name: 'Name', tileSize: 'Tile', tileShow: 'Tile (preview)', relief: 'Relief', matte: 'Roughness', shade: 'Crevice shading',
        exposure: 'Exposure', environment: 'Environment reflections',
        save: 'Save as defaults', saved: 'Saved', revert: 'As in the library', remove: 'Delete',
        confirm: (name) => `Delete “${name}” from the library? Projects that use it get the SketchUp material back.`,
        empty: 'Empty so far. Materials land here when they are made in the editor: right-click a SketchUp model → “Generate / improve texture…”.',
        offline: 'The library does not answer: restart the lab (41215) — its server is older than this page.',
        mapsOnly: 'Maps for a SketchUp texture: on the model it lies as it did, the tile here is only for the preview.',
        note: 'Defaults are what “Apply” in the material window lays on a model. Materials already applied do not change.',
        metres: 'm', pixels: 'px', seam: 'seam', madeBy: 'made by', ai: 'AI', mapsMode: 'maps only', created: 'made', materials: 'materials',
    },
};

const lookOf = (entry) => ({ tile: entry?.tile ?? 1, tileY: entry?.tileY ?? entry?.tile ?? 1, rotation: entry?.rotation ?? 0,
    metalness: entry?.metalness ?? 0, normal: entry?.normal ?? 1, roughness: entry?.roughness ?? 1 });

// Координаты формы — как у glTF (v сверху вниз): карты библиотеки читаются с
// flipY = false, как на модели SketchUp, и лежат на шаре так же, как на ней.
function gltfUv(geometry) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - uv.getY(i));
    return geometry;
}

function useLibraryMaps(id) {
    const [maps, setMaps] = useState(null);
    useEffect(() => {
        setMaps(null);
        if (!id) return undefined;
        let live = true;
        const height = new Promise((resolve) => new THREE.TextureLoader().load(libraryFile(id, 'height.png'), (texture) => {
            texture.flipY = false;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            resolve(texture);
        }, undefined, () => resolve(null)));
        Promise.all([loadLibraryMaps(id), height]).then(([loaded, heightMap]) => {
            const next = { ...Object.fromEntries(loaded), heightMap };
            if (live) setMaps(next);
            else Object.values(next).forEach((texture) => texture?.dispose());
        }, () => {});
        return () => { live = false; };
    }, [id]);
    useEffect(() => () => maps && Object.values(maps).forEach((texture) => texture?.dispose()), [maps]);
    return maps;
}

function Specimen({ shape, maps, look, show }) {
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    const { make, size, position, rotation } = SHAPES[shape];
    const geometry = useMemo(() => gltfUv(make()), [make]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    const lit = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0 }), []);
    const flat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
    useEffect(() => () => { lit.dispose(); flat.dispose(); }, [lit, flat]);
    // Карта отдельно — как она есть в файле: данные (не цвет) читаются как sRGB,
    // чтобы вывод на экран вернул те же числа.
    const raw = useMemo(() => {
        if (!maps) return null;
        return Object.fromEntries(Object.entries(maps).filter(([, texture]) => texture).map(([key, texture]) => {
            if (key === 'map') return [key, texture];
            const copy = texture.clone();
            copy.colorSpace = THREE.SRGBColorSpace;
            copy.needsUpdate = true;
            return [key, copy];
        }));
    }, [maps]);
    useEffect(() => () => raw && Object.entries(raw).forEach(([key, texture]) => key !== 'map' && texture.dispose()), [raw]);

    useLayoutEffect(() => {
        if (!maps) return;
        const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        for (const texture of [...Object.values(maps), ...Object.values(raw ?? {})]) {
            if (!texture) continue;
            setLibraryTransform(texture, { ...look, projection: 'box' }, size);
            texture.anisotropy = anisotropy;
        }
        lit.map = maps.map;
        lit.normalMap = maps.normalMap;
        lit.roughnessMap = maps.roughnessMap;
        lit.aoMap = maps.aoMap;
        lit.normalScale.set(look.normal, -look.normal);
        lit.roughness = look.roughness;
        lit.metalness = look.metalness ?? 0;
        lit.aoMapIntensity = look.ao ? 1 : 0;
        lit.needsUpdate = true;
        flat.map = raw?.[MAP_KEYS[show]] ?? null;
        flat.needsUpdate = true;
        invalidate();
    }, [maps, raw, lit, flat, size, look, show, gl, invalidate]);

    if (!maps) return null;
    return <mesh geometry={geometry} material={show === 'all' ? lit : flat} position={position} rotation={rotation ?? [0, 0, 0]} castShadow receiveShadow />;
}

export default function MaterialLab() {
    const [language, setLanguage] = useState('ru');
    const t = TEXT[language];
    const [library, setLibrary] = useState(null);
    const [selected, setSelected] = useState(null);
    const [look, setLook] = useState(DEFAULT_LOOK);
    const [name, setName] = useState('');
    const [view, setView] = useState('sphere');
    const [show, setShow] = useState('all');
    const [saved, setSaved] = useState(false);
    const [hidden, setHidden] = useState(document.hidden);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    useEffect(() => {
        const onVisibility = () => setHidden(document.hidden);
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    const reload = (keep) => listMaterials().then((entries) => {
        setLibrary(entries);
        setSelected((current) => {
            const wanted = keep ?? current;
            return entries.some((item) => item.id === wanted) ? wanted : entries[0]?.id ?? null;
        });
    }, () => setLibrary(false));
    // Один раз при входе; ?material=<id> — сразу этот материал.
    useEffect(() => { void reload(new URLSearchParams(window.location.search).get('material')); }, []);

    const entry = library ? library.find((item) => item.id === selected) ?? null : null;
    useEffect(() => {
        setLook((current) => ({ ...current, ...lookOf(entry) }));
        setName(entry?.name ?? '');
        setSaved(false);
    }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- новые умолчания только при смене материала
    const maps = useLibraryMaps(entry?.id ?? null);
    const set = (key, value) => { setLook((current) => ({ ...current, [key]: value })); setSaved(false); };
    const range = (key, label, [min, max, step], unit = '') => <LabRange label={label} value={look[key]} min={min} max={max} step={step} unit={unit} onChange={(value) => set(key, value)} />;
    const mapsOnly = entry?.tile === null;

    const save = async () => {
        const next = await updateMaterial(entry.id, { name, normal: look.normal, roughness: look.roughness, rotation: look.rotation, metalness: look.metalness,
            ...(mapsOnly ? {} : { tile: look.tile, tileY: look.tileY }) });
        setLibrary((current) => current.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
        setSaved(true);
    };
    const remove = async () => {
        if (!window.confirm(t.confirm(entry.name))) return;
        await removeMaterial(entry.id).catch(() => {});
        await reload();
    };

    return (
        <LabShell
            collection="materials"
            testId="material-lab"
            eyebrow={`DDG / ASSET LAB / ${assetIndex('materials')}`}
            title={t.title}
            subtitle={t.subtitle}
            language={language}
            onLanguage={setLanguage}
            views={Object.keys(SHAPES).map((id) => ({ id, label: t[id] }))}
            view={view}
            onView={setView}
            scale={entry ? `${look.tile.toFixed(2)} × ${(look.tileY ?? look.tile).toFixed(2)} ${t.metres}` : null}
            panel={<>
                <LabGroup title={t.library}>
                    <LabText label={language === 'ru' ? 'Поиск' : 'Search'} value={query} onChange={setQuery} />
                    <LabSelect label={language === 'ru' ? 'Категория' : 'Category'} value={category} onChange={setCategory}
                        options={[{ value: 'all', label: t.all }, ...MATERIAL_CATEGORIES.map(([value, ru, en]) => ({ value, label: language === 'ru' ? ru : en }))]} />
                    {library === false ? <p className="lab__note">{t.offline}</p> : null}
                    {library && !library.length ? <p className="lab__note">{t.empty}</p> : null}
                    {library?.length ? <LabSwatches label={t.library} value={selected} onChange={setSelected}
                        items={library.filter((item) => (category === 'all' || categoryOf(item) === category) && item.name.toLowerCase().includes(query.toLowerCase())).map((item) => ({ id: item.id, label: item.name, image: `${libraryFile(item.id, 'preview.webp')}?v=${item.version ?? 0}` }))} /> : null}
                </LabGroup>
                {entry ? <LabGroup title={t.material}>
                    <LabText label={t.name} value={name} onChange={(value) => { setName(value); setSaved(false); }} />
                    {range('tile', language === 'ru' ? 'Ширина образца' : 'Sample width', MATERIAL_RANGES.tile, t.metres)}
                    {range('tileY', language === 'ru' ? 'Высота образца' : 'Sample height', MATERIAL_RANGES.tileY, t.metres)}
                    {range('rotation', language === 'ru' ? 'Поворот' : 'Rotation', MATERIAL_RANGES.rotation, '°')}
                    {range('normal', t.relief, MATERIAL_RANGES.normal)}
                    {range('roughness', t.matte, MATERIAL_RANGES.roughness)}
                    {range('metalness', language === 'ru' ? 'Металличность' : 'Metalness', MATERIAL_RANGES.metalness)}
                    <LabToggle label={t.shade} value={look.ao} onChange={(value) => set('ao', value)} />
                    <LabModes label={t.show} value={show} onChange={setShow} items={['all', 'color', 'normal', 'roughness', 'ao', 'height'].map((id) => ({ id, label: t[id] }))} />
                    <p className="lab__note">{mapsOnly ? t.mapsOnly : t.note}</p>
                </LabGroup> : null}
                <LabGroup title={t.light}>
                    {range('exposure', t.exposure, [0.2, 2.4, 0.01])}
                    {range('environmentIntensity', t.environment, [0, 2, 0.01])}
                </LabGroup>
                {entry ? <LabFacts rows={[
                    [t.pixels, entry.size ? entry.size.join(' × ') : '—'],
                    [t.madeBy, entry.mode === 'maps' ? t.mapsMode : t.ai],
                    [t.seam, entry.seamRatio ?? '—'],
                    [t.created, entry.created ? new Date(entry.created).toLocaleDateString(language === 'en' ? 'en-GB' : 'ru-RU') : '—'],
                ]} /> : null}
            </>}
            transport={entry ? <>
                <button type="button" onClick={() => void save()} data-testid="material-lab-save">{saved ? t.saved : t.save}</button>
                <button type="button" onClick={() => { setLook((current) => ({ ...current, ...lookOf(entry) })); setName(entry.name); setSaved(false); }}>{t.revert}</button>
                <button type="button" onClick={() => void remove()}>{t.remove}</button>
            </> : null}
            stats={library ? <span><b>{library.length}</b> {t.materials}</span> : null}
        >
            <AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} floorY={0} cameraFar={60} fogRange={[20, 40]} shadowRadius={3}
                exposure={look.exposure} environmentIntensity={look.environmentIntensity} paused={hidden}>
                <Specimen shape={view} maps={maps} look={look} show={show} />
            </AssetStudio>
        </LabShell>
    );
}
