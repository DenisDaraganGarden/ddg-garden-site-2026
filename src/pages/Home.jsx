import React, { useEffect } from 'react';
import SceneCanvas from '../components/effects/SceneCanvas';
import SnakeScene from '../components/effects/SnakeScene';
import { usePublishedSnakeSettings } from '../hooks/useSnakeSettings';

const Home = () => {
    const { settings } = usePublishedSnakeSettings();

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const { documentElement, body } = document;
        const previousHtmlOverflow = documentElement.style.overflow;
        const previousHtmlOverscroll = documentElement.style.overscrollBehavior;
        const previousBodyOverflow = body.style.overflow;
        const previousBodyOverscroll = body.style.overscrollBehavior;

        documentElement.style.overflow = 'hidden';
        documentElement.style.overscrollBehavior = 'none';
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';
        window.scrollTo(0, 0);

        return () => {
            documentElement.style.overflow = previousHtmlOverflow;
            documentElement.style.overscrollBehavior = previousHtmlOverscroll;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehavior = previousBodyOverscroll;
        };
    }, []);

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
