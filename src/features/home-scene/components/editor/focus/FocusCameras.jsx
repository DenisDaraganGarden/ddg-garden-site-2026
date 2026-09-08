import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { resolveLayoutFrameInset } from '../../../lib/layout';
import { WORK_CAMERA_MAIN_ID } from '../../../lib/sceneCameras';
import { TECHNICAL_FRAMES } from '../../../lib/technicalCameras';
import './FocusCameras.css';

const THUMBNAILS_KEY = 'ddg_home_editor_camera_thumbnails_v1';
const DRAG_THRESHOLD = 5;

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

function captureViewportImage() {
    try {
        const canvas = document.querySelector('.home-editor-render-frame canvas');
        return canvas?.toDataURL?.('image/webp', 0.68) ?? null;
    } catch {
        return null;
    }
}

function useCameraThumbnails() {
    const [thumbnails, setThumbnails] = useState(readThumbnails);
    const capture = useCallback((id) => {
        window.requestAnimationFrame(() => {
            const image = captureViewportImage();
            if (!image) return;
            setThumbnails((previous) => {
                const next = { ...previous, [id]: image };
                writeThumbnails(next);
                return next;
            });
        });
    }, []);
    return [thumbnails, capture];
}

const IconButton = ({ children, label, className = '', ...props }) => (
    <button type="button" className={`focus-camera-icon ${className}`} aria-label={label} title={label} {...props}>{children}</button>
);

function CameraRow({ camera, index, kind, active, total, layoutEditor, onCapture }) {
    const { t } = useLanguage();
    const isWork = kind === 'work';
    const select = isWork ? layoutEditor.selectWorkCamera : layoutEditor.selectCamera;
    const rename = isWork ? layoutEditor.renameWorkCamera : layoutEditor.renameCamera;
    const move = isWork ? layoutEditor.moveWorkCamera : layoutEditor.moveCamera;
    const remove = isWork ? layoutEditor.removeWorkCamera : layoutEditor.removeCamera;
    const canMoveUp = index > 0 && !(isWork && index === 1 && layoutEditor.workCameras?.[0]?.id === WORK_CAMERA_MAIN_ID);
    const canMoveDown = index < total - 1 && !(isWork && camera.id === WORK_CAMERA_MAIN_ID);
    const canRemove = isWork ? camera.id !== WORK_CAMERA_MAIN_ID : total > 1;
    const selectIfNeeded = () => {
        if (!active) select(camera.id);
    };
    const runCapture = () => {
        if (!active) return;
        if (isWork) layoutEditor.captureWorkCamera(camera.id);
        else layoutEditor.captureLayout(layoutEditor.selectedKey);
        onCapture(camera.id);
    };

    return (
        <div className={`focus-camera-row ${active ? 'is-active' : ''} ${!isWork && camera.enabled === false ? 'is-disabled' : ''}`}>
            {!isWork ? (
                <input
                    className="focus-camera-enabled"
                    type="checkbox"
                    checked={Boolean(camera.enabled)}
                    onChange={(event) => layoutEditor.setCameraEnabled(camera.id, event.target.checked)}
                    aria-label={t('homeEditor.controls.cameraEnabled')}
                />
            ) : <span className="focus-camera-kind" aria-hidden="true">{camera.id === WORK_CAMERA_MAIN_ID ? '⌂' : '◇'}</span>}
            <button type="button" className="focus-camera-select" onClick={() => select(camera.id)} aria-pressed={active}>
                <span>{String(index + 1).padStart(2, '0')}</span>
            </button>
            <input
                className="focus-camera-name"
                value={camera.name ?? ''}
                onFocus={selectIfNeeded}
                onChange={(event) => rename(camera.id, event.target.value)}
                aria-label={t('homeEditor.controls.cameraName')}
            />
            {!isWork ? (
                <label className="focus-camera-delay" title={t('homeEditor.controls.cameraDuration')}>
                    <input type="number" min="1" max="3600" step="0.5" value={camera.holdSeconds ?? 8} onFocus={selectIfNeeded} onChange={(event) => layoutEditor.setCameraHoldSeconds(camera.id, parseFloat(event.target.value) || 1)} aria-label={t('homeEditor.controls.cameraDuration')} />
                    <span>{t('homeEditor.controls.seconds')}</span>
                </label>
            ) : null}
            <div className="focus-camera-actions">
                <IconButton label={t('homeEditor.controls.layoutCapture')} onClick={runCapture} disabled={!active}>⌁</IconButton>
                <IconButton label={t('homeEditor.controls.cameraMoveUp')} onClick={() => move(camera.id, -1)} disabled={!canMoveUp}>↑</IconButton>
                <IconButton label={t('homeEditor.controls.cameraMoveDown')} onClick={() => move(camera.id, 1)} disabled={!canMoveDown}>↓</IconButton>
                <IconButton label={t('homeEditor.controls.cameraDelete')} className="is-danger" onClick={() => remove(camera.id)} disabled={!canRemove}>×</IconButton>
            </div>
        </div>
    );
}

function CameraGroup({ kind, layoutEditor, onCapture }) {
    const { t, language } = useLanguage();
    const isWork = kind === 'work';
    const cameras = isWork ? layoutEditor.workCameras ?? [] : layoutEditor.cameras ?? [];
    const activeId = isWork ? layoutEditor.activeWorkCameraId : layoutEditor.activeCameraId;
    const add = isWork ? layoutEditor.addWorkCamera : layoutEditor.addCamera;
    const title = isWork ? t('homeEditor.controls.workCameras') : t('homeEditor.controls.cameras');
    const note = isWork
        ? (t('homeEditor.controls.workCamerasEmpty'))
        : (language === 'ru' ? 'Порядок и включение войдут в проект.' : 'Order and enabled scenes go to the project.');
    return (
        <section className={`focus-camera-group focus-camera-group--${kind}`} aria-label={title}>
            <header>
                <div><strong>{title}</strong><small>{note}</small></div>
                <IconButton label={isWork ? t('homeEditor.controls.workCameraAdd') : t('homeEditor.controls.cameraAdd')} onClick={add}>+</IconButton>
            </header>
            <div className="focus-camera-list">
                {cameras.map((camera, index) => <CameraRow key={camera.id} camera={camera} index={index} kind={kind} active={camera.id === activeId} total={cameras.length} layoutEditor={layoutEditor} onCapture={onCapture} />)}
                {isWork && cameras.length === 0 ? <p className="focus-camera-empty">{t('homeEditor.controls.workCamerasEmpty')}</p> : null}
            </div>
        </section>
    );
}

function FocusCameraTuning({ settings, layoutEditor, onCapture }) {
    const { t } = useLanguage();
    const isWork = Boolean(layoutEditor.activeWorkCameraId);
    const layouts = layoutEditor.currentScene?.layouts ?? settings.layouts ?? {};
    const frameInset = resolveLayoutFrameInset(layouts, layoutEditor.selectedKey);
    const isCustomized = Boolean(layouts?.[layoutEditor.selectedKey]?.customized);
    const fadeSeconds = layoutEditor.slideshow?.fadeSeconds ?? 1.2;
    const activeId = isWork ? layoutEditor.activeWorkCameraId : layoutEditor.activeCameraId;
    const capture = () => {
        if (isWork) layoutEditor.captureWorkCamera(activeId);
        else layoutEditor.captureLayout(layoutEditor.selectedKey);
        onCapture(activeId);
    };
    return (
        <section className="focus-camera-tuning" aria-label={t('homeEditor.controls.layoutBucket')}>
            <div className="focus-camera-tuning-line">
                <label><span>{t('homeEditor.controls.frameInset')}</span><input type="range" min="0" max="32" step="0.5" value={frameInset * 100} onChange={(event) => layoutEditor.onFrameInsetChange(parseFloat(event.target.value) / 100)} /></label>
                <output>{(frameInset * 100).toFixed(1)}%</output>
            </div>
            <div className="focus-camera-tuning-actions">
                <button type="button" onClick={capture}>{t('homeEditor.controls.layoutCapture')}</button>
                {!isWork ? <button type="button" onClick={() => layoutEditor.resetLayout(layoutEditor.selectedKey)} disabled={!isCustomized}>{t('homeEditor.controls.layoutReset')}</button> : null}
            </div>
            <div className="focus-camera-slideshow">
                <label><input type="checkbox" checked={Boolean(layoutEditor.slideshow?.enabled)} onChange={(event) => layoutEditor.updateSlideshow({ enabled: event.target.checked })} /> {t('homeEditor.controls.slideshow')}</label>
                <label><span>{t('homeEditor.controls.cameraFade')}</span><input type="number" min="0" max="30" step="0.1" value={fadeSeconds} onChange={(event) => layoutEditor.updateSlideshow({ fadeSeconds: Math.max(0, parseFloat(event.target.value) || 0) })} /></label>
            </div>
        </section>
    );
}

export function FocusCameraManager({ settings, layoutEditor }) {
    const [, captureImage] = useCameraThumbnails();
    if (!layoutEditor) return null;
    return <div className="focus-camera-manager"><CameraGroup kind="work" layoutEditor={layoutEditor} onCapture={captureImage} /><CameraGroup kind="scene" layoutEditor={layoutEditor} onCapture={captureImage} /><FocusCameraTuning settings={settings} layoutEditor={layoutEditor} onCapture={captureImage} /></div>;
}

function FocusCameraTile({ camera, active, onSelect, thumbnail }) {
    return <button type="button" className={`focus-film-tile ${active ? 'is-active' : ''}`} onClick={onSelect} aria-pressed={active} title={camera.name}>
        {thumbnail ? <img src={thumbnail} alt="" /> : <span className="focus-film-empty" aria-hidden="true" />}
        <span>{camera.name}</span>
    </button>;
}

export function FocusCameraStrip({ layoutEditor, className = '' }) {
    const { t } = useLanguage();
    const [thumbnails, captureImage] = useCameraThumbnails();
    const [menuOpen, setMenuOpen] = useState(false);
    const scrollerRef = useRef(null);
    const scrollLeftRef = useRef(0);
    const dragRef = useRef(null);
    const justDraggedRef = useRef(false);
    const all = useMemo(() => [
        ...(layoutEditor?.workCameras ?? []).map((camera) => ({ ...camera, kind: 'work' })),
        ...(layoutEditor?.cameras ?? []).map((camera) => ({ ...camera, kind: 'scene' })),
    ], [layoutEditor?.workCameras, layoutEditor?.cameras]);

    useLayoutEffect(() => {
        if (scrollerRef.current) scrollerRef.current.scrollLeft = scrollLeftRef.current;
    }, [all.length, layoutEditor?.activeCameraId, layoutEditor?.activeWorkCameraId]);
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
        captureImage(id);
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
        <div ref={scrollerRef} className="focus-film-scroll" tabIndex="0" onScroll={(event) => { scrollLeftRef.current = event.currentTarget.scrollLeft; }} onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); event.currentTarget.scrollLeft += event.deltaY; } }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={(event) => { if (justDraggedRef.current) { event.preventDefault(); event.stopPropagation(); justDraggedRef.current = false; } }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -160 : 160, behavior: 'smooth' }); } }}>
            {all.map((camera, index) => <React.Fragment key={camera.id}>{index === 0 || camera.kind !== all[index - 1].kind ? <span className={`focus-film-label focus-film-label--${camera.kind}`}>{camera.kind === 'work' ? t('homeEditor.controls.workCameras') : t('homeEditor.controls.cameras')}</span> : null}<FocusCameraTile camera={camera} active={active(camera)} onSelect={() => select(camera)} thumbnail={thumbnails[camera.id]} /></React.Fragment>)}
        </div>
        <div className="focus-film-add"><IconButton label={t('homeEditor.controls.cameraAdd')} onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>+</IconButton>{menuOpen ? <div role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); layoutEditor.addWorkCamera(); }}>{t('homeEditor.controls.workCameraAdd')}</button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); layoutEditor.addCamera(); }}>{t('homeEditor.controls.cameraAdd')}</button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); captureActive(); }}>{t('homeEditor.controls.layoutCapture')}</button></div> : null}</div>
    </div>;
}

export function FocusTechnicalViews({ settings, layoutEditor }) {
    const { language, t } = useLanguage();
    if (!layoutEditor) return null;
    const preview = (frame) => frame.object ? layoutEditor.frameObject?.(frame.object, frame.options) : layoutEditor.previewPose?.(frame.pose(settings));
    return <div className="focus-technical-views" role="menu" aria-label={t('homeEditor.controls.technicalFrames')}>
        {TECHNICAL_FRAMES.map((frame) => <button type="button" key={frame.id} role="menuitem" onClick={() => preview(frame)}>{language === 'ru' ? frame.ru : frame.en}</button>)}
    </div>;
}
