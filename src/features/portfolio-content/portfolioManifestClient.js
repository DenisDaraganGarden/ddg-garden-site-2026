import { validatePortfolioManifest } from './portfolioManifestValidation';

const manifestUrl = import.meta.env.VITE_PORTFOLIO_MANIFEST_URL
  || `${import.meta.env.BASE_URL}content/portfolio-manifest.json`;

let manifestRequest = null;

export const loadPortfolioManifest = () => {
  if (!manifestRequest) {
    manifestRequest = fetch(manifestUrl, {
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Portfolio manifest request failed with ${response.status}`);
        }

        return response.json();
      })
      .then(validatePortfolioManifest);
  }

  return manifestRequest;
};
