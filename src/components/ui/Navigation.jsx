import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { archiveNavigationItems, primaryNavigationItems } from '../../config/siteNavigation';
import ouroborosDark from '../../../portfolio/DDG_logo.png';
import ouroborosWhite from '../../../portfolio/Denis Daragan Garden Logo White.png';
import { useSiteMusic } from './SiteMusicController';
import './Navigation.css';

const Navigation = () => {
    const location = useLocation();
    const isHomeRoute = location.pathname === '/';
    const { language, setLanguage, t } = useLanguage();
    const { isMusicPlaying, toggleMusic, isEditorRoute } = useSiteMusic();
    const [isArchiveOpen, setIsArchiveOpen] = React.useState(false);
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const navMenuRef = React.useRef(null);
    const toggleButtonRef = React.useRef(null);
    const touchStartRef = React.useRef(null);
    const canUseHover = React.useMemo(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return true;
        }

        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }, []);

    const logoSrc = ouroborosWhite || ouroborosDark;

    const closeMenu = React.useCallback(() => {
        setIsMenuOpen(false);
        setIsArchiveOpen(false);
    }, []);

    React.useEffect(() => {
        closeMenu();
    }, [location.pathname, location.search, location.hash, closeMenu]);

    React.useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }

        const handleVisibilityChange = () => {
            if (document.hidden) {
                closeMenu();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [closeMenu]);

    React.useEffect(() => {
        if (!isMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            const target = event.target;
            if (navMenuRef.current?.contains(target) || toggleButtonRef.current?.contains(target)) {
                return;
            }

            closeMenu();
        };

        const handleTouchStart = (event) => {
            const touch = event.touches?.[0];
            if (!touch) {
                return;
            }

            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        };

        const handleTouchMove = (event) => {
            const touch = event.touches?.[0];
            const start = touchStartRef.current;

            if (!touch || !start) {
                return;
            }

            const deltaX = Math.abs(touch.clientX - start.x);
            const deltaY = Math.abs(touch.clientY - start.y);

            if (deltaX > 12 || deltaY > 12) {
                closeMenu();
                touchStartRef.current = null;
            }
        };

        const handleWheel = () => closeMenu();
        const handleBlur = () => closeMenu();
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('blur', handleBlur);
        window.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [closeMenu, isMenuOpen]);

    const handleArchiveToggle = (event) => {
        event.stopPropagation();
        setIsArchiveOpen((previous) => !previous);
    };

    return (
        <nav className={`main-nav ${isHomeRoute ? 'main-nav--home' : ''}`} data-testid="site-nav">
            <div className="nav-brand">
                <NavLink to="/" data-testid="brand-link">
                    Denis Daragan
                    <span className="brand-subtitle">{t('navigation.brandSubtitle')}</span>
                </NavLink>
            </div>

            <div ref={navMenuRef} className={`nav-menu ${isMenuOpen ? 'is-open' : ''}`}>
                <button
                    ref={toggleButtonRef}
                    type="button"
                    className={`ouroboros-toggle ${isMenuOpen ? 'is-open' : ''}`}
                    aria-label={isMenuOpen ? t('navigation.closeMenu') : t('navigation.openMenu')}
                    aria-expanded={isMenuOpen}
                    aria-controls="site-nav-drawer"
                    onClick={() => setIsMenuOpen((previous) => !previous)}
                >
                    <img className="ouroboros-toggle__icon" src={logoSrc} alt="" aria-hidden="true" />
                </button>

                <div id="site-nav-drawer" className="nav-drawer" aria-hidden={!isMenuOpen}>
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
                                                onClick={closeMenu}
                                            >
                                                {t('navigation.portfolio')}
                                            </NavLink>
                                            <div className="nav-portfolio-sub">
                                                {['city', 'parks', 'residences'].map((cat) => (
                                                    <NavLink
                                                        key={cat}
                                                        to={`/portfolio?category=${cat}`}
                                                        className="nav-portfolio-sub__link"
                                                        onClick={closeMenu}
                                                    >
                                                        {t(`navigation.portfolio_${cat}`)}
                                                    </NavLink>
                                                ))}
                                                <NavLink
                                                    to="/portfolio"
                                                    className="nav-portfolio-sub__link nav-portfolio-sub__link--all"
                                                    onClick={closeMenu}
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
                                            onClick={closeMenu}
                                        >
                                            {t(`navigation.${item.key}`)}
                                        </NavLink>
                                    </li>
                                );
                            })}
                            <li
                                className={`nav-group ${isArchiveOpen ? 'is-open' : ''}`}
                                onMouseEnter={canUseHover ? () => setIsArchiveOpen(true) : undefined}
                                onMouseLeave={canUseHover ? () => setIsArchiveOpen(false) : undefined}
                                onClick={handleArchiveToggle}
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
                                            onClick={closeMenu}
                                        >
                                            {t(`navigation.${item.key}`)}
                                        </NavLink>
                                    ))}
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="language-switch" role="group" aria-label={t('navigation.language')}>
                {!isEditorRoute ? (
                    <button
                        type="button"
                        onClick={toggleMusic}
                        className="language-switch__music"
                        data-testid="site-music-controller"
                        data-playing={isMusicPlaying ? 'true' : 'false'}
                        aria-label={isMusicPlaying ? 'Выключить музыку' : 'Включить музыку'}
                        aria-pressed={isMusicPlaying}
                        title={isMusicPlaying ? 'Выключить музыку' : 'Включить музыку'}
                    >
                        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
                            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                            {isMusicPlaying ? (
                                <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                                    <path d="M16 8.5a5 5 0 0 1 0 7" />
                                    <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
                                </g>
                            ) : (
                                <path
                                    d="M16 9l5 6M21 9l-5 6"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                />
                            )}
                        </svg>
                    </button>
                ) : null}
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
