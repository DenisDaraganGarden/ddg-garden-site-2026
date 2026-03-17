import React, { useCallback, useEffect, useState } from 'react';
import WaterScene from '../components/effects/WaterScene';
import { usePublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import ddgLogo from '../../portfolio/DDG_logo.png';
import '../styles/Home.css';

const Home = () => {
    const { settings } = usePublishedHomeSceneSettings();
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);

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

    useEffect(() => {
        if (!isSceneReady) {
            return undefined;
        }

        const cleanupDelay = window.setTimeout(() => {
            setShowLoaderOverlay(false);
        }, 900);

        return () => {
            window.clearTimeout(cleanupDelay);
        };
    }, [isSceneReady]);

    const handleSceneReady = useCallback(() => {
        setIsSceneReady(true);
    }, []);

    return (
        <div className="home-page" data-testid="home-page">
            <div className="home-cinematic-frame home-cinematic-frame--top" />
            <div className="home-cinematic-frame home-cinematic-frame--bottom" />

            <div
                className={`home-water-container ${isSceneReady ? 'home-water-container--visible' : ''}`}
            >
                <WaterScene settings={settings} sceneId="water-scene" onSceneReady={handleSceneReady} />
            </div>

            {showLoaderOverlay ? (
                <div
                    className={`home-scene-loader ${isSceneReady ? 'home-scene-loader--fade-out' : ''}`}
                    aria-label="3D scene is loading"
                    role="status"
                >
                    <img
                        className="home-scene-loader__logo"
                        src={ddgLogo}
                        alt=""
                        aria-hidden="true"
                    />
                </div>
            ) : null}

            <div className="home-content" style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
                {/* Content can go here, pointerEvents: none allows interaction with water */}
            </div>
        </div>
    );
};

export default Home;
