import React, { useCallback, useEffect, useState } from 'react';
import WaterScene from '../components/effects/WaterScene';
import { usePublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { useHomeChromeVisibility } from '../features/home-scene/hooks/useHomeChromeVisibility';
import {
    getLayoutVisibleAspect,
    resolveLayoutFrameInset,
    resolveLayoutKey,
} from '../features/home-scene/lib/layout';
import ddgLogo from '../../portfolio/DDG_logo.png';
import '../styles/Home.css';

const Home = () => {
    const { settings } = usePublishedHomeSceneSettings();
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [isLoaderMinimumElapsed, setIsLoaderMinimumElapsed] = useState(false);
    const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);
    const [viewport, setViewport] = useState(() => {
        const width = typeof window === 'undefined' ? 16 : window.innerWidth;
        const height = typeof window === 'undefined' ? 9 : window.innerHeight;

        return {
            width,
            height,
            layoutKey: resolveLayoutKey(width, height),
        };
    });

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const syncLayout = () => {
            setViewport({
                width: window.innerWidth,
                height: window.innerHeight,
                layoutKey: resolveLayoutKey(window.innerWidth, window.innerHeight),
            });
        };

        syncLayout();
        window.addEventListener('resize', syncLayout);
        window.addEventListener('orientationchange', syncLayout);

        return () => {
            window.removeEventListener('resize', syncLayout);
            window.removeEventListener('orientationchange', syncLayout);
        };
    }, []);

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
        const minimumTimer = window.setTimeout(() => {
            setIsLoaderMinimumElapsed(true);
        }, 1400);

        return () => window.clearTimeout(minimumTimer);
    }, []);

    const shouldRevealScene = isSceneReady && isLoaderMinimumElapsed;

    useEffect(() => {
        if (!shouldRevealScene) {
            return undefined;
        }

        const cleanupDelay = window.setTimeout(() => {
            setShowLoaderOverlay(false);
        }, 900);

        return () => {
            window.clearTimeout(cleanupDelay);
        };
    }, [shouldRevealScene]);

    const handleSceneReady = useCallback(() => {
        setIsSceneReady(true);
    }, []);

    const frameInset = resolveLayoutFrameInset(settings.layouts, viewport.layoutKey);
    const visibleAspect = getLayoutVisibleAspect(viewport.layoutKey, frameInset);
    const viewportAspect = viewport.height > 0 ? viewport.width / viewport.height : visibleAspect;
    const viewportFrameInset = Math.min(
        0.48,
        Math.max(0, (1 - (viewportAspect / visibleAspect)) * 0.5),
    );

    useHomeChromeVisibility(settings);

    // Turning the bars off means letting the scene fill the viewport rather than
    // painting the black strips over it - under them is the same black. The camera
    // fit already expands to contain the authored composition when the viewport is
    // wider than the reference, so nothing is cropped.
    const frameBarInset = settings.uiFrameVisible === false ? 0 : viewportFrameInset;

    // The header is rendered outside .home-page, so it cannot inherit the band
    // geometry from it. Publishing the inset on the root lets the title and menu
    // position themselves against the cinematic frame instead of against the
    // viewport, which is what used to cut the block in half on a phone.
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--home-frame-inset', `${frameBarInset * 100}dvh`);

        return () => root.style.removeProperty('--home-frame-inset');
    }, [frameBarInset]);

    return (
        <div
            className="home-page"
            data-testid="home-page"
            data-layout={viewport.layoutKey}
            data-visible-aspect={visibleAspect.toFixed(3)}
            style={{ '--home-frame-inset': `${frameBarInset * 100}dvh` }}
        >
            <div className="home-cinematic-frame home-cinematic-frame--top" />
            <div className="home-cinematic-frame home-cinematic-frame--bottom" />
            <div className="home-film-grain" aria-hidden="true" />

            <div
                className={`home-water-container ${isSceneReady ? 'home-water-container--visible' : ''}`}
            >
                <WaterScene settings={settings} sceneId="water-scene" onSceneReady={handleSceneReady} />
            </div>

            {showLoaderOverlay ? (
                <div
                    className={`home-scene-loader ${shouldRevealScene ? 'home-scene-loader--fade-out' : ''}`}
                    aria-label="3D scene is loading"
                    role="status"
                >
                    <div className="home-scene-loader__identity">
                        <img
                            className="home-scene-loader__logo"
                            src={ddgLogo}
                            alt=""
                            aria-hidden="true"
                        />
                        <div className="home-scene-loader__wordmark" aria-hidden="true">
                            <span className="home-scene-loader__name">DENIS DARAGAN</span>
                            <span className="home-scene-loader__bureau">БЮРО</span>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="home-content" style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
                {/* Content can go here, pointerEvents: none allows interaction with water */}
            </div>
        </div>
    );
};

export default Home;
