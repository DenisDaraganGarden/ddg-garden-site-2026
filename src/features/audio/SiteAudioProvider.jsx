import React from 'react';
import { useLocation } from 'react-router-dom';
import { getPublishedHomeSceneSettings } from '../home-scene/hooks/useHomeSceneSettings';
import { siteAudioEngine } from './engine/SoundscapeEngine';
import { SiteAudioContext } from './SiteAudioContext';

const SITE_AUDIO_PREFERENCE_KEY = 'ddg_site_audio_preference_v1';
const isDocumentVisible = () => (
  typeof document === 'undefined'
  || (document.visibilityState === 'visible' && !document.hidden)
);

const readPreference = () => {
  if (typeof window === 'undefined') {
    return { enabled: false };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SITE_AUDIO_PREFERENCE_KEY) ?? '{}');
    return { enabled: parsed.enabled === true };
  } catch {
    return { enabled: false };
  }
};

export function SiteAudioProvider({ children }) {
  const location = useLocation();
  const [audioState, setAudioState] = React.useState(() => siteAudioEngine.getState());
  const [editorPreviewEnabled, setEditorPreviewEnabledState] = React.useState(false);
  const initialPreferenceRef = React.useRef(readPreference());
  const preferenceRestorePendingRef = React.useRef(initialPreferenceRef.current.enabled);
  const isHomeRoute = location.pathname === '/';
  const isEditorRoute = location.pathname.startsWith('/home/edit');
  const routeAudible = isHomeRoute || (isEditorRoute && editorPreviewEnabled);

  React.useEffect(() => siteAudioEngine.subscribe(setAudioState), []);

  React.useEffect(() => {
    const published = getPublishedHomeSceneSettings();
    siteAudioEngine.setSettings(published.audio);
    siteAudioEngine.setRouteActive(routeAudible);
    siteAudioEngine.setPageVisible(isDocumentVisible());

    if (initialPreferenceRef.current.enabled) {
      // Restoring the preference is intentionally silent until a browser gesture
      // successfully resumes the context. The first pointer/key below performs it.
      const resumePreferredAudio = async (event) => {
        if (!initialPreferenceRef.current.enabled) {
          removeGestureUnlock();
          return;
        }
        if (event.target?.closest?.('[data-audio-consent-toggle="true"]')) {
          return;
        }

        const enabled = await siteAudioEngine.setUserEnabled(true);
        if (enabled) {
          preferenceRestorePendingRef.current = false;
          removeGestureUnlock();
        }
      };
      const removeGestureUnlock = () => {
        window.removeEventListener('pointerdown', resumePreferredAudio, true);
        window.removeEventListener('touchstart', resumePreferredAudio, true);
        window.removeEventListener('keydown', resumePreferredAudio, true);
      };

      window.addEventListener('pointerdown', resumePreferredAudio, true);
      window.addEventListener('touchstart', resumePreferredAudio, true);
      window.addEventListener('keydown', resumePreferredAudio, true);
      return removeGestureUnlock;
    }

    return undefined;
    // The published baseline is applied once. Home/HomeEdit supply the current
    // active draft below through setSceneSettings without rebuilding the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    siteAudioEngine.setRouteActive(routeAudible);
  }, [routeAudible]);

  React.useEffect(() => {
    if (!isEditorRoute && editorPreviewEnabled) {
      setEditorPreviewEnabledState(false);
    }
  }, [editorPreviewEnabled, isEditorRoute]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const syncVisibility = () => {
      void siteAudioEngine.setPageVisible(isDocumentVisible());
    };

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('pageshow', syncVisibility);
    window.addEventListener('pagehide', syncVisibility);
    window.addEventListener('focus', syncVisibility);
    window.addEventListener('blur', syncVisibility);

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('pageshow', syncVisibility);
      window.removeEventListener('pagehide', syncVisibility);
      window.removeEventListener('focus', syncVisibility);
      window.removeEventListener('blur', syncVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const playInteraction = (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      const interactive = event.target?.closest?.(
        'button, a, [role="button"], input[type="checkbox"], input[type="radio"], select',
      );
      if (!interactive || interactive.closest('[data-audio-silent="true"]')) {
        return;
      }

      void siteAudioEngine.playUiClick();
    };

    document.addEventListener('pointerdown', playInteraction, true);
    return () => document.removeEventListener('pointerdown', playInteraction, true);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Keep a stored "on" preference intact while the browser is still waiting
    // for its first legal resume gesture. This also survives StrictMode's
    // development effect replay. Subsequent actual state changes own it.
    if (preferenceRestorePendingRef.current) {
      return;
    }

    window.localStorage.setItem(
      SITE_AUDIO_PREFERENCE_KEY,
      JSON.stringify({ enabled: audioState.enabled }),
    );
  }, [audioState.enabled]);

  const toggleSound = React.useCallback(async () => {
    // An explicit press owns the decision and cancels any pending auto-restore
    // from a previous visit. Capture-phase restoration skips this same button.
    initialPreferenceRef.current.enabled = false;
    preferenceRestorePendingRef.current = false;

    if (siteAudioEngine.getState().enabled) {
      await siteAudioEngine.playUiClick();
      await siteAudioEngine.setUserEnabled(false);
      return false;
    }

    const enabled = await siteAudioEngine.setUserEnabled(true);
    if (enabled) {
      await siteAudioEngine.playUiClick();
    }
    return enabled;
  }, []);

  const setEditorPreviewEnabled = React.useCallback(async (enabled) => {
    const nextEnabled = Boolean(enabled);
    if (nextEnabled) {
      const unlocked = await siteAudioEngine.setUserEnabled(true);
      if (!unlocked) {
        return false;
      }
      setEditorPreviewEnabledState(true);
      siteAudioEngine.setRouteActive(true);
      return true;
    }

    setEditorPreviewEnabledState(false);
    siteAudioEngine.setRouteActive(isHomeRoute);
    return false;
  }, [isHomeRoute]);

  const previewTrack = React.useCallback(async (trackId) => {
    if (!siteAudioEngine.getState().enabled) {
      const unlocked = await siteAudioEngine.setUserEnabled(true);
      if (!unlocked) {
        return false;
      }
    }

    if (isEditorRoute) {
      setEditorPreviewEnabledState(true);
      siteAudioEngine.setRouteActive(true);
    }

    return siteAudioEngine.playPreview(trackId);
  }, [isEditorRoute]);

  const setSceneSettings = React.useCallback((settings) => {
    siteAudioEngine.setSettings(settings);
  }, []);

  const setCameraTransition = React.useCallback((phase, fadeSeconds) => {
    siteAudioEngine.setCameraTransition(phase, fadeSeconds);
  }, []);

  const setSoloTrack = React.useCallback((trackId) => {
    siteAudioEngine.setSoloTrack(trackId);
  }, []);

  const runtime = React.useMemo(() => ({
    isActive: () => siteAudioEngine.isSpatialTrackingActive(),
    updateTanker: state => siteAudioEngine.updateTanker(state),
    releaseTanker: () => siteAudioEngine.releaseTanker(),
    updateListener: (position, forward, up) => siteAudioEngine.updateListener(position, forward, up),
    updateEmitter: (emitterId, x, y, z, immediate) => (
      siteAudioEngine.updateEmitter(emitterId, x, y, z, immediate)
    ),
  }), []);

  const value = React.useMemo(() => ({
    state: audioState,
    isHomeRoute,
    isEditorRoute,
    editorPreviewEnabled,
    toggleSound,
    setEditorPreviewEnabled,
    previewTrack,
    setSceneSettings,
    setCameraTransition,
    setSoloTrack,
    runtime,
  }), [
    audioState,
    editorPreviewEnabled,
    isEditorRoute,
    isHomeRoute,
    previewTrack,
    runtime,
    setCameraTransition,
    setEditorPreviewEnabled,
    setSceneSettings,
    setSoloTrack,
    toggleSound,
  ]);

  return (
    <SiteAudioContext.Provider value={value}>
      {children}
    </SiteAudioContext.Provider>
  );
}

export default SiteAudioProvider;
