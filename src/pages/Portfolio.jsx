import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageProvider';
import {
  getDefaultPortfolioProjects,
  getLocalizedPortfolioProject,
  loadPortfolioProjects,
} from '../lib/portfolioProjectStorage';
import '../styles/Portfolio.css';

const Portfolio = () => {
  const { language, t } = useLanguage();
  const [projects, setProjects] = useState(getDefaultPortfolioProjects());
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activePlateIndex, setActivePlateIndex] = useState(null);
  const localizedProjects = projects.map((project) => getLocalizedPortfolioProject(project, language));
  const activeProject = localizedProjects.find((project) => project.id === activeProjectId) ?? null;
  const activePlate = activeProject && activePlateIndex !== null
    ? activeProject.plates[activePlateIndex]
    : null;

  useEffect(() => {
    setProjects(loadPortfolioProjects());
  }, []);

  useEffect(() => {
    if (!activeProject && !activePlate) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeProject, activePlate]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (activePlate) {
          setActivePlateIndex(null);
          return;
        }

        if (activeProject) {
          setActiveProjectId(null);
        }

        return;
      }

      if (!activeProject || activePlateIndex === null) {
        return;
      }

      if (event.key === 'ArrowRight') {
        setActivePlateIndex((previous) => (
          previous + 1 >= activeProject.plates.length ? 0 : previous + 1
        ));
      }

      if (event.key === 'ArrowLeft') {
        setActivePlateIndex((previous) => (
          previous - 1 < 0 ? activeProject.plates.length - 1 : previous - 1
        ));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProject, activePlate, activePlateIndex]);

  const openProject = (projectId) => {
    setActiveProjectId(projectId);
    setActivePlateIndex(null);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const closeProject = () => {
    setActiveProjectId(null);
    setActivePlateIndex(null);
  };

  const openPlate = (index) => {
    setActivePlateIndex(index);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8);
    }
  };

  const goToPreviousPlate = () => {
    if (!activeProject) {
      return;
    }

    setActivePlateIndex((previous) => (
      previous - 1 < 0 ? activeProject.plates.length - 1 : previous - 1
    ));
  };

  const goToNextPlate = () => {
    if (!activeProject) {
      return;
    }

    setActivePlateIndex((previous) => (
      previous + 1 >= activeProject.plates.length ? 0 : previous + 1
    ));
  };

  return (
    <div className="portfolio-page" data-testid="portfolio-page">
      <div className="portfolio-page__noise" />

      <section className="portfolio-shell portfolio-shell--editorial">
        <header className="portfolio-hero">
          <h1>{t('portfolio.title')}</h1>
        </header>

        <section className="portfolio-title-list" aria-label={t('navigation.portfolio')}>
          {localizedProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="portfolio-title-item"
              onClick={() => openProject(project.id)}
              data-testid={`portfolio-project-${project.id}`}
            >
              <span className="portfolio-title-item__year">{project.year}</span>
              <span className="portfolio-title-item__name">{project.title}</span>
              <span className="portfolio-title-item__code">{project.fileCode}</span>
            </button>
          ))}
        </section>

        <footer className="portfolio-footnote">
          <Link to="/portfolio/edit" className="portfolio-inline-link">
            {t('portfolio.openDraftEditor')}
          </Link>
        </footer>
      </section>

      {activeProject ? (
        <div
          className="portfolio-sheet-backdrop"
          role="presentation"
          onClick={closeProject}
        >
          <section
            className="portfolio-booklet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`portfolio-project-${activeProject.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portfolio-booklet__inner">
              <header className="portfolio-booklet__header">
                <div className="portfolio-booklet__title-cell">
                  <span className="portfolio-kicker">{activeProject.fileCode}</span>
                  <h2 id={`portfolio-project-${activeProject.id}`}>{activeProject.title}</h2>
                  <div className="portfolio-booklet__meta-line">
                    <span className="portfolio-booklet__year">{activeProject.year}</span>
                    <span className="portfolio-booklet__dot">•</span>
                    <Link to={`/map?project=${activeProject.id}`} className="portfolio-location-link">
                      {activeProject.location}
                    </Link>
                  </div>
                </div>

                <button
                  type="button"
                  className="portfolio-booklet__close"
                  data-testid="portfolio-project-close"
                  onClick={closeProject}
                  aria-label={t('portfolio.closeProject')}
                >
                  {t('common.close')}
                </button>
              </header>

              <div className="portfolio-booklet__content">
                <div className="portfolio-booklet__description-cell">
                  {activeProject.description ? (
                    <div className="portfolio-booklet__description">
                      {activeProject.description.split('\n').map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="portfolio-booklet__statement">{activeProject.statement}</p>
                  )}
                </div>

                <div className="portfolio-booklet__plates-cell">
                  <div className="portfolio-booklet__plate-grid">
                    {activeProject.plates.map((plate, index) => (
                      <button
                        key={plate.id}
                        type="button"
                        className="portfolio-booklet__plate"
                        data-testid={`portfolio-plate-${plate.id}`}
                        onClick={() => openPlate(index)}
                        aria-label={t('portfolio.openPlate', { label: plate.label })}
                      >
                        <img
                          src={plate.image}
                          alt={plate.alt}
                          style={{ objectPosition: plate.previewPosition }}
                          loading="lazy"
                        />
                        <span className="portfolio-booklet__plate-label">{plate.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeProject && activePlate ? (
        <div
          className="portfolio-lightbox"
          role="presentation"
          onClick={() => setActivePlateIndex(null)}
        >
          <section
            className="portfolio-lightbox__frame"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`portfolio-plate-${activePlate.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portfolio-lightbox__toolbar">
              <div>
                <span className="portfolio-kicker">{t('portfolio.fullscreenPlate')}</span>
                <h2 id={`portfolio-plate-${activePlate.id}`}>{activeProject.title}</h2>
              </div>

              <button
                type="button"
                className="portfolio-sheet__close"
                data-testid="portfolio-lightbox-close"
                onClick={() => setActivePlateIndex(null)}
                aria-label={t('portfolio.closeFullscreenPlate')}
              >
                {t('common.close')}
              </button>
            </div>

            <div className="portfolio-lightbox__image-wrap">
              <img
                className="portfolio-lightbox__image"
                src={activePlate.image}
                alt={activePlate.alt}
              />
            </div>

            <footer className="portfolio-lightbox__footer">
              <span>{activePlate.label}</span>
              <span>{activePlateIndex + 1} / {activeProject.plates.length}</span>
            </footer>

            {activeProject.plates.length > 1 ? (
              <div className="portfolio-lightbox__nav">
                <button type="button" onClick={goToPreviousPlate} data-testid="portfolio-lightbox-prev">
                  {t('common.prev')}
                </button>
                <button type="button" onClick={goToNextPlate} data-testid="portfolio-lightbox-next">
                  {t('common.next')}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default Portfolio;
