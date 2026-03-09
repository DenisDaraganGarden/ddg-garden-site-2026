import React from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageProvider';
import './Navigation.css';

const navItems = [
    { key: 'portfolio', path: '/portfolio' },
    { key: 'info', path: '/info' },
    { key: 'press', path: '/press' },
    { key: 'news', path: '/news' },
    { key: 'monographs', path: '/monographs' },
    { key: 'map', path: '/map' },
    { key: 'archive', path: '/archive' }
];

const Navigation = () => {
    const { language, setLanguage, t } = useLanguage();

    return (
        <nav className="main-nav">
            <div className="nav-brand">
                <NavLink to="/">
                    Denis Daragan
                    <span className="brand-subtitle">{t('navigation.brandSubtitle')}</span>
                </NavLink>
            </div>

            <div className="nav-menu">
                <ul className="nav-links">
                    {navItems.map((item) => (
                        <li key={item.key}>
                            <NavLink
                                to={item.path}
                                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                            >
                                {t(`navigation.${item.key}`)}
                            </NavLink>
                        </li>
                    ))}
                </ul>

                <div className="language-switch" role="group" aria-label={t('navigation.language')}>
                    {['ru', 'en'].map((code) => (
                        <button
                            key={code}
                            type="button"
                            className={`language-switch__button ${language === code ? 'is-active' : ''}`}
                            onClick={() => setLanguage(code)}
                            aria-label={t('navigation.switchTo', { language: code.toUpperCase() })}
                            aria-pressed={language === code}
                        >
                            {code.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
