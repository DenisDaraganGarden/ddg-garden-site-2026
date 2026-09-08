import React, { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { translate } from './translations';
import { LanguageContext } from './LanguageContext';
import { languageFromPath, localizePath } from './languageRoutes';

export const LanguageProvider = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Источник правды — адрес страницы. Хранить выбор в localStorage больше нельзя:
  // тогда один и тот же URL показывал бы разным людям разный язык, и поисковик
  // не смог бы сослаться на английскую версию.
  const language = languageFromPath(location.pathname);

  const setLanguage = useCallback((nextLanguage) => {
    const target = localizePath(location.pathname, nextLanguage);
    navigate(`${target}${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash, navigate]);

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
