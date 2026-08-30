import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Observe the camera after the existing rig has authored it. The bridge never
// changes camera state, so slideshow cuts and editor navigation remain owned by
// WaterCameraRig while Web Audio receives the final listener pose.
export default function HomeSoundscapeBridge({ runtime }) {
  const { camera, gl } = useThree();
  const controls = useThree((state) => state.controls);
  const vectorsRef = useRef({
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
    worldQuaternion: new THREE.Quaternion(),
  });

  useEffect(() => {
    if (!runtime) {
      return undefined;
    }

    gl.domElement.dataset.ddgAudioBridge = 'camera-listener';
    return () => {
      delete gl.domElement.dataset.ddgAudioBridge;
      delete gl.domElement.dataset.ddgAudioListener;
    };
  }, [gl, runtime]);

  const syncListenerPose = useCallback(() => {
    if (!runtime?.updateListener || runtime.isActive?.() === false) {
      return;
    }

    const vectors = vectorsRef.current;
    camera.updateMatrixWorld();
    camera.getWorldPosition(vectors.position);
    camera.getWorldDirection(vectors.forward);
    camera.getWorldQuaternion(vectors.worldQuaternion);
    vectors.up.copy(camera.up).applyQuaternion(vectors.worldQuaternion).normalize();
    runtime.updateListener(vectors.position, vectors.forward, vectors.up);

    if (import.meta.env.DEV) {
      gl.domElement.dataset.ddgAudioListener = [
        vectors.position.x,
        vectors.position.y,
        vectors.position.z,
      ].map((value) => value.toFixed(3)).join(',');
    }
  }, [camera, gl, runtime]);

  // The frame observer follows the public slideshow camera. In the editor,
  // OrbitControls can also update between frames while damping; its change
  // event synchronizes the listener immediately without writing camera state.
  useEffect(() => {
    if (!controls?.addEventListener) {
      return undefined;
    }

    controls.addEventListener('change', syncListenerPose);
    return () => controls.removeEventListener('change', syncListenerPose);
  }, [controls, syncListenerPose]);

  useFrame(syncListenerPose);

  return null;
}
