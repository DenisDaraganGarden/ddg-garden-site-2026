import { useCallback, useEffect, useRef } from 'react';
import { EDITOR_THUMBNAIL_READY, requestEditorThumbnail } from '../components/effects/editorThumbnailCapture';
import { projectStore } from '../features/engine/projectApi';
import { getView, PLAN_CAMERA, siteNorth, subscribeView } from './north.js';

// Снимок генплана для отчёта: пока выбрана камера «Генплан» и кадр смотрит
// прямо вниз, через полторы секунды тишины кадр целиком (до 2400 px) уходит в
// папку проекта вместе с тем, где стояла камера (projectStore.writePlan):
// отчёт по нему подписывает цветники и ставит масштаб.
const QUIET_MS = 1500;
export const PLAN_KEY = 'plan:';

export function usePlanCapture({ projectId, settings, capturePose }) {
    const camera = settings.workCameras?.find((item) => item.id === settings.activeWorkCameraId);
    const active = Boolean(projectId && camera?.name === PLAN_CAMERA);
    const north = siteNorth(settings);
    const pose = useRef(capturePose);
    pose.current = capturePose;
    const getPose = useCallback(() => pose.current?.(), []);
    useEffect(() => {
        if (!active) return undefined;
        const key = `${PLAN_KEY}${projectId}`;
        let timer = 0, view = null;
        const shoot = () => {
            const now = getView(), at = getPose();
            if (!at || !now.down) return;
            view = { position: at.cameraPosition, target: at.cameraTarget, fov: at.cameraFov, bearing: now.bearing, north };
            requestEditorThumbnail(key, { width: 2400, quality: 0.9 });
        };
        const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(shoot, QUIET_MS); };
        const store = (event) => {
            if (event.detail?.key !== key || !view) return;
            projectStore.savePlan(projectId, event.detail.image, view).catch(() => {
                // Снимок — удобство отчёта; сцена от него не зависит.
            });
            view = null;
        };
        window.addEventListener(EDITOR_THUMBNAIL_READY, store);
        const off = subscribeView(schedule);
        schedule();
        return () => { off(); window.clearTimeout(timer); window.removeEventListener(EDITOR_THUMBNAIL_READY, store); };
    }, [active, projectId, north, settings, getPose]);
}
