import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

// Light objects, the Corona Light way: the light has a body you can see and a
// target you drag, and the two are separate things in the scene. Both ends are
// ordinary named objects, so the editor's existing gizmo moves them - no new
// interaction code.
//
// They never cast shadows. A second shadow map is the single most expensive
// thing this feature could ask for, and the plan refuses it: these are fill and
// accent lights, and the key light is the one that shapes the frame.

// Layer 3 is the "not in reflections" bit. three culls lights by layer against
// the camera (WebGLRenderer), so moving a light onto this layer removes both the
// light AND its illumination from the mirror - not just the visible bulb.
export const NO_REFLECTION_LAYER = 3;

const SLOTS = [1, 2];

function LightObject({ settings, slot }) {
  const groupRef = useRef();
  const targetRef = useRef();
  const lightRef = useRef();

  const prefix = `light${slot}`;
  const enabled = Boolean(settings[`${prefix}Enabled`]);
  const inReflections = settings[`${prefix}InReflections`] !== false;
  const sourceVisible = settings[`${prefix}SourceVisible`] !== false;
  const coneAngle = settings[`${prefix}ConeAngle`] ?? 38;
  const color = settings[`${prefix}Color`] ?? '#ffd9a0';
  const intensity = settings[`${prefix}Intensity`] ?? 12;
  const softness = settings[`${prefix}Softness`] ?? 0.4;

  const position = useMemo(() => [
    settings[`${prefix}X`] ?? 0,
    settings[`${prefix}Y`] ?? 2.5,
    settings[`${prefix}Z`] ?? 0,
  ], [prefix, settings]);

  const target = useMemo(() => [
    settings[`${prefix}TargetX`] ?? 0,
    settings[`${prefix}TargetY`] ?? 0,
    settings[`${prefix}TargetZ`] ?? 0,
  ], [prefix, settings]);

  // three needs the target to be in the scene graph for a spot light to aim.
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }
  }, [enabled]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) {
      return;
    }

    // Layer membership decides reflection visibility for the light itself and
    // for the bulb mesh under the same group.
    const layer = inReflections ? 0 : NO_REFLECTION_LAYER;
    light.layers.set(layer);
    groupRef.current?.traverse((child) => {
      if (child.isMesh) {
        child.layers.set(layer);
      }
    });
  }, [inReflections, enabled]);

  if (!enabled) {
    return null;
  }

  // Past 180 degrees a cone is a sphere; that is a point light, and saying so is
  // cheaper than a second control asking which type this is.
  const isOmni = coneAngle >= 179;

  return (
    <>
      <group ref={groupRef} name={`light-${slot}-anchor`} position={position}>
        {isOmni ? (
          <pointLight
            ref={lightRef}
            color={color}
            intensity={intensity}
            distance={0}
            decay={2}
            castShadow={false}
          />
        ) : (
          <spotLight
            ref={lightRef}
            color={color}
            intensity={intensity}
            angle={THREE.MathUtils.degToRad(coneAngle) * 0.5}
            penumbra={softness}
            distance={0}
            decay={2}
            castShadow={false}
          />
        )}
        {sourceVisible ? (
          <mesh name={`light-${slot}-source`}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ) : null}
      </group>
      <object3D ref={targetRef} name={`light-${slot}-target`} position={target} />
    </>
  );
}

export default function SceneLightObjects({ settings }) {
  return (
    <>
      {SLOTS.map((slot) => (
        <LightObject key={slot} settings={settings} slot={slot} />
      ))}
    </>
  );
}
