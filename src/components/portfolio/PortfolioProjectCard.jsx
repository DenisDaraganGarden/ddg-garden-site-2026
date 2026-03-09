import React from 'react';
import { useLanguage } from '../../i18n/LanguageProvider';

const CARD_RHYTHMS = [
  {
    '--portfolio-tilt': '-0.35deg',
    '--portfolio-shift': '0.08rem',
  },
  {
    '--portfolio-tilt': '0.26deg',
    '--portfolio-shift': '0rem',
  },
  {
    '--portfolio-tilt': '-0.18deg',
    '--portfolio-shift': '0.12rem',
  },
  {
    '--portfolio-tilt': '0.3deg',
    '--portfolio-shift': '0.04rem',
  },
  {
    '--portfolio-tilt': '-0.22deg',
    '--portfolio-shift': '0.15rem',
  },
];

const PortfolioProjectCard = ({ project, onOpen, index = 0 }) => {
  const { t } = useLanguage();
  const rhythm = CARD_RHYTHMS[index % CARD_RHYTHMS.length];

  return (
    <button
      type="button"
      className="portfolio-project-card"
      onClick={() => onOpen(project.id)}
      aria-label={t('portfolio.openProject', { title: project.title })}
      style={rhythm}
    >
      <span className="portfolio-project-card__paper">
        <span className="portfolio-project-card__meta">
          <span>{project.year}</span>
        </span>

        <span className="portfolio-project-card__image-wrap">
          <img
            className="portfolio-project-card__image"
            src={project.coverImage}
            alt={project.coverAlt}
            style={{ objectPosition: project.coverPosition }}
            loading="lazy"
          />
        </span>

        <span className="portfolio-project-card__body">
          <span className="portfolio-project-card__title">{project.title}</span>
          <span className="portfolio-project-card__redaction">
            <span className="portfolio-project-card__subtitle">{project.subtitle}</span>
          </span>
        </span>
      </span>
    </button>
  );
};

export default PortfolioProjectCard;
