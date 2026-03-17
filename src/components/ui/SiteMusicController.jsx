import React from 'react';
import { useLocation } from 'react-router-dom';
import ambientTrack from '../../../portfolio/VOCES8 & Samuel Barber - Barber Agnus Dei.mp3';

const SiteMusicController = () => {
    const location = useLocation();
    const isEditorRoute = location.pathname.startsWith('/home/edit');
    const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
    const audioRef = React.useRef(null);
    const waitingForGestureRef = React.useRef(false);

    const syncPlayback = React.useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (isEditorRoute) {
            waitingForGestureRef.current = false;
            audio.pause();
            setIsMusicPlaying(false);
            return;
        }

        try {
            await audio.play();
            waitingForGestureRef.current = false;
            setIsMusicPlaying(true);
        } catch {
            waitingForGestureRef.current = true;
            setIsMusicPlaying(false);
        }
    }, [isEditorRoute]);

    React.useEffect(() => {
        const audio = new Audio(ambientTrack);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = 0.36;

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
            if (!waitingForGestureRef.current) {
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

    if (isEditorRoute) {
        return null;
    }

    return (
        <div
            aria-hidden="true"
            data-testid="site-music-controller"
            style={{ display: 'none' }}
            data-playing={isMusicPlaying ? 'true' : 'false'}
        />
    );
};

export default SiteMusicController;
