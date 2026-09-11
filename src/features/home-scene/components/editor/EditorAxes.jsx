import React from 'react';

// Ориентир осей в углу вьюпорта, как в любом 3D-пакете. Под водой или с
// нестандартного ракурса стрелки манипулятора читаются плохо: красная смотрит
// куда-то вниз, синяя вбок, и непонятно, где вообще «вперёд». Тройка в углу
// поворачивается вместе с камерой и отвечает на этот вопрос всегда.
//
// Цвета те же, что у манипулятора: X красная, Y зелёная, Z синяя.
// Щелчки по осям выключены — камерой управляет свой рычаг, и прыжок «смотреть
// вдоль X» сбивал бы сохранённый ракурс.
const LazyAxes = React.lazy(() => Promise.all([
    import('@react-three/drei/core/GizmoHelper.js'),
    import('@react-three/drei/core/GizmoViewport.js'),
]).then(([helper, viewport]) => ({
    default: function Axes() {
        const { GizmoHelper } = helper;
        const { GizmoViewport } = viewport;
        return (
            // Постобработка рисует кадр с приоритетом 100 — тройка должна лечь после неё.
            <GizmoHelper alignment="bottom-right" margin={[64, 64]} renderPriority={101}>
                <GizmoViewport
                    disabled
                    axisColors={['#e0554d', '#8fbf5a', '#4f7fe0']}
                    labelColor="#f4f2ea"
                    axisHeadScale={0.9}
                    hideNegativeAxes
                />
            </GizmoHelper>
        );
    },
})));

export default function EditorAxes() {
    return (
        <React.Suspense fallback={null}>
            <LazyAxes />
        </React.Suspense>
    );
}
