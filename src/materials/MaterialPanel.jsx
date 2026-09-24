import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { EDITOR_THUMBNAIL_READY, requestEditorThumbnail } from '../components/effects/editorThumbnailCapture';
import { sketchupModelEntry } from '../placed/sketchupModel.js';
import { MATERIAL_RANGES } from './settings.js';
import { libraryFile, textureDataUrl, uvScale } from './modelMaterials.js';
import { glassDefaults, looksLikeGlass } from './glass.js';
import {
    finishMaterial, generateMaterial, listImageModels, listMaterials, mapsFromTexture, readKeyStatus, removeMaterial,
} from './api.js';
import './materials.css';

// «Сгенерировать / доработать текстуру…» — по щелчку правой кнопкой на модели
// SketchUp. Материал под курсором (имя из SketchUp) заменяется материалом
// библиотеки во всей модели, как в SketchUp. ИИ рисует только цвет; шов,
// рельеф, нормали, AO и шероховатость делает сервер (scripts/materials.mjs).
// Окно не модальное: пока оно открыто, модель можно крутить и смотреть.
const CONTEXT_KEY = 'material:context';
const PREFS = 'ddg_material_generator_v1';
const QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];
const SIZES = [1024, 1536, 2048];

const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } };
const writePrefs = (value) => { try { localStorage.setItem(PREFS, JSON.stringify(value)); } catch { /* удобство, не данные */ } };

// Аналог → JPEG до 1536 px: из Pinterest приходят и 4000 px.
async function shrink(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.9);
}

const imagesOf = (list) => [...(list ?? [])].filter((item) => item.type?.startsWith('image/'));
const round = (value, step = 0.05) => Math.max(step, Math.round(value / step) * step);

export default function MaterialPanel({ target, settings, applySettings, onClose }) {
    const { language } = useLanguage();
    const tr = (ru, en) => (language === 'ru' ? ru : en);
    const { placedId, materialName, material } = target;
    const override = settings.modelMaterials?.[placedId]?.[materialName] ?? null;
    const prefs = useMemo(readPrefs, []);

    // Сетки этого материала в модели: по ним — размер плитки SketchUp (с него
    // и начинаем) и стекло ли это.
    const { root, meshes } = useMemo(() => {
        const found = sketchupModelEntry(placedId)?.root ?? null;
        const list = [];
        found?.traverse((object) => { if (object.isMesh && object.material === material) list.push(object); });
        return { root: found, meshes: list };
    }, [placedId, material]);
    const scale = useMemo(() => (root && material ? material.userData.scale ?? uvScale(meshes, root) : [1, 1]), [root, meshes, material]);
    const current = useMemo(() => (material ? textureDataUrl(material, 512) : null), [material]);
    const swatch = material?.userData.glassBase?.color ?? material?.userData.original?.color ?? material?.color;
    const glassAuto = useMemo(() => Boolean(material && looksLikeGlass(material, meshes, root)), [material, meshes, root]);
    const glass = { ...glassDefaults(material), on: glassAuto, ...(override?.glass ?? {}) };

    const [references, setReferences] = useState([]);
    const [context, setContext] = useState({ on: true, image: null });
    const [description, setDescription] = useState('');
    const [key, setKey] = useState(null);
    const [models, setModels] = useState([]);
    const [model, setModel] = useState(prefs.model ?? 'gpt-image-2.5-sunburst');
    const [quality, setQuality] = useState(prefs.quality ?? 'high');
    const [size, setSize] = useState(prefs.size ?? 1024);
    const [count, setCount] = useState(prefs.count ?? 2);
    // Начальная плитка — как текстура лежала в SketchUp, но в пределах 0.25–4 м:
    // у листвы изгороди там бывает и 10 м.
    const [tile, setTile] = useState(() => round(Math.min(4, Math.max(0.25, Math.max(...scale)))));
    const [status, setStatus] = useState(null);
    const [draft, setDraft] = useState(null);
    const [picked, setPicked] = useState(0);
    const [library, setLibrary] = useState([]);
    const [now, setNow] = useState(Date.now());
    const fileInput = useRef(null);
    const busy = Boolean(status?.busy);

    useEffect(() => { writePrefs({ model, quality, size, count }); }, [model, quality, size, count]);
    useEffect(() => {
        if (!busy) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [busy]);

    const reloadLibrary = useCallback(() => listMaterials().then(setLibrary, () => setLibrary([])), []);
    useEffect(() => {
        void reloadLibrary();
        readKeyStatus().then((status) => {
            setKey(status);
            if (status.hasKey) listImageModels().then((list) => {
                setModels(list);
                if (list.length && !list.includes(model)) setModel(list.find((id) => /sunburst/.test(id)) ?? list[0]);
            }, () => {});
        }, () => setKey({ hasKey: false }));
    // Раз при открытии: модель из списка подбирается, только если прежней нет.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadLibrary]);

    // Кадр сцены — контекст для модели: где этот материал и что вокруг.
    const capture = useCallback(() => {
        requestEditorThumbnail(CONTEXT_KEY, { width: 1280, quality: 0.86 });
    }, []);
    useEffect(() => {
        const take = (event) => { if (event.detail?.key === CONTEXT_KEY) setContext((value) => ({ ...value, image: event.detail.image })); };
        window.addEventListener(EDITOR_THUMBNAIL_READY, take);
        capture();
        return () => window.removeEventListener(EDITOR_THUMBNAIL_READY, take);
    }, [capture]);

    const addFiles = useCallback(async (files) => {
        const images = imagesOf(files).slice(0, 12);
        if (!images.length) return;
        const added = await Promise.all(images.map(async (file) => ({ id: `${Date.now()}-${Math.random()}`, name: file.name || tr('картинка', 'image'), image: await shrink(file) })));
        setReferences((list) => [...list, ...added].slice(0, 12));
    // tr — подпись по-русски или по-английски, других зависимостей нет.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [language]);
    // ⌘V с картинкой — в аналоги, где бы ни стоял курсор; текст вставляется как обычно.
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
        const models = { ...(settings.modelMaterials ?? {}) };
        const materials = { ...(models[placedId] ?? {}) };
        if (next) materials[materialName] = next; else delete materials[materialName];
        if (Object.keys(materials).length) models[placedId] = materials; else delete models[placedId];
        applySettings({ modelMaterials: models });
    };
    // Материал библиотеки — со своими плиткой, рельефом и матовостью (их правит
    // лаборатория «Материалы»); своё слово о стекле при этом не теряется.
    const keepGlass = override?.glass ? { glass: override.glass } : {};
    const apply = (entry) => setOverride({ ...keepGlass, material: entry.id, tile: entry.tile ?? null, normal: entry.normal ?? override?.normal ?? 1, roughness: entry.roughness ?? override?.roughness ?? 1 });
    const unapply = () => setOverride(override?.glass ? keepGlass : null);
    const setGlass = (patch) => setOverride({ ...(override ?? {}), glass: { ...glass, ...patch } });

    const run = async (text, job) => {
        const started = Date.now();
        setNow(started);
        setStatus({ busy: true, text, started });
        try {
            setStatus({ text: await job() });
        } catch (error) {
            setStatus({ text: error.message, error: true });
        }
    };
    const generate = (mode) => run(mode === 'improve' ? tr('Улучшаю текстуру…', 'Improving the texture…') : tr('Рисую варианты…', 'Drawing variants…'), async () => {
        const result = await generateMaterial({
            mode, model, quality, size, n: count, tile, description,
            references: references.map((item) => item.image),
            context: context.on ? context.image : null,
            base: mode === 'improve' ? textureDataUrl(material) : null,
        });
        setDraft(result);
        setPicked(0);
        return tr(`Вариантов: ${result.previews.length}. Выберите и «Применить» — шов и карты сделаются сами.`, `${result.previews.length} variants. Pick one and apply — the seam and the maps follow.`);
    });
    const finish = () => run(tr('Делаю бесшовной и считаю карты…', 'Making it seamless, building maps…'), async () => {
        const entry = await finishMaterial({ draft: draft.draft, variant: picked, name: `${materialName}${description ? ` · ${description.slice(0, 40)}` : ''}` });
        apply(entry);
        await reloadLibrary();
        return entry.notes?.length ? entry.notes.join('; ') : tr('Готово: материал в библиотеке и на модели.', 'Done: the material is in the library and on the model.');
    });
    const mapsOnly = () => run(tr('Считаю карты к текущей текстуре…', 'Building maps for the current texture…'), async () => {
        const entry = await mapsFromTexture({ image: textureDataUrl(material, 4096), name: `${materialName} · ${tr('карты', 'maps')}` });
        apply(entry);
        await reloadLibrary();
        return tr('Готово: к текстуре SketchUp добавлены рельеф, нормали, AO и шероховатость.', 'Done: relief, normals, AO and roughness added to the SketchUp texture.');
    });
    const remove = async (entry) => {
        if (!window.confirm(tr(`Удалить «${entry.name}» из библиотеки?`, `Delete “${entry.name}” from the library?`))) return;
        await removeMaterial(entry.id).catch(() => {});
        if (override?.material === entry.id) unapply();
        await reloadLibrary();
    };

    const noKey = key && !key.hasKey;
    const canAi = !busy && key?.hasKey;
    const knob = (name, [label, labelEn], [min, max, step], unit = '') => <label className="material-panel__knob">
        <span>{tr(label, labelEn)}</span>
        <input type="range" min={min} max={max} step={step} value={override[name] ?? 1} onChange={(event) => setOverride({ ...override, [name]: Number(event.target.value) })} />
        <output>{Number(override[name] ?? 1).toFixed(2)}{unit}</output>
    </label>;
    const applied = override?.material ? library.find((entry) => entry.id === override.material) : null;
    const glassKnob = (name, [label, labelEn], [min, max, step]) => <label className="material-panel__knob">
        <span>{tr(label, labelEn)}</span>
        <input type="range" min={min} max={max} step={step} value={glass[name]} onChange={(event) => setGlass({ [name]: Number(event.target.value) })} data-testid={`material-glass-${name}`} />
        <output>{Number(glass[name]).toFixed(2)}</output>
    </label>;

    return <section className="material-panel focus-glass" aria-label={tr('Текстура', 'Texture')} data-testid="material-panel"
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>
        <header>
            <h2>{glass.on ? tr('Стекло', 'Glass') : tr('Текстура', 'Texture')} · «{materialName}»</h2>
            <button type="button" className="material-panel__close" onClick={onClose} aria-label={tr('Закрыть', 'Close')}>×</button>
        </header>

        <div className="material-panel__glass">
            <label className="material-panel__check">
                <input type="checkbox" checked={glass.on} onChange={(event) => setGlass({ on: event.target.checked })} data-testid="material-glass" />
                <span>{tr('Это стекло', 'This is glass')}</span>
                {glassAuto && !override?.glass ? <small>{tr('узнано само', 'recognised')}</small> : null}
            </label>
            {glass.on ? <>
                {glassKnob('clarity', ['Прозрачность', 'Clarity'], MATERIAL_RANGES.clarity)}
                {glassKnob('frost', ['Матовость', 'Frost'], MATERIAL_RANGES.frost)}
                {glassKnob('reflect', ['Отражение', 'Reflection'], MATERIAL_RANGES.reflect)}
                <label className="material-panel__knob">
                    <span>{tr('Оттенок', 'Tint')}</span>
                    <input type="color" value={glass.tint ?? '#888888'} onChange={(event) => setGlass({ tint: event.target.value })} />
                    <output />
                </label>
                <small>{tr('Стеклу текстура не нужна: снимите «Это стекло», чтобы сделать ему текстуру.', 'Glass needs no texture: untick “This is glass” to give it one.')}</small>
            </> : null}
        </div>

        {!glass.on ? <>
        <div className="material-panel__top">
            <div className="material-panel__refs">
                <span className="material-panel__caption">{tr('Аналоги', 'References')}</span>
                <div className="material-panel__thumbs">
                    {references.map((item) => <button key={item.id} type="button" className="material-panel__thumb" title={tr('Убрать', 'Remove')} style={{ backgroundImage: `url(${item.image})` }}
                        onClick={() => setReferences((list) => list.filter((other) => other.id !== item.id))}><span>×</span></button>)}
                    <button type="button" className="material-panel__add" onClick={() => fileInput.current?.click()} aria-label={tr('Добавить аналог', 'Add a reference')}>+</button>
                </div>
                <small>{tr('⌘V, перетащить или +', '⌘V, drop or +')}</small>
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }} />
            </div>
            <div className="material-panel__current">
                <span className="material-panel__caption">{tr('Сейчас', 'Now')}</span>
                <div className="material-panel__swatch" style={current ? { backgroundImage: `url(${current})` } : { background: `#${swatch?.getHexString?.() ?? '888888'}` }} />
                <small>{current ? tr(`плитка ≈ ${scale.map((value) => value.toFixed(2)).join(' × ')} м`, `tile ≈ ${scale.map((value) => value.toFixed(2)).join(' × ')} m`) : tr('без текстуры', 'no texture')}</small>
            </div>
            <label className="material-panel__brief">
                <span className="material-panel__caption">{tr('Что я хочу', 'What I want')}</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5}
                    placeholder={tr('Например: планкен из лиственницы, тёплый мёд, матовый, волокно вертикально, доска 12 см', 'E.g. larch cladding, warm honey, matte, vertical grain, 12 cm boards')} />
            </label>
        </div>
        <label className="material-panel__context">
            <input type="checkbox" checked={context.on} onChange={(event) => setContext((value) => ({ ...value, on: event.target.checked }))} />
            <span>{tr('Кадр сцены как контекст', 'Scene frame as context')}</span>
            {context.image ? <img src={context.image} alt="" /> : null}
            <button type="button" onClick={capture}>{tr('Снять заново', 'Retake')}</button>
        </label>

        {noKey ? <p className="material-panel__note">{tr('Нет ключа OpenAI: шестерёнка «Настройки движка» → «API», вставить ключ. «Только карты» работает и без него.', 'No OpenAI key: the gear “Engine settings” → “API”, paste the key. “Maps only” works without it.')}</p> : null}

        <div className="material-panel__row">
            <button type="button" className="material-panel__primary" disabled={!canAi || !current} onClick={() => void generate('improve')} data-testid="material-improve">{tr('Улучшить текущую · ИИ', 'Improve current · AI')}</button>
            <button type="button" disabled={busy || !current} onClick={() => void mapsOnly()} data-testid="material-maps">{tr('Только добавить карты', 'Only add maps')}</button>
        </div>
        <div className="material-panel__row">
            <button type="button" className="material-panel__primary" disabled={!canAi || (!description.trim() && !references.length)} onClick={() => void generate('create')} data-testid="material-create">{tr('Сгенерировать с нуля', 'Generate from scratch')}</button>
        </div>

        <div className="material-panel__settings">
            <label className="material-panel__model"><span>{tr('Модель', 'Model')}</span><select value={model} onChange={(event) => setModel(event.target.value)}>
                {[...new Set([model, ...models])].map((id) => <option key={id} value={id}>{id}</option>)}
            </select></label>
            <label><span>{tr('Качество', 'Quality')}</span><select value={quality} onChange={(event) => setQuality(event.target.value)}>
                {QUALITIES.map((id) => <option key={id} value={id}>{id}</option>)}
            </select></label>
            <label><span>{tr('Разрешение', 'Resolution')}</span><select value={size} onChange={(event) => setSize(Number(event.target.value))}>
                {SIZES.map((id) => <option key={id} value={id}>{id}²</option>)}
            </select></label>
            <label><span>{tr('Вариантов', 'Variants')}</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {[1, 2, 3, 4].map((id) => <option key={id} value={id}>{id}</option>)}
            </select></label>
            <label><span>{tr('Плитка, м', 'Tile, m')}</span><input type="number" min={0.05} max={50} step={0.05} value={tile} onChange={(event) => setTile(Math.max(0.05, Number(event.target.value) || 1))} /></label>
        </div>

        {status ? <p className={`material-panel__status${status.error ? ' is-error' : ''}`} role="status" data-testid="material-status">
            {status.text}{busy ? ` ${Math.round((now - status.started) / 1000)} ${tr('с', 's')}` : ''}
        </p> : null}

        {draft ? <div className="material-panel__variants">
            {draft.previews.map((url, index) => <button key={url} type="button" className={`material-panel__variant${index === picked ? ' is-picked' : ''}`}
                style={{ backgroundImage: `url(${url})` }} aria-pressed={index === picked} onClick={() => setPicked(index)} title={tr('Плитка 2×2 — видно шов', 'Tiled 2×2 — the seam shows')} />)}
            <button type="button" className="material-panel__primary" disabled={busy} onClick={() => void finish()} data-testid="material-apply">{tr('Применить', 'Apply')}</button>
        </div> : null}

        {override?.material ? <div className="material-panel__applied">
            <span className="material-panel__caption">{tr('На модели', 'On the model')}: {applied?.name ?? override.material}</span>
            {override.tile !== null ? <div className="material-panel__projection" role="group" aria-label={tr('Раскладка', 'Layout')}>
                <span>{tr('Раскладка', 'Layout')}</span>
                {[['uv', tr('Как в SketchUp', 'As in SketchUp')], ['box', tr('Прямо по граням', 'Straight on faces')]].map(([id, label]) => <button key={id} type="button"
                    aria-pressed={(override.projection ?? 'uv') === id} onClick={() => setOverride({ ...override, projection: id === 'box' ? 'box' : undefined })}>{label}</button>)}
            </div> : null}
            {override.tile !== null ? <label className="material-panel__knob">
                <span>{tr('Плитка', 'Tile')}</span>
                <input type="range" min={MATERIAL_RANGES.tile[0]} max={Math.max(4, override.tile * 2)} step={0.01} value={override.tile} onChange={(event) => setOverride({ ...override, tile: Number(event.target.value) })} />
                <output>{override.tile.toFixed(2)} {tr('м', 'm')}</output>
            </label> : null}
            {knob('normal', ['Рельеф', 'Relief'], MATERIAL_RANGES.normal)}
            {knob('roughness', ['Матовость', 'Roughness'], MATERIAL_RANGES.roughness)}
            <button type="button" onClick={unapply}>{tr('Вернуть материал SketchUp', 'Back to the SketchUp material')}</button>
        </div> : null}

        <div className="material-panel__library">
            <span className="material-panel__caption">{tr('Библиотека материалов', 'Material library')} · {library.length}</span>
            <div className="material-panel__shelf">
                {library.map((entry) => <div key={entry.id} className={`material-panel__item${override?.material === entry.id ? ' is-applied' : ''}`}>
                    <button type="button" onClick={() => apply(entry)} title={entry.description || entry.name}
                        style={{ backgroundImage: `url(${libraryFile(entry.id, 'preview.webp')}?v=${entry.version})` }} />
                    <span>{entry.name}</span>
                    <button type="button" className="material-panel__remove" onClick={() => void remove(entry)} aria-label={tr('Удалить', 'Delete')}>×</button>
                </div>)}
                {!library.length ? <small>{tr('Пока пусто: применённые материалы ложатся сюда и доступны в любом проекте.', 'Empty so far: applied materials land here for every project.')}</small> : null}
            </div>
        </div>
        </> : null}
    </section>;
}
