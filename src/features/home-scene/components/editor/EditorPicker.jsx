import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { sceneNodeForObject3D } from '../../lib/sceneObjects';

// Выбор объекта прямо в сцене. Луч идёт от курсора, попадание поднимается вверх
// по родителям до знакомого имени, и дальше выбор — это тот же путь в дереве,
// который ставит клик в списке. Второго источника истины не появляется:
// useEditorTool на этом и построен.
//
// Короткое нажатие выбирает, протяжка остаётся вращением сцены — иначе в режиме
// выбора нельзя было бы повернуть камеру. Порог в пикселях, потому что рука
// всегда сдвигает мышь на пару точек, даже когда человек «просто кликнул».
const CLICK_SLOP = 4;

export default function EditorPicker({ enabled, onPick }) {
    const gl = useThree((state) => state.gl);
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const raycaster = useThree((state) => state.raycaster);

    useEffect(() => {
        if (!enabled || typeof onPick !== 'function') {
            return undefined;
        }

        const element = gl.domElement;
        let pressed = null;

        const handlePointerDown = (event) => {
            pressed = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
        };

        const handlePointerUp = (event) => {
            const start = pressed;
            pressed = null;

            if (!start || event.button !== 0) {
                return;
            }

            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) {
                return;
            }

            const rect = element.getBoundingClientRect();
            raycaster.setFromCamera({
                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
            }, camera);

            // Первое попадание, за которым стоит объект редактора: служебные
            // плоскости и отладочные помощники имени не имеют и пропускаются.
            for (const hit of raycaster.intersectObjects(scene.children, true)) {
                const node = hit.object.visible ? sceneNodeForObject3D(hit.object) : null;

                if (node) {
                    onPick(node);
                    return;
                }
            }
        };

        element.addEventListener('pointerdown', handlePointerDown);
        element.addEventListener('pointerup', handlePointerUp);

        return () => {
            element.removeEventListener('pointerdown', handlePointerDown);
            element.removeEventListener('pointerup', handlePointerUp);
        };
    }, [camera, enabled, gl, onPick, raycaster, scene]);

    return null;
}
