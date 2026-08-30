export const PORTFOLIO_PREVIEW_DRAFT_KEY = 'ddg_portfolio_preview_settings_v1';

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const getProjectFallback = (project, index) => ({
  enabled: Boolean(project.images?.[0]) && project.status !== 'placeholder',
  image: project.images?.[0] ?? '',
  side: index % 2 === 0 ? 'right' : 'left',
  width: project.images?.[0] ? 44 : 42,
  offsetY: 0,
});

export function normalizePortfolioPreviewSettings(projects, settings = {}) {
  return projects.reduce((result, project, index) => {
    const fallback = getProjectFallback(project, index);
    const source = settings?.[project.id] ?? fallback;
    const availableImages = Array.isArray(project.images) ? project.images : [];
    const requestedImage = typeof source.image === 'string' ? source.image : '';

    result[project.id] = {
      enabled: source.enabled === undefined ? fallback.enabled : Boolean(source.enabled),
      image: availableImages.includes(requestedImage) ? requestedImage : fallback.image,
      side: source.side === 'left' || source.side === 'right' ? source.side : fallback.side,
      width: clamp(source.width, 28, 58, fallback.width),
      offsetY: clamp(source.offsetY, -160, 160, 0),
    };

    return result;
  }, {});
}

export function loadPortfolioPreviewDraft(projects, publishedSettings) {
  if (typeof window === 'undefined') {
    return normalizePortfolioPreviewSettings(projects, publishedSettings);
  }

  try {
    const storedDraft = window.localStorage.getItem(PORTFOLIO_PREVIEW_DRAFT_KEY);
    return normalizePortfolioPreviewSettings(
      projects,
      storedDraft ? JSON.parse(storedDraft) : publishedSettings,
    );
  } catch {
    return normalizePortfolioPreviewSettings(projects, publishedSettings);
  }
}

export function savePortfolioPreviewDraft(projects, settings) {
  const normalized = normalizePortfolioPreviewSettings(projects, settings);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PORTFOLIO_PREVIEW_DRAFT_KEY, JSON.stringify(normalized));
  }

  return normalized;
}
