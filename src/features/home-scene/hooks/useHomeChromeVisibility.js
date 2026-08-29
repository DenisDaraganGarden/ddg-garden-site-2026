import { useEffect, useMemo } from 'react';

// Which parts of the site chrome the scene hides, authored in the editor's
// Interface tab. The header and the language switch render outside the page, so
// the flags travel as a root attribute and CSS acts on them (see Home.css). The
// attribute exists only while a home scene is mounted, so the inner pages keep
// their header regardless. Shared by the public page and the editor so the author
// previews exactly what will ship.
export function useHomeChromeVisibility(settings) {
    const hiddenParts = useMemo(() => [
        settings?.uiBrandVisible === false ? 'brand' : '',
        settings?.uiSubtitleVisible === false ? 'subtitle' : '',
        settings?.uiMenuVisible === false ? 'menu' : '',
        settings?.uiLanguageVisible === false ? 'language' : '',
        settings?.uiSoundVisible === false ? 'sound' : '',
    ].filter(Boolean).join(' '), [
        settings?.uiBrandVisible,
        settings?.uiSubtitleVisible,
        settings?.uiMenuVisible,
        settings?.uiLanguageVisible,
        settings?.uiSoundVisible,
    ]);

    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-home-hidden', hiddenParts);

        return () => root.removeAttribute('data-home-hidden');
    }, [hiddenParts]);
}

export default useHomeChromeVisibility;
