import React from 'react';
import { useLocation } from 'react-router-dom';
import ambientTrack from '../../../portfolio/VOCES8 & Samuel Barber - Barber Agnus Dei.mp3';

function isDocumentVisible() {
    if (typeof document === 'undefined') {
        return true;
    }

    return document.visibilityState === 'visible' && !document.hidden;
}

/**
 * Owns the ambient-music audio element and its lifecycle, and exposes a manual
 * play/pause toggle. The visible control is rendered by the Navigation so it can
 * sit next to the language switch.
 */
export function useSiteMusic() {
    const location = useLocation();
    const isEditorRoute = location.pathname.startsWith('/home/edit');
    const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
    const audioRef = React.useRef(null);
    const waitingForGestureRef = React.useRef(false);
    const wasPlayingBeforeBackgroundRef = React.useRef(false);

    const syncPlayback = React.useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (isEditorRoute || !isDocumentVisible()) {
            waitingForGestureRef.current = false;
            audio.pause();
            setIsMusicPlaying(false);
            return;
        }

        try {
            await audio.play();
            waitingForGestureRef.current = false;
            wasPlayingBeforeBackgroundRef.current = true;
            setIsMusicPlaying(true);
        } catch {
            waitingForGestureRef.current = true;
            setIsMusicPlaying(false);
        }
    }, [isEditorRoute]);

    React.useEffect(() => {
        const audio = new Audio(ambientTrack);
        audio.loop = true;
        audio.preload = 'metadata';
        audio.volume = 0.36;
        audio.playsInline = true;

        const handlePlay = () => setIsMusicPlaying(true);
        const handlePause = () => setIsMusicPlaying(false);

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audioRef.current = audio;

        return () => {
            audio.pause();
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audioRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        void syncPlayback();
    }, [syncPlayback]);

    React.useEffect(() => {
        if (typeof window === 'undefined' || isEditorRoute) {
            return undefined;
        }

        const resumePlayback = () => {
            if (!waitingForGestureRef.current || !isDocumentVisible()) {
                return;
            }

            void syncPlayback();
        };

        window.addEventListener('pointerdown', resumePlayback, { passive: true });
        window.addEventListener('touchstart', resumePlayback, { passive: true });
        window.addEventListener('keydown', resumePlayback);

        return () => {
            window.removeEventListener('pointerdown', resumePlayback);
            window.removeEventListener('touchstart', resumePlayback);
            window.removeEventListener('keydown', resumePlayback);
        };
    }, [isEditorRoute, syncPlayback]);

    React.useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return undefined;
        }

        const pauseForBackground = () => {
            const audio = audioRef.current;
            if (!audio) {
                return;
            }

            wasPlayingBeforeBackgroundRef.current = !audio.paused;
            audio.pause();
            setIsMusicPlaying(false);
        };

        const resumeFromBackground = () => {
            if (!isDocumentVisible()) {
                return;
            }

            if (!isEditorRoute && wasPlayingBeforeBackgroundRef.current) {
                void syncPlayback();
            }
        };

        const handleVisibilityChange = () => {
            if (isDocumentVisible()) {
                resumeFromBackground();
                return;
            }

            pauseForBackground();
        };

        handleVisibilityChange();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', pauseForBackground);
        window.addEventListener('pageshow', resumeFromBackground);
        window.addEventListener('blur', pauseForBackground);
        window.addEventListener('focus', resumeFromBackground);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', pauseForBackground);
            window.removeEventListener('pageshow', resumeFromBackground);
            window.removeEventListener('blur', pauseForBackground);
            window.removeEventListener('focus', resumeFromBackground);
        };
    }, [isEditorRoute, syncPlayback]);

    const toggleMusic = React.useCallback(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (audio.paused) {
            waitingForGestureRef.current = false;
            audio.play().then(() => {
                wasPlayingBeforeBackgroundRef.current = true;
            }).catch(() => {
                waitingForGestureRef.current = true;
            });
        } else {
            wasPlayingBeforeBackgroundRef.current = false;
            audio.pause();
        }
    }, []);

    return { isMusicPlaying, toggleMusic, isEditorRoute };
}

export default useSiteMusic;
