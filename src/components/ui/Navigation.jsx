import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { archiveNavigationItems, primaryNavigationItems } from '../../config/siteNavigation';
import { useSiteMusic } from './SiteMusicController';
import './Navigation.css';

const PORTFOLIO_CATEGORIES = ['city', 'parks', 'residences'];

const Navigation = () => {
    const location = useLocation();
    const isHomeRoute = location.pathname === '/';
    const { language, setLanguage, t } = useLanguage();
    const {
        isMusicPlaying,
        toggleMusic,
        isEditorRoute,
        audioMode,
        isHomeAudioAudible,
    } = useSiteMusic();
    const [openGroup, setOpenGroup] = React.useState(null);
    const navRef = React.useRef(null);

    const canUseHover = React.useMemo(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return true;
        }

        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }, []);

    const closeGroups = React.useCallback(() => setOpenGroup(null), []);

    // Close any open dropdown on route change.
    React.useEffect(() => {
        closeGroups();
    }, [location.pathname, location.search, location.hash, closeGroups]);

    // On touch devices a dropdown is opened by tap; close it on outside tap / Escape.
    React.useEffect(() => {
        if (!openGroup || canUseHover) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (navRef.current?.contains(event.target)) {
                return;
            }
            closeGroups();
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeGroups();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [openGroup, canUseHover, closeGroups]);

    const groupHandlers = (key) => {
        if (canUseHover) {
            return {
                onMouseEnter: () => setOpenGroup(key),
                onMouseLeave: () => setOpenGroup((current) => (current === key ? null : current)),
            };
        }
        return {};
    };

    const handleGroupTap = (key) => (event) => {
        // Touch: first tap reveals the dropdown instead of following the parent.
        if (canUseHover) {
            return;
        }
        if (openGroup !== key) {
            event.preventDefault();
            setOpenGroup(key);
        }
    };

    return (
        <nav
            ref={navRef}
            className={`main-nav ${isHomeRoute ? 'main-nav--home' : ''}`}
            data-testid="site-nav"
        >
            <div className="nav-brand">
                <NavLink to="/" className="nav-brand__link" data-testid="brand-link">
                    Denis Daragan
                    <span className="brand-subtitle">{t('navigation.brandSubtitle')}</span>
                </NavLink>

                <ul className="nav-links">
                    {primaryNavigationItems.map((item) => {
                        if (item.key === 'portfolio') {
                            return (
                                <li
                                    key="portfolio"
                                    className={`nav-item nav-item--has-sub ${openGroup === 'portfolio' ? 'is-open' : ''}`}
                                    {...groupHandlers('portfolio')}
                                >
                                    <NavLink
                                        to="/portfolio"
                                        className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                                        data-testid="nav-portfolio"
                                        onClick={handleGroupTap('portfolio')}
                                    >
                                        {t('navigation.portfolio')}
                                    </NavLink>
                                    <div className="nav-sub">
                                        {PORTFOLIO_CATEGORIES.map((cat) => (
                                            <NavLink
                                                key={cat}
                                                to={`/portfolio?category=${cat}`}
                                                className="nav-sub__link"
                                            >
                                                {t(`navigation.portfolio_${cat}`)}
                                            </NavLink>
                                        ))}
                                        <NavLink
                                            to="/portfolio"
                                            className="nav-sub__link nav-sub__link--all"
                                        >
                                            {t('navigation.portfolio_all')}
                                        </NavLink>
                                    </div>
                                </li>
                            );
                        }

                        return (
                            <li key={item.key} className="nav-item">
                                <NavLink
                                    to={item.path}
                                    data-testid={`nav-${item.key}`}
                                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                                >
                                    {t(`navigation.${item.key}`)}
                                </NavLink>
                            </li>
                        );
                    })}

                    <li
                        className={`nav-item nav-item--has-sub ${openGroup === 'archive' ? 'is-open' : ''}`}
                        {...groupHandlers('archive')}
                    >
                        <button
                            type="button"
                            className="nav-link nav-link--group"
                            aria-expanded={openGroup === 'archive'}
                            onClick={() => setOpenGroup((current) => (current === 'archive' ? null : 'archive'))}
                        >
                            {t('navigation.archive')}
                        </button>
                        <div className="nav-sub">
                            {archiveNavigationItems.map((archiveItem) => (
                                <NavLink
                                    key={archiveItem.key}
                                    to={archiveItem.path}
                                    data-testid={`nav-${archiveItem.key}`}
                                    className="nav-sub__link"
                                >
                                    {t(`navigation.${archiveItem.key}`)}
                                </NavLink>
                            ))}
                        </div>
                    </li>
                </ul>
            </div>

            <div className="language-switch" role="group" aria-label={t('navigation.language')}>
                {!isEditorRoute ? (
                    <button
                        type="button"
                        onClick={toggleMusic}
                        className="language-switch__music"
                        data-testid="site-music-controller"
                        data-playing={isMusicPlaying ? 'true' : 'false'}
                        data-home-audible={isHomeAudioAudible ? 'true' : 'false'}
                        data-audio-mode={audioMode}
                        data-audio-silent="true"
                        data-audio-consent-toggle="true"
                        aria-label={isMusicPlaying ? t('navigation.soundOff') : t('navigation.soundOn')}
                        aria-pressed={isMusicPlaying}
                        title={isMusicPlaying ? t('navigation.soundOff') : t('navigation.soundOn')}
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
