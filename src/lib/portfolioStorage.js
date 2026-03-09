import { portfolioData } from '../data/portfolioItems';

export const PORTFOLIO_FEATURED_STORAGE_KEY = 'ddg_portfolio_featured_v1';

export const portfolioImageOptions = [
  {
    value: '/portfolio/test-field/cover.png',
    label: 'PDF portfolio cover',
  },
  {
    value: '/portfolio/test-field/dossier.jpg',
    label: 'Archive dossier texture',
  },
  ...portfolioData.map((item) => ({
    value: item.coverImage,
    label: item.title,
  })),
];

export function getDefaultFeaturedProject() {
  return {
    id: 'from-ice-to-flame',
    year: '2026',
    title: 'От льдов и пламени',
    subtitle: 'Курортный ландшафт как напряжённая сцена',
    location: 'Denis Daragan Garden / test field / global resorts',
    description:
      'Авторский ландшафт для курортной среды, где ледяная строгость оси сталкивается с вязкой пластикой грунта, тяжёлой тенью и контролируемой дикостью посадок. Пространство намеренно искажается: рельеф срывается, масштаб смещается, а идеальный минимализм уничтожается фактурой, давлением материала и внутренним конфликтом формы.',
    manifest: 'Диссонанс. Пространственный сдвиг. Деградация формы.',
    coverImage: '/portfolio/test-field/cover.png',
    textureImage: '/portfolio/test-field/dossier.jpg',
  };
}

function cleanText(value, fallback) {
  const nextValue = String(value ?? fallback).trim();
  return nextValue || fallback;
}

function getValidatedImage(value, fallback) {
  const optionValues = new Set(portfolioImageOptions.map((option) => option.value));
  return optionValues.has(value) ? value : fallback;
}

export function normalizeFeaturedProject(featuredProject = {}) {
  const defaults = getDefaultFeaturedProject();

  return {
    ...defaults,
    ...featuredProject,
    year: cleanText(featuredProject.year, defaults.year).slice(0, 4),
    title: cleanText(featuredProject.title, defaults.title),
    subtitle: cleanText(featuredProject.subtitle, defaults.subtitle),
    location: cleanText(featuredProject.location, defaults.location),
    description: cleanText(featuredProject.description, defaults.description),
    manifest: cleanText(featuredProject.manifest, defaults.manifest),
    coverImage: getValidatedImage(featuredProject.coverImage, defaults.coverImage),
    textureImage: getValidatedImage(featuredProject.textureImage, defaults.textureImage),
  };
}

export function loadFeaturedProject() {
  if (typeof window === 'undefined') {
    return getDefaultFeaturedProject();
  }

  try {
    const rawValue = window.localStorage.getItem(PORTFOLIO_FEATURED_STORAGE_KEY);
    if (!rawValue) {
      return getDefaultFeaturedProject();
    }

    return normalizeFeaturedProject(JSON.parse(rawValue));
  } catch {
    return getDefaultFeaturedProject();
  }
}

export function saveFeaturedProject(featuredProject) {
  const normalized = normalizeFeaturedProject(featuredProject);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PORTFOLIO_FEATURED_STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}
