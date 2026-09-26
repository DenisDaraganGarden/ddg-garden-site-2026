const SUPPORTED_SCHEMA_VERSION = 1;
const PUBLIC_STATUSES = new Set(['published', 'placeholder']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isString = (value) => typeof value === 'string' && value.trim().length > 0;

const isLocalizedField = (value) => (
  value
  && typeof value === 'object'
  && isString(value.ru)
  && isString(value.en)
);

const isCoordinates = (value) => (
  value === null
  || (
    value
    && typeof value === 'object'
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lng)
    && value.lat >= -90
    && value.lat <= 90
    && value.lng >= -180
    && value.lng <= 180
  )
);

const getRuntimeOrigin = () => (
  typeof window === 'undefined' ? 'http://localhost' : window.location.origin
);

const parseHttpUrl = (value, base = getRuntimeOrigin()) => {
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

const isAssetBaseUrl = (value) => {
  if (!isString(value)) return false;
  return parseHttpUrl(value) !== null;
};

export const isValidProject = (project) => {
  if (!project || typeof project !== 'object' || !PUBLIC_STATUSES.has(project.status)) {
    return false;
  }

  if (!isString(project.id) || !SLUG_PATTERN.test(project.id)
    || !isString(project.slug) || !SLUG_PATTERN.test(project.slug) || !isString(project.year)
    || !isString(project.fileCode) || !isString(project.category)
    || !isLocalizedField(project.title) || !isLocalizedField(project.location)
    || !isCoordinates(project.coordinates)) {
    return false;
  }

  if (project.collaboration !== undefined && !isLocalizedField(project.collaboration)) {
    return false;
  }

  return project.images === undefined
    || (Array.isArray(project.images) && project.images.every(isString));
};

export const resolveAssetUrl = (assetUrl, assetBaseUrl) => {
  if (!isString(assetUrl) || !isString(assetBaseUrl)) return null;

  const parsedBaseUrl = parseHttpUrl(assetBaseUrl);
  if (!parsedBaseUrl) return null;

  return parseHttpUrl(assetUrl, parsedBaseUrl)?.toString() ?? null;
};

const resolveProjectAssets = (project, assetBaseUrl) => ({
  ...project,
  ...(project.images ? {
    images: project.images.map((imageUrl) => resolveAssetUrl(imageUrl, assetBaseUrl)),
  } : {}),
});

export const validatePortfolioManifest = (manifest) => {
  if (!manifest || typeof manifest !== 'object'
    || manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION
    || !SHA256_PATTERN.test(manifest.revision)
    || !isString(manifest.publishedAt)
    || Number.isNaN(Date.parse(manifest.publishedAt))
    || !isAssetBaseUrl(manifest.assetBaseUrl)
    || !Array.isArray(manifest.projects)) {
    return null;
  }

  if (manifest.projects.length === 0 || !manifest.projects.every(isValidProject)) return null;

  const ids = new Set(manifest.projects.map((project) => project.id));
  const slugs = new Set(manifest.projects.map((project) => project.slug));
  if (ids.size !== manifest.projects.length || slugs.size !== manifest.projects.length) return null;

  const projects = manifest.projects.map((project) => resolveProjectAssets(project, manifest.assetBaseUrl));

  if (projects.some((project) => project.images?.some((imageUrl) => imageUrl === null))) return null;

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    revision: manifest.revision,
    publishedAt: manifest.publishedAt,
    assetBaseUrl: manifest.assetBaseUrl,
    projects,
  };
};
