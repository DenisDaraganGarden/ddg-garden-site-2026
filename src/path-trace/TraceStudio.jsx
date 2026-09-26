import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { FocusIcon } from '../features/home-scene/components/editor/focus/FocusIcons.jsx';
import './trace.css';

const PREFS = 'ddg_path_trace_v1';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } };
export default function TraceStudio({ layoutEditor, project, onClose }) {
    const { language } = useLanguage(), tr = (ru, en) => language === 'ru' ? ru : en;
    const [prefs] = useState(readPrefs);
    const [edge, setEdge] = useState(prefs.edge || 1536), [samples, setSamples] = useState(prefs.samples || 256);
    const [bounces, setBounces] = useState(prefs.bounces || 6), [textures, setTextures] = useState(prefs.textures || 1024);
    const [exposure, setExposure] = useState(0), [denoise, setDenoise] = useState(prefs.denoise !== false);
    const [busy, setBusy] = useState(false), [progress, setProgress] = useState(null), [error, setError] = useState('');
    const [url, setUrl] = useState('');
    const dialog = useRef(null), canvas = useRef(null), controller = useRef(null), mounted = useRef(true), imageUrl = useRef('');
    const current = layoutEditor.activeWorkCameraId ? layoutEditor.workCameras.find((c) => c.id === layoutEditor.activeWorkCameraId) : layoutEditor.cameras.find((c) => c.id === layoutEditor.activeCameraId);
    useEffect(() => { mounted.current = true; dialog.current.showModal(); return () => { mounted.current = false; controller.current?.abort(); URL.revokeObjectURL(imageUrl.current); }; }, []);
    useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ edge, samples, bounces, textures, denoise })); } catch { /* optional preferences */ } }, [edge, samples, bounces, textures, denoise]);
    const saveFrame = async () => {
        const blob = await new Promise((resolve) => canvas.current?.toBlob(resolve, 'image/png'));
        if (blob && mounted.current) { URL.revokeObjectURL(imageUrl.current); imageUrl.current = URL.createObjectURL(blob); setUrl(imageUrl.current); }
    };
    const start = async () => {
        if (busy) return;
        const run = new AbortController(); controller.current = run; setBusy(true); setError(''); setProgress({ stage: 'loading' });
        let drawn = false;
        try {
            const { renderTrace } = await import('./render.js');
            if (run.signal.aborted) return;
            const result = await renderTrace({ canvas: canvas.current, edge, samples, bounces, textureSize: textures, exposure, denoise, controller: run,
                onProgress: (value) => { if (value.stage === 'render') drawn = true; if (mounted.current) setProgress(value); } });
            if (mounted.current) { await saveFrame(); setProgress({ stage: 'done', ...result }); }
        } catch (issue) {
            if (mounted.current) {
                if (issue.name === 'AbortError') { if (drawn) await saveFrame(); setProgress((p) => ({ ...p, stage: 'stopped' })); }
                else { setError(issue.message); setProgress(null); }
            }
        } finally { if (mounted.current) setBusy(false); controller.current = null; }
    };
    const stages = { loading: tr('Загрузка рендера…', 'Loading renderer…'), scene: tr('Подготовка материалов…', 'Preparing materials…'), bvh: tr('Подготовка геометрии…', 'Preparing geometry…'), materials: tr('Загрузка на GPU…', 'Uploading to GPU…'), render: tr('Рендер', 'Rendering'), done: tr('Готово', 'Done'), stopped: tr('Остановлен', 'Stopped') };
    const filename = `${project?.id || 'scene'}-${current?.name || 'camera'}-render.png`;
    return <dialog ref={dialog} className="focus-dialog trace-studio" aria-label={tr('Трассировка', 'Path tracing')} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
        <header><h2>{tr('Трассировка', 'Path tracing')}</h2><button type="button" className="focus-button" aria-label={tr('Закрыть', 'Close')} onClick={onClose}><FocusIcon name="close" /></button></header>
        <div className="trace-layout"><div className="trace-image"><div className="trace-caption">{current?.name || tr('Текущий ракурс', 'Current view')}<span>{layoutEditor.selectedKey === 'portrait' ? 'Mobile' : 'Desktop'}</span></div>
            <div className="trace-canvas"><canvas ref={canvas} width="1" height="1" />{!progress && !url ? <span>{tr('Рендер текущего ракурса', 'Render the current view')}</span> : null}</div>
            <div className="trace-status" role="status">{progress ? <><span>{stages[progress.stage]}{progress.samples ? ` · ${progress.samples} / ${progress.total || samples}` : ''}{progress.seconds ? ` · ${Math.round(progress.seconds)} ${tr('с', 's')}` : ''}</span>{busy ? <progress max={1} value={progress.stage === 'render' ? progress.samples / samples : progress.progress} /> : null}</> : null}</div>
        </div><div className="trace-controls"><fieldset disabled={busy}>
            <label>{tr('Длинная сторона', 'Long edge')}<select value={edge} onChange={(e) => setEdge(Number(e.target.value))}>{[768, 1536, 2048, 3840].map((n) => <option key={n} value={n}>{n} px</option>)}</select></label>
            <label>{tr('Выборки', 'Samples')}<select value={samples} onChange={(e) => setSamples(Number(e.target.value))}>{[32, 128, 256, 512, 1024].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>{tr('Переотражения', 'Light bounces')}<select value={bounces} onChange={(e) => setBounces(Number(e.target.value))}>{[2, 4, 6, 8, 12].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>{tr('Текстуры', 'Textures')}<select value={textures} onChange={(e) => setTextures(Number(e.target.value))}><option value={1024}>1K</option><option value={2048}>2K</option></select></label>
            <label>{tr('Экспозиция', 'Exposure')}<input type="number" min="-4" max="4" step="0.25" value={exposure} onChange={(e) => setExposure(Math.min(4, Math.max(-4, Number(e.target.value))))} /></label>
            <label className="trace-check"><input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />{tr('Смягчение шума', 'Noise smoothing')}</label>
        </fieldset>{error ? <p className="trace-error" role="alert">{error}</p> : null}
        <div className="trace-actions">{busy ? <button type="button" onClick={() => controller.current?.abort()}>{tr('Остановить', 'Stop')}</button> : <button type="button" className="focus-primary" onClick={start}>{tr('Рендер', 'Render')}</button>}
            {url ? <a href={url} download={filename}>{tr('Сохранить PNG', 'Save PNG')}</a> : null}
        </div></div></div>
    </dialog>;
}
