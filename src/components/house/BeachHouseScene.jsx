import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import BeachHouseModel from './BeachHouseModel';
import GroundShade from './GroundShade';
import StringLights from './StringLights';
import SurfCampModel from './SurfCampModel';
import { houseMapUrls } from './houseMaterial';
import { campPaintOf, housePaintOf } from './settings';
import { SHED_TURN, useBeachHouse } from './useBeachHouse';

// Bikini Point as one thing, from the scene's flat settings (settings.js):
// the house, the shed off the foot of its stairs, the festoon lights and a
// strand across to the shed, the surfers' things. Set down with its middle
// at (houseX, houseZ), turned houseHeading, on the ground `groundAt(x, z)`
// gives (the terrain; y = 0 without it) — the shed on its own spot of it.

// Lit like every other thing in the scene — by the sky, or by the panorama
// when one lights the scene — with one difference (Denis's rule for the
// house): a panorama is one fixed hour and does not dim with the scene's
// hour, so the house takes it only as much as the sky has daylight: fully by
// day, fading through twilight (the sun from 12 degrees up to 6 below), a
// trace at night. Only the house's own materials are touched; the scene's
// sun and moon, fill lights, shadows, fog and panorama stay as they are.
const NIGHT_TRACE = 0.04;
function useDaylight(root, { hdri, sunElevation }) {
  const { scene } = useThree();
  const latest = useRef({ hdri, sunElevation });
  useEffect(() => { latest.current = { hdri, sunElevation }; });
  useFrame(() => {
    if (!root.current) return;
    const { hdri: panorama, sunElevation: elevation } = latest.current;
    const map = panorama ? scene.environment : null;
    const daylight = NIGHT_TRACE + (1 - NIGHT_TRACE) * THREE.MathUtils.smoothstep(elevation ?? 90, -6, 12);
    root.current.traverse((object) => {
      if (!object.material) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material.isMeshStandardMaterial) continue;
        if (material.envMap !== map) {
          material.envMap = map;
          material.needsUpdate = true;
        }
        if (map) {
          material.envMapIntensity = scene.environmentIntensity * daylight;
          material.envMapRotation.copy(scene.environmentRotation);
        }
      }
    });
  });
}

export default function BeachHouseScene({ hdri = false, sunElevation = 90, ...props }) {
  const built = useBeachHouse(props.settings);
  const root = useRef();
  useDaylight(root, { hdri, sunElevation });
  // The maps start loading from an effect, not from inside a render, where
  // the scene's loading progress would be set while another part renders.
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    useLoader.preload(THREE.TextureLoader, houseMapUrls(props.lowPower));
    setAsked(true);
  }, [props.lowPower]);
  return <group ref={root}>{asked ? <BeachHouseView {...props} built={built} /> : null}</group>;
}

// The same, drawn from buildings already built (the lab builds them itself,
// for its facts and its surfer).
export function BeachHouseView({ settings, built, night = 0, clay = false, wireframe = false, lowPower = false, groundAt = null }) {
  const { house, shed, shedAt, camp, shedThings, yardSpan } = built;
  const heading = THREE.MathUtils.degToRad(settings.houseHeading);
  const ground = (x, z) => (groundAt ? groundAt(x, z) : 0);
  const baseY = ground(settings.houseX, settings.houseZ);
  const shedWorld = new THREE.Vector3(...shedAt).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(new THREE.Vector3(settings.houseX, 0, settings.houseZ));
  const shedY = ground(shedWorld.x, shedWorld.z) - baseY;
  // Colours as values, not as a new object every render: a new one would
  // repaint everything on any slider.
  const paintKey = JSON.stringify([housePaintOf(settings), campPaintOf(settings)]);
  const [colors, campColors] = useMemo(() => JSON.parse(paintKey), [paintKey]);
  const spans = useMemo(() => (settings.houseShed ? [...house.plan.garlands, { ...yardSpan, b: [yardSpan.b[0], yardSpan.b[1] + shedY, yardSpan.b[2]] }] : house.plan.garlands), [house, settings.houseShed, shedY, yardSpan]);
  const common = { colors, clay, wireframe, weather: settings.houseWeather, lamps: settings.houseLamps, night, lowPower };
  const things = { clay, wireframe, wind: settings.houseCampWind, night, hue: THREE.MathUtils.degToRad(settings.houseCampHue), fade: settings.houseCampFade, colors: campColors };
  // The sand under a house on stilts is in the house's shade all day; so is
  // the sand under the shed's deck.
  const houseShade = useMemo(() => {
    const { houseWidth: W, houseLength: L, porch: { depth: P }, annex } = house.plan;
    return [
      { x: P / 2, z: P / 2, rx: (W + P) / 2 + 0.5, rz: (L + P) / 2 + 0.5, strength: 0.55, box: true },
      { x: (annex.x0 + annex.x1) / 2, z: (annex.z0 + annex.z1) / 2, rx: (annex.x1 - annex.x0) / 2 + 0.4, rz: (annex.z1 - annex.z0) / 2 + 0.4, strength: 0.45, box: true },
    ];
  }, [house]);
  const shedShade = useMemo(() => [{ x: 0.3, z: 0, rx: 2.3, rz: 1.75, strength: 0.5, box: true }], []);
  return (
    <group name="beach-house" position={[settings.houseX, baseY, settings.houseZ]} rotation={[0, heading, 0]}>
      <Suspense fallback={null}>
        <BeachHouseModel building={house} seed={settings.houseSeed} {...common} />
        <GroundShade spots={houseShade} visible={!clay} />
        {settings.houseShed ? (
          <group position={[shedAt[0], shedY, shedAt[2]]} rotation={[0, SHED_TURN, 0]}>
            <BeachHouseModel building={shed} seed={settings.houseSeed + 5} {...common} />
            <GroundShade spots={shedShade} visible={!clay} />
            {settings.houseCamp ? <SurfCampModel camp={shedThings} {...things} /> : null}
          </group>
        ) : null}
        {clay ? null : <StringLights spans={spans} power={settings.houseGarlands} night={night} />}
        {settings.houseCamp ? <SurfCampModel camp={camp} {...things} /> : null}
      </Suspense>
    </group>
  );
}
