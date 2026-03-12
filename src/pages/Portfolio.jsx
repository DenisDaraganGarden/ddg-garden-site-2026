import React from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { projectRegistry } from '../data/projectRegistry';
import { localizeField } from '../lib/localizeField';
import { useTrail, animated, config } from 'react-spring';
import '../styles/Portfolio.css';

import { Link, useSearchParams } from 'react-router-dom';

const ProjectRow = ({ project, style }) => {
  const { language, t } = useLanguage();

  return (
    <animated.div
      className={`project-row project-row--${project.status}`}
      style={style}
      data-testid={`project-row-${project.id}`}
    >
      <Link to={`/portfolio/${project.slug}`} className="project-row__link">
        <div className="project-row__meta">
          <span className="project-row__year">{project.year}</span>
          <span className="project-row__code">{project.fileCode}</span>
        </div>
        <div className="project-row__content">
          <h2 className="project-row__title">{localizeField(project.title, language)}</h2>
          <div className="project-row__discovery">
            <span className="project-row__location">{localizeField(project.location, language)}</span>
            <span className="project-row__discover-label">{t('portfolio.discover')}</span>
          </div>
        </div>
      </Link>
    </animated.div>
  );
};

const Portfolio = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');

  const filteredProjects = React.useMemo(() => {
    if (!categoryFilter || categoryFilter === 'all') return projectRegistry;
    return projectRegistry.filter(p => p.category === categoryFilter);
  }, [categoryFilter]);

  const trail = useTrail(filteredProjects.length, {
    config: { ...config.gentle, tension: 280, friction: 60 },
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
    delay: 300,
    reset: true,
  });

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
        <header className="portfolio-hero">
          <animated.h1 className="portfolio-title">
            {t('portfolio.title')}
          </animated.h1>
        </header>

        <section className="portfolio-section">
          <div className="portfolio-list">
            {trail.map((style, index) => (
              <ProjectRow key={filteredProjects[index].id} project={filteredProjects[index]} style={style} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

export default Portfolio;
