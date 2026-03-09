import React from 'react';
import SceneCanvas from '../components/effects/SceneCanvas';
import SnakeScene from '../components/effects/SnakeScene';
import { usePublishedSnakeSettings } from '../hooks/useSnakeSettings';

const Home = () => {
    const { settings } = usePublishedSnakeSettings();

    return (
        <div className="home-page snake-home-page">
            <SceneCanvas
                sceneId="home"
                mode="public"
                className="snake-home-canvas"
                testId="home-scene"
                fallbackTestId="home-scene-fallback"
                settings={settings}
                camera={{ fov: settings.cameraFov, position: [0, 50, 0.01], up: [0, 1, 0] }}
            >
                    <SnakeScene settings={{ ...settings, freeCamera: false }} />
            </SceneCanvas>
        </div>
    );
};

export default Home;
