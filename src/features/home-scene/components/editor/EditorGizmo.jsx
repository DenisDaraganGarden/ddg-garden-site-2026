/* eslint-disable react-refresh/only-export-components -- Правило осей и его подсказка — одно знание, живут вместе. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const LazyTransformControls = React.lazy(() => import('@react-three/drei/core/TransformControls.js').then((module) => ({
    default: module.TransformControls,
})));

// What each object is allowed to be dragged by. The rule is not cosmetic: a
// channel a procedural system owns must not be editable by hand, or the gizmo
// and the simulation fight and the author loses either way.
//
//  - The boat floats. Its height comes from the buoyancy probes plus the height
//    offset, and it only ever yaws, so vertical translation and pitch/roll are
//    off. Both hulls are one mesh, so scale stays uniform.
//  - The sculpture stands on the seabed; its base offset owns Y for the same
//    reason.
const GIZMO_TARGETS = {
    boat: {
        objectName: 'boat-anchor',
        visualName: 'boat',
        translate: { x: true, y: false, z: true },
        rotate: { x: false, y: true, z: false },
        uniformScale: true,
    },
    sculpture: {
        objectName: 'sculpture-anchor',
        visualName: 'sculpture',
        translate: { x: true, y: false, z: true },
        rotate: { x: false, y: true, z: false },
        uniformScale: true,
    },
    // A light and the point it looks at are two separate handles, the way a
    // Corona Light works: drag the body to place it, drag the pivot to aim it.
    // Both move freely in all three axes - a light is not standing on anything.
    light1: {
        objectName: 'light-1-anchor',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
    light1target: {
        objectName: 'light-1-target',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
    light2: {
        objectName: 'light-2-anchor',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
    light2target: {
        objectName: 'light-2-target',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
};

// Подсказка для строки состояния: какие оси у объекта в этом режиме и почему
// остальных нет. Стрелок в кадре бывает две, и это выглядит как поломка, пока
// не сказано словами, что высоту лодки задаёт вода.
const GIZMO_NOTES = {
    boat: { ru: 'высота — от воды', en: 'height comes from the water' },
    sculpture: { ru: 'высота — от дна', en: 'height comes from the seabed' },
};

export function describeGizmoAxes(selection, mode, language = 'ru') {
    const rule = GIZMO_TARGETS[selection];
    if (!rule) return '';
    const axes = mode === 'scale'
        ? (rule.uniformScale ? (language === 'ru' ? 'равномерно' : 'uniform') : 'X Y Z')
        : ['x', 'y', 'z'].filter((axis) => rule[mode]?.[axis]).map((axis) => axis.toUpperCase()).join(' ');
    const note = mode === 'translate' ? GIZMO_NOTES[selection]?.[language] : null;
    return [axes, note].filter(Boolean).join(' · ');
}

const round = (value, digits = 3) => Number(value.toFixed(digits));

// Манипулятор стоит не на якоре, а на видимом центре объекта. У лодки начало
// координат модели — у кормы, в полутора метрах от корпуса, и стрелки на
// якоре висели в воде рядом с лодкой: это выглядело как поломка.
//
// Ручки держат не сам объект, а прокси. Поворот и масштаб лодки живут не на
// якоре, а на дочерних узлах (яв — на «boat», масштаб — на модели), и когда
// TransformControls крутил якорь напрямую, сцена сверху накладывала то же
// значение из настроек — лодка поворачивалась дважды. Прокси пишет только в
// настройки, а сцена раскладывает их по своим узлам, как и от ползунков.
export default function EditorGizmo({ selection, mode, orbitRef, onTransform, pose }) {
    const { scene } = useThree();
    // Ручки приходят лениво, через Suspense: обычный ref в момент эффекта ещё
    // пуст, и слушатели бы не повесились. Ref-колбэк кладёт их в состояние.
    const [controls, setControls] = useState(null);
    const [target, setTarget] = useState(null);
    const [visual, setVisual] = useState(null);
    const proxy = useMemo(() => {
        const object = new THREE.Object3D();
        object.name = 'editor-gizmo-proxy';
        return object;
    }, []);
    const drag = useRef(null);
    const centre = useRef(new THREE.Vector3());
    const rule = selection ? GIZMO_TARGETS[selection] : null;

    // The anchors mount with the scene, which can be a frame or two after the
    // selection is made, so resolve by name and retry until it exists.
    useEffect(() => {
        if (!rule) {
            setTarget(null);
            setVisual(null);
            return undefined;
        }

        let frame = 0;
        const resolve = () => {
            const anchor = scene.getObjectByName(rule.objectName);
            const body = rule.visualName ? scene.getObjectByName(rule.visualName) : anchor;
            if (anchor && body) {
                setTarget(anchor);
                setVisual(body);
                return;
            }
            frame = requestAnimationFrame(resolve);
        };

        resolve();
        return () => cancelAnimationFrame(frame);
    }, [rule, scene]);

    // Центр модели в её собственных координатах — один раз: он не зависит ни
    // от поворота, ни от качки, а коробку по 70 тысячам треугольников каждый
    // кадр считать незачем.
    useEffect(() => {
        if (!visual) return;
        const box = new THREE.Box3().setFromObject(visual);
        if (box.isEmpty()) {
            centre.current.set(0, 0, 0);
            return;
        }
        visual.updateWorldMatrix(true, false);
        centre.current.copy(visual.worldToLocal(box.getCenter(new THREE.Vector3())));
    }, [visual]);

    const axes = useMemo(() => {
        if (!rule) {
            return { showX: false, showY: false, showZ: false };
        }
        if (mode === 'translate') {
            return { showX: rule.translate.x, showY: rule.translate.y, showZ: rule.translate.z };
        }
        if (mode === 'rotate') {
            return { showX: rule.rotate.x, showY: rule.rotate.y, showZ: rule.rotate.z };
        }
        return { showX: true, showY: true, showZ: true };
    }, [mode, rule]);

    // Пока ручку не тянут, прокси следует за сценой: центр модели, яв и масштаб
    // из настроек. Во время протяжки им владеет TransformControls.
    useFrame(() => {
        if (!target || !visual || drag.current) return;
        visual.updateWorldMatrix(true, false);
        proxy.position.copy(visual.localToWorld(centre.current.clone()));
        proxy.rotation.set(0, THREE.MathUtils.degToRad(pose?.rotationY ?? 0), 0);
        proxy.scale.setScalar(pose?.scale ?? 1);
    });

    // Orbiting while dragging a handle would drag the object across the screen.
    useEffect(() => {
        const orbit = orbitRef?.current;

        if (!controls) {
            return undefined;
        }
        // В dev ручки доступны снаружи — проба гоняет протяжку без мыши.
        if (import.meta.env.DEV) window.__ouroborosGizmo = { controls, proxy };

        const handleDragging = (event) => {
            if (orbit) {
                orbit.enabled = !event.value;
            }
            // В начале протяжки запоминаем, где стояли якорь и прокси: сдвиг
            // ручки переносится на якорь как разница, а не как абсолют.
            drag.current = event.value && target
                ? { anchor: target.position.clone(), proxy: proxy.position.clone() }
                : null;
        };

        controls.addEventListener('dragging-changed', handleDragging);
        return () => {
            controls.removeEventListener('dragging-changed', handleDragging);
            drag.current = null;
            if (orbit) {
                orbit.enabled = true;
            }
        };
    }, [controls, orbitRef, proxy, target]);

    if (!rule || !target) {
        return null;
    }

    const handleObjectChange = () => {
        if (typeof onTransform !== 'function' || !drag.current) {
            return;
        }

        // Report the authored value, not the raw object: the scene re-applies
        // settings every frame, so the settings are the source of truth and the
        // gizmo is one more way to write to them.
        if (mode === 'translate') {
            const next = drag.current.anchor.clone().add(proxy.position).sub(drag.current.proxy);
            onTransform(selection, {
                position: { x: round(next.x, 2), y: round(next.y, 2), z: round(next.z, 2) },
            });
            return;
        }

        if (mode === 'rotate') {
            onTransform(selection, {
                rotationY: Math.round(THREE.MathUtils.radToDeg(proxy.rotation.y)),
            });
            return;
        }

        const uniform = rule.uniformScale
            ? (proxy.scale.x + proxy.scale.y + proxy.scale.z) / 3
            : proxy.scale.x;
        onTransform(selection, { scale: round(uniform, 4) });
    };

    return (
        <React.Suspense fallback={null}>
            <primitive object={proxy} />
            <LazyTransformControls
                ref={setControls}
                object={proxy}
                mode={mode}
                size={1}
                space="world"
                onObjectChange={handleObjectChange}
                {...axes}
            />
        </React.Suspense>
    );
}
