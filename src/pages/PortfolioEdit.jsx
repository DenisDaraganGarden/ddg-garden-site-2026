import React from 'react';
import { Link } from 'react-router-dom';
import PortfolioProjectList from '../components/portfolio/PortfolioProjectList';
import { projectRegistry } from '../data/projectRegistry';
import { publishedPortfolioPreviewSettings } from '../features/portfolio-preview/data/publishedPortfolioPreviewSettings';
import {
  loadPortfolioPreviewDraft,
  normalizePortfolioPreviewSettings,
  savePortfolioPreviewDraft,
} from '../features/portfolio-preview/lib/portfolioPreviewSettings';
import { publishPortfolioPreviewSettings } from '../features/portfolio-preview/lib/portfolioPreviewPublishClient';
import { useLanguage } from '../i18n/useLanguage';
import { localizeField } from '../lib/localizeField';
import '../styles/Portfolio.css';
import '../styles/PortfolioEditor.css';

const editorCopy = {
  ru: {
    kicker: 'ПОРТФОЛИО / ПРЕВЬЮ',
    title: 'НАВЕДЕНИЕ',
    saved: 'СОХРАНЕНО',
    saving: 'СОХРАНЯЮ',
    publishing: 'ПУБЛИКУЮ',
    published: 'ОПУБЛИКОВАНО',
    error: 'ОШИБКА',
    image: 'ИЗОБРАЖЕНИЕ',
    side: 'СТОРОНА',
    left: 'СЛЕВА',
    right: 'СПРАВА',
    size: 'РАЗМЕР',
    offset: 'СМЕЩЕНИЕ Y',
    enabled: 'ПОКАЗЫВАТЬ ПРИ НАВЕДЕНИИ',
    open: 'ОТКРЫТЬ ПОРТФОЛИО',
    publish: 'ОПУБЛИКОВАТЬ',
    publishConfirm: 'Записать текущие настройки превью в проект?',
    noImages: 'У проекта пока нет изображений.',
  },
  en: {
    kicker: 'PORTFOLIO / PREVIEW',
    title: 'HOVER',
    saved: 'SAVED',
    saving: 'SAVING',
    publishing: 'PUBLISHING',
    published: 'PUBLISHED',
    error: 'ERROR',
    image: 'IMAGE',
    side: 'SIDE',
    left: 'LEFT',
    right: 'RIGHT',
    size: 'SIZE',
    offset: 'OFFSET Y',
    enabled: 'SHOW ON HOVER',
    open: 'OPEN PORTFOLIO',
    publish: 'PUBLISH',
    publishConfirm: 'Write the current preview settings into the project?',
    noImages: 'This project has no images yet.',
  },
};

const PortfolioEdit = () => {
  const { language } = useLanguage();
  const copy = editorCopy[language] ?? editorCopy.ru;
  const editableProjects = React.useMemo(
    () => projectRegistry.filter((project) => project.status !== 'placeholder'),
    [],
  );
  const [selectedProjectId, setSelectedProjectId] = React.useState(editableProjects[0]?.id ?? null);
  const [settings, setSettings] = React.useState(() => (
    loadPortfolioPreviewDraft(projectRegistry, publishedPortfolioPreviewSettings)
  ));
  const [status, setStatus] = React.useState('saved');
  const selectedProject = editableProjects.find((project) => project.id === selectedProjectId);
  const selectedSettings = selectedProject ? settings[selectedProject.id] : null;

  React.useEffect(() => {
    setStatus('saving');
    const timeoutId = window.setTimeout(() => {
      savePortfolioPreviewDraft(projectRegistry, settings);
      setStatus('saved');
    }, 140);

    return () => window.clearTimeout(timeoutId);
  }, [settings]);

  const updateSelectedSettings = (nextValues) => {
    if (!selectedProject) return;

    setSettings((current) => ({
      ...current,
      [selectedProject.id]: {
        ...current[selectedProject.id],
        ...nextValues,
      },
    }));
  };

  const handlePublish = async () => {
    if (!window.confirm(copy.publishConfirm)) return;

    setStatus('publishing');
    try {
      const normalized = normalizePortfolioPreviewSettings(projectRegistry, settings);
      await publishPortfolioPreviewSettings(normalized);
      setSettings(normalized);
      setStatus('published');
      window.setTimeout(() => setStatus('saved'), 2200);
    } catch {
      setStatus('error');
    }
  };

  return (
    <main className="portfolio-edit-page" data-testid="portfolio-edit-page">
      <header className="portfolio-edit-header">
        <div>
          <span>{copy.kicker}</span>
          <h1>{copy.title}</h1>
        </div>
        <div className="portfolio-edit-header__actions">
          <span className={`portfolio-edit-status is-${status}`}>{copy[status]}</span>
          <Link to="/portfolio">{copy.open}</Link>
          <button type="button" onClick={handlePublish} disabled={status === 'publishing'}>
            {copy.publish}
          </button>
        </div>
      </header>

      <div className="portfolio-edit-layout">
        <aside className="portfolio-edit-panel">
          <nav className="portfolio-edit-projects" aria-label={copy.kicker}>
            {editableProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={project.id === selectedProjectId ? 'is-active' : ''}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <span>{project.fileCode}</span>
                {localizeField(project.title, language)}
              </button>
            ))}
          </nav>

          {selectedProject && selectedSettings ? (
            <section className="portfolio-edit-controls">
              <label className="portfolio-edit-toggle">
                <span>{copy.enabled}</span>
                <input
                  type="checkbox"
                  checked={selectedSettings.enabled}
                  onChange={(event) => updateSelectedSettings({ enabled: event.target.checked })}
                />
              </label>

              <div className="portfolio-edit-control">
                <span>{copy.image}</span>
                {selectedProject.images?.length ? (
                  <div className="portfolio-edit-images">
                    {selectedProject.images.map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        className={selectedSettings.image === image ? 'is-active' : ''}
                        onClick={() => updateSelectedSettings({ image })}
                        aria-label={`${copy.image} ${index + 1}`}
                      >
                        <img src={image} alt="" />
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>{copy.noImages}</p>
                )}
              </div>

              <div className="portfolio-edit-control">
                <span>{copy.side}</span>
                <div className="portfolio-edit-segmented">
                  {['left', 'right'].map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={selectedSettings.side === side ? 'is-active' : ''}
                      onClick={() => updateSelectedSettings({ side })}
                    >
                      {copy[side]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="portfolio-edit-range">
                <span>
                  {copy.size}
                  <output>{Math.round(selectedSettings.width)} VW</output>
                </span>
                <input
                  type="range"
                  min="28"
                  max="58"
                  step="1"
                  value={selectedSettings.width}
                  onChange={(event) => updateSelectedSettings({ width: Number(event.target.value) })}
                />
              </label>

              <label className="portfolio-edit-range">
                <span>
                  {copy.offset}
                  <output>{Math.round(selectedSettings.offsetY)} PX</output>
                </span>
                <input
                  type="range"
                  min="-160"
                  max="160"
                  step="4"
                  value={selectedSettings.offsetY}
                  onChange={(event) => updateSelectedSettings({ offsetY: Number(event.target.value) })}
                />
              </label>
            </section>
          ) : null}
        </aside>

        <section className="portfolio-edit-stage" aria-label={copy.title}>
          <div className="portfolio-edit-stage__viewport">
            <h2 className="site-section-title">{language === 'ru' ? 'РАБОТЫ' : 'WORKS'}</h2>
            <PortfolioProjectList
              projects={editableProjects}
              previewSettings={settings}
              forcedActiveProjectId={selectedProjectId}
              animate={false}
              linkEnabled={false}
            />
          </div>
        </section>
      </div>
    </main>
  );
};

export default PortfolioEdit;
