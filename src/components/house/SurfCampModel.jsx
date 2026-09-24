import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ENV_REFLECTION_SCALE, configureMaps } from '../effects/water/pbrMaterial';
import { boardDimensions, buildBoardGeometry, buildFinGeometries } from '../surfboard/boardShape';
import { BOARD_TEXTURE_SIZE, boardTextureLayout, paintBoardTexture } from '../surfboard/boardTexture';
import { CAMP_COLORS, RING_PAINTS, VENDING } from './surfCamp';
import {
  CLOTHES, DIAMOND, DISC, SIGN_PLATES, adirondackGeometry, clothGeometry, clothGrid, curtainAt, drapeGrid, flagAt,
  hammockGeometry, hangingBoard, lifeRingParts, plate, signPlate, vendingGeometry,
} from './campProps';
import { DIAMOND_BOLTS, bikiniFace, chillFace, nakedSurfingFace, noBadDaysFace, unpaidFace, vendingFaces } from './campSigns';

// Bikini Point's things (surfCamp.js) drawn. The life rings are one model in
// instances, each ring in its own two colours; the boards the surfboard's
// own shape and paint job, only lighter — fewer sections round the hull, the
// paint kept at a quarter — as things seen about a porch, not ridden. The
// wind (`wind`, 0 still … 2 a gale) moves the flags, the washing, the
// curtain in the door, the hanging signs and the hammock; the drinks machine
// glows as `night` falls. Colours are taken as the pickers show them, like
// the house's own, then all turned `hue` radians round the colour circle and
// faded by the sun (`fade` 0…1). `clay` whitens everything with the house.
// Detail by distance: within `near` metres all of it moves; out to `far` it
// stands still; past that it is gone — at that range it is a few pixels.
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

// The tone every camp material shares: a turn round the hue circle (YIQ) and
// the sun's fading, applied after the maps and colours.
const TONE = { uCampHue: { value: 0 }, uCampFade: { value: 0 } };
const TONE_GLSL = /* glsl */ `
uniform float uCampHue;
uniform float uCampFade;
vec3 campTone(vec3 c) {
  const mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYiq * c;
  float cs = cos(uCampHue), sn = sin(uCampHue);
  yiq.yz = vec2(yiq.y * cs - yiq.z * sn, yiq.y * sn + yiq.z * cs);
  c = max(toRgb * yiq, 0.0);
  float grey = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, vec3(grey) * 0.85 + 0.12, uCampFade * 0.65);
}
`;
function toned(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, TONE);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TONE_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = campTone(diffuseColor.rgb);');
  };
  material.customProgramCacheKey = () => 'surf-camp-tone';
  return material;
}
const standard = (options) => toned(new THREE.MeshStandardMaterial(options));

// Every material of a thing with what it shows when painted; clay and
// wireframe are set on all of them at once. A `shared` map is not its own.
function useFinishes(list, { clay, wireframe }) {
  useLayoutEffect(() => {
    for (const { material, color = '#ffffff', map = null, vertexColors = false } of list) {
      material.color.set(clay ? CLAY : color);
      material.map = clay ? null : map;
      material.vertexColors = !clay && vertexColors;
      material.wireframe = wireframe;
      material.needsUpdate = true;
    }
  }, [clay, list, wireframe]);
  useEffect(() => () => list.forEach(({ material, map, shared, emissiveMap }) => {
    material.dispose();
    if (!shared) map?.dispose();
    emissiveMap?.dispose();
  }), [list]);
}
// A frame callback that runs only while the camp is near enough to be seen moving.
const useWind = (look, step) => useFrame(({ clock }) => {
  if (look.live.current) step(clock.elapsedTime, look.wind);
});

function Rings({ rings, look }) {
  const meshes = useRef([]);
  const parts = useMemo(lifeRingParts, []);
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.72 }) },
    { material: standard({ roughness: 0.72 }) },
    { material: standard({ roughness: 0.9 }), color: '#cdbf98' },
  ], []);
  useFinishes(finishes, look);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), turn = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), colour = new THREE.Color();
    meshes.current.forEach((mesh, part) => {
      rings.forEach((ring, i) => {
        mesh.setMatrixAt(i, matrix.compose(position.fromArray(ring.position), turn.fromArray(ring.quaternion), one));
        if (part < 2) mesh.setColorAt(i, colour.set(look.clay ? '#ffffff' : RING_PAINTS[ring.paint][part]));
      });
      mesh.count = rings.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [look.clay, rings]);
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

function CampBoard({ settings, position, quaternion, look }) {
  const { gl } = useThree();
  const dims = useMemo(() => boardDimensions(settings), [settings]);
  const hull = useMemo(() => buildBoardGeometry(dims, { lengthSegments: 56, aroundSegments: 24 }), [dims]);
  const fins = useMemo(() => buildFinGeometries(dims, { depthSegments: 3, chordSegments: 5 }), [dims]);
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.3, envMapIntensity: ENV_REFLECTION_SCALE.surfboard }), map: boardPaint(settings, gl), shared: true },
    { material: standard({ roughness: 0.3, envMapIntensity: ENV_REFLECTION_SCALE.surfboard }), color: settings.surfboardFinColor },
  ], [gl, settings]);
  useFinishes(finishes, look);
  useEffect(() => () => hull.dispose(), [hull]);
  useEffect(() => () => fins.forEach((fin) => fin.geometry.dispose()), [fins]);
  return (
    <group position={position} quaternion={quaternion}>
      <mesh geometry={hull} material={finishes[0].material} castShadow receiveShadow />
      {fins.map((fin) => <mesh key={fin.id} geometry={fin.geometry} material={finishes[1].material} position={fin.position} quaternion={fin.quaternion} castShadow />)}
    </group>
  );
}

function Chairs({ chairs, look }) {
  const mesh = useRef();
  const geometry = useMemo(adirondackGeometry, []);
  const finishes = useMemo(() => [{ material: standard({ roughness: 0.75 }), color: look.colors.chairs }], [look.colors.chairs]);
  useFinishes(finishes, look);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    chairs.forEach(({ position, yaw }, i) => mesh.current.setMatrixAt(i, matrix.makeRotationY(yaw).setPosition(...position)));
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [chairs, finishes]);
  return <instancedMesh ref={mesh} args={[geometry, finishes[0].material, chairs.length]} key={`${chairs.length}${look.colors.chairs}`} castShadow receiveShadow />;
}

// Bikini Point: an iron post with an arm; the top hangs from the arm on its
// straps, the briefs are bolted to the post under it.
function BikiniSign({ sign, look }) {
  const plates = useMemo(() => ({ bikini: signPlate('bikini'), point: signPlate('point') }), []);
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.6, metalness: 0.4 }), color: '#34322e' },
    { material: standard({ roughness: 0.55 }), color: RED },
    ...['bikini', 'point'].map((name) => ({ material: standard({ roughness: 0.55 }), map: bikiniFace(SIGN_PLATES[name].text, SIGN_PLATES[name].bounds, SIGN_PLATES[name].textY) })),
  ], []);
  useFinishes(finishes, look);
  useEffect(() => () => Object.values(plates).forEach(({ plate: edge, faces }) => [edge, faces].forEach((geometry) => geometry.dispose())), [plates]);
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

// A painted board on two chains, swinging on its hooks in the wind.
const HANGING = {
  noBadDays: { width: 1.3, height: 0.58, chain: 0.18, paint: noBadDaysFace },
  unpaid: { width: 0.76, height: 0.57, chain: 0.12, paint: unpaidFace },
};
function HangingSign({ sign, look }) {
  const swing = useRef();
  const { width, height, chain, paint } = HANGING[sign.face];
  const parts = useMemo(() => hangingBoard(width, height, chain), [chain, height, width]);
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.85 }), color: '#7d7263' },
    { material: standard({ roughness: 0.8 }), map: paint() },
    { material: standard({ roughness: 0.5, metalness: 0.5 }), color: '#4a443c' },
  ], [paint]);
  useFinishes(finishes, look);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);
  const [wood, face, iron] = finishes.map(({ material }) => material);
  useWind(look, (t, wind) => {
    swing.current.rotation.x = wind * (0.06 * Math.sin(t * 1.3 + sign.phase) + 0.025 * Math.sin(t * 3.1 + sign.phase * 2));
  });
  return (
    <group position={sign.position} rotation={[0, sign.yaw, 0]}>
      <group ref={swing}>
        <mesh geometry={parts.board} material={[wood, wood, wood, wood, face, wood]} castShadow receiveShadow />
        <mesh geometry={parts.links} material={iron} />
      </group>
    </group>
  );
}

// A road sign on a pole in the sand: the plate, its face, bolts; the back
// bare galvanised metal.
const POSTED = {
  nakedSurfing: { shape: DIAMOND, paint: nakedSurfingFace, height: 2.0, bolts: DIAMOND_BOLTS, pole: '#8f8a80' },
  chill: { shape: DISC, paint: chillFace, height: 1.95, bolts: [[0, 0.2], [0, -0.2]], pole: '#c9b79a' },
};
function PostSign({ sign, look }) {
  const { shape, paint, height, bolts, pole } = POSTED[sign.face];
  const parts = useMemo(() => plate(shape, 0.004), [shape]);
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.55, metalness: 0.5 }), color: pole },
    { material: standard({ roughness: 0.6 }), map: paint() },
    { material: standard({ roughness: 0.45, metalness: 0.6 }), color: '#b7b8b4' },
    { material: standard({ roughness: 0.7, metalness: 0.3 }), color: '#7a4a2c' },
  ], [paint, pole]);
  useFinishes(finishes, look);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);
  const [metal, face, bare, rust] = finishes.map(({ material }) => material);
  return (
    <group position={sign.position} rotation={[sign.lean, sign.yaw, sign.lean * 0.6]}>
      <mesh material={metal} position={[0, (height + 0.2 - 0.4) / 2, -0.035]} castShadow><cylinderGeometry args={[0.03, 0.03, height + 0.2 + 0.4, 10]} /></mesh>
      <group position={[0, height, 0]}>
        <mesh geometry={parts.edge} material={bare} castShadow />
        <mesh geometry={parts.front} material={face} />
        <mesh geometry={parts.back} material={bare} />
        {bolts.map(([x, y]) => <mesh key={`${x}${y}`} material={rust} position={[x, y, 0.006]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.014, 0.014, 0.008, 8]} /></mesh>)}
      </group>
    </group>
  );
}

// Red over yellow, the line between them sharp.
function halvesMap(colour) {
  const map = canvas(2, 2, (context) => {
    context.fillStyle = colour;
    context.fillRect(0, 0, 2, 1);
    context.fillStyle = '#f0c93a';
    context.fillRect(0, 1, 2, 1);
  });
  map.magFilter = THREE.NearestFilter;
  return map;
}

// A flag on a white pole stuck in the sand: a red pennant, or the red over
// yellow of the surf lifeguards; the cloth flies in the wind.
function Flag({ flag, look }) {
  const cloth = useMemo(() => clothGrid(12, 6), []);
  const halves = flag.kind === 'halves', colour = look.colors.flags;
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.5 }), color: '#ebe8e0' },
    {
      material: standard({ roughness: 0.85, side: THREE.DoubleSide }),
      ...(halves ? { map: halvesMap(colour) } : { color: colour }),
    },
  ], [colour, halves]);
  useFinishes(finishes, look);
  useEffect(() => () => cloth.dispose(), [cloth]);
  const pole = useMemo(() => {
    const foot = new THREE.Vector3(...flag.foot), up = new THREE.Vector3(...flag.up).normalize();
    return { middle: foot.clone().addScaledVector(up, flag.length / 2).toArray(), turn: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up).toArray(), top: foot.clone().addScaledVector(up, flag.length - 0.03), down: up.clone().negate() };
  }, [flag]);
  const shape = useMemo(() => ({ top: pole.top, down: pole.down, wind: WIND, kind: halves ? 'rectangle' : 'pennant', hoist: halves ? 0.6 : 0.62, fly: halves ? 0.85 : 1.05, phase: flag.phase }), [flag.phase, halves, pole]);
  useLayoutEffect(() => drapeGrid(cloth, flagAt(shape, 0, look.wind)), [cloth, look.wind, shape]);
  useWind(look, (t, wind) => drapeGrid(cloth, flagAt(shape, t, wind)));
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
function WashingLine({ line, look }) {
  const pieces = useRef([]);
  const built = useMemo(() => {
    const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, k) => alongLine(line, k / 12))), 24, 0.004, 4, false);
    const across = new THREE.Vector3(line.b[0] - line.a[0], 0, line.b[2] - line.a[2]).normalize();
    const facing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, new THREE.Vector3(0, 1, 0), new THREE.Vector3().crossVectors(across, new THREE.Vector3(0, 1, 0))));
    const kinds = [...new Set(line.washing.map(({ kind }) => kind))];
    return { rope, facing, geometries: Object.fromEntries(kinds.map((kind) => [kind, clothGeometry(kind)])) };
  }, [line]);
  const finishes = useMemo(() => [
    { material: standard({ roughness: 0.9 }), color: '#dcd6c8' },
    { material: standard({ roughness: 0.95 }), color: '#8a8176' },
    { material: standard({ roughness: 0.8 }), color: '#c9a46a' },
    ...Object.entries(CLOTHES).map(([kind, { colour }]) => ({ kind, material: standard({ roughness: 0.92, side: THREE.DoubleSide }), ...(kind === 'towel' ? { vertexColors: true } : { color: colour }) })),
  ], []);
  useFinishes(finishes, look);
  useEffect(() => () => {
    built.rope.dispose();
    Object.values(built.geometries).forEach((geometry) => geometry.dispose());
  }, [built]);
  useWind(look, (t, wind) => line.washing.forEach(({ phase }, i) => {
    const piece = pieces.current[i];
    if (piece) piece.rotation.x = -wind * (0.22 + 0.14 * Math.sin(t * 1.7 + phase) + 0.05 * Math.sin(t * 4.1 + phase * 2));
  }));
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
function DoorCurtain({ curtain, look }) {
  const cloth = useMemo(() => clothGrid(12, 24), []);
  const colour = look.colors.curtain;
  const finishes = useMemo(() => [
    {
      material: standard({ roughness: 0.9, side: THREE.DoubleSide }),
      map: canvas(256, 4, (context, width, height) => {
        for (let k = 0; k < 8; k += 1) {
          context.fillStyle = k % 2 ? '#fff4e0' : colour;
          context.fillRect((k * width) / 8, 0, width / 8, height);
        }
      }),
    },
    { material: standard({ roughness: 0.5, metalness: 0.4 }), color: '#3a342c' },
  ], [colour]);
  useFinishes(finishes, look);
  useEffect(() => () => cloth.dispose(), [cloth]);
  const shape = useMemo(() => ({ rod: new THREE.Vector3(...curtain.rod), width: curtain.width, height: curtain.height, out: new THREE.Vector3(0, 0, 1), across: new THREE.Vector3(1, 0, 0) }), [curtain]);
  useLayoutEffect(() => drapeGrid(cloth, curtainAt(shape, 0, look.wind)), [cloth, look.wind, shape]);
  useWind(look, (t, wind) => drapeGrid(cloth, curtainAt(shape, t, wind)));
  return (
    <group>
      <mesh geometry={cloth} material={finishes[0].material} castShadow receiveShadow />
      <mesh material={finishes[1].material} position={curtain.rod} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.009, 0.009, curtain.width + 0.06, 6]} /></mesh>
    </group>
  );
}

// The hammock on the side porch, rocking a little on its ropes.
function Hammock({ hammock, look }) {
  const swing = useRef();
  const frame = useMemo(() => {
    const a = new THREE.Vector3(...hammock.a), b = new THREE.Vector3(...hammock.b), along = b.clone().sub(a);
    const span = along.length();
    along.normalize();
    const out = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(out, along);
    return { position: a.toArray(), quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, out)), parts: hammockGeometry(span) };
  }, [hammock]);
  const colour = look.colors.hammock;
  const finishes = useMemo(() => [
    {
      material: standard({ roughness: 0.95, side: THREE.DoubleSide }),
      map: canvas(8, 128, (context, width, height) => {
        context.fillStyle = colour;
        context.fillRect(0, 0, width, height);
        for (let k = 0; k < 9; k += 1) {
          context.fillStyle = k % 3 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(120, 60, 40, 0.25)';
          context.fillRect(0, (height * (k + 0.5)) / 9, width, 2 + (k % 3));
        }
      }),
    },
    { material: standard({ roughness: 0.9 }), color: '#d8cdb0' },
  ], [colour]);
  useFinishes(finishes, look);
  useEffect(() => () => Object.values(frame.parts).forEach((geometry) => geometry.dispose()), [frame]);
  useWind(look, (t, wind) => {
    swing.current.rotation.x = (0.02 + 0.05 * wind) * Math.sin(t * 0.8 + hammock.phase);
  });
  return (
    <group position={frame.position} quaternion={frame.quaternion}>
      <group ref={swing}>
        <mesh geometry={frame.parts.bed} material={finishes[0].material} castShadow receiveShadow />
        <mesh geometry={frame.parts.ropes} material={finishes[1].material} castShadow />
      </group>
    </group>
  );
}

// The drinks machine; its window and display light up as night falls.
function VendingMachine({ machine, look, night }) {
  const parts = useMemo(vendingGeometry, []);
  const front = look.colors.machine, side = look.colors.machineSide;
  const finishes = useMemo(() => {
    const { face, glow } = vendingFaces(front);
    return [
      { material: standard({ roughness: 0.45, metalness: 0.2 }), color: side },
      { material: standard({ roughness: 0.35, metalness: 0.1, emissive: '#ffffff' }), map: face, emissiveMap: glow },
      { material: standard({ roughness: 0.8 }), color: '#2a2622' },
    ];
  }, [front, side]);
  useFinishes(finishes, look);
  useLayoutEffect(() => {
    const { material, emissiveMap } = finishes[1];
    material.emissiveMap = look.clay ? null : emissiveMap;
    material.emissiveIntensity = look.clay ? 0 : 0.25 + 1.6 * night;
    material.needsUpdate = true;
  }, [finishes, look.clay, night]);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);
  const [body, face, dark] = finishes.map(({ material }) => material);
  return (
    <group position={machine.position} rotation={[0, machine.yaw, 0]}>
      <mesh geometry={parts.body} material={[body, body, body, dark, face, body]} castShadow receiveShadow />
      <mesh geometry={parts.plinth} material={dark} />
      {night > 0.3 && !look.clay ? <pointLight position={[0, VENDING.height * 0.6, VENDING.depth / 2 + 0.3]} color="#fff0d0" intensity={night * 1.5} distance={3.5} decay={2} /> : null}
    </group>
  );
}

export default function SurfCampModel({ camp, clay = false, wireframe = false, wind = 1, night = 0, hue = 0, fade = 0, colors = CAMP_COLORS, near = 45, far = 110 }) {
  const root = useRef(), live = useRef(true);
  const look = useMemo(() => ({ clay, wireframe, wind, live, colors: { ...CAMP_COLORS, ...colors } }), [clay, colors, wind, wireframe]);
  useEffect(() => {
    TONE.uCampHue.value = clay ? 0 : hue;
    TONE.uCampFade.value = clay ? 0 : fade;
  }, [clay, fade, hue]);
  // Where the camp is, for the detail by distance: the middle of its things.
  const centre = useMemo(() => {
    const points = [...camp.rings, ...camp.boards].map(({ position }) => new THREE.Vector3(...position));
    return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
  }, [camp]);
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!root.current) return;
    const distance = camera.position.distanceTo(root.current.localToWorld(point.copy(centre)));
    live.current = distance < near;
    root.current.visible = distance < far;
  });
  return (
    <group ref={root} name="surf-camp">
      {camp.rings.length ? <Rings rings={camp.rings} look={look} /> : null}
      {camp.boards.map((board) => <CampBoard key={board.slot} {...board} look={look} />)}
      {camp.chairs ? <Chairs chairs={camp.chairs} look={look} /> : null}
      {camp.sign ? <BikiniSign sign={camp.sign} look={look} /> : null}
      {camp.flags?.map((flag, i) => <Flag key={i} flag={flag} look={look} />)}
      {camp.line ? <WashingLine line={camp.line} look={look} /> : null}
      {camp.curtain ? <DoorCurtain curtain={camp.curtain} look={look} /> : null}
      {camp.hammock ? <Hammock hammock={camp.hammock} look={look} /> : null}
      {camp.machine ? <VendingMachine machine={camp.machine} look={look} night={night} /> : null}
      {camp.hanging?.map((sign) => <HangingSign key={sign.face} sign={sign} look={look} />)}
      {camp.posts?.map((sign) => <PostSign key={sign.face} sign={sign} look={look} />)}
    </group>
  );
}
