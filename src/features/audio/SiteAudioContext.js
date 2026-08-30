import React from 'react';

export const SiteAudioContext = React.createContext(null);

export function useSiteAudio() {
  const context = React.useContext(SiteAudioContext);

  if (!context) {
    throw new Error('useSiteAudio must be used inside SiteAudioProvider.');
  }

  return context;
}
