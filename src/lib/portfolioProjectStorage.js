import { portfolioEditorialProjects } from '../data/portfolioEditorialProjects';
import {
  createLocalizedSheetLabel,
  createLocalizedText,
  getLocalizedText,
  normalizeLocalizedText,
  updateLocalizedText,
} from '../i18n/localizedContent';

export const PORTFOLIO_PROJECTS_STORAGE_KEY = 'ddg_portfolio_projects_v1';

function clonePlate(plate, index) {
  const fallbackLabel = createLocalizedSheetLabel(index);

  return {
    id: plate.id ?? `plate-${index + 1}`,
    label: normalizeLocalizedText(plate.label, getLocalizedText(fallbackLabel, 'ru')),
    image: plate.image ?? '',
    previewPosition: plate.previewPosition ?? '50% 50%',
    alt: normalizeLocalizedText(plate.alt, getLocalizedText(fallbackLabel, 'en')),
  };
}

function cloneProject(project, index) {
  const plates = Array.isArray(project.plates) ? project.plates.map(clonePlate) : [];
  const fallbackCover = plates[0]?.image ?? '';
  const fallbackTitle = createLocalizedText(`Проект ${index + 1}`, `Project ${index + 1}`);

  return {
    id: project.id ?? `project-${index + 1}`,
    year: String(project.year ?? '').trim() || '2026',
    fileCode: String(project.fileCode ?? '').trim(),
    title: normalizeLocalizedText(project.title, getLocalizedText(fallbackTitle, 'ru')),
    subtitle: normalizeLocalizedText(project.subtitle, ''),
    location: normalizeLocalizedText(project.location, ''),
    coordinates: project.coordinates ?? { lat: 55.7558, lng: 37.6173 }, // Default to Moscow
    statement: normalizeLocalizedText(project.statement, ''),
    description: normalizeLocalizedText(project.description, ''),
    coverImage: project.coverImage ?? fallbackCover,
    coverPosition: project.coverPosition ?? '50% 50%',
    coverAlt: normalizeLocalizedText(project.coverAlt, getLocalizedText(fallbackTitle, 'en')),
    plates,
  };
}

export function getDefaultPortfolioProjects() {
  return portfolioEditorialProjects.map(cloneProject);
}

function normalizePortfolioProjects(projects) {
  if (!Array.isArray(projects) || projects.length === 0) {
    return getDefaultPortfolioProjects();
  }

  return projects.map(cloneProject);
}

export function loadPortfolioProjects() {
  if (typeof window === 'undefined') {
    return getDefaultPortfolioProjects();
  }

  try {
    const rawValue = window.localStorage.getItem(PORTFOLIO_PROJECTS_STORAGE_KEY);
    if (!rawValue) {
      return getDefaultPortfolioProjects();
    }

    return normalizePortfolioProjects(JSON.parse(rawValue));
  } catch {
    return getDefaultPortfolioProjects();
  }
}

export function savePortfolioProjects(projects) {
  const normalized = normalizePortfolioProjects(projects);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PORTFOLIO_PROJECTS_STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function updateProjectInCollection(projects, projectId, updater) {
  return projects.map((project) => (
    project.id === projectId
      ? cloneProject(typeof updater === 'function' ? updater(project) : updater, 0)
      : project
  ));
}

export function getLocalizedPortfolioProject(project, language) {
  return {
    ...project,
    title: getLocalizedText(project.title, language),
    subtitle: getLocalizedText(project.subtitle, language),
    location: getLocalizedText(project.location, language),
    statement: getLocalizedText(project.statement, language),
    description: getLocalizedText(project.description, language),
    coverAlt: getLocalizedText(project.coverAlt, language),
    plates: project.plates.map((plate) => ({
      ...plate,
      label: getLocalizedText(plate.label, language),
      alt: getLocalizedText(plate.alt, language),
    })),
  };
}

export function updateProjectLocalizedField(project, field, language, value) {
  return {
    ...project,
    [field]: updateLocalizedText(project[field], language, value),
  };
}

export function createImportedPlates(project, files) {
  const projectTitleRu = getLocalizedText(project.title, 'ru');
  const projectTitleEn = getLocalizedText(project.title, 'en');

  return files.map((file, index) => ({
    id: `imported-${Date.now()}-${index + 1}`,
    label: createLocalizedSheetLabel(index),
    image: file.url,
    previewPosition: '50% 50%',
    alt: createLocalizedText(
      `${projectTitleRu} / ${file.name}`,
      `${projectTitleEn} / ${file.name}`,
    ),
  }));
}

export function appendPlatesToProject(project, nextPlates) {
  const plates = [...project.plates, ...nextPlates].map((plate, index) => ({
    ...clonePlate(plate, index),
    label: createLocalizedSheetLabel(index),
  }));

  const coverImage = project.coverImage || plates[0]?.image || '';

  return {
    ...project,
    coverImage,
    plates,
  };
}

export function removePlateFromProject(project, plateId) {
  const plates = project.plates
    .filter((plate) => plate.id !== plateId)
    .map((plate, index) => ({
      ...clonePlate(plate, index),
      label: createLocalizedSheetLabel(index),
    }));

  const removedCover = project.coverImage && project.coverImage === project.plates.find((plate) => plate.id === plateId)?.image;

  return {
    ...project,
    coverImage: removedCover ? (plates[0]?.image ?? '') : project.coverImage,
    plates,
  };
}

export function movePlateInProject(project, plateId, direction) {
  const currentIndex = project.plates.findIndex((plate) => plate.id === plateId);
  if (currentIndex === -1) {
    return project;
  }

  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= project.plates.length) {
    return project;
  }

  const plates = [...project.plates];
  const [movedPlate] = plates.splice(currentIndex, 1);
  plates.splice(nextIndex, 0, movedPlate);

  return {
    ...project,
    plates: plates.map((plate, index) => ({
      ...clonePlate(plate, index),
      label: createLocalizedSheetLabel(index),
    })),
  };
}
