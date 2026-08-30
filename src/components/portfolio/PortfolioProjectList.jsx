import React from 'react';
import { animated, config, useTrail } from 'react-spring';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { localizeField } from '../../lib/localizeField';

const ProjectRow = ({
  active,
  linkEnabled,
  onActivate,
  onDeactivate,
  preview,
  project,
  style,
}) => {
  const { language } = useLanguage();
  const rowContent = (
    <>
      <div className="project-row__meta">
        <span className="project-row__year">{project.year}</span>
        <span className="project-row__code">{project.fileCode}</span>
      </div>
      <div className="project-row__content">
        <h2 className="project-row__title">{localizeField(project.title, language)}</h2>
        <div className="project-row__discovery">
          <span className="project-row__location">{localizeField(project.location, language)}</span>
        </div>
      </div>
    </>
  );

  return (
    <animated.article
      className={`project-row project-row--${project.status} ${active ? 'is-preview-active' : ''}`}
      style={style}
      data-testid={`project-row-${project.id}`}
      onPointerEnter={onActivate}
      onPointerLeave={onDeactivate}
    >
      {preview?.enabled && preview.image ? (
        <figure
          className={`project-row__preview project-row__preview--${preview.side}`}
          style={{
            '--project-preview-width': `${preview.width}vw`,
            '--project-preview-offset-y': `${preview.offsetY}px`,
          }}
          data-testid={`project-preview-${project.id}`}
          aria-hidden="true"
        >
          <img src={preview.image} alt="" draggable="false" />
        </figure>
      ) : null}

      {linkEnabled ? (
        <Link
          to={`/portfolio/${project.slug}`}
          className="project-row__link"
          onFocus={onActivate}
          onBlur={onDeactivate}
        >
          {rowContent}
        </Link>
      ) : (
        <div className="project-row__link" aria-hidden="true">
          {rowContent}
        </div>
      )}
    </animated.article>
  );
};

const PortfolioProjectList = ({
  animate = true,
  forcedActiveProjectId = null,
  linkEnabled = true,
  previewSettings,
  projects,
}) => {
  const [hoveredProjectId, setHoveredProjectId] = React.useState(null);
  const activeProjectId = forcedActiveProjectId ?? hoveredProjectId;
  const trail = useTrail(projects.length, {
    config: { ...config.gentle, tension: 280, friction: 60 },
    from: animate ? { opacity: 0, transform: 'translateY(40px)' } : { opacity: 1, transform: 'translateY(0)' },
    to: { opacity: 1, transform: 'translateY(0)' },
    delay: animate ? 300 : 0,
    reset: animate,
    immediate: !animate,
  });

  return (
    <div className={`portfolio-list ${activeProjectId ? 'is-preview-active' : ''}`}>
      {trail.map((style, index) => {
        const project = projects[index];

        return (
          <ProjectRow
            key={project.id}
            project={project}
            preview={previewSettings?.[project.id]}
            active={activeProjectId === project.id}
            style={style}
            linkEnabled={linkEnabled}
            onActivate={() => setHoveredProjectId(project.id)}
            onDeactivate={() => setHoveredProjectId((current) => (
              current === project.id ? null : current
            ))}
          />
        );
      })}
    </div>
  );
};

export default PortfolioProjectList;
