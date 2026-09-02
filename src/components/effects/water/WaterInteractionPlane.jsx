import React, { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp, effectiveImpulseRadius } from './constants';

// The invisible plane the pointer talks to. Ripples, and the cursor's push on the
// boat, are both raised here rather than on the water mesh itself: the water mesh
// is displaced every frame, and hit-testing a moving surface is needlessly noisy.

export default function WaterInteractionPlane({
  settings,
  pointerStateRef,
  sampleBoatProbes,
  enableSurfaceRefine = true,
  debug = false,
}) {
  const { camera, gl, size } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcPointerRef = useRef(new THREE.Vector2());
  const rayHitPointRef = useRef(new THREE.Vector3());
  const projectedUvRef = useRef(new THREE.Vector2(0.5, 0.5));
  const deltaUvRef = useRef(new THREE.Vector2());
  const waterPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const surfacePlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const surfaceProbePointsRef = useRef([
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const lastSurfaceRefineTimeRef = useRef(-Infinity);
  const debugMarkerRef = useRef();
  const reprojectRef = useRef(new THREE.Vector3());
  const markerWorldRef = useRef(new THREE.Vector3());
  const markerProjectedRef = useRef(new THREE.Vector3());

  const deactivatePointerState = useCallback(() => {
    // Keep a valid impulse pending until the simulation consumes it. A quick
    // click can complete between two simulation ticks; clearing here would lose
    // both the water ring and the boat push.
    pointerStateRef.current.isInside = false;
  }, [pointerStateRef]);

  const discardPointerState = useCallback(() => {
    pointerStateRef.current.hasImpulse = false;
    pointerStateRef.current.impulseStrength = 0;
    pointerStateRef.current.isInside = false;
  }, [pointerStateRef]);

  const worldPointToUv = useCallback((point) => {
    if (!point) {
      return null;
    }

    const halfExtent = settings.waterExtent * 0.5;
    if (Math.abs(point.x) > halfExtent || Math.abs(point.z) > halfExtent) {
      return null;
    }

    projectedUvRef.current.set(
      clamp((point.x + halfExtent) / settings.waterExtent, 0.001, 0.999),
      clamp((halfExtent - point.z) / settings.waterExtent, 0.001, 0.999),
    );

    return projectedUvRef.current;
  }, [settings.waterExtent]);

  const screenPointToHit = useCallback((clientX, clientY) => {
    const domElement = gl.domElement;
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    ndcPointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );

    // The pointer handler runs between frames. If the camera has moved since the
    // last render - orbiting, or the rig re-applying the authored pose - its world
    // and projection matrices are stale, and a ray built from them aims where the
    // camera used to be.
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    // updateMatrixWorld does not touch matrixWorldInverse - the renderer maintains
    // that separately - and Vector3.project reads it. Without this the instrument
    // measures the projection against a camera pose that may be a frame old.
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    raycasterRef.current.setFromCamera(ndcPointerRef.current, camera);
    const ray = raycasterRef.current.ray;
    const hit = ray.intersectPlane(waterPlaneRef.current, rayHitPointRef.current);
    if (!hit) {
      return null;
    }

    // Refine the hit against the actual displaced water surface, so the impulse lands
    // under the cursor even at grazing / zoomed camera angles (parallax fix). We read the
    // wave height under the first guess and re-aim at that height. One iteration is
    // enough for the small displacement used here and halves synchronous GPU reads.
    // Only the refinement is rate limited: it costs a synchronous GPU readback.
    // The ray itself is a plane intersection, so there is no reason to sample the
    // pointer at anything less than the rate the pointer actually moves.
    const canRefine = enableSurfaceRefine
      && typeof sampleBoatProbes === 'function'
      && settings.waveAmplitude > 0.0001
      && (performance.now() - lastSurfaceRefineTimeRef.current) >= (1000 / 30);

    if (canRefine) {
      lastSurfaceRefineTimeRef.current = performance.now();
      for (let iteration = 0; iteration < 1; iteration += 1) {
        const probePoints = surfaceProbePointsRef.current;
        for (let index = 0; index < probePoints.length; index += 1) {
          probePoints[index].copy(rayHitPointRef.current);
        }

        const probes = sampleBoatProbes(probePoints, 'pointer');
        if (!probes) {
          break;
        }

        surfacePlaneRef.current.constant = -(probes[0].height * settings.waveAmplitude);
        if (!ray.intersectPlane(surfacePlaneRef.current, rayHitPointRef.current)) {
          break;
        }
      }
    }

    const uv = worldPointToUv(rayHitPointRef.current);
    if (!uv) {
      // Off the water entirely - past the far edge, or above the horizon. Say so,
      // otherwise the readout silently keeps showing the last good sample and
      // looks like the pointer froze.
      // Freezing the marker here is what made the pointer look like it missed:
      // it stayed at the last point inside the simulation while the cursor kept
      // going, so the gap grew with distance. Off the simulated water it hides.
      if (debugMarkerRef.current) {
        debugMarkerRef.current.visible = false;
      }

      if (import.meta.env.DEV && typeof window !== 'undefined') {
        window.__DDG_POINTER__ = {
          client: { x: clientX, y: clientY },
          onWater: false,
          world: {
            x: rayHitPointRef.current.x,
            y: rayHitPointRef.current.y,
            z: rayHitPointRef.current.z,
          },
        };
      }
      return null;
    }

    // Debug instrument: publish every step of the pointer -> world -> simulation
    // chain so the two ends can be compared numerically instead of by eye.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      // Project the hit back to the screen. If the ray maths is right this lands
      // on the cursor, and the error is the honest answer to "does it miss?".
      const reprojected = reprojectRef.current.copy(rayHitPointRef.current).project(camera);
      const projectedClient = {
        x: rect.left + ((reprojected.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - reprojected.y) / 2) * rect.height,
      };

      window.__DDG_POINTER__ = {
        client: { x: clientX, y: clientY },
        onWater: true,
        // The ray is built from the CSS box, but the camera's aspect comes from
        // r3f's own measurement. If those two disagree the ray is skewed, and a
        // reprojection through the same box cannot reveal it - only comparing the
        // two measurements can.
        canvasCssSize: { width: rect.width, height: rect.height },
        r3fSize: { width: size.width, height: size.height },
        aspectMismatch: Math.round(((rect.width / rect.height) - (size.width / size.height)) * 10000) / 10000,
        cameraAspect: Math.round(camera.aspect * 10000) / 10000,
        projectedClient,
        errorPx: Math.round(Math.hypot(projectedClient.x - clientX, projectedClient.y - clientY) * 100) / 100,
        canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        ndc: { x: ndcPointerRef.current.x, y: ndcPointerRef.current.y },
        world: {
          x: rayHitPointRef.current.x,
          y: rayHitPointRef.current.y,
          z: rayHitPointRef.current.z,
        },
        uv: { x: uv.x, y: uv.y },
        // rippleRadius is authored in metres and divided by the extent before it
        // reaches the shader, where it is also clamped - so the radius the water
        // actually feels is not the slider value at either end of that clamp.
        impulseRadiusMetres: effectiveImpulseRadius(settings),
        // The cursor pushes the boat over a far wider area than it ripples the
        // water, which is why the hull answers a pointer that looks nowhere near it.
        boatImpactRadiusMetres: effectiveImpulseRadius(settings) * 5.2,
        refined: Boolean(enableSurfaceRefine && sampleBoatProbes),
      };
    }

    if (debugMarkerRef.current) {
      debugMarkerRef.current.visible = true;
      debugMarkerRef.current.position.copy(rayHitPointRef.current);
      debugMarkerRef.current.position.y += 0.02;

      if (import.meta.env.DEV && typeof window !== 'undefined' && window.__DDG_POINTER__) {
        // Where the marker really is, and where that world point should land on
        // screen. If the drawn marker sits somewhere else, the camera the scene
        // is rendered with is not the camera this ray was built from.
        debugMarkerRef.current.updateWorldMatrix(true, false);
        const markerWorld = debugMarkerRef.current.getWorldPosition(markerWorldRef.current);
        const projected = markerProjectedRef.current.copy(markerWorld).project(camera);
        window.__DDG_POINTER__.markerWorld = { x: markerWorld.x, y: markerWorld.y, z: markerWorld.z };
        window.__DDG_POINTER__.markerScreen = {
          x: Math.round(rect.left + ((projected.x + 1) / 2) * rect.width),
          y: Math.round(rect.top + ((1 - projected.y) / 2) * rect.height),
        };
      }
    }

    return rayHitPointRef.current;
  }, [
    camera,
    gl,
    worldPointToUv,
    sampleBoatProbes,
    settings,
    size.width,
    size.height,
    enableSurfaceRefine,
  ]);

  const registerPointerImpulse = useCallback((uv, worldPoint, baseStrength = 0.22) => {
    if (!uv) {
      return;
    }

    const pointerState = pointerStateRef.current;
    const wasInside = pointerState.isInside;
    const deltaStrength = wasInside
      ? clamp(deltaUvRef.current.copy(uv).sub(pointerState.uv).length() * 28, 0, 1)
      : 0;

    pointerState.uv.copy(uv);

    if (!wasInside) {
      pointerState.impulseUv.copy(uv);
      pointerState.isInside = true;

      if (baseStrength <= 0.01) {
        return;
      }
    }

    const impulseStrength = Math.max(baseStrength, deltaStrength);

    if (impulseStrength <= 0.01) {
      return;
    }

    pointerState.impulseUv.copy(uv);
    if (worldPoint) {
      pointerState.impulseWorldPoint.copy(worldPoint);
    }
    pointerState.impulseStrength = clamp(impulseStrength, 0.18, 1);
    pointerState.hasImpulse = true;
    pointerState.isInside = true;
  }, [pointerStateRef]);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!domElement) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      // Sampled at the pointer's own rate. Throttling this to 30 Hz on a 120 Hz
      // display made the splash land where the cursor had been up to 33 ms
      // earlier, which reads as the cursor missing rather than as lag.
      const hitPoint = screenPointToHit(event.clientX, event.clientY);
      if (!hitPoint) {
        deactivatePointerState();
        return;
      }

      const isLeftPressed = (event.buttons & 1) === 1;
      const interactionStrength = isLeftPressed ? 0.68 : 0.32;
      registerPointerImpulse(projectedUvRef.current, hitPoint, interactionStrength);
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0) {
        return;
      }
      // A gull click is resolved on pointer-up by the creature runtime. Do not
      // raise an unrelated cursor splash underneath it before the body reaches
      // the surface; the actual impact will enqueue its own physical impulse.
      if (domElement.dataset.seagullShotTarget !== undefined) {
        discardPointerState();
        return;
      }

      const hitPoint = screenPointToHit(event.clientX, event.clientY);
      if (!hitPoint) {
        return;
      }
      registerPointerImpulse(projectedUvRef.current, hitPoint, 0.92);
    };

    const handlePointerLeave = () => {
      deactivatePointerState();
    };

    domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
    domElement.addEventListener('pointerdown', handlePointerDown, { passive: true });
    domElement.addEventListener('pointerup', handlePointerLeave, { passive: true });
    domElement.addEventListener('pointercancel', handlePointerLeave, { passive: true });
    domElement.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    return () => {
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerLeave);
      domElement.removeEventListener('pointercancel', handlePointerLeave);
      domElement.removeEventListener('pointerleave', handlePointerLeave);
      discardPointerState();
    };
  }, [
    deactivatePointerState,
    discardPointerState,
    gl,
    registerPointerImpulse,
    screenPointToHit,
  ]);

  return (
    <>
      {debug ? <PointerDebugMarker settings={settings} markerRef={debugMarkerRef} /> : null}
      {debug ? <PointerPixelProbe enabled={debug} /> : null}
      {debug ? <SceneReferenceMast objectName="boat-anchor" color="#35ff9e" /> : null}
      {debug ? <SceneReferenceMast objectName="sculpture-anchor" color="#ffd23b" /> : null}
    <mesh
      name="water-interaction-plane"
      rotation={[-Math.PI / 2, 0, 0]}
      // Sits on the same plane the ray is cast against. The 5 cm it used to float
      // at put r3f's own hit 10 cm away from the manual one at a grazing camera.
      position={[0, 0, 0]}
      visible={debug}
      onPointerMove={debug ? (event) => {
        // r3f derives its own pointer -> world hit. Comparing it with the manual
        // ray is the only check that is not circular: the manual path builds the
        // ray from the css box and then reprojects through the same box, so it
        // cannot see an error in that box at all.
        if (typeof window !== 'undefined') {
          window.__DDG_R3F_POINT__ = { x: event.point.x, y: event.point.y, z: event.point.z };
        }
      } : undefined}
    >
      <planeGeometry args={[settings.waterExtent, settings.waterExtent, 1, 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
    </>
  );
}

// Draws where the pointer actually lands and how far the impulse it raises
// reaches. The inner cross is the ray hit; the ring is the impulse footprint,
// which is authored in uv and therefore scales with the water extent.
// A mast planted on an object whose world position we already know. If it draws
// on that object, then world -> screen is faithful and any pointer mismatch has
// to be upstream. If it draws beside it, the render disagrees with the world and
// nothing measured against the camera can be trusted.
export function SceneReferenceMast({ objectName, color }) {
  const { scene } = useThree();
  const groupRef = useRef();

  useFrame(() => {
    const target = scene.getObjectByName(objectName);
    if (target && groupRef.current) {
      target.getWorldPosition(groupRef.current.position);
      groupRef.current.position.y = 0;
    }
  });

  return (
    <group ref={groupRef} name={`reference-${objectName}`}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 3, 8]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Reads the finished frame back from the GPU and finds the marker by colour.
// Every earlier measurement compared the ray against something derived from the
// same camera, so a shared error stayed invisible. Pixels cannot collude: this
// reports where the marker is actually drawn, in buffer coordinates.
export function PointerPixelProbe({ enabled }) {
  const { gl } = useThree();
  const lastSampleRef = useRef(0);
  const bufferRef = useRef(null);

  useFrame(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const now = performance.now();
    if (now - lastSampleRef.current < 500) {
      return;
    }
    lastSampleRef.current = now;

    const canvas = gl.domElement;
    const width = canvas.width;
    const height = canvas.height;
    const context = gl.getContext();
    const needed = width * height * 4;

    if (!bufferRef.current || bufferRef.current.length !== needed) {
      bufferRef.current = new Uint8Array(needed);
    }

    gl.setRenderTarget(null);
    context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, bufferRef.current);

    const pixels = bufferRef.current;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let index = 0; index < needed; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      // magenta: both ends of the spectrum lit, the middle dark
      if (red > 150 && blue > 110 && green < red * 0.6 && green < blue * 0.75) {
        const pixel = index / 4;
        sumX += pixel % width;
        sumY += Math.floor(pixel / width);
        count += 1;
      }
    }

    const rect = canvas.getBoundingClientRect();
    window.__DDG_PIXEL_PROBE__ = count > 0
      ? {
        found: count,
        bufferPx: { x: Math.round(sumX / count), y: Math.round(sumY / count) },
        // readPixels counts from the bottom, the page counts from the top
        clientPx: {
          x: Math.round(rect.left + (sumX / count) * (rect.width / width)),
          y: Math.round(rect.top + (height - sumY / count) * (rect.height / height)),
        },
        buffer: { width, height },
      }
      : { found: 0 };
  }, 200);

  return null;
}

export function PointerDebugMarker({ settings, markerRef }) {
  const impulseRadius = Math.max(effectiveImpulseRadius(settings), 0.02);
  const boatRadius = impulseRadius * 5.2;

  return (
    <group ref={markerRef} name="pointer-debug" renderOrder={40}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[impulseRadius * 0.985, impulseRadius, 96]} />
        <meshBasicMaterial color="#ff3b6b" transparent opacity={0.75} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0, 0.25, 32]} />
        <meshBasicMaterial color="#ff00ff" depthTest={false} toneMapped={false} />
      </mesh>
      {/* A ring a few pixels across is invisible against dark water, and an
          instrument you cannot read is worse than none. The mast is unmistakable. */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 3, 8]} />
        <meshBasicMaterial color="#ff8800" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[boatRadius * 0.99, boatRadius, 96]} />
        <meshBasicMaterial color="#35a7ff" transparent opacity={0.55} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
