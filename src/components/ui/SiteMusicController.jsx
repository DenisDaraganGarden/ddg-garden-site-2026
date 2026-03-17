import React from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import ambientTrack from '../../../portfolio/VOCES8 & Samuel Barber - Barber Agnus Dei.mp3';
import './SiteMusicController.css';

const MUSIC_STORAGE_KEY = 'ddg-site-music-enabled';

const getInitialMusicState = () => {
    if (typeof window === 'undefined') {
        return true;
    }

    try {
        const savedValue = window.localStorage.getItem(MUSIC_STORAGE_KEY);
        return savedValue === null ? true : savedValue === 'true';
    } catch {
        return true;
    }
};

const SiteMusicController = () => {
    const { language } = useLanguage();
    const location = useLocation();
    const isEditorRoute = location.pathname.startsWith('/home/edit');
    const [isMusicEnabled, setIsMusicEnabled] = React.useState(getInitialMusicState);
    const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
    const audioRef = React.useRef(null);
    const autoplayRetryRef = React.useRef(false);

    const labels = React.useMemo(() => (
        language === 'ru'
            ? {
                on: 'Музыка вкл',
                off: 'Музыка выкл',
                enable: 'Включить музыку',
                disable: 'Выключить музыку',
            }
            : {
                on: 'Music on',
                off: 'Music off',
                enable: 'Enable music',
                disable: 'Disable music',
            }
    ), [language]);

    const syncPlayback = React.useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (isEditorRoute || !isMusicEnabled) {
            autoplayRetryRef.current = false;
            audio.pause();
            setIsMusicPlaying(false);
            return;
        }

        try {
            await audio.play();
            autoplayRetryRef.current = false;
            setIsMusicPlaying(true);
        } catch {
            autoplayRetryRef.current = true;
            setIsMusicPlaying(false);
        }
    }, [isEditorRoute, isMusicEnabled]);

    React.useEffect(() => {
        const audio = new Audio(ambientTrack);
        audio.loop = true;
        audio.preload = 'none';
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
        if (typeof window === 'undefined') {
            return;
        }

        try {
            window.localStorage.setItem(MUSIC_STORAGE_KEY, String(isMusicEnabled));
        } catch {
            // Ignore storage errors in private mode.
        }
    }, [isMusicEnabled]);

    React.useEffect(() => {
        if (typeof window === 'undefined' || isEditorRoute || !isMusicEnabled) {
            return undefined;
        }

        const resumePlayback = () => {
            if (!autoplayRetryRef.current) {
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
    }, [isEditorRoute, isMusicEnabled, syncPlayback]);

    if (isEditorRoute) {
        return null;
    }

    return (
        <button
            type="button"
            className={`site-music-toggle ${isMusicPlaying ? 'is-active' : ''}`}
            onClick={() => setIsMusicEnabled((previous) => !previous)}
            aria-pressed={isMusicEnabled}
            aria-label={isMusicEnabled ? labels.disable : labels.enable}
            data-testid="site-music-toggle"
        >
            {isMusicEnabled ? labels.on : labels.off}
        </button>
    );
};

export default SiteMusicController;
