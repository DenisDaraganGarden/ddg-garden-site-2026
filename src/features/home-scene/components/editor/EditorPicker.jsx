import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { sceneHitForObject3D } from '../../lib/sceneObjects';
import { outsideIsolation } from '../../../../placed/sketchupModel.js';

// Выбор объекта прямо в сцене. Луч идёт от курсора, попадание поднимается вверх
// по родителям до знакомого имени, и дальше выбор — это тот же путь в дереве,
// который ставит клик в списке. Второго источника истины не появляется:
// useEditorTool на этом и построен.
//
// Короткое нажатие выбирает, протяжка остаётся вращением сцены — иначе в режиме
// выбора нельзя было бы повернуть камеру. Порог в пикселях, потому что рука
// всегда сдвигает мышь на пару точек, даже когда человек «просто кликнул».
//
// ПКМ живёт по тем же правилам: протяжка правой кнопкой — это панорама
// OrbitControls, а короткое нажатие открывает контекстное меню. Родное меню
// браузера на холсте гасит WaterCameraRig, поэтому ловится не 'contextmenu',
// а пара pointerdown/pointerup — так порог протяжки работает одинаково на всех
// платформах (в Chrome на macOS 'contextmenu' приходит ещё до движения мыши).
const CLICK_SLOP = 4;
// Двойной щелчок — два коротких нажатия в одном месте подряд: в модели
// SketchUp он открывает выбранный компонент (usePlacedEditor); Shift — добавить
// к выбору.
const DOUBLE_MS = 400, DOUBLE_SLOP = 6;
// Ручка манипулятора, которая сейчас нарисована. Его невидимые части —
// сборщики, помощники других режимов, линии осей длиной в километры — лежат
// в скрытых группах, и щелчок сквозь них проходит, как раньше.
const isShownGizmo = (object) => {
    let gizmo = false;
    for (let node = object; node; node = node.parent) {
        if (!node.visible) return false;
        if (node.isTransformControlsGizmo) gizmo = true;
    }
    return gizmo;
};

export default function EditorPicker({ enabled, onPick, onContextMenu }) {
    const gl = useThree((state) => state.gl);
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const raycaster = useThree((state) => state.raycaster);

    // В dev сцена доступна снаружи — для проб и справочника, как каталог контролов.
    useEffect(() => {
        if (import.meta.env.DEV) window.__ouroborosScene = scene;
    }, [scene]);

    useEffect(() => {
        const element = gl.domElement;
        let pressed = null, last = null;

        // Первое попадание, за которым стоит объект редактора: служебные
        // плоскости и отладочные помощники имени не имеют и пропускаются.
        const hitAt = (event) => {
            const rect = element.getBoundingClientRect();
            raycaster.setFromCamera({
                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
            }, camera);

            for (const hit of raycaster.intersectObjects(scene.children, true)) {
                // Щелчок по ручке манипулятора — не выбор того, что за ней.
                if (isShownGizmo(hit.object)) return null;
                // Q в группе модели: спрятанного вокруг неё для щелчка нет.
                if (outsideIsolation(hit.object)) continue;
                const found = hit.object.visible ? sceneHitForObject3D(hit.object, hit) : null;
                if (found) return found;
            }

            return null;
        };

        const handlePointerDown = (event) => {
            pressed = event.button === 0 || event.button === 2
                ? { button: event.button, x: event.clientX, y: event.clientY }
                : null;
        };

        const handlePointerUp = (event) => {
            const start = pressed;
            pressed = null;

            if (!start || start.button !== event.button) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;

            if (event.button === 2) {
                if (typeof onContextMenu !== 'function') return;
                onContextMenu({ x: event.clientX, y: event.clientY, ...(hitAt(event) ?? { node: null, root: null }) });
                return;
            }

            if (!enabled || typeof onPick !== 'function') return;
            const found = hitAt(event);
            const double = Boolean(last && event.timeStamp - last.at < DOUBLE_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOUBLE_SLOP);
            last = double ? null : { at: event.timeStamp, x: event.clientX, y: event.clientY };
            if (found) onPick(found.node, { ...found, double, shift: event.shiftKey });
        };

        element.addEventListener('pointerdown', handlePointerDown);
        element.addEventListener('pointerup', handlePointerUp);

        return () => {
            element.removeEventListener('pointerdown', handlePointerDown);
            element.removeEventListener('pointerup', handlePointerUp);
        };
    }, [camera, enabled, gl, onContextMenu, onPick, raycaster, scene]);

    return null;
}
