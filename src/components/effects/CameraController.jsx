import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

const CameraController = ({ settings, orbitRef }) => {
    const { camera } = useThree();
    const wasFreeCamera = useRef(settings.freeCamera);

    useFrame(() => {
        // Update FOV reactively
        if (camera.fov !== settings.cameraFov) {
            camera.fov = settings.cameraFov;
            camera.updateProjectionMatrix();
        }

        // When freeCamera was just turned OFF, snap back to top-down
        if (wasFreeCamera.current && !settings.freeCamera) {
            camera.position.set(0, 50, 0.01);
            camera.up.set(0, 1, 0);
            camera.lookAt(0, -1, 0);
            camera.updateProjectionMatrix();
            if (orbitRef.current) {
                orbitRef.current.target.set(0, -1, 0);
                orbitRef.current.update();
            }
        }
        wasFreeCamera.current = settings.freeCamera;
    });

    return null;
};

export default CameraController;
