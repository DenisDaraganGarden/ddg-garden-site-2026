import React from 'react';

const TactilePortfolioCard = ({
  featuredProject,
  interactive = true,
  expanded = false,
  pressed = false,
  onPressStart,
  onPressEnd,
  onToggle,
  className = '',
}) => {
  const TagName = interactive ? 'button' : 'div';
  const shouldShowDetails = expanded || !interactive;

  return (
    <TagName
      type={interactive ? 'button' : undefined}
      className={`portfolio-slab ${expanded ? 'is-open' : ''} ${pressed ? 'is-pressed' : ''} ${className}`.trim()}
      onPointerDown={interactive ? onPressStart : undefined}
      onPointerUp={interactive ? onPressEnd : undefined}
      onPointerLeave={interactive ? onPressEnd : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          onPressStart?.();
        }
      } : undefined}
      onKeyUp={interactive ? (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          onPressEnd?.();
        }
      } : undefined}
      onClick={interactive ? onToggle : undefined}
      aria-pressed={interactive ? expanded : undefined}
      aria-label={
        interactive
          ? `Open portfolio case ${featuredProject.title}`
          : undefined
      }
    >
      <span className="portfolio-slab__shell">
        <span className="portfolio-slab__header">
          <span>{featuredProject.year}</span>
          <span>{interactive ? 'press' : 'preview'}</span>
        </span>

        <span className="portfolio-slab__title-wrap">
          <span className="portfolio-slab__title">{featuredProject.title}</span>
          <span className="portfolio-slab__subtitle">{featuredProject.subtitle}</span>
        </span>

        <span
          className="portfolio-slab__visual"
          style={{ backgroundImage: `url(${featuredProject.coverImage})` }}
        />

        <span className={`portfolio-slab__excerpt ${shouldShowDetails ? 'is-open' : ''}`}>
          {featuredProject.description}
        </span>
      </span>
    </TagName>
  );
};

export default TactilePortfolioCard;
