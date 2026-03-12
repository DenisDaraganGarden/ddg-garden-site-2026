import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './localizedContent';
import { translate } from './translations';
import { LanguageContext } from './LanguageContext';

const LANGUAGE_STORAGE_KEY = 'ddg_site_language_v1';

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const storedValue = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return SUPPORTED_LANGUAGES.includes(storedValue) ? storedValue : DEFAULT_LANGUAGE;
}

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getInitialLanguage);

  const setLanguage = useCallback((nextLanguage) => {
    const resolvedLanguage = SUPPORTED_LANGUAGES.includes(nextLanguage)
      ? nextLanguage
      : DEFAULT_LANGUAGE;

    setLanguageState(resolvedLanguage);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, resolvedLanguage);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
  }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
