import { useSiteAudio } from '../../features/audio/SiteAudioContext';

/**
 * Compatibility wrapper for the navigation. Audio ownership moved to the global
 * Web Audio provider so music, the spatial soundscape, route fades and UI clicks
 * share one lifecycle and one master volume.
 */
export function useSiteMusic() {
    const { state, toggleSound, isEditorRoute } = useSiteAudio();

    return {
        isMusicPlaying: state.enabled,
        toggleMusic: toggleSound,
        isEditorRoute,
        audioMode: state.mode,
        isHomeAudioAudible: state.homeAudible,
    };
}

export default useSiteMusic;
