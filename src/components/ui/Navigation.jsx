import React from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { archiveNavigationItems, primaryNavigationItems } from '../../config/siteNavigation';
import './Navigation.css';

const Navigation = () => {
    const { language, setLanguage, t } = useLanguage();
    const [isArchiveOpen, setIsArchiveOpen] = React.useState(false);

    return (
        <nav className="main-nav" data-testid="site-nav">
            <div className="nav-brand">
                <NavLink to="/" data-testid="brand-link">
                    Denis Daragan
                    <span className="brand-subtitle">{t('navigation.brandSubtitle')}</span>
                </NavLink>
            </div>

            <div className="nav-menu">
                <div className="nav-links-wrapper">
                    <ul className="nav-links">
                        {primaryNavigationItems.map((item) => {
                            if (item.key === 'portfolio') {
                                return (
                                    <li key="portfolio-group" className="nav-group nav-group--portfolio">
                                        <NavLink
                                            to="/portfolio"
                                            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                                            data-testid="nav-portfolio"
                                        >
                                            {t('navigation.portfolio')}
                                        </NavLink>
                                        <div className="nav-portfolio-sub">
                                            {['city', 'parks', 'residences'].map((cat) => (
                                                <NavLink
                                                    key={cat}
                                                    to={`/portfolio?category=${cat}`}
                                                    className="nav-portfolio-sub__link"
                                                >
                                                    {t(`navigation.portfolio_${cat}`)}
                                                </NavLink>
                                            ))}
                                            <NavLink
                                                to="/portfolio"
                                                className="nav-portfolio-sub__link nav-portfolio-sub__link--all"
                                            >
                                                {t('navigation.portfolio_all')}
                                            </NavLink>
                                        </div>
                                    </li>
                                );
                            }
                            return (
                                <li key={item.key}>
                                    <NavLink
                                        to={item.path}
                                        data-testid={`nav-${item.key}`}
                                        className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                                    >
                                        {t(`navigation.${item.key}`)}
                                    </NavLink>
                                </li>
                            );
                        })}
                        <li
                            className={`nav-group ${isArchiveOpen ? 'is-open' : ''}`}
                            onMouseEnter={() => setIsArchiveOpen(true)}
                            onMouseLeave={() => setIsArchiveOpen(false)}
                            onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                        >
                            <span className="nav-link group-label">
                                {t('navigation.archive')}
                            </span>
                            <div className="nav-group-scroll">
                                {archiveNavigationItems.map((item) => (
                                    <NavLink
                                        key={item.key}
                                        to={item.path}
                                        data-testid={`nav-${item.key}`}
                                        className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                                    >
                                        {t(`navigation.${item.key}`)}
                                    </NavLink>
                                ))}
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <div className="language-switch" role="group" aria-label={t('navigation.language')}>
                {['ru', 'en'].map((code) => (
                    <button
                        key={code}
                        type="button"
                        className={`language-switch__button ${language === code ? 'is-active' : ''}`}
                        onClick={() => setLanguage(code)}
                        data-testid={`language-${code}`}
                        aria-label={t('navigation.switchTo', { language: code.toUpperCase() })}
                        aria-pressed={language === code}
                    >
                        {code.toUpperCase()}
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default Navigation;
