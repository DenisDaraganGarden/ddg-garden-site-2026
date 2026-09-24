import React, { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import BeachHouseModel from './BeachHouseModel';
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

export default function BeachHouseScene(props) {
  const built = useBeachHouse(props.settings);
  // The maps start loading from an effect, not from inside a render, where
  // the scene's loading progress would be set while another part renders.
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    useLoader.preload(THREE.TextureLoader, houseMapUrls(props.lowPower));
    setAsked(true);
  }, [props.lowPower]);
  return asked ? <BeachHouseView {...props} built={built} /> : null;
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
  return (
    <group name="beach-house" position={[settings.houseX, baseY, settings.houseZ]} rotation={[0, heading, 0]}>
      <Suspense fallback={null}>
        <BeachHouseModel building={house} seed={settings.houseSeed} {...common} />
        {settings.houseShed ? (
          <group position={[shedAt[0], shedY, shedAt[2]]} rotation={[0, SHED_TURN, 0]}>
            <BeachHouseModel building={shed} seed={settings.houseSeed + 5} {...common} />
            {settings.houseCamp ? <SurfCampModel camp={shedThings} {...things} /> : null}
          </group>
        ) : null}
        {clay ? null : <StringLights spans={spans} power={settings.houseGarlands} night={night} />}
        {settings.houseCamp ? <SurfCampModel camp={camp} {...things} /> : null}
      </Suspense>
    </group>
  );
}
