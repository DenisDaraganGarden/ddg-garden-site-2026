import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { EDITOR_THUMBNAIL_READY, requestEditorThumbnail } from '../components/effects/editorThumbnailCapture';
import { sketchupModelEntry } from '../placed/sketchupModel.js';
import { MATERIAL_RANGES } from './settings.js';
import { libraryFile, textureDataUrl, uvScale } from './modelMaterials.js';
import { glassDefaults, looksLikeGlass } from './glass.js';
import { categoryOf, MAP_FILES, MATERIAL_CATEGORIES, materialSize, normalizeRecipe, recipeFor } from './recipe.js';
import { buildProceduralMaterial, finishMaterial, generateMaterial, listImageModels, listMaterials, mapsFromTexture, readKeyStatus, updateMaterial } from './api.js';
import ReferencePicker from '../references/ReferencePicker.jsx';
import MaterialQuickLook from './MaterialQuickLook.jsx';
import { SURFACES, normalizeSurface, surfacePreset, surfaceSize } from './procedural.js';
import './materials.css';

const MaterialPreview = lazy(() => import('./MaterialPreview.jsx'));
const ProceduralPreview = lazy(() => import('./ProceduralPreview.jsx'));
const CONTEXT_KEY = 'material:context';
const PREFS = 'ddg_material_generator_v1';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } };
const imagesOf = (list) => [...(list ?? [])].filter((item) => item.type?.startsWith('image/'));
const asDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});
async function imageFile(file, limit = 2048) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/png');
}
function Field({ label, children }) { return <label className="material-panel__field"><span>{label}</span>{children}</label>; }
function NumberInput({ value, onChange, min = 0, max = 50, step = 0.01, label }) {
    const format = (number) => String(Number.isFinite(number) ? Number(number.toFixed(3)) : min);
    const [text, setText] = useState(() => format(value));
    const editing = useRef(false);
    useEffect(() => { if (!editing.current) setText(String(Number.isFinite(value) ? Number(value.toFixed(3)) : min)); }, [value, min]);
    return <input aria-label={label} type="number" min={min} max={max} step={step} value={text}
        onFocus={() => { editing.current = true; }}
        onChange={(event) => {
            setText(event.target.value);
            if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
        }} onBlur={() => {
            editing.current = false;
            const next = Math.min(max, Math.max(min, text !== '' && Number.isFinite(Number(text)) ? Number(text) : value));
            setText(format(next)); onChange(next);
        }} />;
}
function Knob({ label, value, onChange, range, unit = '' }) {
    const { language } = useLanguage();
    return <label className="material-panel__knob"><span>{label}{unit ? `, ${unit}` : ''}</span>
        <input aria-label={label} type="range" min={range[0]} max={range[1]} step={range[2]} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <NumberInput label={`${label}: ${language === 'ru' ? 'значение' : 'value'}`} value={value} onChange={onChange} min={range[0]} max={range[1]} step={range[2]} />
    </label>;
}

export default function MaterialPanel({ target, settings, applySettings, onClose }) {
    const { language } = useLanguage();
    const tr = (ru, en) => language === 'ru' ? ru : en;
    const { placedId, materialName, material } = target;
    const override = settings.modelMaterials?.[placedId]?.[materialName] ?? null;
    const prefs = useMemo(readPrefs, []);
    const { root, meshes } = useMemo(() => {
        const root = sketchupModelEntry(placedId)?.root ?? null;
        const meshes = [];
        root?.traverse((object) => { if (object.isMesh && [object.material].flat().includes(material)) meshes.push(object); });
        return { root, meshes };
    }, [placedId, material]);
    const scale = useMemo(() => root && material ? material.userData.scale ?? uvScale(meshes, root) : [1, 1], [root, meshes, material]);
    const original = useMemo(() => material ? textureDataUrl(material, 4096, true) : null, [material]);
    const current = override?.material ? libraryFile(override.material, 'albedo.webp') : original;
    const glassAuto = useMemo(() => Boolean(material && looksLikeGlass(material, meshes, root)), [material, meshes, root]);
    const glass = { ...glassDefaults(material), on: glassAuto, ...(override?.glass ?? {}) };
    const [tab, setTab] = useState('create');
    const [pinterest, setPinterest] = useState(false), [quickLook, setQuickLook] = useState(false);
    const [surface, setSurface] = useState(() => surfacePreset('pebble'));
    const [proceduralParallax, setProceduralParallax] = useState(true);
    const [previewLook, setPreviewLook] = useState({ parallax: 0, parallaxDepth: 5 });
    const [references, setReferences] = useState([]);
    const [source, setSource] = useState('current');
    const [context, setContext] = useState({ on: false, image: null });
    const [description, setDescription] = useState('');
    const [name, setName] = useState(materialName);
    const [category, setCategory] = useState(() => categoryOf({ name: materialName }));
    const [recipe, setRecipe] = useState(() => recipeFor(categoryOf({ name: materialName })));
    const [uploads, setUploads] = useState({});
    const [key, setKey] = useState(null);
    const [models, setModels] = useState([]);
    const [model, setModel] = useState(prefs.model ?? 'gpt-image-2.5-sunburst');
    const [quality, setQuality] = useState(prefs.quality ?? 'high');
    const [size, setSize] = useState(prefs.size ?? 1024);
    const [count, setCount] = useState(prefs.count ?? 1);
    const [dimensions, setDimensions] = useState(() => materialSize(override, scale));
    const [keepLayout, setKeepLayout] = useState(true);
    const [status, setStatus] = useState(null);
    const [draft, setDraft] = useState(null);
    const [picked, setPicked] = useState(0);
    const [seam, setSeam] = useState('none');
    const [library, setLibrary] = useState([]);
    const [libraryError, setLibraryError] = useState('');
    const [selected, setSelected] = useState(override?.material ?? null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [favorites, setFavorites] = useState(false);
    const [preview, setPreview] = useState('render');
    const [repeat, setRepeat] = useState(true);
    const [overlay, setOverlay] = useState(0.55);
    const [previewError, setPreviewError] = useState(false);
    const [now, setNow] = useState(Date.now());
    const fileInput = useRef(null);
    const initialLook = useRef(false), proceduralStarted = useRef(false);
    const busyRef = useRef(false);
    const busy = Boolean(status?.busy);
    const entry = library.find((item) => item.id === selected) ?? null;
    const entryOnModel = Boolean(entry && entry.id === override?.material);
    const previewEntry = useMemo(() => entryOnModel ? { ...entry, ...override, id: entry.id } : entry ? { ...entry, ...previewLook } : null, [entry, entryOnModel, override, previewLook]);
    const applied = library.find((item) => item.id === override?.material);
    useEffect(() => {
        if (initialLook.current || !applied) return;
        initialLook.current = true;
        setName(applied.name); setCategory(categoryOf(applied));
        setRecipe(normalizeRecipe(applied.recipe, categoryOf(applied)));
        if (applied.surface) setSurface(normalizeSurface(applied.surface));
    }, [applied]);
    const sourceEntry = source === 'selection' ? entry : source === 'current' ? applied : null;
    const sourceUrl = tab === 'procedural' && sourceEntry?.surfaceSource ? libraryFile(sourceEntry.id, 'surface-source.webp')
        : source === 'reference' ? references[0]?.image : source === 'sketchup' ? original : source === 'selection' ? entry && libraryFile(entry.id, 'albedo.webp') : current;
    const validSize = dimensions.every((value) => Number.isFinite(value) && value >= 0.05 && value <= 50);
    const canAi = !busy && key?.hasKey && validSize;
    const fileMaps = Object.fromEntries(Object.entries(uploads).map(([key, item]) => [key, item.image]));
    const visible = library.filter((item) => (filter === 'all' || categoryOf(item) === filter) && (!favorites || item.favorite)
        && `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));

    useEffect(() => {
        try { localStorage.setItem(PREFS, JSON.stringify({ model, quality, size, count })); } catch { /* preference only */ }
    }, [model, quality, size, count]);
    useEffect(() => {
        if (!busy) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [busy]);
    const reloadLibrary = useCallback(async () => {
        try { const items = await listMaterials(); setLibrary(items); setLibraryError(''); }
        catch (error) { setLibraryError(error.message); }
    }, []);
    useEffect(() => { if (tab === 'library') void reloadLibrary(); }, [tab, reloadLibrary]);
    useEffect(() => {
        void reloadLibrary();
        readKeyStatus().then((value) => {
            setKey(value);
            if (value.hasKey) listImageModels().then((list) => {
                const supported = list.filter((id) => /^gpt-image/.test(id));
                setModels(supported);
                setModel((current) => supported.length && !supported.includes(current) ? supported.find((id) => /sunburst/.test(id)) ?? supported[0] : current);
            }, () => {});
        }, () => setKey({ hasKey: false }));
    }, [reloadLibrary]);
    const capture = useCallback(() => requestEditorThumbnail(CONTEXT_KEY, { width: 1280, quality: 0.86 }), []);
    useEffect(() => {
        const take = (event) => { if (event.detail?.key === CONTEXT_KEY) setContext((value) => ({ ...value, image: event.detail.image })); };
        window.addEventListener(EDITOR_THUMBNAIL_READY, take);
        return () => window.removeEventListener(EDITOR_THUMBNAIL_READY, take);
    }, []);
    const addFiles = useCallback(async (files) => {
        if (busyRef.current) return;
        try {
            const added = await Promise.all(imagesOf(files).slice(0, 12).map(async (file) => ({ id: crypto.randomUUID(), name: file.name, image: await imageFile(file) })));
            if (!added.length) return;
            setReferences((list) => [...list, ...added].slice(0, 12));
            setSource('reference');
        } catch (error) { setStatus({ error: true, text: error.message }); }
    }, []);
    useEffect(() => {
        const paste = (event) => {
            const files = imagesOf(event.clipboardData?.files);
            if (!files.length) return;
            event.preventDefault();
            void addFiles(files);
        };
        window.addEventListener('paste', paste);
        return () => window.removeEventListener('paste', paste);
    }, [addFiles]);
    const setOverride = (next) => {
        const all = { ...(settings.modelMaterials ?? {}) };
        const materials = { ...(all[placedId] ?? {}) };
        if (next) materials[materialName] = next; else delete materials[materialName];
        if (Object.keys(materials).length) all[placedId] = materials; else delete all[placedId];
        applySettings({ modelMaterials: all });
    };
    const apply = () => {
        if (!entry) return;
        setOverride({ ...(override ?? {}), material: entry.id, tile: entry.tile ?? null, tileY: entry.tileY ?? entry.tile ?? null,
            rotation: entry.rotation ?? 0, normal: entry.normal ?? 1, roughness: entry.roughness ?? 1, ao: entry.ao ?? 1, metalness: entry.metalness ?? 0,
            parallax: previewEntry.parallax ?? 0, parallaxDepth: previewEntry.parallaxDepth ?? entry.recipe?.depth ?? 5 });
        setStatus({ text: tr('Материал применён. Настройки раскладки — ниже.', 'Material applied. Layout controls are below.') });
    };
    const unapply = () => {
        const rest = { ...(override?.glass ? { glass: override.glass } : {}), ...(override?.faces ? { faces: override.faces } : {}) };
        setOverride(Object.keys(rest).length ? rest : null);
    };
    const setGlass = (patch) => setOverride({ ...(override ?? {}), glass: { ...glass, ...patch } });
    const run = async (text, job) => {
        if (busyRef.current) return;
        busyRef.current = true;
        const started = Date.now(); setNow(started); setStatus({ busy: true, text, started });
        try { setStatus({ text: await job() }); }
        catch (error) { setStatus({ text: error.message, error: true }); }
        finally { busyRef.current = false; }
    };
    const sourceData = async () => {
        if (!sourceUrl) return null;
        if (sourceUrl.startsWith('data:')) return sourceUrl;
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(tr('Не удалось прочитать цветовую карту.', 'Cannot read the colour map.'));
        return asDataUrl(await response.blob());
    };
    const savedEntry = (result) => {
        setLibrary((list) => [result, ...list.filter((item) => item.id !== result.id)]);
        setSelected(result.id); setPreview('render'); setPreviewError(false);
        setPreviewLook({ parallax: result.parallax ?? 0, parallaxDepth: result.parallaxDepth ?? result.recipe?.depth ?? 5 });
    };
    const generate = (mode) => run(tr('Генерация вариантов', 'Generating variants'), async () => {
        const result = await generateMaterial({ mode, model, quality, size, n: count, tile: dimensions[0], tileY: dimensions[1], category, description,
            references: references.filter((_, index) => !(mode === 'improve' && source === 'reference' && index === 0)).map((item) => item.image), context: context.on ? context.image : null,
            base: mode === 'improve' ? await sourceData() : null });
        setDraft(result); setPicked(0); setSelected(null);
        return tr('Выберите вариант и подготовьте карты. Затем можно проверить результат и применить его.', 'Pick a variant and prepare its maps, then review and apply it.');
    });
    const finish = () => run(tr('Подготовка материала', 'Preparing material'), async () => {
        const result = await finishMaterial({ draft: draft.draft, variant: picked, name, seam, category, recipe, maps: fileMaps });
        savedEntry(result);
        return tr('Готовый материал сохранён в библиотеку. Проверьте карты и примените его.', 'Finished material saved to the library. Review the maps, then apply.');
    });
    const buildMaps = () => run(tr('Подготовка карт', 'Preparing maps'), async () => {
        const preserve = keepLayout && (source === 'sketchup' || (source === 'current' && (!override || override.tile === null)));
        const result = await mapsFromTexture({ ...(sourceEntry ? { material: sourceEntry.id, reuseMaps: true } : { image: await sourceData() }),
            name, category, recipe, maps: fileMaps, model, quality, size, description,
            tile: preserve ? null : dimensions[0], tileY: dimensions[1], sourceSize: scale });
        savedEntry(result); setSource('selection');
        return tr('Карты готовы. Цвет сохранён без изменений; материал пока не назначен модели.', 'Maps ready. Colour preserved exactly; the material has not been applied yet.');
    });
    const selectEntry = (item) => {
        setSelected(item.id); setName(item.name); setCategory(categoryOf(item));
        setRecipe(normalizeRecipe(item.recipe, categoryOf(item))); setDimensions(materialSize(item, scale));
        setUploads({}); setPreviewError(false);
        setPreviewLook({ parallax: item.parallax ?? 0, parallaxDepth: item.parallaxDepth ?? item.recipe?.depth ?? 5 });
        if (item.surface) setSurface(normalizeSurface(item.surface));
    };
    const patchEntry = (patch) => run(tr('Сохранение', 'Saving'), async () => {
        const result = await updateMaterial(entry.id, patch);
        setLibrary((list) => list.map((item) => item.id === result.id ? { ...item, ...result } : item));
        return tr('Сохранено в библиотеку.', 'Saved to the library.');
    });
    const changeCategory = (value) => { setCategory(value); setRecipe(recipeFor(value)); };
    const setRecipeValue = (key, value) => setRecipe((current) => ({ ...current, [key]: value }));
    const onPreviewError = useCallback(() => setPreviewError(true), []);
    const onProceduralError = useCallback((text) => setStatus({ error: true, text: typeof text === 'string' ? text : 'Не удалось построить образец' }), []);
    const setSurfaceValue = (key, value) => setSurface((current) => ({ ...current, [key]: value }));
    const buildSurface = () => run(tr('Подготовка материала', 'Preparing material'), async () => {
        const result = await buildProceduralMaterial({ surface, name, parallax: Number(proceduralParallax), tile: dimensions[0], tileY: dimensions[1], size,
            image: surface.kind === 'tiles' ? await sourceData() : undefined });
        savedEntry(result); setPreviewLook({ parallax: Number(proceduralParallax), parallaxDepth: surface.relief }); setTab('library');
        return tr('Материал готов. Проверьте и примените.', 'Material ready. Review and apply.');
    });
    const openTab = (id) => {
        if (id === 'procedural' && !proceduralStarted.current) {
            proceduralStarted.current = true;
            if (!entry?.surface) { setSurface(surfacePreset('pebble')); setName(tr('Галька', 'Pebbles')); setDimensions([0.6, 0.6]); }
        }
        setTab(id);
    };
    const previewSetting = (key, value) => entryOnModel ? setOverride({ ...override, [key]: value }) : setPreviewLook((current) => ({ ...current, [key]: value }));
    const uploadMap = async (map, file) => {
        if (!file) return;
        try {
            const image = await imageFile(file, 4096);
            setUploads((items) => ({ ...items, [map]: { name: file.name, image } }));
            if (map === 'height') setRecipeValue('heightMode', 'file');
        } catch (error) { setStatus({ error: true, text: error.message }); }
    };
    const categorySelect = (value, change) => <select aria-label={tr('Категория', 'Category')} value={value} onChange={(event) => change(event.target.value)}>
        {MATERIAL_CATEGORIES.map(([id, ru, en]) => <option key={id} value={id}>{tr(ru, en)}</option>)}
    </select>;
    const dimensionsControl = <div className="material-panel__dimensions">
        <Field label={tr('Ширина образца, м', 'Sample width, m')}><NumberInput label={tr('Ширина образца', 'Sample width')} value={dimensions[0]} min={0.05} onChange={(value) => setDimensions(([, h]) => [value, h])} /></Field>
        <span>×</span>
        <Field label={tr('Высота образца, м', 'Sample height, m')}><NumberInput label={tr('Высота образца', 'Sample height')} value={dimensions[1]} min={0.05} onChange={(value) => setDimensions(([w]) => [w, value])} /></Field>
        <button type="button" title={tr('Поменять стороны', 'Swap sides')} onClick={() => setDimensions(([w, h]) => [h, w])}>⇄</button>
    </div>;
    const sourceControl = <div className="material-panel__source">
        <div className="material-panel__source-image">{sourceUrl ? <img src={sourceUrl} alt={tr('Исходный образец', 'Source sample')} /> : <span>{tr('Нет изображения', 'No image')}</span>}</div>
        <div><Field label={tr('Источник цвета', 'Colour source')}><select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="current">{tr('Материал на модели', 'Material on model')}</option>
            <option value="sketchup" disabled={!original}>{tr('Исходный SketchUp', 'Original SketchUp')}</option>
            <option value="reference" disabled={!references.length}>{tr('Загруженный образец', 'Uploaded sample')}</option>
            <option value="selection" disabled={!entry}>{tr('Выбранный из библиотеки', 'Selected from library')}</option>
        </select></Field><div className="material-panel__row"><button type="button" onClick={() => fileInput.current?.click()}>{tr('Файл', 'File')}</button><button type="button" onClick={() => setPinterest(true)}>Pinterest</button></div></div>
    </div>;
    const selectedMap = MAP_FILES.find(([id]) => id === preview) ?? MAP_FILES[0];
    const previewUrl = entry ? libraryFile(entry.id, selectedMap[3]) : null;
    const [sampleW, sampleH] = materialSize(preview === 'render' ? previewEntry : entry, scale);
    const previewAspect = Math.max(0.25, Math.min(4, sampleW / sampleH));
    const recipeKnob = (key, ru, en, range, unit) => <Knob label={tr(ru, en)} value={recipe[key]} range={range} unit={unit} onChange={(value) => setRecipeValue(key, value)} />;
    const appliedKnob = (key, ru, en, fallback = 1) => <Knob label={tr(ru, en)} value={override[key] ?? fallback} range={MATERIAL_RANGES[key]} onChange={(value) => setOverride({ ...override, [key]: value })} />;
    const surfaceKnob = (key, ru, en, range, unit = '') => <Knob label={tr(ru, en)} value={surface[key]} range={range} unit={unit} onChange={(value) => setSurfaceValue(key, value)} />;
    const proceduralSides = surfaceSize(surface, dimensions);
    const proceduralVisual = <div className="material-panel__render"><Suspense fallback={null}><ProceduralPreview surface={surface} extent={dimensions} sourceUrl={surface.kind === 'tiles' ? sourceUrl : null} parallax={proceduralParallax} resolution={quickLook ? 1024 : 512} onError={onProceduralError} /></Suspense></div>;
    const mapTabs = <div className="material-panel__map-tabs"><button type="button" aria-pressed={preview === 'render'} onClick={() => setPreview('render')}>3D</button>{MAP_FILES.map(([id, ru, en]) => <button type="button" key={id} aria-pressed={preview === id} onClick={() => setPreview(id)}>{tr(ru, en)}</button>)}<button type="button" aria-pressed={preview === 'compare'} onClick={() => setPreview('compare')}>{tr('Совмещение', 'Alignment')}</button></div>;
    const previewVisual = entry && (preview === 'render' && !previewError ? <div className="material-panel__render"><Suspense fallback={null}><MaterialPreview entry={previewEntry} onError={onPreviewError} /></Suspense></div>
        : <div className="material-panel__map-image">{preview === 'compare' ? <div style={{ aspectRatio: previewAspect, backgroundImage: `url(${libraryFile(entry.id, 'albedo.webp')})`, backgroundSize: repeat ? '50% 50%' : '100% 100%' }}><div className="material-panel__overlay" style={{ backgroundImage: `url(${libraryFile(entry.id, 'height.png')})`, backgroundSize: repeat ? '50% 50%' : '100% 100%', opacity: overlay }} /></div> : repeat ? <div style={{ aspectRatio: previewAspect, backgroundImage: `url(${previewUrl})`, backgroundSize: '50% 50%' }} /> : <img src={previewUrl} style={{ aspectRatio: previewAspect }} alt={tr(selectedMap[1], selectedMap[2])} />}</div>);

    return <section className="material-panel" aria-label={tr('Материалы', 'Materials')} data-testid="material-panel" data-space-preview
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}
        onKeyDown={(event) => {
            event.stopPropagation();
            if (event.code === 'Space' && !event.repeat && !pinterest && !event.target.closest('input,textarea,select,[contenteditable=true]') && (entry || tab === 'procedural')) { event.preventDefault(); setQuickLook((value) => !value); }
        }}>
        <header><div><h2>{tr('Материалы', 'Materials')}</h2><span className="material-panel__target">{materialName}</span></div>
            <button type="button" className="material-panel__close" onClick={onClose} aria-label={tr('Закрыть', 'Close')}>×</button></header>
        <nav className="material-panel__tabs" aria-label={tr('Разделы материала', 'Material sections')}>
            {[['create', 'Создать', 'Create'], ['procedural', 'Процедурные', 'Procedural'], ['maps', 'Карты', 'Maps'], ['library', 'Библиотека', 'Library']].map(([id, ru, en]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => openTab(id)}>{tr(ru, en)}{id === 'library' ? <span>{library.length}</span> : null}</button>)}
        </nav>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }} />
        <div className="material-panel__body">
            <details className="material-panel__glass" open={glass.on || undefined}><summary>{tr('Стекло', 'Glass')}</summary>
                <label className="material-panel__check"><input type="checkbox" checked={glass.on} onChange={(event) => setGlass({ on: event.target.checked })} data-testid="material-glass" />{tr('Это стекло', 'This is glass')}</label>
                {glass.on ? <>{[['clarity', 'Прозрачность', 'Clarity'], ['frost', 'Матовость', 'Frost'], ['reflect', 'Отражение', 'Reflection']].map(([id, ru, en]) => <Knob key={id} label={tr(ru, en)} value={glass[id]} range={MATERIAL_RANGES[id]} onChange={(value) => setGlass({ [id]: value })} />)}
                    <Field label={tr('Оттенок', 'Tint')}><input type="color" value={glass.tint ?? '#888888'} onChange={(event) => setGlass({ tint: event.target.value })} /></Field></> : null}
            </details>
            {!glass.on ? <>
                <fieldset disabled={busy} className="material-panel__work">
                    {tab === 'create' ? <>
                        <div className="material-panel__refs"><div className="material-panel__section-label">{tr('Аналоги', 'References')}<button type="button" onClick={() => setPinterest(true)}>Pinterest</button><span>⌘V · {tr('перетащить', 'drop')}</span></div>
                            <div className="material-panel__thumbs">{references.map((item, index) => <div className={`material-panel__thumb${index === 0 ? ' is-source' : ''}`} key={item.id}>
                                <button type="button" onClick={() => { setReferences((list) => [item, ...list.filter((other) => other.id !== item.id)]); setSource('reference'); }} title={tr('Использовать как образец', 'Use as sample')}><img src={item.image} alt={item.name} /></button>
                                <button type="button" className="material-panel__remove" onClick={() => setReferences((list) => list.filter((other) => other.id !== item.id))} aria-label={tr('Убрать аналог', 'Remove reference')}>×</button>
                            </div>)}<button type="button" className="material-panel__add" onClick={() => fileInput.current?.click()} aria-label={tr('Добавить аналог', 'Add reference')}>＋</button></div>
                        </div>
                        <Field label={tr('Материал и рисунок', 'Material and pattern')}><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder={tr('Например: светлый травертин, плитка 120 × 60 см, горизонтально, шов 3 мм', 'E.g. pale travertine, 120 × 60 cm tiles, horizontal, 3 mm joints')} /></Field>
                        <div className="material-panel__two"><Field label={tr('Название', 'Name')}><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={tr('Тип поверхности', 'Surface type')}>{categorySelect(category, changeCategory)}</Field></div>
                        {dimensionsControl}
                        <small>{tr('Размер всего изображения. Размер отдельной плитки или доски укажите в описании.', 'Size of the whole image. Describe individual tile or board dimensions above.')}</small>
                        {sourceControl}
                        <div className="material-panel__row"><button type="button" className="material-panel__primary" disabled={!canAi || (!description.trim() && !references.length)} onClick={() => void generate('create')} data-testid="material-create">{tr('Создать по аналогам · ИИ', 'Create from references · AI')}</button>
                            <button type="button" disabled={!canAi || !sourceUrl} onClick={() => void generate('improve')} data-testid="material-improve">{tr('Доработать образец · ИИ', 'Refine sample · AI')}</button></div>
                        <button type="button" className="material-panel__text-button" onClick={() => setTab('maps')}>{tr('Использовать изображение как есть →', 'Use the image as is →')}</button>
                        <details className="material-panel__advanced"><summary>{tr('Параметры генерации', 'Generation settings')}</summary><div className="material-panel__three">
                            <Field label={tr('Качество', 'Quality')}><select value={quality} onChange={(event) => setQuality(event.target.value)}>{['auto', 'low', 'medium', 'high', ...(/^gpt-image-2\.5/.test(model) ? ['xhigh', 'max'] : [])].map((id) => <option key={id}>{id}</option>)}</select></Field>
                            <Field label={tr('Разрешение', 'Resolution')}><select value={size} onChange={(event) => setSize(Number(event.target.value))}>{[1024, 1536, 2048].map((id) => <option key={id} value={id}>{id}</option>)}</select></Field>
                            <Field label={tr('Вариантов', 'Variants')}><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map((id) => <option key={id}>{id}</option>)}</select></Field>
                        </div><Field label={tr('Модель', 'Model')}><select value={model} onChange={(event) => setModel(event.target.value)}>{[...new Set([model, ...models])].map((id) => <option key={id}>{id}</option>)}</select></Field>
                            <label className="material-panel__check"><input type="checkbox" checked={context.on} onChange={(event) => { setContext((value) => ({ ...value, on: event.target.checked })); if (event.target.checked) capture(); }} />{tr('Учесть кадр сцены', 'Include scene context')}</label>
                            {context.on ? <button type="button" onClick={capture}>{context.image ? tr('Обновить кадр', 'Refresh frame') : tr('Снять кадр', 'Capture frame')}</button> : null}
                        </details>
                        {draft ? <div className="material-panel__draft"><div className="material-panel__section-label">{tr('Варианты', 'Variants')}</div><div className="material-panel__variants">{draft.previews.map((url, index) => <button type="button" key={url} aria-label={`${tr('Вариант', 'Variant')} ${index + 1}`} aria-pressed={index === picked} onClick={() => { setPicked(index); setSelected(null); }}><img src={url} alt="" /><span>{index + 1}</span></button>)}</div>
                            <Field label={tr('Обработка шва', 'Seam treatment')}><select value={seam} onChange={(event) => setSeam(event.target.value)}><option value="none">{tr('Сохранить рисунок', 'Preserve pattern')}</option><option value="ai">{tr('Исправить шов · ИИ', 'Repair seam · AI')}</option><option value="blend">{tr('Смешать края · возможны двоения', 'Blend edges · may ghost')}</option></select></Field>
                            <button type="button" className="material-panel__primary" disabled={busy || (seam === 'ai' && !canAi) || (recipe.heightMode === 'ai' && !canAi)} onClick={() => void finish()} data-testid="material-prepare">{tr('Подготовить материал', 'Prepare material')}</button>
                        </div> : null}
                    </> : null}
                    {tab === 'procedural' ? <>
                        <div className="material-panel__two"><Field label={tr('Поверхность', 'Surface')}><select value={surface.kind} onChange={(event) => {
                            const kind = event.target.value; setSurface(surfacePreset(kind)); setName(tr(...SURFACES.find(([id]) => id === kind).slice(1)));
                            const side = kind === 'carpet' ? 0.2 : kind === 'gravel' ? 0.5 : kind === 'standing-seam' ? 2 : 1; setDimensions([side, side]);
                        }}>{SURFACES.map(([id, ru, en]) => <option key={id} value={id}>{tr(ru, en)}</option>)}</select></Field><Field label={tr('Название', 'Name')}><input value={name} onChange={(event) => setName(event.target.value)} /></Field></div>
                        {!quickLook ? proceduralVisual : null}
                        <div className="material-panel__preview-actions"><span>{proceduralSides.map((v) => v.toFixed(2)).join(' × ')} {tr('м', 'm')}</span><label className="material-panel__check"><input type="checkbox" checked={proceduralParallax} onChange={(event) => setProceduralParallax(event.target.checked)} />{tr('Параллакс', 'Parallax')}</label><button type="button" onClick={() => setQuickLook(true)}>{tr('Просмотр · пробел', 'View · Space')}</button></div>
                        {surface.kind === 'standing-seam' ? <>
                            {surfaceKnob('spacing', 'Шаг фальца', 'Seam spacing', [100, 1500, 10], tr('мм', 'mm'))}
                            {surfaceKnob('seamWidth', 'Ширина фальца', 'Seam width', [3, 40, 1], tr('мм', 'mm'))}
                        </> : surface.kind === 'tiles' ? <>
                            {sourceControl}
                            {surfaceKnob('tileWidth', 'Ширина плитки', 'Tile width', [30, 3000, 10], tr('мм', 'mm'))}
                            {surfaceKnob('tileHeight', 'Длина плитки', 'Tile length', [30, 3000, 10], tr('мм', 'mm'))}
                            {surfaceKnob('gap', 'Шов', 'Joint', [0.1, 40, 0.1], tr('мм', 'mm'))}
                            {surfaceKnob('bond', 'Смещение рядов', 'Row offset', [0, 0.5, 0.5])}
                        </> : <>
                            {surfaceKnob('stoneSize', 'Размер камня', 'Stone size', [2, 160, 1], tr('мм', 'mm'))}
                            {surfaceKnob('variation', 'Разброс размеров', 'Size variation', [0, 0.8, 0.02])}
                            {surfaceKnob('roundness', 'Округлость', 'Roundness', [0, 1, 0.02])}
                            {surfaceKnob('gap', 'Зазор', 'Gap', [0.1, 12, 0.1], tr('мм', 'mm'))}
                        </>}
                        {surfaceKnob('relief', surface.kind === 'standing-seam' ? 'Высота фальца' : 'Глубина рельефа', surface.kind === 'standing-seam' ? 'Seam height' : 'Relief depth', [0, 60, 0.1], tr('мм', 'mm'))}
                        {surfaceKnob('roughness', 'Матовость', 'Roughness', [0.05, 1, 0.01])}
                        <div className="material-panel__colours">{(surface.kind === 'standing-seam' ? [['tint', 'Цвет металла', 'Metal colour']] : surface.kind === 'tiles' ? [['bed', 'Цвет шва', 'Joint colour']] : [['tint', 'Основной', 'Base'], ['tint2', 'Второй тон', 'Second tone'], ['bed', 'Заполнитель', 'Binder']]).map(([id, ru, en]) => <Field key={id} label={tr(ru, en)}><input aria-label={tr(ru, en)} type="color" value={surface[id]} onChange={(event) => setSurfaceValue(id, event.target.value)} /></Field>)}</div>
                        {!['standing-seam', 'tiles'].includes(surface.kind) ? surfaceKnob('tintVariation', 'Разброс оттенков', 'Tone variation', [0, 1, 0.02]) : null}
                        <details className="material-panel__advanced"><summary>{tr('Образец', 'Sample')}</summary>{dimensionsControl}{surfaceKnob('seed', 'Рисунок', 'Seed', [1, 99999, 1])}<Field label={tr('Разрешение', 'Resolution')}><select value={size} onChange={(event) => setSize(Number(event.target.value))}>{[1024, 1536, 2048].map((n) => <option key={n}>{n}</option>)}</select></Field></details>
                        <button type="button" className="material-panel__primary" disabled={busy || !validSize} onClick={() => void buildSurface()}>{tr('Сохранить материал', 'Save material')}</button>
                    </> : null}
                    {tab === 'maps' ? <>
                        {sourceControl}
                        <div className="material-panel__two"><Field label={tr('Название', 'Name')}><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={tr('Пресет поверхности', 'Surface preset')}>{categorySelect(category, changeCategory)}</Field></div>
                        {dimensionsControl}
                        {source === 'sketchup' || (source === 'current' && (!override || override.tile === null)) ? <label className="material-panel__check"><input type="checkbox" checked={keepLayout} onChange={(event) => setKeepLayout(event.target.checked)} />{tr('Сохранить раскладку SketchUp', 'Preserve SketchUp mapping')}</label> : null}
                        <Field label={tr('Из чего получить рельеф', 'Height source')}><select value={recipe.heightMode} onChange={(event) => setRecipeValue('heightMode', event.target.value)}>
                            {[['flat', 'Гладкая поверхность', 'Flat surface'], ['detail', 'Мелкая фактура из цвета', 'Fine colour detail'], ['luminance', 'Светлое выше, тёмное ниже', 'Light is high, dark is low'], ['file', 'Моя карта высоты', 'My height map'], ['ai', 'Распознать структуру · ИИ', 'Infer surface structure · AI']].map(([id, ru, en]) => <option key={id} value={id}>{tr(ru, en)}</option>)}
                        </select></Field>
                        {recipe.heightMode === 'ai' ? <small>{sourceEntry?.recipe?.heightMode === 'ai' ? tr('Сохранённая высота используется повторно. Цвет не перерисовывается.', 'Reuses the saved height map. Colour is not regenerated.') : tr('Один запрос ИИ для высоты. Перед применением проверьте совпадение швов с цветом.', 'One AI request for height. Check alignment with colour before applying.')}</small> : null}
                        {recipe.heightMode === 'detail' || recipe.heightMode === 'luminance' ? <small>{tr('Оценка по цвету: пятна и тени могут стать рельефом. Для точных швов загрузите карту высоты.', 'Colour-based estimate: stains and shadows may become relief. Import a height map for exact joints.')}</small> : null}
                        {recipeKnob('depth', 'Глубина рельефа', 'Relief depth', [0, 30, 0.1], tr('мм', 'mm'))}
                        {recipeKnob('smoothing', 'Сглаживание', 'Smoothing', [0, 4, 0.1])}
                        <label className="material-panel__check"><input type="checkbox" checked={recipe.invert} onChange={(event) => setRecipeValue('invert', event.target.checked)} />{tr('Инвертировать высоту', 'Invert height')}</label>
                        {recipeKnob('roughness', 'Матовость', 'Roughness', [0.02, 1, 0.01])}
                        {recipeKnob('variation', 'Разница матовости', 'Roughness variation', [0, 0.5, 0.01])}
                        {recipeKnob('ao', 'Затенение щелей', 'Crevice shading', [0, 2, 0.05])}
                        {recipeKnob('metalness', 'Металличность', 'Metalness', [0, 1, 0.01])}
                        <details className="material-panel__advanced" open={recipe.heightMode === 'file' || undefined}><summary>{tr('Загрузить готовые карты', 'Import existing maps')}</summary>
                            <small>{tr('Карты одного образца, в одинаковых пропорциях. Нормали — OpenGL (+Y).', 'Same framing and proportions as the colour image. Normals: OpenGL (+Y).')}</small>
                            <div className="material-panel__imports">{MAP_FILES.filter(([id]) => id !== 'albedo').map(([id, ru, en]) => <div key={id}><label>{tr(ru, en)}<input aria-label={tr(`Загрузить: ${ru}`, `Import: ${en}`)} type="file" accept="image/*" onChange={(event) => { void uploadMap(id, event.target.files[0]); event.target.value = ''; }} /></label><small>{uploads[id]?.name ?? (sourceEntry?.mapSources?.[id] === 'file' ? tr('Из сохранённого материала', 'From saved material') : '')}</small>{uploads[id] ? <button type="button" onClick={() => setUploads((items) => { const next = { ...items }; delete next[id]; return next; })} aria-label={tr('Убрать карту', 'Remove map')}>×</button> : null}</div>)}</div>
                        </details>
                        <button type="button" className="material-panel__primary" disabled={!sourceUrl || !validSize || busy || (recipe.heightMode === 'ai' && !key?.hasKey && sourceEntry?.recipe?.heightMode !== 'ai')} onClick={() => void buildMaps()} data-testid="material-maps">{tr('Подготовить карты', 'Prepare maps')}</button>
                    </> : null}
                    {tab === 'library' ? <>
                        <div className="material-panel__search"><input aria-label={tr('Поиск материалов', 'Search materials')} placeholder={tr('Найти материал…', 'Find material…')} value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-pressed={favorites} aria-label={tr('Только избранное', 'Favorites only')} onClick={() => setFavorites((value) => !value)}>☆</button></div>
                        <div className="material-panel__categories"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{tr('Все', 'All')}</button>{MATERIAL_CATEGORIES.map(([id, ru, en]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{tr(ru, en)}</button>)}</div>
                        {libraryError ? <p role="alert" className="is-error">{libraryError}</p> : null}
                        <div className="material-panel__shelf">{visible.map((item) => <button type="button" key={item.id} aria-pressed={selected === item.id} className="material-panel__item" onClick={() => selectEntry(item)}><img src={`${libraryFile(item.id, 'preview.webp')}?v=${item.version ?? 0}`} alt="" /><span>{item.name}</span><small>{item.tile == null ? 'SketchUp' : `${materialSize(item).map((n) => Number(n.toFixed(2))).join(' × ')} ${tr('м', 'm')}`}{item.favorite ? ' · ★' : ''}</small></button>)}</div>
                        {!visible.length ? <p className="material-panel__empty">{library.length ? tr('По этому фильтру ничего нет.', 'No materials match.') : tr('Создайте материал или загрузите цвет и готовые карты. Библиотека общая для всех проектов.', 'Create a material or import colour and maps. The library is shared across projects.')}</p> : null}
                        {entry ? <details className="material-panel__library-edit"><summary>{tr('Свойства материала', 'Material properties')}</summary><div className="material-panel__two"><Field label={tr('Название', 'Name')}><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={tr('Категория', 'Category')}>{categorySelect(category, setCategory)}</Field></div><div className="material-panel__row"><button type="button" onClick={() => void patchEntry({ name, category, ...previewLook })}>{tr('Сохранить', 'Save')}</button><button type="button" aria-label={tr('Избранное', 'Favorite')} aria-pressed={Boolean(entry.favorite)} onClick={() => void patchEntry({ favorite: !entry.favorite })}>{entry.favorite ? '★' : '☆'}</button><button type="button" onClick={() => { setSource('selection'); setTab('maps'); }}>{tr('Карты', 'Maps')}</button>{entry.surface ? <button type="button" onClick={() => { proceduralStarted.current = true; setSurface(normalizeSurface(entry.surface)); setSource('selection'); setProceduralParallax(Boolean(previewEntry.parallax)); setTab('procedural'); }}>{tr('Рисунок', 'Pattern')}</button> : null}</div></details> : null}
                    </> : null}
                </fieldset>
                {key && !key.hasKey && ['create', 'maps'].includes(tab) ? <p className="material-panel__note">{tr('Для ИИ подключите ключ в «Настройки движка → API». Расчёт и загрузка карт работают без ключа.', 'Connect a key in Engine settings → API for AI. Local and imported maps need no key.')}</p> : null}
                {!validSize ? <p role="alert" className="is-error">{tr('Размеры образца: от 0,05 до 50 м.', 'Sample dimensions: 0.05 to 50 m.')}</p> : null}
                {entry && tab !== 'procedural' ? <section className="material-panel__preview" aria-label={tr('Готовый материал', 'Finished material')}><div className="material-panel__section-label"><strong>{entry.name}</strong><span>{entry.size?.join(' × ')} px</span></div>
                    {mapTabs}
                    {!quickLook ? previewVisual : null}
                    {preview === 'compare' ? <Knob label={tr('Высота поверх цвета', 'Height over colour')} value={overlay} range={[0, 1, 0.05]} onChange={setOverlay} /> : null}
                    <div className="material-panel__preview-actions"><span>{sampleW.toFixed(2)} × {sampleH.toFixed(2)} {tr('м', 'm')}</span>{preview !== 'render' ? <><button type="button" aria-pressed={repeat} onClick={() => setRepeat((value) => !value)}>{tr('Повтор 2 × 2', 'Repeat 2 × 2')}</button><a href={previewUrl} download={`${entry.name}-${selectedMap[3]}`}>{tr('Скачать карту', 'Download map')}</a></> : <button type="button" onClick={() => setQuickLook(true)}>{tr('Просмотр · пробел', 'View · Space')}</button>}</div>
                    <div className="material-panel__preview-actions"><label className="material-panel__check"><input type="checkbox" checked={Boolean(previewEntry.parallax)} onChange={(event) => previewSetting('parallax', Number(event.target.checked))} />{tr('Параллакс', 'Parallax')}</label>{preview !== 'render' ? <button type="button" onClick={() => setQuickLook(true)}>{tr('Просмотр · пробел', 'View · Space')}</button> : null}</div>
                    {previewEntry.parallax ? <Knob label={tr('Глубина параллакса', 'Parallax depth')} unit={tr('мм', 'mm')} value={previewEntry.parallaxDepth ?? entry.recipe?.depth ?? 5} range={MATERIAL_RANGES.parallaxDepth} onChange={(value) => previewSetting('parallaxDepth', value)} /> : null}
                    {entry.mapSources?.height === 'ai' ? <small>{tr('Высота оценена ИИ. Сверьте швы на картах цвета и высоты.', 'AI estimated height. Compare joints in colour and height maps.')}</small> : null}
                </section> : null}
                {override?.material && tab !== 'procedural' ? <details className="material-panel__applied"><summary>{tr('На модели', 'On model')} · {applied?.name ?? override.material}</summary>
                    <Field label={tr('Раскладка', 'Mapping')}><select value={override.tile === null ? 'original' : override.projection ?? 'uv'} onChange={(event) => {
                        const value = event.target.value;
                        setOverride({ ...override, tile: value === 'original' ? null : override.tile ?? dimensions[0], tileY: value === 'original' ? null : override.tileY ?? dimensions[1], projection: value === 'box' ? 'box' : undefined });
                    }}><option value="original">{tr('Исходный масштаб SketchUp', 'Original SketchUp scale')}</option><option value="uv">{tr('Размер в метрах · UV SketchUp', 'Metres · SketchUp UVs')}</option><option value="box">{tr('Размер в метрах · по граням', 'Metres · on faces')}</option></select></Field>
                    {override.tile !== null ? <div className="material-panel__two"><Field label={tr('Ширина, м', 'Width, m')}><NumberInput value={override.tile} min={0.05} onChange={(value) => setOverride({ ...override, tile: value })} /></Field><Field label={tr('Высота, м', 'Height, m')}><NumberInput value={override.tileY ?? override.tile} min={0.05} onChange={(value) => setOverride({ ...override, tileY: value })} /></Field></div> : null}
                    {appliedKnob('rotation', 'Поворот', 'Rotation', 0)}
                    {appliedKnob('normal', 'Нормали', 'Normals')}
                    {appliedKnob('roughness', 'Матовость', 'Roughness')}
                    {appliedKnob('ao', 'Затенение щелей', 'Crevice shading')}
                    {appliedKnob('metalness', 'Металличность', 'Metalness', 0)}
                    {!entryOnModel ? <label className="material-panel__check"><input type="checkbox" checked={Boolean(override.parallax)} onChange={(event) => setOverride({ ...override, parallax: Number(event.target.checked) })} />{tr('Параллакс', 'Parallax')}</label> : null}
                    {!entryOnModel && override.parallax ? appliedKnob('parallaxDepth', 'Глубина параллакса, мм', 'Parallax depth, mm', 5) : null}
                    <button type="button" onClick={unapply}>{tr('Вернуть материал SketchUp', 'Restore SketchUp material')}</button>
                </details> : null}
            </> : null}
        </div>
        <footer>{status ? <p className={`material-panel__status${status.error ? ' is-error' : ''}`} role="status" data-testid="material-status">{status.text}{busy ? ` · ${Math.round((now - status.started) / 1000)} ${tr('с', 's')}` : ''}</p> : null}
            {!glass.on && tab !== 'procedural' ? <button type="button" className="material-panel__primary" disabled={!entry || busy || entryOnModel} onClick={apply} data-testid="material-apply">{entryOnModel ? tr('Материал на модели', 'Material is applied') : entry ? tr(`Применить «${entry.name}»`, `Apply “${entry.name}”`) : tr('Выберите или подготовьте материал', 'Select or prepare a material')}</button> : null}
        </footer>
        {pinterest ? <ReferencePicker onClose={() => setPinterest(false)} onSelect={async (files) => { await addFiles(files); setSource('reference'); }} /> : null}
        {quickLook ? <MaterialQuickLook title={tab === 'procedural' ? name : entry?.name} onClose={() => setQuickLook(false)}>{tab === 'procedural' ? proceduralVisual : <>{mapTabs}{previewVisual}{preview === 'compare' ? <Knob label={tr('Высота поверх цвета', 'Height over colour')} value={overlay} range={[0, 1, 0.05]} onChange={setOverlay} /> : null}</>}</MaterialQuickLook> : null}
    </section>;
}
