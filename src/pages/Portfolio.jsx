import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortfolioProjectCard from '../components/portfolio/PortfolioProjectCard';
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
    <div className="portfolio-page">
      <div className="portfolio-page__noise" />

      <section className="portfolio-shell portfolio-shell--editorial">
        <header className="portfolio-hero">
          <h1>{t('portfolio.title')}</h1>
        </header>

        <section className="portfolio-card-grid" aria-label={t('navigation.portfolio')}>
          {localizedProjects.map((project, index) => (
            <PortfolioProjectCard
              key={project.id}
              project={project}
              index={index}
              onOpen={openProject}
            />
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
            className="portfolio-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`portfolio-project-${activeProject.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="portfolio-sheet__header">
              <div className="portfolio-sheet__heading">
                <span className="portfolio-kicker">{t('portfolio.openedProject')}</span>
                <h2 id={`portfolio-project-${activeProject.id}`}>{activeProject.title}</h2>
                <p className="portfolio-redaction-copy">{activeProject.statement}</p>
              </div>

              <button
                type="button"
                className="portfolio-sheet__close"
                onClick={closeProject}
                aria-label={t('portfolio.closeProject')}
              >
                {t('common.close')}
              </button>
            </header>

            <div className="portfolio-sheet__meta">
              <span>{activeProject.year}</span>
              <span>{activeProject.location}</span>
              <span>{t('portfolio.plateCount', { count: activeProject.plates.length })}</span>
            </div>

            <div className="portfolio-plate-grid">
              {activeProject.plates.map((plate, index) => (
                <button
                  key={plate.id}
                  type="button"
                  className="portfolio-plate-card"
                  onClick={() => openPlate(index)}
                  aria-label={t('portfolio.openPlate', { label: plate.label })}
                >
                  <span className="portfolio-plate-card__frame">
                    <img
                      className="portfolio-plate-card__image"
                      src={plate.image}
                      alt={plate.alt}
                      style={{ objectPosition: plate.previewPosition }}
                      loading="lazy"
                    />
                    <span className="portfolio-plate-card__tag">{plate.label}</span>
                  </span>
                </button>
              ))}
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
                <button type="button" onClick={goToPreviousPlate}>
                  {t('common.prev')}
                </button>
                <button type="button" onClick={goToNextPlate}>
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
