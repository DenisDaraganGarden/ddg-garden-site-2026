import React, { useEffect, useMemo, useState } from 'react';
import { projectRegistry } from '../../data/projectRegistry';
import { loadPortfolioManifest } from './portfolioManifestClient';
import { PortfolioContentContext } from './portfolioContentContext';

export const PortfolioContentProvider = ({ children }) => {
  const [content, setContent] = useState({
    projects: projectRegistry,
    source: 'fallback',
  });

  useEffect(() => {
    let isCurrent = true;

    loadPortfolioManifest()
      .then((manifest) => {
        if (isCurrent && manifest) {
          setContent({
            projects: manifest.projects,
            source: 'manifest',
          });
        }
      })
      .catch(() => {
        // The local registry is intentionally retained if the external content is unavailable.
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const value = useMemo(() => content, [content]);

  return (
    <PortfolioContentContext.Provider value={value}>
      {children}
    </PortfolioContentContext.Provider>
  );
};
