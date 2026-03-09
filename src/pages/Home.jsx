import React from 'react';
import { Canvas } from '@react-three/fiber';
import SnakeScene from '../components/effects/SnakeScene';
import { useSnakeSettings } from '../hooks/useSnakeSettings';

const Home = () => {
    const { settings } = useSnakeSettings();

    return (
        <div className="home-page snake-home-page">
            <div className="snake-home-canvas">
                <Canvas shadows camera={{ fov: settings.cameraFov, position: [0, 50, 0.01], up: [0, 1, 0] }}>
                    <SnakeScene settings={{ ...settings, freeCamera: false }} />
                </Canvas>
            </div>
        </div>
    );
};

export default Home;
