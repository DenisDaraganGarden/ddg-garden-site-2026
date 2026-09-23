import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ENV_REFLECTION_SCALE, colorPickerToArtisticAlbedo, configureMaps } from '../effects/water/pbrMaterial';
import { DEFAULT_SURFBOARD_SETTINGS } from './settings';
import { boardDimensions, buildBoardGeometry, buildFinGeometries, deckHeight } from './boardShape';
import { boardTextureLayout, createBoardTexture, paintBoardTexture } from './boardTexture';

// The surfboard as it looks, in its own frame (+Z nose, +Y deck, origin at
// mid-length on the lowest point of the bottom). No placement and no physics:
// whoever carries it — the lab's stand, the scene's float — moves the group.
// The shape and the paint come from boardShape / boardTexture; the glassing is
// a clearcoat over the painted map, lit by the same environment factor scheme
// as the boat so it sits in the scene's light instead of glowing on top of it.

const LEASH_PLUG_FROM_TAIL = 0.07;
const PLUG_COLOR = '#1d1f20';

export default function SurfboardModel({ settings = {}, lighting, castShadow = true, receiveShadow = true, wireframe = false }) {
  const { gl, invalidate } = useThree();
  const {
    surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker,
    surfboardDeckColor, surfboardRailColor, surfboardStripeColor, surfboardStringerColor, surfboardFinColor, surfboardStripes,
  } = settings;
  const dims = useMemo(() => boardDimensions({
    surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker,
  }), [surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker]);

  const hullGeometry = useMemo(() => buildBoardGeometry(dims), [dims]);
  const fins = useMemo(() => buildFinGeometries(dims), [dims]);

  // The paint: one canvas texture and one material for the model's life, so a
  // colour dragged in the editor repaints in place instead of building a new
  // texture and material (and relinking the clearcoat program) on every input
  // event. The shape's layout is kept until the shape changes; the colours
  // are deferred, so a fast drag paints only the values React gets round to.
  const paint = useMemo(() => {
    const texture = createBoardTexture();
    if (texture) configureMaps(gl, { color: [texture] });
    return texture;
  }, [gl]);
  const layout = useMemo(() => boardTextureLayout(dims), [dims]);
  const colours = useDeferredValue(useMemo(() => ({
    surfboardDeckColor, surfboardRailColor, surfboardStripeColor, surfboardStringerColor, surfboardFinColor, surfboardStripes,
  }), [surfboardDeckColor, surfboardFinColor, surfboardRailColor, surfboardStringerColor, surfboardStripeColor, surfboardStripes]));
  useLayoutEffect(() => {
    if (!paint) return;
    paintBoardTexture(paint.image, colours, layout);
    paint.needsUpdate = true;
    // A deferred repaint can land with no frame asked for (the paused editor).
    invalidate();
  }, [colours, invalidate, layout, paint]);

  // Glassing: a satin laminate under a glossy hot coat. The gloss belongs to
  // the coat; the laminate keeps only a soft sheen of its own, or the two
  // dielectric lobes together wash the black stripes out to grey. The fins are
  // solid fibreglass, a touch glossier; the leash plug is plain moulded plastic.
  const hullMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    name: 'surfboard-glass', map: paint, roughness: 0.32, metalness: 0, specularIntensity: 0.55,
    clearcoat: 1, clearcoatRoughness: 0.08,
  }), [paint]);
  const finMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    name: 'surfboard-fin', roughness: 0.26, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12,
  }), []);
  useLayoutEffect(() => {
    finMaterial.color.copy(colorPickerToArtisticAlbedo(colours.surfboardFinColor, DEFAULT_SURFBOARD_SETTINGS.surfboardFinColor));
  }, [colours.surfboardFinColor, finMaterial]);
  const plugMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    name: 'surfboard-plug', color: colorPickerToArtisticAlbedo(PLUG_COLOR), roughness: 0.55, metalness: 0,
  }), []);

  const reflection = (lighting?.environment?.reflection ?? 1) * ENV_REFLECTION_SCALE.surfboard;
  useEffect(() => {
    [hullMaterial, finMaterial, plugMaterial].forEach((material) => {
      material.envMapIntensity = reflection;
      material.wireframe = wireframe;
    });
  }, [finMaterial, hullMaterial, plugMaterial, reflection, wireframe]);

  // The leash plug sits flush in the deck on the stringer, tilted with the kick.
  const leash = useMemo(() => {
    const z = -dims.length / 2 + LEASH_PLUG_FROM_TAIL;
    const slope = (deckHeight(dims, 0, z + 0.01) - deckHeight(dims, 0, z - 0.01)) / 0.02;
    return { position: [0, deckHeight(dims, 0, z), z], rotation: [-Math.atan(slope), 0, 0] };
  }, [dims]);

  useEffect(() => () => hullGeometry.dispose(), [hullGeometry]);
  useEffect(() => () => fins.forEach((fin) => fin.geometry.dispose()), [fins]);
  useEffect(() => () => paint?.dispose(), [paint]);
  useEffect(() => () => hullMaterial.dispose(), [hullMaterial]);
  useEffect(() => () => finMaterial.dispose(), [finMaterial]);
  useEffect(() => () => plugMaterial.dispose(), [plugMaterial]);

  return (
    <group name="surfboard-model">
      <mesh name="surfboard-hull" geometry={hullGeometry} material={hullMaterial} castShadow={castShadow} receiveShadow={receiveShadow} />
      {fins.map((fin) => (
        <mesh
          key={fin.id}
          name={fin.name}
          geometry={fin.geometry}
          material={finMaterial}
          position={fin.position}
          quaternion={fin.quaternion}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
      <group name="surfboard-leash-plug" position={leash.position} rotation={leash.rotation}>
        <mesh material={plugMaterial} position={[0, -0.001, 0]} receiveShadow={receiveShadow}>
          <cylinderGeometry args={[0.0125, 0.0125, 0.003, 24]} />
        </mesh>
        <mesh material={plugMaterial} position={[0, 0.0012, 0]} castShadow={castShadow}>
          <boxGeometry args={[0.02, 0.0028, 0.0035]} />
        </mesh>
      </group>
    </group>
  );
}
