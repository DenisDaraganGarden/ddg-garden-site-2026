import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageProvider';
import { getLocalizedText } from '../i18n/localizedContent';
import {
  appendPlatesToProject,
  createImportedPlates,
  getDefaultPortfolioProjects,
  getLocalizedPortfolioProject,
  loadPortfolioProjects,
  movePlateInProject,
  removePlateFromProject,
  savePortfolioProjects,
  updateProjectLocalizedField,
  updateProjectInCollection,
} from '../lib/portfolioProjectStorage';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  getPortfolioImportStatus,
  importPortfolioFiles,
  publishPortfolioProjects,
} from '../lib/portfolioImportClient';
import ProjectBooklet from '../components/portfolio/ProjectBooklet';
import '../styles/Portfolio.css';

const PortfolioEdit = () => {
  const { language, t } = useLanguage();
  const [projects, setProjects] = useState(getDefaultPortfolioProjects());
  const [selectedProjectId, setSelectedProjectId] = useState(getDefaultPortfolioProjects()[0]?.id ?? null);
  const [saveStatus, setSaveStatus] = useState('loading');
  const [importStatus, setImportStatus] = useState({ type: 'checking' });
  const [targetDir, setTargetDir] = useState('public/portfolio/imported');
  const [isImportAvailable, setIsImportAvailable] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState({ type: 'idle' });
  const fileInputRef = useRef(null);
  const didInitSaveRef = useRef(false);

  // Custom marker icon for editor
  const EditorMarkerIcon = useMemo(() => L.divIcon({
    className: 'ddg-map-marker is-editor',
    html: '<div class="ddg-map-marker-inner"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  }), []);

  const LocationPickerEvents = ({ onLocationSelect }) => {
    useMapEvents({
      click(e) {
        onLocationSelect(e.latlng);
      },
    });
    return null;
  };

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    const initialProjects = loadPortfolioProjects();
    setProjects(initialProjects);
    setSelectedProjectId(initialProjects[0]?.id ?? null);
    setSaveStatus('saved');

    let cancelled = false;

    getPortfolioImportStatus().then((status) => {
      if (cancelled) {
        return;
      }

      setIsImportAvailable(Boolean(status.available));
      setTargetDir(status.targetDir ?? 'public/portfolio/imported');
      setImportStatus({ type: status.available ? 'ready' : 'unavailable', message: status.message ?? '' });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!didInitSaveRef.current) {
      didInitSaveRef.current = true;
      return undefined;
    }

    setSaveStatus('saving');
    const timeoutId = window.setTimeout(() => {
      savePortfolioProjects(projects);
      setSaveStatus('saved');
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [projects]);

  const updateSelectedProject = (updater) => {
    if (!selectedProjectId) {
      return;
    }

    setProjects((previous) => updateProjectInCollection(previous, selectedProjectId, updater));
  };

  const updateField = (key, value) => {
    updateSelectedProject((project) => ({
      ...project,
      [key]: value,
    }));
  };

  const updateLocalizedField = (key, value) => {
    updateSelectedProject((project) => updateProjectLocalizedField(project, key, language, value));
  };

  const handleImportedFiles = async (fileList) => {
    if (!selectedProject || !fileList?.length) {
      return;
    }

    setIsImporting(true);
    setImportStatus({ type: 'copying', path: `${targetDir}/${selectedProject.id}/` });

    try {
      const importedFiles = await importPortfolioFiles(selectedProject.id, fileList);
      const nextPlates = createImportedPlates(selectedProject, importedFiles);

      updateSelectedProject((project) => appendPlatesToProject(project, nextPlates));
      setImportStatus({
        type: 'copied',
        count: importedFiles.length,
        path: `${targetDir}/${selectedProject.id}/`,
      });
    } catch (error) {
      setImportStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Import failed.',
      });
    } finally {
      setIsImporting(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = async (event) => {
    await handleImportedFiles(event.target.files);
  };

  const handlePublish = async () => {
    if (!window.confirm(t('portfolio.editor.publishConfirm'))) {
      return;
    }

    setIsPublishing(true);
    setPublishStatus({ type: 'publishing' });

    try {
      await publishPortfolioProjects(projects);
      setPublishStatus({ type: 'success' });
      setTimeout(() => setPublishStatus({ type: 'idle' }), 5000);
    } catch (error) {
      setPublishStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Publish failed',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();

    if (!isImportAvailable || isImporting) {
      return;
    }

    await handleImportedFiles(event.dataTransfer.files);
  };

  const localizedSelectedProject = selectedProject
    ? getLocalizedPortfolioProject(selectedProject, language)
    : null;

  const saveStatusLabel = t(`common.${saveStatus === 'dirty' ? 'unsaved' : saveStatus}`);
  const importStatusLabel = (() => {
    if (importStatus.type === 'ready') {
      return t('portfolio.editor.importReady', { path: importStatus.path ?? `${targetDir}/${selectedProject?.id ?? ''}/` });
    }

    if (importStatus.type === 'copying') {
      return t('portfolio.editor.importCopying', { path: importStatus.path ?? targetDir });
    }

    if (importStatus.type === 'copied') {
      return t('portfolio.editor.importCopied', { count: importStatus.count ?? 0, path: importStatus.path ?? targetDir });
    }

    if (importStatus.type === 'unavailable') {
      return importStatus.message || t('portfolio.editor.importUnavailable');
    }

    if (importStatus.type === 'error') {
      return importStatus.message || t('portfolio.editor.importUnavailable');
    }

    return t('portfolio.editor.importChecking');
  })();

  return (
    <div className="portfolio-edit-page" data-testid="portfolio-edit-page">
      <div className="portfolio-page__noise" />

      <section className="portfolio-edit-shell">
        <aside className="portfolio-edit-panel">
          <div className="portfolio-edit-panel__heading">
            <div>
              <span className="portfolio-kicker">{t('portfolio.editor.kicker')}</span>
              <h1>{t('portfolio.editor.title')}</h1>
              <p className="portfolio-edit-panel__language-note">{t('portfolio.editor.activeLanguage', { language: language.toUpperCase() })}</p>
            </div>
            <span className="portfolio-save-status">{saveStatusLabel}</span>
          </div>

          <div className="portfolio-project-tabs" role="tablist" aria-label={t('portfolio.editor.tabsLabel')}>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`portfolio-project-tab ${project.id === selectedProject?.id ? 'is-active' : ''}`}
                data-testid={`portfolio-edit-tab-${project.id}`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                {getLocalizedPortfolioProject(project, language).title}
              </button>
            ))}
          </div>

          {selectedProject && localizedSelectedProject ? (
            <>
              <label className="portfolio-field">
                <span>{t('common.year')}</span>
                <input
                  type="text"
                  value={selectedProject.year}
                  onChange={(event) => updateField('year', event.target.value)}
                />
              </label>

              <label className="portfolio-field">
                <span>{t('common.title')}</span>
                <input
                  type="text"
                  value={localizedSelectedProject.title}
                  onChange={(event) => updateLocalizedField('title', event.target.value)}
                />
              </label>

              <label className="portfolio-field">
                <span>{t('common.subtitle')}</span>
                <input
                  type="text"
                  value={localizedSelectedProject.subtitle}
                  onChange={(event) => updateLocalizedField('subtitle', event.target.value)}
                />
              </label>

              <label className="portfolio-field">
                <span>{t('common.location')}</span>
                <input
                  type="text"
                  value={localizedSelectedProject.location}
                  onChange={(event) => updateLocalizedField('location', event.target.value)}
                />
              </label>

              <label className="portfolio-field">
                <span>{t('common.statement')}</span>
                <textarea
                  rows="2"
                  value={localizedSelectedProject.statement}
                  onChange={(event) => updateLocalizedField('statement', event.target.value)}
                />
              </label>

              <label className="portfolio-field">
                <span>{t('common.description')}</span>
                <textarea
                  rows="8"
                  value={localizedSelectedProject.description}
                  onChange={(event) => updateLocalizedField('description', event.target.value)}
                />
              </label>

              <div className="portfolio-field">
                <span>{t('portfolio.editor.locationPickerTitle')}</span>
                <div className="portfolio-location-editor">
                  <div className="portfolio-location-map">
                    <MapContainer
                      center={[selectedProject.coordinates.lat, selectedProject.coordinates.lng]}
                      zoom={13}
                      scrollWheelZoom={false}
                      style={{ height: '200px', width: '100%' }}
                      className="ddg-leaflet-container is-picker"
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      />
                      <Marker
                        position={[selectedProject.coordinates.lat, selectedProject.coordinates.lng]}
                        icon={EditorMarkerIcon}
                      />
                      <LocationPickerEvents
                        onLocationSelect={(latlng) => updateField('coordinates', { lat: latlng.lat, lng: latlng.lng })}
                      />
                    </MapContainer>
                    <p className="portfolio-location-hint">{t('portfolio.editor.locationPickerHint')}</p>
                  </div>
                  <div className="portfolio-location-inputs">
                    <label className="portfolio-coordinate-field">
                      <span>{t('portfolio.editor.lat')}</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={selectedProject.coordinates.lat}
                        onChange={(e) => updateField('coordinates', { ...selectedProject.coordinates, lat: parseFloat(e.target.value) })}
                      />
                    </label>
                    <label className="portfolio-coordinate-field">
                      <span>{t('portfolio.editor.lng')}</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={selectedProject.coordinates.lng}
                        onChange={(e) => updateField('coordinates', { ...selectedProject.coordinates, lng: parseFloat(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="portfolio-field">
                <span>{t('portfolio.editor.importTitle')}</span>
                <div
                  className={`portfolio-dropzone ${!isImportAvailable ? 'is-disabled' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={(event) => event.preventDefault()}
                >
                  <strong>{localizedSelectedProject.title}</strong>
                  <p>{isImportAvailable ? t('portfolio.editor.importReady', { path: `${targetDir}/${selectedProject.id}/` }) : importStatusLabel}</p>
                  <div className="portfolio-dropzone__actions">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!isImportAvailable || isImporting}
                    >
                      {isImporting ? t('portfolio.editor.copying') : t('portfolio.editor.pickImages')}
                    </button>
                    <span>{importStatusLabel}</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={handleFileInputChange}
                  />
                </div>
              </div>

              <div className="portfolio-field">
                <span>{t('portfolio.editor.imagesTitle')}</span>
                <div className="portfolio-asset-list">
                  {selectedProject.plates.map((plate, index) => (
                    <article key={plate.id} className="portfolio-asset-item">
                      <img
                        className="portfolio-asset-item__image"
                        src={plate.image}
                        alt={plate.alt}
                      />

                      <div className="portfolio-asset-item__copy">
                        <strong>{getLocalizedText(plate.label, language)}</strong>
                        <span>{plate.image}</span>
                      </div>

                      <div className="portfolio-asset-item__actions">
                        <button
                          type="button"
                          className={selectedProject.coverImage === plate.image ? 'is-active' : ''}
                          onClick={() => updateField('coverImage', plate.image)}
                        >
                          {t('common.cover')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedProject((project) => movePlateInProject(project, plate.id, 'up'))}
                          disabled={index === 0}
                        >
                          {t('common.up')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedProject((project) => movePlateInProject(project, plate.id, 'down'))}
                          disabled={index === selectedProject.plates.length - 1}
                        >
                          {t('common.down')}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedProject((project) => removePlateFromProject(project, plate.id))}
                        >
                          {t('common.remove')}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <div className="portfolio-edit-actions">
            <button
              type="button"
              className="portfolio-publish-button"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? t('portfolio.editor.publishing') : t('portfolio.editor.publishAction')}
            </button>
            <button type="button" onClick={() => setProjects(getDefaultPortfolioProjects())}>
              {t('portfolio.editor.resetDraft')}
            </button>
            <Link to="/portfolio" className="portfolio-inline-link">
              {t('portfolio.editor.openPublic')}
            </Link>
          </div>

          {publishStatus.type !== 'idle' && (
            <div className={`portfolio-publish-feedback is-${publishStatus.type}`}>
              {publishStatus.type === 'success' ? t('portfolio.editor.publishSuccess') : null}
              {publishStatus.type === 'error' ? t('portfolio.editor.publishError', { message: publishStatus.message }) : null}
            </div>
          )}
        </aside>

        <section className="portfolio-edit-preview">
          {localizedSelectedProject ? (
            <ProjectBooklet
              project={localizedSelectedProject}
              variant="inline"
            />
          ) : (
            <div className="portfolio-edit-preview__empty">
              <span className="portfolio-kicker">{t('portfolio.editor.preview')}</span>
              <p>{t('portfolio.editor.selectProjectToPreview')}</p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
};

export default PortfolioEdit;
