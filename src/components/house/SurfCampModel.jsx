import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ENV_REFLECTION_SCALE, configureMaps } from '../effects/water/pbrMaterial';
import { boardDimensions, buildBoardGeometry, buildFinGeometries } from '../surfboard/boardShape';
import { BOARD_TEXTURE_SIZE, boardTextureLayout, paintBoardTexture } from '../surfboard/boardTexture';
import { RING_PAINTS } from './surfCamp';
import { CLOTHES, SIGN_PLATES, adirondackGeometry, clothGeometry, clothGrid, curtainAt, drapeGrid, flagAt, lifeRingParts, signPlate } from './campProps';

// Bikini Point's things (surfCamp.js) drawn. The life rings are one model in
// instances, each ring in its own two colours; the boards the surfboard's
// own shape and paint job, only lighter — fewer sections round the hull, the
// paint kept at a quarter — as things seen about a porch, not ridden. The
// wind moves the flags, the washing and the curtain in the door. Colours are
// taken as the pickers show them, like the house's own; `clay` whitens
// everything with the house.
const CLAY = '#e8e3d9';
const PAINT_SIZE = [512, 256];
const WIND = new THREE.Vector3(0.8, 0, -0.6).normalize();
const RED = '#c8352a';

const canvas = (width, height, draw) => {
  const element = Object.assign(document.createElement('canvas'), { width, height });
  draw(element.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// Every material of the camp with what it shows when painted; clay and
// wireframe are set on all of them at once. A `shared` map is not its own.
function useFinishes(list, clay, wireframe) {
  useLayoutEffect(() => {
    for (const { material, color = '#ffffff', map = null, vertexColors = false } of list) {
      material.color.set(clay ? CLAY : color);
      material.map = clay ? null : map;
      material.vertexColors = !clay && vertexColors;
      material.wireframe = wireframe;
      material.needsUpdate = true;
    }
  }, [clay, list, wireframe]);
  useEffect(() => () => list.forEach(({ material, map, shared }) => {
    material.dispose();
    if (!shared) map?.dispose();
  }), [list]);
}

function Rings({ rings, clay, wireframe }) {
  const meshes = useRef([]);
  const parts = useMemo(lifeRingParts, []);
  const finishes = useMemo(() => [
    { material: new THREE.MeshStandardMaterial({ roughness: 0.72 }) },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.72 }) },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.9 }), color: '#cdbf98' },
  ], []);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), turn = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), colour = new THREE.Color();
    meshes.current.forEach((mesh, part) => {
      rings.forEach((ring, i) => {
        mesh.setMatrixAt(i, matrix.compose(position.fromArray(ring.position), turn.fromArray(ring.quaternion), one));
        if (part < 2) mesh.setColorAt(i, colour.set(clay ? '#ffffff' : RING_PAINTS[ring.paint][part]));
      });
      mesh.count = rings.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [clay, rings]);
  return ['base', 'bands', 'line'].map((name, part) => (
    <instancedMesh key={`${name}${rings.length}`} ref={(mesh) => { meshes.current[part] = mesh; }} args={[parts[name], finishes[part].material, Math.max(1, rings.length)]} castShadow receiveShadow />
  ));
}

// Each look's paint, made once for the page: painted full size by the board's
// own painter into one scratch canvas, kept at a quarter. That painter lifts
// its colours for the dark sea; the house takes them as they are, so they go
// in at their linear values and come out as picked.
const paints = new Map();
let scratch = null;
const asPicked = (settings) => Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, typeof value === 'string' ? `#${new THREE.Color(value).getHexString(THREE.LinearSRGBColorSpace)}` : value]));
function boardPaint(settings, gl) {
  const key = JSON.stringify(settings);
  if (!paints.has(key)) {
    scratch ??= Object.assign(document.createElement('canvas'), { width: BOARD_TEXTURE_SIZE[0], height: BOARD_TEXTURE_SIZE[1] });
    paintBoardTexture(scratch, asPicked(settings), boardTextureLayout(boardDimensions(settings)));
    const texture = canvas(PAINT_SIZE[0], PAINT_SIZE[1], (context, width, height) => {
      context.imageSmoothingQuality = 'high';
      context.drawImage(scratch, 0, 0, width, height);
    });
    texture.flipY = false;
    configureMaps(gl, { color: [texture] });
    paints.set(key, texture);
  }
  return paints.get(key);
}

function CampBoard({ settings, position, quaternion, clay, wireframe }) {
  const { gl } = useThree();
  const dims = useMemo(() => boardDimensions(settings), [settings]);
  const hull = useMemo(() => buildBoardGeometry(dims, { lengthSegments: 56, aroundSegments: 24 }), [dims]);
  const fins = useMemo(() => buildFinGeometries(dims, { depthSegments: 3, chordSegments: 5 }), [dims]);
  const finishes = useMemo(() => [
    { material: new THREE.MeshStandardMaterial({ roughness: 0.3, envMapIntensity: ENV_REFLECTION_SCALE.surfboard }), map: boardPaint(settings, gl), shared: true },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.3, envMapIntensity: ENV_REFLECTION_SCALE.surfboard }), color: settings.surfboardFinColor },
  ], [gl, settings]);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => hull.dispose(), [hull]);
  useEffect(() => () => fins.forEach((fin) => fin.geometry.dispose()), [fins]);
  return (
    <group position={position} quaternion={quaternion}>
      <mesh geometry={hull} material={finishes[0].material} castShadow receiveShadow />
      {fins.map((fin) => <mesh key={fin.id} geometry={fin.geometry} material={finishes[1].material} position={fin.position} quaternion={fin.quaternion} castShadow />)}
    </group>
  );
}

function Chairs({ chairs, clay, wireframe }) {
  const mesh = useRef();
  const geometry = useMemo(adirondackGeometry, []);
  const finishes = useMemo(() => [{ material: new THREE.MeshStandardMaterial({ roughness: 0.75 }), color: '#a3291f' }], []);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    chairs.forEach(({ position, yaw }, i) => mesh.current.setMatrixAt(i, matrix.makeRotationY(yaw).setPosition(...position)));
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [chairs]);
  return <instancedMesh ref={mesh} args={[geometry, finishes[0].material, chairs.length]} key={chairs.length} castShadow receiveShadow />;
}

// The sign's letters on its red, a little knocked about, in the plate's own
// metres (uv = x, y).
function signFace(name) {
  const { text, bounds: [x0, y0, x1, y1], textY } = SIGN_PLATES[name];
  const perMetre = 1400, width = Math.round((x1 - x0) * perMetre), height = Math.round((y1 - y0) * perMetre);
  const texture = canvas(width, height, (context) => {
    context.fillStyle = RED;
    context.fillRect(0, 0, width, height);
    let size = 0.13 * perMetre;
    context.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    size *= Math.min(1, (0.62 * perMetre) / context.measureText(text).width);
    context.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    context.fillStyle = '#f4efe6';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, -x0 * perMetre, (y1 - textY) * perMetre);
    let seed = text.length * 97;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 90; k += 1) {
      context.fillStyle = `rgba(${random() < 0.5 ? '70, 30, 20' : '240, 230, 220'}, ${0.08 + random() * 0.2})`;
      context.fillRect(random() * width, random() * height, 2 + random() * 14, 1 + random() * 3);
    }
  });
  texture.repeat.set(1 / (x1 - x0), 1 / (y1 - y0));
  texture.offset.set(-x0 / (x1 - x0), -y0 / (y1 - y0));
  return texture;
}

// Bikini Point: an iron post with an arm; the top hangs from the arm on its
// straps, the briefs are bolted to the post under it.
function BikiniSign({ sign, clay, wireframe }) {
  const plates = useMemo(() => ({ bikini: signPlate('bikini'), point: signPlate('point') }), []);
  const finishes = useMemo(() => [
    { material: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), color: '#34322e' },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.55 }), color: RED },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.55 }), map: signFace('bikini') },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.55 }), map: signFace('point') },
  ], []);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => Object.values(plates).forEach(({ plate, faces }) => [plate, faces].forEach((geometry) => geometry.dispose())), [plates]);
  const [iron, red, bikini, point] = finishes.map(({ material }) => material);
  const TOP = 2.7, ARM = 0.95, hang = -0.55;
  return (
    <group position={sign.position} rotation={[sign.lean, sign.yaw, 0]}>
      <mesh material={iron} position={[0, (TOP - 0.4) / 2, 0]} castShadow><cylinderGeometry args={[0.024, 0.028, TOP + 0.4, 10]} /></mesh>
      <mesh material={iron} position={[-ARM / 2 + 0.02, TOP - 0.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.016, 0.016, ARM, 8]} /></mesh>
      {[-0.17, 0.17].map((x) => <mesh key={x} material={red} position={[hang + x, TOP - 0.05 - 0.13, 0]} castShadow><boxGeometry args={[0.035, 0.24, 0.005]} /></mesh>)}
      <group position={[hang, TOP - 0.07, 0]} rotation={[0.04, 0, 0.02]}>
        <mesh geometry={plates.bikini.plate} material={red} castShadow />
        <mesh geometry={plates.bikini.faces} material={bikini} />
      </group>
      <group position={[-0.03, 1.72, 0]} rotation={[0, 0, -0.015]}>
        <mesh geometry={plates.point.plate} material={red} castShadow />
        <mesh geometry={plates.point.faces} material={point} />
        {[-0.04, -0.2].map((y) => <mesh key={y} material={iron} position={[0.01, y, 0]}><boxGeometry args={[0.06, 0.03, 0.02]} /></mesh>)}
      </group>
    </group>
  );
}

// A flag on a white pole stuck in the sand: a red pennant, or the red over
// yellow of the surf lifeguards; the cloth flies in the wind.
function Flag({ flag, clay, wireframe }) {
  const cloth = useMemo(() => clothGrid(12, 6), []);
  const halves = flag.kind === 'halves';
  const finishes = useMemo(() => [
    { material: new THREE.MeshStandardMaterial({ roughness: 0.5 }), color: '#ebe8e0' },
    {
      material: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
      ...(halves ? { map: canvas(2, 2, (context) => { context.fillStyle = '#c62f28'; context.fillRect(0, 0, 2, 1); context.fillStyle = '#f0c93a'; context.fillRect(0, 1, 2, 1); }) } : { color: '#c62f28' }),
    },
  ], [halves]);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => cloth.dispose(), [cloth]);
  const pole = useMemo(() => {
    const foot = new THREE.Vector3(...flag.foot), up = new THREE.Vector3(...flag.up).normalize();
    return { middle: foot.clone().addScaledVector(up, flag.length / 2).toArray(), turn: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up).toArray(), top: foot.clone().addScaledVector(up, flag.length - 0.03), down: up.clone().negate() };
  }, [flag]);
  const shape = useMemo(() => ({ top: pole.top, down: pole.down, wind: WIND, kind: halves ? 'rectangle' : 'pennant', hoist: halves ? 0.6 : 0.62, fly: halves ? 0.85 : 1.05, phase: flag.phase }), [flag.phase, halves, pole]);
  useLayoutEffect(() => drapeGrid(cloth, flagAt(shape, 0)), [cloth, shape]);
  useFrame(({ clock }) => drapeGrid(cloth, flagAt(shape, clock.elapsedTime)));
  return (
    <group>
      <mesh material={finishes[0].material} position={pole.middle} quaternion={pole.turn} castShadow><cylinderGeometry args={[0.018, 0.02, flag.length, 8]} /></mesh>
      <mesh geometry={cloth} material={finishes[1].material} castShadow />
    </group>
  );
}

// The washing line: a pole in the sand, the line to the porch post, and on it
// the washing pegged out, each piece swinging on the line in the wind.
const alongLine = ({ a, b, sag }, t) => new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t);
function WashingLine({ line, clay, wireframe }) {
  const pieces = useRef([]);
  const built = useMemo(() => {
    const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, k) => alongLine(line, k / 12))), 24, 0.004, 4, false);
    const across = new THREE.Vector3(line.b[0] - line.a[0], 0, line.b[2] - line.a[2]).normalize();
    const facing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, new THREE.Vector3(0, 1, 0), new THREE.Vector3().crossVectors(across, new THREE.Vector3(0, 1, 0))));
    const kinds = [...new Set(line.washing.map(({ kind }) => kind))];
    return { rope, facing, geometries: Object.fromEntries(kinds.map((kind) => [kind, clothGeometry(kind)])) };
  }, [line]);
  const finishes = useMemo(() => [
    { material: new THREE.MeshStandardMaterial({ roughness: 0.9 }), color: '#dcd6c8' },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.95 }), color: '#8a8176' },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.8 }), color: '#c9a46a' },
    ...Object.entries(CLOTHES).map(([kind, { colour }]) => ({ kind, material: new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide }), ...(kind === 'towel' ? { vertexColors: true } : { color: colour }) })),
  ], []);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => {
    built.rope.dispose();
    Object.values(built.geometries).forEach((geometry) => geometry.dispose());
  }, [built]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    line.washing.forEach(({ phase }, i) => {
      const piece = pieces.current[i];
      if (piece) piece.rotation.x = -(0.22 + 0.14 * Math.sin(t * 1.7 + phase) + 0.05 * Math.sin(t * 4.1 + phase * 2));
    });
  });
  const [rope, wood, peg] = finishes.map(({ material }) => material);
  const cloth = Object.fromEntries(finishes.filter(({ kind }) => kind).map(({ kind, material }) => [kind, material]));
  const poleFoot = new THREE.Vector3(line.pole[0], -0.3, line.pole[1]), poleTop = new THREE.Vector3(...line.b).add(new THREE.Vector3(0, 0.12, 0));
  const poleTurn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleTop.clone().sub(poleFoot).normalize());
  return (
    <group>
      <mesh geometry={built.rope} material={rope} castShadow />
      <mesh material={wood} position={poleFoot.clone().lerp(poleTop, 0.5).toArray()} quaternion={poleTurn} castShadow>
        <cylinderGeometry args={[0.035, 0.045, poleTop.distanceTo(poleFoot), 7]} />
      </mesh>
      {line.washing.map(({ kind, t }, i) => (
        <group key={i} position={alongLine(line, t).toArray()} quaternion={built.facing}>
          <group ref={(group) => { pieces.current[i] = group; }}>
            <mesh geometry={built.geometries[kind]} material={cloth[kind]} position={[0, -0.005, 0]} castShadow />
            {CLOTHES[kind].pegs.map((x) => <mesh key={x} material={peg} position={[x, -0.005, 0]}><boxGeometry args={[0.014, 0.07, 0.022]} /></mesh>)}
          </group>
        </group>
      ))}
    </group>
  );
}

// The curtain in the open front door: striped cotton on a rod, breathing out
// over the threshold.
function DoorCurtain({ curtain, clay, wireframe }) {
  const cloth = useMemo(() => clothGrid(12, 24), []);
  const finishes = useMemo(() => [
    {
      material: new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }),
      map: canvas(256, 4, (context, width, height) => {
        for (let k = 0; k < 8; k += 1) {
          context.fillStyle = k % 2 ? '#fff4e0' : '#f59f55';
          context.fillRect((k * width) / 8, 0, width / 8, height);
        }
      }),
    },
    { material: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 }), color: '#3a342c' },
  ], []);
  useFinishes(finishes, clay, wireframe);
  useEffect(() => () => cloth.dispose(), [cloth]);
  const shape = useMemo(() => ({ rod: new THREE.Vector3(...curtain.rod), width: curtain.width, height: curtain.height, out: new THREE.Vector3(0, 0, 1), across: new THREE.Vector3(1, 0, 0) }), [curtain]);
  useLayoutEffect(() => drapeGrid(cloth, curtainAt(shape, 0)), [cloth, shape]);
  useFrame(({ clock }) => drapeGrid(cloth, curtainAt(shape, clock.elapsedTime)));
  return (
    <group>
      <mesh geometry={cloth} material={finishes[0].material} castShadow receiveShadow />
      <mesh material={finishes[1].material} position={curtain.rod} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.009, 0.009, curtain.width + 0.06, 6]} /></mesh>
    </group>
  );
}

export default function SurfCampModel({ camp, clay = false, wireframe = false }) {
  const look = { clay, wireframe };
  return (
    <group name="surf-camp">
      {camp.rings.length ? <Rings rings={camp.rings} {...look} /> : null}
      {camp.boards.map((board) => <CampBoard key={board.slot} {...board} {...look} />)}
      {camp.chairs ? <Chairs chairs={camp.chairs} {...look} /> : null}
      {camp.sign ? <BikiniSign sign={camp.sign} {...look} /> : null}
      {camp.flags?.map((flag, i) => <Flag key={i} flag={flag} {...look} />)}
      {camp.line ? <WashingLine line={camp.line} {...look} /> : null}
      {camp.curtain ? <DoorCurtain curtain={camp.curtain} {...look} /> : null}
    </group>
  );
}
