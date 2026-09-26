import React from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { usePortfolioContent } from '../features/portfolio-content';
import { animated } from 'react-spring';
import PortfolioProjectList from '../components/portfolio/PortfolioProjectList';
import { publishedPortfolioPreviewSettings } from '../features/portfolio-preview/data/publishedPortfolioPreviewSettings';
import { normalizePortfolioPreviewSettings } from '../features/portfolio-preview/lib/portfolioPreviewSettings';
import '../styles/Portfolio.css';

import { useSearchParams } from 'react-router-dom';

const Portfolio = () => {
  const { t } = useLanguage();
  const { projects } = usePortfolioContent();
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');

  const filteredProjects = React.useMemo(() => {
    if (!categoryFilter || categoryFilter === 'all') return projects;
    return projects.filter(p => p.category === categoryFilter);
  }, [categoryFilter, projects]);
  const previewSettings = React.useMemo(() => (
    normalizePortfolioPreviewSettings(projects, publishedPortfolioPreviewSettings)
  ), [projects]);

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
        <header className="portfolio-hero">
          <animated.h1 className="portfolio-title site-section-title">
            {t('portfolio.title')}
          </animated.h1>
        </header>

        <section className="portfolio-section">
          <PortfolioProjectList
            projects={filteredProjects}
            previewSettings={previewSettings}
          />
        </section>
      </div>
    </main>
  );
};

export default Portfolio;
