import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { resolveLayoutFrameInset } from '../../../lib/layout';
import { WORK_CAMERA_MAIN_ID } from '../../../lib/sceneCameras';
import { TECHNICAL_FRAMES } from '../../../lib/technicalCameras';
import { technicalFrameAvailable } from '../../../lib/sceneObjects';
import { EDITOR_THUMBNAIL_READY, requestEditorThumbnail } from '../../../../../components/effects/editorThumbnailCapture';
import { FocusCheckboxControl, FocusRangeControl } from './FocusControlComponents';
import { FocusControlNumberInput } from './FocusControlNumberInput';
import { FocusControlScope } from './FocusControlsContext';
import { FocusContextMenu } from './FocusContextMenu';
import './FocusCameras.css';

const THUMBNAILS_KEY = 'ddg_home_editor_camera_thumbnails_v1';
const DRAG_THRESHOLD = 5;
const THUMBNAIL_EVENT = EDITOR_THUMBNAIL_READY;
const thumbnailKey = (id, layoutKey) => `${id}:${layoutKey}`;

function readThumbnails() {
    if (typeof window === 'undefined') return {};
    try {
        return JSON.parse(window.localStorage.getItem(THUMBNAILS_KEY) || '{}');
    } catch {
        return {};
    }
}

function writeThumbnails(value) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(THUMBNAILS_KEY, JSON.stringify(value));
    } catch {
        // Camera images are a convenience only. Scene saves must never depend on them.
    }
}

function useCameraThumbnails() {
    const [thumbnails, setThumbnails] = useState(readThumbnails);
    useEffect(() => {
        const update = (event) => setThumbnails((previous) => {
            const next = { ...previous, [event.detail.key]: event.detail.image };
            writeThumbnails(next);
            return next;
        });
        window.addEventListener(THUMBNAIL_EVENT, update);
        return () => window.removeEventListener(THUMBNAIL_EVENT, update);
    }, []);
    const capture = useCallback((id, layoutKey) => {
        requestEditorThumbnail(thumbnailKey(id, layoutKey));
    }, []);
    return [thumbnails, capture];
}

const IconButton = ({ children, label, className = '', ...props }) => (
    <button type="button" className={`focus-camera-icon ${className}`} aria-label={label} title={label} {...props}>{children}</button>
);

function CameraRow({ camera, index, kind, active, layoutEditor, onCapture, onOpenSettings }) {
    const { t, language } = useLanguage();
    const isWork = kind === 'work';
    const select = isWork ? layoutEditor.selectWorkCamera : layoutEditor.selectCamera;
    const runCapture = () => {
        if (!active) return;
        if (isWork) layoutEditor.captureWorkCamera(camera.id);
        else layoutEditor.captureLayout(layoutEditor.selectedKey);
        onCapture(camera.id, layoutEditor.selectedKey);
    };
    // ПКМ по карточке — те же настройки, что под «•••»: переименование и порядок
    // живут в диалоге, второго списка действий заводить незачем.
    return <article className={`focus-camera-card ${active ? 'is-active' : ''} ${!isWork && camera.enabled === false ? 'is-disabled' : ''}`} onContextMenu={(event) => { if (event.shiftKey) return; event.preventDefault(); onOpenSettings({ camera, kind, index }); }}>
        <div className="focus-camera-card-top">
            <button type="button" className="focus-camera-card-select" onClick={() => select(camera.id)} aria-pressed={active}>
                <span className="focus-camera-card-index">{String(index + 1).padStart(2, '0')}</span>
                <span>{camera.name || (isWork ? t('homeEditor.controls.workCameras') : t('homeEditor.controls.camera'))}</span>
            </button>
            {active ? <IconButton label={t('homeEditor.controls.layoutCapture')} onClick={runCapture}>⌁</IconButton> : null}
            <IconButton label={language === 'ru' ? 'Настройки камеры' : 'Camera settings'} onClick={() => onOpenSettings({ camera, kind, index })}>•••</IconButton>
        </div>
        <small>Desktop · Mobile</small>
    </article>;
}

function CameraSettingsDialog({ item, layoutEditor, onCapture, onClose }) {
    const { t, language } = useLanguage();
    const dialogRef = useRef(null);
    const isWork = item?.kind === 'work';
    const list = isWork ? layoutEditor.workCameras ?? [] : layoutEditor.cameras ?? [];
    const camera = item ? list.find((candidate) => candidate.id === item.camera.id) : null;
    const index = camera ? list.findIndex((candidate) => candidate.id === camera.id) : -1;
    useEffect(() => {
        const dialog = dialogRef.current;
        if (item && dialog && !dialog.open) dialog.showModal();
    }, [item]);
    if (!item || !camera) return null;
    const rename = isWork ? layoutEditor.renameWorkCamera : layoutEditor.renameCamera;
    const move = isWork ? layoutEditor.moveWorkCamera : layoutEditor.moveCamera;
    const remove = isWork ? layoutEditor.removeWorkCamera : layoutEditor.removeCamera;
    const active = isWork ? camera.id === layoutEditor.activeWorkCameraId : !layoutEditor.activeWorkCameraId && camera.id === layoutEditor.activeCameraId;
    const canMoveUp = index > 0 && !(isWork && index === 1 && list[0]?.id === WORK_CAMERA_MAIN_ID);
    const canMoveDown = index < list.length - 1 && !(isWork && camera.id === WORK_CAMERA_MAIN_ID);
    const canRemove = isWork ? camera.id !== WORK_CAMERA_MAIN_ID : list.length > 1;
    const capture = () => {
        if (!active) return;
        if (isWork) layoutEditor.captureWorkCamera(camera.id);
        else layoutEditor.captureLayout(layoutEditor.selectedKey);
        onCapture(camera.id, layoutEditor.selectedKey);
    };
    return <dialog ref={dialogRef} className="focus-camera-dialog" aria-labelledby="focus-camera-dialog-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
        <header><strong id="focus-camera-dialog-title">{camera.name}</strong><IconButton label={language === 'ru' ? 'Закрыть' : 'Close'} onClick={() => dialogRef.current?.close()}>×</IconButton></header>
        <label className="focus-camera-dialog-field"><span>{t('homeEditor.controls.cameraName')}</span><input value={camera.name ?? ''} onChange={(event) => rename(camera.id, event.target.value)} autoFocus /></label>
        {!isWork ? <><label className="focus-camera-dialog-check"><input type="checkbox" checked={Boolean(camera.enabled)} onChange={(event) => layoutEditor.setCameraEnabled(camera.id, event.target.checked)} /> {t('homeEditor.controls.cameraEnabled')}</label><label className="focus-camera-dialog-field"><span>{t('homeEditor.controls.cameraDuration')}</span><FocusControlNumberInput controlId={`camera-hold-${camera.id}`} value={camera.holdSeconds ?? 8} min={1} max={3600} step={0.5} onChange={(event) => layoutEditor.setCameraHoldSeconds(camera.id, parseFloat(event.target.value) || 1)} aria-label={t('homeEditor.controls.cameraDuration')} /></label></> : null}
        <div className="focus-camera-dialog-actions"><button type="button" onClick={capture} disabled={!active}>{t('homeEditor.controls.layoutCapture')}</button><button type="button" onClick={() => { move(camera.id, -1); dialogRef.current?.close(); }} disabled={!canMoveUp}>↑</button><button type="button" onClick={() => { move(camera.id, 1); dialogRef.current?.close(); }} disabled={!canMoveDown}>↓</button><button type="button" className="is-danger" onClick={() => { remove(camera.id); dialogRef.current?.close(); }} disabled={!canRemove}>×</button></div>
    </dialog>;
}
function CameraGroup({ kind, layoutEditor, onCapture, onOpenSettings }) {
    const { t, language } = useLanguage();
    const isWork = kind === 'work';
    const cameras = isWork ? layoutEditor.workCameras ?? [] : layoutEditor.cameras ?? [];
    const activeId = isWork ? layoutEditor.activeWorkCameraId : (layoutEditor.activeWorkCameraId ? null : layoutEditor.activeCameraId);
    const add = isWork ? layoutEditor.addWorkCamera : layoutEditor.addCamera;
    const title = isWork ? t('homeEditor.controls.workCameras') : (language === 'ru' ? 'Сцены' : 'Scenes');
    return <section className={`focus-camera-group focus-camera-group--${kind}`} aria-label={title}>
        <header><strong>{title}</strong><IconButton label={isWork ? t('homeEditor.controls.workCameraAdd') : t('homeEditor.controls.cameraAdd')} onClick={add}>+</IconButton></header>
        <div className="focus-camera-list">{cameras.map((camera, index) => <CameraRow key={camera.id} camera={camera} index={index} kind={kind} active={camera.id === activeId} layoutEditor={layoutEditor} onCapture={onCapture} onOpenSettings={onOpenSettings} />)}</div>
    </section>;
}

export function FocusCameraParameters({ settings, layoutEditor, catalogOnly = false }) {
    const { t } = useLanguage();
    if (!layoutEditor) return null;
    const layouts = layoutEditor.currentScene?.layouts ?? settings.layouts ?? {};
    const frameInset = resolveLayoutFrameInset(layouts, layoutEditor.selectedKey);
    const fadeSeconds = layoutEditor.slideshow?.fadeSeconds ?? 1.2;
    return <FocusControlScope path="cameras/camera" groupLabel={t('homeEditor.controls.cameras')} nodeLabel={t('homeEditor.controls.camera')} catalogOnly={catalogOnly}>
        <FocusRangeControl controlId="frameInset" label={t('homeEditor.controls.frameInset')} value={frameInset * 100} min={0} max={32} step={0.5} unit="%" formatValue={(value) => Number(value).toFixed(1)} onChange={(event) => layoutEditor.onFrameInsetChange(parseFloat(event.target.value) / 100)} />
        <FocusCheckboxControl controlId="slideshowEnabled" label={t('homeEditor.controls.slideshow')} checked={Boolean(layoutEditor.slideshow?.enabled)} onChange={(event) => layoutEditor.updateSlideshow({ enabled: event.target.checked })} />
        <FocusRangeControl controlId="slideshowFade" label={t('homeEditor.controls.cameraFade')} value={fadeSeconds} min={0} max={30} step={0.1} unit={t('homeEditor.controls.seconds')} formatValue={(value) => Number(value).toFixed(1)} onChange={(event) => layoutEditor.updateSlideshow({ fadeSeconds: Math.max(0, parseFloat(event.target.value) || 0) })} />
    </FocusControlScope>;
}

function FocusCameraTuning({ settings, layoutEditor }) {
    const { t, language } = useLanguage();
    const isWork = Boolean(layoutEditor.activeWorkCameraId);
    const layouts = layoutEditor.currentScene?.layouts ?? settings.layouts ?? {};
    const isCustomized = Boolean(layouts?.[layoutEditor.selectedKey]?.customized);
    return <details className="focus-camera-tuning">
        <summary>{language === 'ru' ? 'Рамка и показ' : 'Frame and playback'}</summary>
        <div className="focus-camera-tuning-body"><FocusCameraParameters settings={settings} layoutEditor={layoutEditor} />
        {!isWork ? <button type="button" className="focus-camera-reset" onClick={() => layoutEditor.resetLayout(layoutEditor.selectedKey)} disabled={!isCustomized}>{t('homeEditor.controls.layoutReset')}</button> : null}</div>
    </details>;
}
export function FocusCameraManager({ settings, layoutEditor }) {
    const [, captureImage] = useCameraThumbnails();
    const [settingsItem, setSettingsItem] = useState(null);
    if (!layoutEditor) return null;
    return <div className="focus-camera-manager"><CameraGroup kind="work" layoutEditor={layoutEditor} onCapture={captureImage} onOpenSettings={setSettingsItem} /><CameraGroup kind="scene" layoutEditor={layoutEditor} onCapture={captureImage} onOpenSettings={setSettingsItem} /><FocusCameraTuning settings={settings} layoutEditor={layoutEditor} /><CameraSettingsDialog item={settingsItem} layoutEditor={layoutEditor} onCapture={captureImage} onClose={() => setSettingsItem(null)} /></div>;
}

function FocusCameraTile({ camera, active, onSelect, onMenu, thumbnail }) {
    return <button type="button" className={`focus-film-tile ${active ? 'is-active' : ''}`} onClick={onSelect} onContextMenu={onMenu} aria-pressed={active} title={camera.name}>
        {thumbnail ? <img src={thumbnail} alt="" /> : <span className="focus-film-empty" aria-hidden="true" />}
        <span>{camera.name}</span>
    </button>;
}

export function FocusCameraStrip({ layoutEditor, className = '' }) {
    const { t, language } = useLanguage();
    const [thumbnails, captureImage] = useCameraThumbnails();
    const [menuOpen, setMenuOpen] = useState(false);
    const [tileMenu, setTileMenu] = useState(null);
    const scrollerRef = useRef(null);
    const scrollLeftRef = useRef(0);
    const dragRef = useRef(null);
    const justDraggedRef = useRef(false);
    const all = useMemo(() => [
        ...(layoutEditor?.workCameras ?? []).map((camera) => ({ ...camera, kind: 'work' })),
        ...(layoutEditor?.cameras ?? []).map((camera) => ({ ...camera, kind: 'scene' })),
    ], [layoutEditor?.workCameras, layoutEditor?.cameras]);
    const activeCameraId = layoutEditor?.activeWorkCameraId ?? layoutEditor?.activeCameraId;
    const activeThumbnailKey = activeCameraId ? thumbnailKey(activeCameraId, layoutEditor?.selectedKey) : null;

    useEffect(() => {
        if (!activeThumbnailKey || thumbnails[activeThumbnailKey]) return undefined;
        const timeout = window.setTimeout(() => captureImage(activeCameraId, layoutEditor.selectedKey), 850);
        return () => window.clearTimeout(timeout);
    }, [activeCameraId, activeThumbnailKey, captureImage, layoutEditor?.selectedKey, thumbnails]);

    useLayoutEffect(() => {
        if (scrollerRef.current) scrollerRef.current.scrollLeft = scrollLeftRef.current;
    }, [all.length, layoutEditor?.activeCameraId, layoutEditor?.activeWorkCameraId]);
    useEffect(() => {
        const node = scrollerRef.current;
        if (!node) return undefined;
        const wheel = (event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.preventDefault();
            node.scrollLeft += event.deltaY;
        };
        node.addEventListener('wheel', wheel, { passive: false });
        return () => node.removeEventListener('wheel', wheel);
    }, []);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const close = (event) => { if (!event.target.closest?.('.focus-film-strip')) setMenuOpen(false); };
        document.addEventListener('pointerdown', close, true);
        return () => document.removeEventListener('pointerdown', close, true);
    }, [menuOpen]);
    if (!layoutEditor) return null;
    const select = (camera) => camera.kind === 'work' ? layoutEditor.selectWorkCamera(camera.id) : layoutEditor.selectCamera(camera.id);
    const active = (camera) => camera.kind === 'work' ? camera.id === layoutEditor.activeWorkCameraId : !layoutEditor.activeWorkCameraId && camera.id === layoutEditor.activeCameraId;
    const captureActive = () => {
        const id = layoutEditor.activeWorkCameraId ?? layoutEditor.activeCameraId;
        if (layoutEditor.activeWorkCameraId) layoutEditor.captureWorkCamera(id);
        else layoutEditor.captureLayout(layoutEditor.selectedKey);
        captureImage(id, layoutEditor.selectedKey);
    };
    // ПКМ по плитке: выбрать, переснять ракурс или миниатюру, удалить. Защиты те
    // же, что в диалоге камеры: главная рабочая и последняя сцена не удаляются.
    const tileMenuItems = (camera) => {
        const isWork = camera.kind === 'work';
        const list = isWork ? layoutEditor.workCameras ?? [] : layoutEditor.cameras ?? [];
        const canRemove = isWork ? camera.id !== WORK_CAMERA_MAIN_ID : list.length > 1;
        return [
            { label: language === 'ru' ? 'Выбрать' : 'Select', icon: 'camera', disabled: active(camera), onSelect: () => select(camera) },
            { label: t('homeEditor.controls.layoutCapture'), icon: 'capture', disabled: !active(camera), onSelect: captureActive },
            { label: language === 'ru' ? 'Обновить миниатюру' : 'Refresh thumbnail', icon: 'eye', onSelect: () => captureImage(camera.id, layoutEditor.selectedKey) },
            '-',
            { label: language === 'ru' ? 'Удалить' : 'Delete', icon: 'close', danger: true, disabled: !canRemove, onSelect: () => (isWork ? layoutEditor.removeWorkCamera : layoutEditor.removeCamera)(camera.id) },
        ];
    };
    const startDrag = (event) => {
        if (event.button !== 0) return;
        dragRef.current = { id: event.pointerId, x: event.clientX, scroll: event.currentTarget.scrollLeft, dragging: false };
        justDraggedRef.current = false;
    };
    const moveDrag = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        if (!drag.dragging && Math.abs(dx) > DRAG_THRESHOLD) {
            drag.dragging = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.dataset.dragging = 'true';
        }
        if (drag.dragging) event.currentTarget.scrollLeft = drag.scroll - dx;
    };
    const endDrag = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        justDraggedRef.current = drag.dragging;
        delete event.currentTarget.dataset.dragging;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        dragRef.current = null;
    };
    return <div className={`focus-film-strip ${className}`} aria-label={t('homeEditor.controls.cameras')}>
        <div ref={scrollerRef} className="focus-film-scroll" tabIndex="0" onScroll={(event) => { scrollLeftRef.current = event.currentTarget.scrollLeft; }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={(event) => { if (justDraggedRef.current) { event.preventDefault(); event.stopPropagation(); justDraggedRef.current = false; } }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -160 : 160, behavior: 'smooth' }); } }}>
            {all.map((camera, index) => <React.Fragment key={camera.id}>{index === 0 || camera.kind !== all[index - 1].kind ? <span className={`focus-film-label focus-film-label--${camera.kind}`}>{camera.kind === 'work' ? t('homeEditor.controls.workCameras') : t('homeEditor.controls.cameras')}</span> : null}<FocusCameraTile camera={camera} active={active(camera)} onSelect={() => select(camera)} onMenu={(event) => { if (event.shiftKey) return; event.preventDefault(); setTileMenu({ x: event.clientX, y: event.clientY, camera }); }} thumbnail={thumbnails[thumbnailKey(camera.id, layoutEditor.selectedKey)]} /></React.Fragment>)}
        </div>
        {tileMenu ? <FocusContextMenu x={tileMenu.x} y={tileMenu.y} title={tileMenu.camera.name} items={tileMenuItems(tileMenu.camera)} onClose={() => setTileMenu(null)} /> : null}
        <div className="focus-film-add"><IconButton label={t('homeEditor.controls.cameraAdd')} onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>+</IconButton>{menuOpen ? <div role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); layoutEditor.addWorkCamera(); }}>{t('homeEditor.controls.workCameraAdd')}</button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); layoutEditor.addCamera(); }}>{t('homeEditor.controls.cameraAdd')}</button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); captureActive(); }}>{t('homeEditor.controls.layoutCapture')}</button></div> : null}</div>
    </div>;
}

export function FocusTechnicalViews({ settings, layoutEditor, frame: frameMask }) {
    const { language, t } = useLanguage();
    if (!layoutEditor) return null;
    const preview = (frame) => frame.object ? layoutEditor.frameObject?.(frame.object, frame.options) : layoutEditor.previewPose?.(frame.pose(settings));
    return <div className="focus-technical-views" role="menu" aria-label={t('homeEditor.controls.technicalFrames')}>
        {/* Рамка кадра — не ракурс, а способ показа: чёрная обрезает так, как обрежет сайт. */}
        {frameMask ? <><button type="button" role="menuitemcheckbox" aria-checked={frameMask.solid} className="focus-technical-views__check" onClick={frameMask.toggle}><span aria-hidden="true">{frameMask.solid ? '✓' : ''}</span>{language === 'ru' ? 'Чёрная рамка кадра' : 'Solid frame mask'}</button><hr /></> : null}
        {/* Ракурс на выключенный объект — пустой кадр, его в списке нет. */}
        {TECHNICAL_FRAMES.filter((frame) => technicalFrameAvailable(frame, settings)).map((frame) => <button type="button" key={frame.id} role="menuitem" onClick={() => preview(frame)}>{language === 'ru' ? frame.ru : frame.en}</button>)}
    </div>;
}
