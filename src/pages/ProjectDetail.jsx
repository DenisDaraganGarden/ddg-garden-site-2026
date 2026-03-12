import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/useLanguage';
import { projectRegistry } from '../data/projectRegistry';
import { localizeField } from '../lib/localizeField';
import { useSpring, animated, config } from 'react-spring';
import '../styles/ProjectDetail.css';

const ProjectDetail = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { language, t } = useLanguage();

    const project = useMemo(() => {
        return projectRegistry.find(p => p.id === projectId);
    }, [projectId]);

    const fadeIn = useSpring({
        from: { opacity: 0, transform: 'translate3d(0, 20px, 0)' },
        to: { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        config: config.slow,
    });

    if (!project) {
        return (
            <div className="project-detail-error">
                <p>{t('app.notFoundTitle')}</p>
                <button onClick={() => navigate('/portfolio')}>{t('portfolio.backToList') || 'Back to Portfolio'}</button>
            </div>
        );
    }

    return (
        <div className={`project-detail ${project.theme ? `project-detail--${project.theme}` : ''}`} data-testid="project-detail">
            <div className="project-detail__noise" />

            {project.images && project.images[0] && (
                <section className="project-detail__hero">
                    <img src={project.images[0]} alt="" className="project-detail__hero-image" />
                    <div className="project-detail__hero-content">
                        <nav className="project-detail__nav">
                            <button onClick={() => navigate('/portfolio')} className="project-detail__back">
                                <span className="arrow">←</span> {t('portfolio.backToList') || 'BACK'}
                            </button>
                        </nav>
                        <header className="project-detail__header">
                            <div className="project-detail__meta">
                                <span className="project-detail__year">{project.year}</span>
                                <span className="project-detail__code">{project.fileCode}</span>
                            </div>
                            <animated.h1 className="project-detail__title" style={fadeIn}>
                                {localizeField(project.title, language)}
                            </animated.h1>
                            <p className="project-detail__location">
                                {localizeField(project.location, language)}
                            </p>

                            {project.collaboration && (
                                <p className="project-detail__collaboration">
                                    {localizeField(project.collaboration, language)}
                                </p>
                            )}

                            {project.theme === 'magazine' && (
                                <div className="project-detail__editorial-elements">
                                    <span className="editorial-tag">COLLECTION. 05 / 26</span>
                                    <div className="scroll-hint">
                                        <span className="scroll-hint__line"></span>
                                        <span className="scroll-hint__text">SCROLL</span>
                                    </div>
                                </div>
                            )}
                        </header>
                    </div>
                </section>
            )}

            <div className="project-detail__container">
                <section className="project-detail__content">
                    {project.images && project.images.slice(1).map((img, idx) => (
                        <div key={idx} className={`project-detail__image-wrapper project-detail__image-wrapper--${idx + 1}`}>
                            <img src={img} alt="" loading="lazy" />
                        </div>
                    ))}
                </section>

                {project.status === 'placeholder' && (
                    <footer className="project-detail__footer">
                        <p className="portfolio-placeholder-note">{t('portfolio.placeholderNote')}</p>
                    </footer>
                )}
            </div>
        </div>
    );
};

export default ProjectDetail;
