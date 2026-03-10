import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageProvider';

const ProjectBooklet = ({
    project,
    onClose,
    onPlateClick,
    variant = 'modal' // 'modal' or 'inline'
}) => {
    const { t } = useLanguage();

    if (!project) return null;

    const content = (
        <div className={`portfolio-booklet__inner ${variant === 'inline' ? 'is-inline' : ''}`}>
            <header className="portfolio-booklet__header">
                <div className="portfolio-booklet__title-cell">
                    <span className="portfolio-kicker">{project.fileCode}</span>
                    <h2 id={`portfolio-project-${project.id}`}>{project.title}</h2>
                    <div className="portfolio-booklet__meta-line">
                        <span className="portfolio-booklet__year">{project.year}</span>
                        <span className="portfolio-booklet__dot">•</span>
                        <Link to={`/map?project=${project.id}`} className="portfolio-location-link">
                            {project.location}
                        </Link>
                    </div>
                </div>

                {onClose && (
                    <button
                        type="button"
                        className="portfolio-booklet__close"
                        data-testid="portfolio-project-close"
                        onClick={onClose}
                        aria-label={t('portfolio.closeProject')}
                    >
                        {t('common.close')}
                    </button>
                )}
            </header>

            <div className="portfolio-booklet__content">
                <div className="portfolio-booklet__description-cell">
                    {project.description ? (
                        <div className="portfolio-booklet__description">
                            {project.description.split('\n').map((paragraph, i) => (
                                <p key={i}>{paragraph}</p>
                            ))}
                        </div>
                    ) : (
                        <p className="portfolio-booklet__statement">{project.statement}</p>
                    )}
                </div>

                <div className="portfolio-booklet__plates-cell">
                    <div className="portfolio-booklet__plate-grid">
                        {project.plates.map((plate, index) => (
                            <button
                                key={plate.id}
                                type="button"
                                className="portfolio-booklet__plate"
                                data-testid={`portfolio-plate-${plate.id}`}
                                onClick={() => onPlateClick?.(index)}
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
    );

    if (variant === 'inline') {
        return (
            <section className="portfolio-booklet is-inline" role="region">
                {content}
            </section>
        );
    }

    return (
        <div
            className="portfolio-sheet-backdrop"
            role="presentation"
            onClick={onClose}
        >
            <section
                className="portfolio-booklet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`portfolio-project-${project.id}`}
                onClick={(event) => event.stopPropagation()}
            >
                {content}
            </section>
        </div>
    );
};

export default ProjectBooklet;
