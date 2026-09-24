import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import RiderModel from '../components/surfboard/RiderModel';
import { updateRiderModel } from '../components/surfboard/riderMesh';
import { updateRiderBody, useRiderBody } from '../components/surfboard/riderBody';
import { follow, followVector } from '../components/surfboard/cameraFollow.js';
import { BUTTON, LOOK_PITCH_RATE, LOOK_YAW_RATE, PAD_DEADZONE, radial, trigger } from '../components/surfboard/usePlayKeys.js';
import { buildWalkGround, groundHeight, rayDistance } from './walkGround.js';
import { createWalk, EYE_ABOVE_PELVIS, resetWalk, stepWalk, walkState } from './walkPlay.js';
import { getWalkSnapshot, setWalk, toggleWalkView } from './walkStore.js';

// Прогулка по проекту (кнопка «Прогулка»): человек с доски встаёт на старт
// (белый значок, инструмент «Старт»), а без него — там, куда смотрела камера,
// и ходит по модели (walkPlay.js). T — старт там, где он стоит, R — назад на
// старт (геймпад: крестовина ↑ и View, как чекпоинт у доски). Камера — его глаза или
// сзади и чуть сверху; орбита редактора на это время выключена, её вид
// редактор вернёт сам (HomeEdit). Клик захватывает мышь в сцену, Esc её
// отпускает, второй Esc — выход; без захвата вид крутится перетаскиванием,
// колесо — дальше и ближе. Геймпад (Xbox, раскладка доски): левый стик —
// идти (наклон — скорость), правый — смотреть, RT или нажатый левый стик —
// бежать, A — прыжок, Y — вид, Menu — выход, нажатый правый стик — взгляд прямо.
//
// От глаз камера не дрожит: по плану она идёт за тазом как есть (его ход
// плавный), а по высоте — пружиной (cameraFollow.js): у таза в шаге есть
// изломы скорости, на беге до 2 м/с за кадр, пружина делает из них плавное
// покачивание, а ступень и приземление — мягкий подъём и оседание.

const LOOK = 0.0024; // рад на пиксель мыши
const CLICK = 4; // px: нажатие короче — клик
const FIRST = { fov: 72, near: 0.04, ahead: 0.1, rise: 9, roll: 0.012 };
const THIRD = { fov: 55, near: 0.1, distance: 3.4, min: 1.2, max: 9, up: 0.55, follow: 7 };
const MOVES = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
const ROOTS = ['placed', 'beach-house'];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const forward = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const stick = { x: 0, y: 0 };

// Геймпад за кадр: стики — в r.padMove и взгляд, кнопки — по нажатию. Что
// уже было зажато, когда геймпад нашёлся, нажатием не считается.
function readPad(r, dt, onExit) {
    let pads = [];
    try { pads = navigator.getGamepads?.() ?? []; } catch { /* страница без разрешения на геймпад */ }
    const pad = Array.from(pads).find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) { r.padIndex = -1; r.padMove.x = 0; r.padMove.y = 0; r.padRun = 0; return; }
    const fresh = r.padIndex !== pad.index;
    r.padIndex = pad.index;
    radial(stick, pad.axes[0] || 0, pad.axes[1] || 0, PAD_DEADZONE);
    r.padMove.x = stick.x; r.padMove.y = -stick.y;
    let used = stick.x !== 0 || stick.y !== 0;
    radial(stick, pad.axes[2] || 0, pad.axes[3] || 0, PAD_DEADZONE);
    if (stick.x || stick.y) {
        used = true;
        r.yaw -= stick.x * LOOK_YAW_RATE * dt;
        r.pitch = clamp(r.pitch - stick.y * LOOK_PITCH_RATE * dt, -1.35, 1.2);
    }
    r.padRun = Math.max(trigger(pad.buttons[BUTTON.RT]?.value || 0), pad.buttons[BUTTON.LS]?.pressed ? 1 : 0);
    if (r.padRun > 0) used = true;
    pad.buttons.forEach((button, i) => {
        const was = r.padDown[i];
        r.padDown[i] = button.pressed;
        if (!button.pressed || was || fresh) return;
        used = true;
        if (i === BUTTON.A) r.jump = true;
        else if (i === BUTTON.Y) toggleWalkView();
        else if (i === BUTTON.RS) r.pitch = -0.25;
        else if (i === BUTTON.MENU) onExit?.();
        else if (i === BUTTON.UP) r.mark = true;
        else if (i === BUTTON.VIEW) r.back = true;
    });
    if (used) setWalk({ device: 'pad' });
}

export default function WalkMode({ orbitRef, planeY = null, terrain = null, start = null, onSetStart, onExit }) {
    const exitRef = useRef(onExit), startRef = useRef(start), setStartRef = useRef(onSetStart);
    useEffect(() => { exitRef.current = onExit; startRef.current = start; setStartRef.current = onSetStart; });
    const { camera, gl, scene } = useThree();
    const s = useMemo(() => createWalk(), []);
    const rider = useMemo(() => ({ world: { bodies: s.bodies } }), [s]);
    const body = useRiderBody(true);
    const sticksRef = useRef(null);
    const rig = useRef({ ground: null, held: new Set(), jump: false, yaw: 0, pitch: -0.25, distance: THIRD.distance, reach: THIRD.distance, eye: new THREE.Vector3(), rise: 0, focus: new THREE.Vector3(), focusV: new THREE.Vector3(), roll: 0, view: null, orbit: null, padIndex: -1, padMove: { x: 0, y: 0 }, padRun: 0, padDown: [], spawn: null, mark: false, back: false });

    // Земля — один раз на входе; встаёт на старт или туда, куда смотрела камера.
    useEffect(() => {
        const r = rig.current;
        const g = buildWalkGround(ROOTS.map((name) => scene.getObjectByName(name)), { planeY, terrain });
        r.ground = g;
        camera.getWorldDirection(forward);
        const flat = Math.hypot(forward.x, forward.z) > 1e-3 ? Math.atan2(forward.x, forward.z) : 0;
        const { x: cx, y: cy, z: cz } = camera.position;
        let hit = rayDistance(g, cx, cy, cz, forward.x, forward.y, forward.z, 250);
        if (hit === Infinity && planeY !== null && forward.y < -0.01) hit = (planeY - cy) / forward.y;
        const at = hit < 250
            ? { x: cx + forward.x * hit - Math.sin(flat) * 0.4, y: cy + forward.y * hit, z: cz + forward.z * hit - Math.cos(flat) * 0.4 }
            : { x: cx, y: cy, z: cz };
        r.spawn = startRef.current ?? { ...at, yaw: flat };
        resetWalk(s, g, r.spawn);
        r.yaw = r.spawn.yaw;
        r.view = null;
    }, [camera, planeY, s, scene, terrain]);

    // Клавиши — до редактора (фаза захвата): его инструменты их не видят.
    useEffect(() => {
        const r = rig.current, canvas = gl.domElement;
        let press = null;
        const keydown = (event) => {
            if (event.metaKey || event.ctrlKey) return;
            const code = event.code;
            setWalk({ device: 'keys' });
            if (code in MOVES) r.held.add(MOVES[code]);
            else if (code === 'Space') { if (!event.repeat) r.jump = true; }
            else if (code === 'KeyC') { if (!event.repeat) toggleWalkView(); }
            else if (code === 'KeyT') { if (!event.repeat) r.mark = true; }
            else if (code === 'KeyR') { if (!event.repeat) r.back = true; }
            else if (code === 'Escape') { if (document.pointerLockElement !== canvas) onExit?.(); }
            else return;
            event.preventDefault();
            event.stopPropagation();
        };
        const keyup = (event) => { if (event.code in MOVES) r.held.delete(MOVES[event.code]); };
        const blur = () => r.held.clear();
        const turn = (dx, dy) => {
            r.yaw -= dx * LOOK;
            r.pitch = clamp(r.pitch - dy * LOOK, -1.35, 1.2);
        };
        const pointerdown = (event) => { if (event.target === canvas && event.button === 0) press = { travel: 0 }; };
        const mousemove = (event) => {
            if (event.movementX || event.movementY) setWalk({ device: 'keys' });
            if (document.pointerLockElement === canvas) turn(event.movementX, event.movementY);
            else if (press && event.buttons & 1) { press.travel += Math.abs(event.movementX) + Math.abs(event.movementY); turn(event.movementX, event.movementY); }
        };
        const pointerup = () => {
            if (press && press.travel < CLICK && document.pointerLockElement !== canvas) {
                try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* без захвата — перетаскивание */ }
            }
            press = null;
        };
        const wheel = (event) => {
            if (event.target !== canvas) return;
            event.preventDefault();
            r.distance = clamp(r.distance * Math.exp(event.deltaY * 0.0012), THIRD.min, THIRD.max);
        };
        const lock = () => setWalk({ locked: document.pointerLockElement === canvas });
        const listeners = [
            [window, 'keydown', keydown, true], [window, 'keyup', keyup, true], [window, 'blur', blur, false],
            [window, 'pointerdown', pointerdown, true], [window, 'mousemove', mousemove, true], [window, 'pointerup', pointerup, true],
            [canvas, 'wheel', wheel, { passive: false }], [document, 'pointerlockchange', lock, false],
        ];
        listeners.forEach(([target, type, listener, options]) => target.addEventListener(type, listener, options));
        return () => {
            listeners.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
            if (document.pointerLockElement === canvas) document.exitPointerLock?.();
            setWalk({ locked: false, state: 'stand' });
        };
    }, [gl, onExit]);

    // Что прогулка берёт у камеры редактора — отдаёт как было.
    useEffect(() => {
        const saved = { near: camera.near, fov: camera.fov };
        const r = rig.current;
        return () => {
            camera.near = saved.near;
            camera.fov = saved.fov;
            camera.updateProjectionMatrix();
            if (r.orbit) r.orbit.enabled = true;
        };
    }, [camera]);

    useFrame((_, delta) => {
        const r = rig.current, g = r.ground;
        if (!g) return;
        if (orbitRef?.current) { orbitRef.current.enabled = false; r.orbit = orbitRef.current; }
        const dt = Math.min(delta, 0.1);
        readPad(r, dt, exitRef.current);
        const first = getWalkSnapshot().view === 'first';
        // Старт здесь — где он стоит (в воздухе — где стоял); на старт — туда.
        if (r.mark) {
            const w = s.walker, here = s.mode === 'air' ? s.safe : { x: w.x, y: w.groundY, z: w.z, yaw: w.yaw };
            setStartRef.current?.({ x: here.x, y: here.y, z: here.z, yaw: here.yaw });
        }
        if (r.back) {
            resetWalk(s, g, startRef.current ?? r.spawn);
            r.yaw = (startRef.current ?? r.spawn).yaw;
            r.view = null;
        }
        r.mark = false; r.back = false;

        // Куда идти — от взгляда: вперёд, назад, вбок; клавиши и стик вместе.
        const f = r.held.has('f') - r.held.has('b') + r.padMove.y, side = r.held.has('r') - r.held.has('l') + r.padMove.x;
        const sin = Math.sin(r.yaw), cos = Math.cos(r.yaw);
        const mx = f * sin - side * cos, mz = f * cos + side * sin;
        const input = { moveYaw: Math.atan2(mx, mz), amount: Math.min(1, Math.hypot(mx, mz)), run: r.held.has('run') ? 1 : r.padRun, jump: r.jump, faceYaw: first ? r.yaw : undefined, instant: first };
        r.jump = false;
        for (let left = dt, n = 0; left > 1e-5 && n < 6; left -= 1 / 60, n += 1) {
            stepWalk(s, input, g, Math.min(left, 1 / 60));
            input.jump = false;
        }
        setWalk({ state: walkState(s) });

        updateRiderModel(sticksRef.current, rider);
        if (sticksRef.current) sticksRef.current.visible = !body && !first;
        if (body) { updateRiderBody(body, rider, first); body.castShadow = !first; }

        const snap = r.view !== first;
        r.view = first;
        const pelvis = s.controls.pelvis;
        if (first) {
            // Глаз над тазом, чуть впереди по взгляду: по плану — как есть,
            // по высоте — сглаженно; наклон головы — с шагом.
            const y = pelvis[1] + EYE_ABOVE_PELVIS;
            if (snap) { r.eye.y = y; r.rise = 0; } else [r.eye.y, r.rise] = follow(r.eye.y, r.rise, y, FIRST.rise, dt);
            r.eye.x = pelvis[0] + sin * FIRST.ahead;
            r.eye.z = pelvis[2] + cos * FIRST.ahead;
            r.roll += (FIRST.roll * s.walker.over * (s.mode === 'air' ? 0 : 1) - r.roll) * ease(6, dt);
            camera.position.copy(r.eye);
            camera.quaternion.setFromEuler(euler.set(r.pitch, r.yaw + Math.PI, r.roll));
        } else {
            // Сзади на расстоянии, но не сквозь стену: луч от плеч к камере.
            const target = r.focus, at = { x: pelvis[0], y: pelvis[1] + THIRD.up, z: pelvis[2] };
            if (snap) { target.copy(at); r.focusV.set(0, 0, 0); } else followVector(target, r.focusV, at, THIRD.follow, dt);
            const cp = Math.cos(r.pitch), dx = -sin * cp, dy = -Math.sin(r.pitch), dz = -cos * cp;
            const free = Math.min(r.distance, rayDistance(g, target.x, target.y, target.z, dx, dy, dz, r.distance + 0.3) - 0.3);
            r.reach = snap || free < r.reach ? Math.max(free, 0.3) : r.reach + (free - r.reach) * ease(3, dt);
            camera.position.set(target.x + dx * r.reach, target.y + dy * r.reach, target.z + dz * r.reach);
            const under = groundHeight(g, camera.position.x, camera.position.z, camera.position.y + 1);
            if (camera.position.y < under + 0.25) camera.position.y = under + 0.25;
            camera.lookAt(target);
        }
        const lens = first ? FIRST : THIRD;
        if (camera.fov !== lens.fov || camera.near !== lens.near) {
            camera.fov = lens.fov;
            camera.near = lens.near;
            camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld();
    }, -6);

    return <>
        {body ? <primitive object={body} /> : null}
        <RiderModel ref={sticksRef} visible={false} />
    </>;
}
