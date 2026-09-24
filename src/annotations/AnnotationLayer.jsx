import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { formatLevel, markLevels, stackLabels } from './settings.js';
import { getView } from '../planting/north.js';
import { drawMark, hash, SHELF, snapHeight } from './marks.js';

// Отметки уровня в сцене (settings.js). Каждая — спрайт, всегда лицом к
// камере и одного размера на экране, как пометка на чертеже: стрелка остриём
// в точку, выноска, полочка, число в рамке. Нарисовано «от руки»: линии
// дважды с дрожью, рукописный шрифт системы. Спрайт стоит на луче от точки к
// камере чуть ближе к ней: на экране там же, а стена за точкой его не режет,
// режет только то, что правда её загораживает. Вдали отметки гаснут
// (annotationFade); налезающие на экране ярлыки расходятся по полкам.
// Высота под отметкой ищется снова лучом сверху, когда модель поменялась, и
// уходит в настройки (onResnap) — число всегда с живой поверхности.
// Две копии знака: обычная — прячется за тем, что правда закрывает точку, и
// бледный «призрак» поверх всего — отметку за деревом или стеной видно и
// можно выбрать, а открытая рисуется ярко поверх своего призрака.
const GHOST = 0.3;
function Mark({ mark, text, color, fill, outline, line, size, fade, level, selected, zero }) {
    const { invalidate } = useThree();
    const canvas = useMemo(() => document.createElement('canvas'), []);
    const texture = useMemo(() => {
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        map.generateMipmaps = false;
        map.minFilter = THREE.LinearFilter;
        return map;
    }, [canvas]);
    const materials = useMemo(() => [false, true].map((ghost) => {
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: !ghost, sizeAttenuation: false, toneMapped: false, fog: false });
        material.userData.alpha = ghost ? GHOST : 1;
        return material;
    }), [texture]);
    useEffect(() => () => { texture.dispose(); materials.forEach((material) => material.dispose()); }, [texture, materials]);
    const box = useRef({ width: 1, height: 1, tipX: 0, tipY: 0 });
    const sprites = useRef([]);
    useEffect(() => {
        box.current = drawMark(canvas, { text, color, fill, outline, line, level, selected, zero, seed: hash(mark.id) });
        texture.dispose();
        texture.image = canvas;
        texture.needsUpdate = true;
        for (const sprite of sprites.current) sprite?.center.set(box.current.tipX / box.current.width, box.current.tipY / box.current.height);
        invalidate();
    }, [canvas, texture, text, color, fill, outline, line, level, selected, zero, mark.id, invalidate]);

    // Каждый кадр: чуть ближе к камере по лучу, размер в пикселях экрана,
    // прозрачность по расстоянию. Вызывается как метод спрайта (this).
    const onBeforeRender = useMemo(() => {
        const anchor = new THREE.Vector3(), toward = new THREE.Vector3(), buffer = new THREE.Vector2();
        return function place(renderer, scene, camera, geometry, material) {
            anchor.set(mark.x, mark.y, mark.z);
            toward.copy(camera.position).sub(anchor);
            const distance = toward.length();
            this.position.copy(anchor).addScaledVector(toward.normalize(), Math.min(0.6, distance * 0.08));
            renderer.getDrawingBufferSize(buffer);
            const k = (2 * renderer.getPixelRatio() * size) / (buffer.y * camera.projectionMatrix.elements[5]);
            this.scale.set(box.current.width * k, box.current.height * k, 1);
            this.updateMatrixWorld();
            const t = Math.min(1, Math.max(0, (distance - fade * 0.7) / (fade * 0.3)));
            material.opacity = material.userData.alpha * (1 - t * t * (3 - 2 * t));
        };
    }, [mark.x, mark.y, mark.z, size, fade]);
    return materials.map((material, i) => <sprite key={i} ref={(sprite) => { sprites.current[i] = sprite; if (sprite) sprite.center.set(box.current.tipX / box.current.width, box.current.tipY / box.current.height); }}
        material={material} onBeforeRender={onBeforeRender} renderOrder={i ? 19 : 20} name={`annotation-mark-${mark.id}`} userData={{ annotationMark: mark.id }} />);
}

export default function AnnotationLayer({ settings, selectedId = null, geometryKey = '', onResnap, ru = true }) {
    const { scene, camera, size: viewport, invalidate } = useThree();
    const marks = settings.annotationMarks;
    const levels = useMemo(() => markLevels(marks), [marks]);
    const texts = useMemo(() => new Map(marks.map((mark) => [mark.id, formatLevel(levels.get(mark.id), { units: settings.annotationUnits, step: settings.annotationStep, ru })])), [marks, levels, settings.annotationUnits, settings.annotationStep, ru]);
    const [shelves, setShelves] = React.useState(() => new Map());

    // Модель заменили, сдвинули, скрыли часть — высоты под отметками ищутся
    // снова; модель грузится не сразу, поэтому ещё раз через пару секунд.
    const resnap = useRef(onResnap);
    resnap.current = onResnap;
    const marksKey = marks.map((mark) => `${mark.id}:${mark.x}:${mark.y}:${mark.z}`).join('|');
    useEffect(() => {
        const ray = new THREE.Raycaster();
        const run = () => {
            const updates = new Map();
            for (const mark of marks) {
                const y = snapHeight(scene, mark, ray);
                if (y !== null && Math.abs(y - mark.y) > 0.0005) updates.set(mark.id, Math.round(y * 10000) / 10000);
            }
            if (updates.size) resnap.current?.(updates);
        };
        const timers = [300, 2500, 8000].map((delay) => window.setTimeout(run, delay));
        return () => timers.forEach((timer) => window.clearTimeout(timer));
    // marks читаются по ключу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scene, marksKey, geometryKey]);

    // Полки ярлыков: пересчёт, когда сдвинулся вид, отметки или их вид.
    const seen = useRef('');
    useFrame(() => {
        const key = `${getView().version}|${marksKey}|${settings.annotationSize}|${settings.annotationFade}|${viewport.width}x${viewport.height}`;
        if (key === seen.current) return;
        seen.current = key;
        const at = new THREE.Vector3(), rects = [];
        for (const mark of marks) {
            at.set(mark.x, mark.y, mark.z);
            const depth = at.distanceTo(camera.position);
            at.project(camera);
            if (at.z > 1 || depth > settings.annotationFade) continue;
            const text = texts.get(mark.id) ?? '';
            rects.push({ id: mark.id, x: (at.x + 1) / 2 * viewport.width, y: (1 - at.y) / 2 * viewport.height, width: (text.length * 10 + 40) * settings.annotationSize, height: 34 * settings.annotationSize, depth });
        }
        const next = stackLabels(rects, SHELF * settings.annotationSize);
        const changed = marks.some((mark) => (next.get(mark.id) ?? 0) !== (shelves.get(mark.id) ?? 0));
        if (changed) { setShelves(next); invalidate(); }
    });

    return <group name="annotations">
        {marks.map((mark) => <Mark key={mark.id} mark={mark} text={texts.get(mark.id)} color={settings.annotationColor} fill={settings.annotationFill !== false} outline={settings.annotationOutline !== false} line={settings.annotationLine ?? 1} size={settings.annotationSize} fade={settings.annotationFade}
            level={shelves.get(mark.id) ?? 0} selected={mark.id === selectedId} zero={Boolean(mark.zero)} />)}
    </group>;
}

