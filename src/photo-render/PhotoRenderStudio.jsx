import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { usePlantLibrary } from '../planting/plantLibrary';
import { listImageModels, readKeyStatus } from '../materials/api';
import { capturePhotoFrame } from './capture';
import { PHOTO_MODEL, PHOTO_PRESETS, photoPrompt } from './prompt';
import MaskCanvas from './MaskCanvas';
import ReferencePicker from '../references/ReferencePicker.jsx';
import './photo-render.css';

const PREFS = 'ouroboros-photo-render-v1';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } };
async function api(url, body) {
    const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw Object.assign(new Error(payload?.message || `Рендер недоступен (${response.status}). Перезапустите локальный редактор.`), { uncertain: Boolean(body) && (response.status >= 500 || response.ok) });
    return payload;
}
async function imageData(url) {
    if (url.startsWith('data:')) return url;
    const response = await fetch(url); if (!response.ok) throw new Error('Не удалось загрузить исходник.');
    const blob = await response.blob();
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}

export default function PhotoRenderStudio({ settings, layoutEditor, project, onClose }) {
    const { language } = useLanguage(); const tr = (ru, en) => language === 'ru' ? ru : en;
    const { plants: library, status: libraryStatus } = usePlantLibrary();
    const [prefs] = useState(readPrefs);
    const [model, setModel] = useState(prefs.model || PHOTO_MODEL), [models, setModels] = useState([]);
    const [quality, setQuality] = useState(prefs.quality || 'high'), [edge, setEdge] = useState(prefs.edge || 2048);
    const [preset, setPreset] = useState('scene'), [description, setDescription] = useState(''), [mode, setMode] = useState('photo');
    const [frame, setFrame] = useState(null), [chosen, setChosen] = useState(null), [records, setRecords] = useState([]);
    const [message, setMessage] = useState(''), [keyState, setKeyState] = useState(null), [capturing, setCapturing] = useState(true), [submitting, setSubmitting] = useState(false);
    const [brush, setBrush] = useState(4), [erase, setErase] = useState(false), [strokes, setStrokes] = useState(0), [compare, setCompare] = useState(false);
    const [uncertain, setUncertain] = useState(null);
    const [pinterest, setPinterest] = useState(false);
    const [foliageReference, setFoliageReference] = useState(null), [readingReference, setReadingReference] = useState(false);
    const dialog = useRef(null), mask = useRef(null), referenceInput = useRef(null), mounted = useRef(true), ticket = useRef(0), automatic = useRef(''), request = useRef(null);
    const latest = useRef(null); latest.current = { settings, layoutEditor, library };
    const projectId = project?.id || 'site';
    const cameraId = layoutEditor.activeWorkCameraId ? `work:${layoutEditor.activeWorkCameraId}` : `scene:${layoutEditor.activeCameraId}`;
    const camera = layoutEditor.activeWorkCameraId ? layoutEditor.workCameras.find((c) => c.id === layoutEditor.activeWorkCameraId) : layoutEditor.cameras.find((c) => c.id === layoutEditor.activeCameraId);
    const running = records.find((entry) => entry.status === 'running');
    const runningId = running?.id;
    const busy = Boolean(running || submitting);
    const result = chosen?.status === 'done' ? chosen : null;
    const image = result?.result || frame?.image;
    const context = result?.context || frame?.context || {};
    const original = result?.source || null;
    const working = mode === 'edit';

    const readFoliageReference = async (file) => {
        if (!file) return;
        setReadingReference(true); setMessage('');
        try {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 18 * 2 ** 20) throw new Error(tr('Нужно фото PNG, JPEG или WebP до 18 МБ.', 'Choose a PNG, JPEG or WebP photograph up to 18 MB.'));
            const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
            const dimensions = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve([img.width, img.height]); img.onerror = () => reject(new Error(tr('Не удалось прочитать фото.', 'Could not read this photograph.'))); img.src = image; });
            if (Math.max(...dimensions) > 4096) throw new Error(tr('Максимальная сторона фото — 4096 px.', 'The maximum photograph edge is 4096 px.'));
            if (mounted.current) setFoliageReference({ image, name: file.name });
        } catch (issue) { if (mounted.current) setMessage(issue.message); }
        finally { if (mounted.current) setReadingReference(false); }
    };

    useEffect(() => { mounted.current = true; dialog.current.showModal(); return () => { mounted.current = false; }; }, []);
    useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ model, quality, edge })); } catch { /* preferences only */ } }, [model, quality, edge]);
    useEffect(() => {
        let live = true;
        readKeyStatus().then((status) => {
            if (!live) return; setKeyState(status);
            if (status.hasKey) listImageModels().then((list) => {
                if (!live) return;
                const supported = list.filter((id) => /^gpt-image-2/.test(id)); setModels(supported);
                setModel((current) => supported.includes(current) ? current : supported.find((id) => /sunburst/.test(id)) || supported[0] || current);
            }).catch((issue) => { if (live) setMessage(issue.message); });
        }).catch((issue) => { if (live) { setKeyState({ hasKey: false }); setMessage(issue.message); } });
        return () => { live = false; };
    }, []);

    const refresh = useCallback(async () => {
        const { renders } = await api(`/__photo-renders?project=${encodeURIComponent(projectId)}`);
        if (!mounted.current) return;
        setRecords(renders);
        const id = request.current;
        if (id) {
            const entry = renders.find((r) => r.id === id);
            if (entry?.status === 'done') { setChosen(entry); setMode('edit'); setDescription(''); request.current = null; }
            if (entry && ['failed', 'interrupted'].includes(entry.status)) { setMessage(entry.message); request.current = null; }
        }
    }, [projectId]);
    useEffect(() => {
        void refresh().catch((issue) => { if (mounted.current) setMessage(issue.message); });
    }, [refresh]);
    useEffect(() => {
        if (!runningId) return undefined;
        let live = true, timer;
        const poll = async () => {
            try { await refresh(); } catch (issue) { if (live) setMessage(issue.message); }
            if (live) timer = setTimeout(poll, 3000);
        };
        timer = setTimeout(poll, 3000); return () => { live = false; clearTimeout(timer); };
    }, [refresh, runningId]);

    const capture = useCallback(async () => {
        const current = ++ticket.current;
        setCapturing(true); setMessage('');
        const state = latest.current;
        const editor = state.layoutEditor;
        const selected = editor.activeWorkCameraId ? editor.workCameras.find((c) => c.id === editor.activeWorkCameraId) : editor.cameras.find((c) => c.id === editor.activeCameraId);
        try {
            const deadline = Date.now() + 20000;
            while (document.getElementById('engine-boot') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
            if (!mounted.current || ticket.current !== current) return;
            const next = await capturePhotoFrame({ settings: state.settings, library: state.library, cameraName: selected?.name || '', aspect: editor.selectedKey === 'portrait' ? 9 / 16 : undefined });
            if (!mounted.current || ticket.current !== current) return;
            setFrame(next); setChosen(null); setMode('photo'); setCompare(false);
        } catch (issue) { if (mounted.current && ticket.current === current) setMessage(issue.message); }
        finally { if (mounted.current && ticket.current === current) setCapturing(false); }
    }, []);
    useEffect(() => {
        if (libraryStatus === 'idle' || libraryStatus === 'loading') return undefined;
        const identity = `${cameraId}:${layoutEditor.selectedKey}`;
        if (automatic.current === identity) return undefined;
        // Wait for the existing camera transition; capture uses the actual lens
        // and matrices of the very frame that is handed to the image API.
        const timer = setTimeout(() => { automatic.current = identity; void capture(); }, 900);
        return () => clearTimeout(timer);
    }, [cameraId, layoutEditor.selectedKey, libraryStatus, capture]);

    const generate = async (retry = null) => {
        if (busy || capturing || readingReference) return;
        setSubmitting(true); setMessage('');
        let body = retry;
        try {
            if (!body) {
                body = { requestId: crypto.randomUUID(), project: projectId, mode, model, quality, edge, preset, description,
                    image: await imageData(image), mask: working ? mask.current.mask() : null,
                    context, references: result ? [] : frame?.references || [], foliageReference: foliageReference ? await imageData(foliageReference.image) : null };
            }
            const { render } = await api('/__photo-renders', body);
            if (!mounted.current) return;
            setUncertain(null); request.current = render.id;
            setRecords((before) => [render, ...before.filter((r) => r.id !== render.id)]);
            await refresh();
        } catch (issue) {
            if (mounted.current) {
                setMessage(issue.message);
                // Preserve the exact id and payload only for transport failures.
                // Retrying that id is safe; a new id might duplicate a paid job.
                if (body && (issue instanceof TypeError || issue.uncertain)) setUncertain(body);
            }
        } finally { if (mounted.current) setSubmitting(false); }
    };
    const extraQuality = /^gpt-image-2\.5/.test(model);
    const prompts = photoPrompt({ mode, description, preset, context, references: result ? [] : frame?.references || [], foliageReference: Boolean(foliageReference) });
    return <dialog ref={dialog} className="focus-dialog photo-studio" aria-label={tr('Фоторендер', 'Photo render')} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
        <header><h2>{tr('Фоторендер', 'Photo render')}</h2><span className="photo-project">{project?.name || tr('Сайт', 'Site')}</span><button type="button" className="focus-button" aria-label={tr('Закрыть рендер', 'Close render')} onClick={onClose}>×</button></header>
        <div className="photo-workspace">
            <div className="photo-main">
                <div className="photo-toolbar">
                    <label className="photo-camera"><span>{tr('Камера', 'Camera')}</span><select aria-label={tr('Камера рендера', 'Render camera')} value={cameraId} disabled={busy || capturing} onChange={(event) => { setCapturing(true); const [kind, ...id] = event.target.value.split(':'); if (kind === 'work') layoutEditor.selectWorkCamera(id.join(':')); else layoutEditor.selectCamera(id.join(':')); }}>
                        <optgroup label={tr('Камеры', 'Cameras')}>{layoutEditor.cameras.map((c) => <option key={c.id} value={`scene:${c.id}`}>{c.name}</option>)}</optgroup>
                        <optgroup label={tr('Рабочие', 'Working')}>{layoutEditor.workCameras.map((c) => <option key={c.id} value={`work:${c.id}`}>{c.name}</option>)}</optgroup>
                    </select></label>
                    <select aria-label={tr('Формат кадра', 'Frame format')} value={layoutEditor.selectedKey} disabled={busy || capturing} onChange={(event) => { setCapturing(true); layoutEditor.setSelectedKey(event.target.value); }}><option value="desktop">Desktop</option><option value="portrait">Mobile</option></select>
                    <button type="button" disabled={busy || capturing} onClick={capture}>{capturing ? tr('Захват…', 'Capturing…') : tr('Обновить кадр', 'Refresh frame')}</button>
                    <span className="photo-spacer" />
                    <button type="button" aria-pressed={compare} disabled={!result} onClick={() => setCompare((v) => !v)}>{compare ? tr('Показать результат', 'Show result') : tr('Сравнить с исходником', 'Compare original')}</button>
                    {image ? <a href={result ? `${result.result}?download=1` : image} download="ouroboros-frame.png">{tr('Скачать PNG', 'Download PNG')}</a> : null}
                </div>
                <MaskCanvas ref={mask} image={image} original={original} compare={compare} enabled={working} size={brush} erase={erase} disabled={busy || capturing} tr={tr} onChange={setStrokes} />
                <div className="photo-frame-caption"><span>{result ? `${result.camera} · ${tr('Вариант', 'Variant')}` : camera?.name}{context.month ? ` · ${new Intl.DateTimeFormat(language, { month: 'long' }).format(new Date(2026, context.month - 1, 15))}` : ''}</span><span>{result?.resultSize?.join(' × ') || tr('Исходный кадр камеры', 'Source camera frame')}</span></div>
                <div className="photo-history" aria-label={tr('История рендеров', 'Render history')}>
                    {frame ? <button type="button" aria-pressed={!chosen} disabled={busy || capturing} onClick={() => { setChosen(null); setCompare(false); setMode('photo'); }}><img src={frame.image} alt="" /><span>{tr('Исходник', 'Source')}</span></button> : null}
                    {records.filter((r) => r.status === 'done').map((entry) => <button type="button" key={entry.id} aria-pressed={chosen?.id === entry.id} disabled={busy || capturing} onClick={() => { setChosen(entry); setMode('edit'); setCompare(false); setDescription(''); }}><img src={entry.preview} alt="" /><span>{entry.camera || tr('Кадр', 'Frame')} · {new Date(entry.created).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}</span></button>)}
                </div>
            </div>
            <aside className="photo-controls">
                <div className="photo-mode" role="group" aria-label={tr('Режим рендера', 'Render mode')}><button type="button" aria-pressed={!working} disabled={busy} onClick={() => { setMode('photo'); setCompare(false); }}>{tr('Фотография', 'Photograph')}</button><button type="button" aria-pressed={working} disabled={busy} onClick={() => { setMode('edit'); setCompare(false); }}>{tr('Кисть', 'Brush')}</button></div>
                {working ? <>
                    <div className="photo-brush-tools"><button type="button" aria-pressed={!erase} disabled={busy} onClick={() => setErase(false)}>{tr('Кисть', 'Paint')}</button><button type="button" aria-pressed={erase} disabled={busy} onClick={() => setErase(true)}>{tr('Ластик', 'Erase')}</button><button type="button" disabled={!strokes || busy} onClick={() => mask.current.undo()}>{tr('Отменить мазок', 'Undo stroke')}</button><button type="button" disabled={!strokes || busy} onClick={() => mask.current.clear()}>{tr('Очистить', 'Clear')}</button></div>
                    <label>{tr('Размер кисти', 'Brush size')}<input aria-label={tr('Размер кисти', 'Brush size')} type="range" min="0.5" max="18" step="0.5" value={brush} onChange={(event) => setBrush(Number(event.target.value))} disabled={busy} /></label>
                </> : <label>{tr('Атмосфера', 'Atmosphere')}<select value={preset} disabled={busy} onChange={(event) => setPreset(event.target.value)}>{PHOTO_PRESETS.map((item) => <option key={item.id} value={item.id}>{language === 'ru' ? item.ru : item.en}</option>)}</select></label>}
                <label>{working ? tr('Что добавить или изменить', 'What to add or change') : tr('Пожелания к кадру', 'Frame refinements')}<textarea aria-label={tr('Задание для рендера', 'Render instructions')} rows={5} maxLength={4000} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder={working ? tr('Например: садовая скамья из тёмного дерева…', 'For example: a dark timber garden bench…') : tr('Можно оставить пустым', 'Optional')} /></label>
                <div className="photo-foliage-reference">
                    <label>{tr('Фото озеленения', 'Vegetation photograph')}<button type="button" aria-label={foliageReference ? tr('Заменить фото', 'Replace photo') : tr('Добавить фото', 'Add photo')} disabled={busy || readingReference} onClick={() => referenceInput.current.click()}>{readingReference ? tr('Читаю фото…', 'Reading photo…') : foliageReference ? tr('Заменить фото', 'Replace photo') : tr('Добавить фото', 'Add photo')}</button><button type="button" disabled={busy || readingReference} onClick={() => setPinterest(true)}>Pinterest</button><input ref={referenceInput} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || readingReference} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void readFoliageReference(file); }} /></label>
                    {foliageReference ? <div><img src={foliageReference.image} alt={foliageReference.name} /><button type="button" disabled={busy || readingReference} onClick={() => setFoliageReference(null)}>{tr('Убрать фото', 'Remove photo')}</button></div> : null}
                    <small>{tr('Ориентир по натуральности листвы. Виды и расположение — из сцены.', 'A reference for natural foliage. Species and placement come from the scene.')}</small>
                </div>
                <label>{tr('Качество', 'Quality')}<select value={extraQuality || !['xhigh', 'max'].includes(quality) ? quality : 'high'} disabled={busy} onChange={(event) => setQuality(event.target.value)}><option value="medium">{tr('Проба', 'Draft')}</option><option value="high">{tr('Высокое', 'High')}</option>{extraQuality ? <><option value="xhigh">{tr('Очень высокое', 'Very high')}</option><option value="max">{tr('Максимальное', 'Maximum')}</option></> : null}</select></label>
                {working ? <p>{tr('Размер результата — как у исходника.', 'Result dimensions match the source.')}</p> : <label>{tr('Размер', 'Size')}<select value={edge} disabled={busy} onChange={(event) => setEdge(Number(event.target.value))}><option value={1024}>1K</option><option value={2048}>2K</option><option value={3840}>{tr('До 4K', 'Up to 4K')}</option></select></label>}
                <details><summary>{tr('Модель', 'Model')}</summary><select aria-label={tr('Модель изображений', 'Image model')} value={model} disabled={busy} onChange={(event) => setModel(event.target.value)}>{[...new Set([model, ...models])].map((id) => <option key={id}>{id}</option>)}</select></details>
                <details><summary>{tr('Виды в кадре', 'Species in frame')} · {context.plants?.length || 0}</summary><div className="photo-scene-data">{context.plants?.map((plant) => <p key={plant.id}><strong>{plant.name}</strong><span>{plant.latin} · {plant.count} · ≈ {plant.height} {tr('м', 'm')}</span></p>)}{context.materials?.length ? <p>{tr('Материалы', 'Materials')}: {context.materials.map((m) => m.name).join(', ')}</p> : null}<small>{tr('Виды из библиотеки посадок; положение — по камере, перекрытия уточняются по изображению.', 'Species from the planting library; positions from the camera, occlusion resolved using the image.')}</small></div></details>
                <details><summary>{tr('Полный промпт', 'Full prompt')}</summary><textarea aria-label={tr('Полный промпт', 'Full prompt')} rows={10} readOnly value={prompts} /></details>
                <div className="photo-submit"><button type="button" className="focus-primary" data-testid="photo-generate" disabled={busy || capturing || readingReference || !image || !keyState?.hasKey || Boolean(uncertain) || (working && (!strokes || !description.trim()))} onClick={() => void generate()}>{busy ? tr('Создаю изображение…', 'Creating image…') : working ? tr('Изменить область', 'Edit area') : tr('Создать фотографию', 'Create photograph')}</button>
                    <small>{working ? tr('Вне кисти исходник сохраняется. Результат — отдельное изображение.', 'Pixels outside the brush are preserved. The result is a separate image.') : tr('Кадр и текстуры отправляются в OpenAI. Один запуск — одно изображение по вашему API.', 'The frame and textures go to OpenAI. One run creates one image using your API.')}</small>
                </div>
                {keyState && !keyState.hasKey ? <p role="status">{tr('Подключите ключ: Настройки движка → API.', 'Connect a key in Engine settings → API.')}</p> : null}
                {running ? <p role="status">{tr('Можно закрыть окно: результат останется в истории.', 'You can close this window; the result will remain in history.')}</p> : null}
                {message ? <p className="photo-error" role="alert">{message}</p> : null}
                {uncertain ? <button type="button" disabled={busy} onClick={() => void generate(uncertain)}>{tr('Проверить тот же запрос', 'Check the same request')}</button> : null}
                {records.filter((r) => ['failed', 'interrupted'].includes(r.status)).slice(0, 1).map((r) => <details key={r.id}><summary>{tr('Последняя ошибка', 'Last error')}</summary><p>{r.message}</p></details>)}
            </aside>
        </div>
        {pinterest ? <ReferencePicker multiple={false} onClose={() => setPinterest(false)} onSelect={(files) => readFoliageReference(files[0])} /> : null}
    </dialog>;
}
