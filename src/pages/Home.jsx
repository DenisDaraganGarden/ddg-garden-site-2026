import React, { useCallback, useEffect, useMemo, useState } from 'react';
import WaterScene from '../components/effects/WaterScene';
import { usePublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { useHomeChromeVisibility } from '../features/home-scene/hooks/useHomeChromeVisibility';
import { useSiteAudio } from '../features/audio/SiteAudioContext';
import {
    getLayoutVisibleAspect,
    resolveLayout,
    resolveLayoutFrameInset,
    resolveLayoutKey,
} from '../features/home-scene/lib/layout';
import ddgLogo from '../../portfolio/DDG_logo.png';
import '../styles/Home.css';

const DEFAULT_HOLD_SECONDS = 8;
const BLACK_FRAME_SETTLE_MS = 80;

const clampSeconds = (value, fallback, minimum = 0) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    return Math.max(minimum, Math.min(numericValue, 3600));
};

const getEnabledSceneCameras = (sceneCameras) => (
    Array.isArray(sceneCameras)
        ? sceneCameras.filter((camera) => (
            camera
            && camera.enabled !== false
            && typeof camera.id === 'string'
            && camera.id.length > 0
            && camera.scene
            && typeof camera.scene === 'object'
        ))
        : []
);

function useHomeSceneSlideshow(settings, isSceneReady) {
    const sequenceFingerprint = JSON.stringify({
        slideshow: settings?.slideshow ?? null,
        sceneCameras: settings?.sceneCameras ?? [],
    });
    // The hook receives a freshly-normalized settings object on each Home render.
    // Freeze the sequence by its JSON content, otherwise a state update would
    // restart the clock simply because the wrapper object has a new identity.
    const sequenceSource = useMemo(
        () => JSON.parse(sequenceFingerprint).sceneCameras,
        [sequenceFingerprint],
    );
    const sequence = useMemo(
        () => getEnabledSceneCameras(sequenceSource),
        [sequenceSource],
    );
    const isConfigured = Boolean(settings?.slideshow?.enabled) && sequence.length > 1;
    const canAdvance = isConfigured && isSceneReady;
    const configuredFadeSeconds = clampSeconds(settings?.slideshow?.fadeSeconds, 1.2);
    const [isDocumentVisible, setIsDocumentVisible] = useState(() => (
        typeof document === 'undefined' || document.visibilityState === 'visible'
    ));
    const [reducedMotion, setReducedMotion] = useState(() => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ));
    const [activeCameraId, setActiveCameraId] = useState(() => sequence[0]?.id ?? null);
    const [phase, setPhase] = useState('idle');

    useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }

        const syncVisibility = () => setIsDocumentVisible(document.visibilityState === 'visible');
        syncVisibility();
        document.addEventListener('visibilitychange', syncVisibility);
        return () => document.removeEventListener('visibilitychange', syncVisibility);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const syncReducedMotion = () => setReducedMotion(mediaQuery.matches);
        syncReducedMotion();
        mediaQuery.addEventListener?.('change', syncReducedMotion);
        return () => mediaQuery.removeEventListener?.('change', syncReducedMotion);
    }, []);

    // Any edit to the published sequence cancels the old clock. Keep the same
    // shot when it survives the edit; otherwise start from the first enabled one.
    useEffect(() => {
        setActiveCameraId((currentId) => (
            sequence.some((camera) => camera.id === currentId)
                ? currentId
                : (sequence[0]?.id ?? null)
        ));
        setPhase('idle');
    }, [sequence, sequenceFingerprint]);

    const activeCameraIndex = sequence.findIndex((camera) => camera.id === activeCameraId);
    const activeCamera = activeCameraIndex >= 0 ? sequence[activeCameraIndex] : null;
    const activeSettings = activeCamera?.scene ?? settings;
    const fadeSeconds = reducedMotion ? 0 : configuredFadeSeconds;
    const fadeMilliseconds = Math.round(fadeSeconds * 1000);

    // The timer is deliberately restarted after a background tab resumes. A
    // hidden tab is not allowed to return halfway through a transition or skip a
    // composition because its timers were throttled.
    useEffect(() => {
        if (!canAdvance || !isDocumentVisible || phase !== 'idle') {
            return undefined;
        }

        const holdMilliseconds = Math.round(
            clampSeconds(activeCamera?.holdSeconds, DEFAULT_HOLD_SECONDS, 0.1) * 1000,
        );
        const timerId = window.setTimeout(() => setPhase('fade-out'), holdMilliseconds);
        return () => window.clearTimeout(timerId);
    }, [activeCamera?.holdSeconds, canAdvance, fadeMilliseconds, isDocumentVisible, phase]);

    useEffect(() => {
        if (!canAdvance || !isDocumentVisible || phase !== 'fade-out') {
            return undefined;
        }

        const changeCamera = () => {
            setActiveCameraId((currentId) => {
                const currentIndex = sequence.findIndex((camera) => camera.id === currentId);
                const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % sequence.length : 0;
                return sequence[nextIndex]?.id ?? null;
            });
            setPhase('black');
        };

        if (fadeMilliseconds === 0) {
            changeCamera();
            return undefined;
        }

        const timerId = window.setTimeout(changeCamera, fadeMilliseconds);
        return () => window.clearTimeout(timerId);
    }, [canAdvance, fadeMilliseconds, isDocumentVisible, phase, sequence]);

    useEffect(() => {
        if (!canAdvance || !isDocumentVisible || phase !== 'black') {
            return undefined;
        }

        // Mobile Safari throttles animation frames once the opaque black layer
        // fully occludes WebGL. Waiting for one of those frames therefore held
        // the cut for several seconds on a real iPhone. The camera settings are
        // already committed in the same React update; a short task is enough to
        // let the reconciler settle without making progress depend on WebGL
        // remaining visible behind an opaque layer.
        const settleTimerId = window.setTimeout(
            () => setPhase('fade-in'),
            BLACK_FRAME_SETTLE_MS,
        );

        return () => window.clearTimeout(settleTimerId);
    }, [canAdvance, isDocumentVisible, phase]);

    useEffect(() => {
        if (!canAdvance || !isDocumentVisible || phase !== 'fade-in') {
            return undefined;
        }

        if (fadeMilliseconds === 0) {
            setPhase('idle');
            return undefined;
        }

        const timerId = window.setTimeout(() => setPhase('idle'), fadeMilliseconds);
        return () => window.clearTimeout(timerId);
    }, [canAdvance, fadeMilliseconds, isDocumentVisible, phase]);

    // Stopping or hiding a slideshow always leaves the current shot visible.
    useEffect(() => {
        if (!canAdvance || !isDocumentVisible) {
            setPhase('idle');
        }
    }, [canAdvance, isDocumentVisible]);

    return {
        activeCamera,
        activeCameraIndex,
        activeSettings,
        cameraCount: sequence.length,
        fadeSeconds,
        isActive: isConfigured,
        phase,
    };
}

const Home = () => {
    const { settings } = usePublishedHomeSceneSettings();
    const {
        runtime: audioRuntime,
        setSceneSettings: setAudioSettings,
        setCameraTransition,
    } = useSiteAudio();
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [isLoaderMinimumElapsed, setIsLoaderMinimumElapsed] = useState(false);
    const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);
    const slideshow = useHomeSceneSlideshow(settings, isSceneReady);
    const activeSettings = slideshow.activeSettings;
    // Layouts own camera/object composition. Keep them out of the scene-wide
    // settings identity so a pure camera cut does not restart every lighting,
    // water, creature and material effect on mobile. When a snapshot really
    // changes one of those values, its fingerprint changes and the full scene
    // state is still applied atomically with the new layout.
    const { layouts: activeLayouts, ...activeSceneSettings } = activeSettings;
    const activeSceneFingerprint = JSON.stringify(activeSceneSettings);
    const stableSceneSettings = useMemo(
        () => JSON.parse(activeSceneFingerprint),
        [activeSceneFingerprint],
    );
    const audioSettingsFingerprint = JSON.stringify(settings.audio);
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
        setAudioSettings(JSON.parse(audioSettingsFingerprint));
    }, [audioSettingsFingerprint, setAudioSettings]);

    useEffect(() => {
        setCameraTransition(slideshow.phase, slideshow.fadeSeconds);
        return () => setCameraTransition('idle', 0);
    }, [setCameraTransition, slideshow.fadeSeconds, slideshow.phase]);

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

    const activeLayout = resolveLayout(activeLayouts, viewport.layoutKey);
    const frameInset = resolveLayoutFrameInset(activeLayouts, viewport.layoutKey);
    const visibleAspect = getLayoutVisibleAspect(viewport.layoutKey, frameInset);
    const viewportAspect = viewport.height > 0 ? viewport.width / viewport.height : visibleAspect;
    const viewportFrameInset = Math.min(
        0.48,
        Math.max(0, (1 - (viewportAspect / visibleAspect)) * 0.5),
    );

    useHomeChromeVisibility(activeSettings);

    // Turning the bars off means letting the scene fill the viewport rather than
    // painting the black strips over it - under them is the same black. The camera
    // fit already expands to contain the authored composition when the viewport is
    // wider than the reference, so nothing is cropped.
    const frameBarInset = activeSettings.uiFrameVisible === false ? 0 : viewportFrameInset;

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
            data-slideshow-active={slideshow.isActive ? 'true' : 'false'}
            data-slideshow-phase={slideshow.phase}
            data-scene-camera-count={String(slideshow.cameraCount)}
            data-scene-camera-index={String(slideshow.activeCameraIndex)}
            data-scene-camera-id={slideshow.activeCamera?.id ?? ''}
            style={{ '--home-frame-inset': `${frameBarInset * 100}dvh` }}
        >
            <div className="home-cinematic-frame home-cinematic-frame--top" />
            <div className="home-cinematic-frame home-cinematic-frame--bottom" />

            <div
                className={`home-water-container ${isSceneReady ? 'home-water-container--visible' : ''}`}
            >
                <WaterScene
                    settings={stableSceneSettings}
                    layoutOverride={activeLayout}
                    cameraPoseKey={slideshow.activeCamera?.id}
                    sceneId="water-scene"
                    onSceneReady={handleSceneReady}
                    audioRuntime={audioRuntime}
                />
            </div>

            <div
                className={`home-scene-transition home-scene-transition--${slideshow.phase}`}
                data-testid="home-scene-transition"
                data-state={slideshow.phase}
                aria-hidden="true"
                style={{ '--home-scene-transition-duration': `${slideshow.fadeSeconds}s` }}
            />

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
