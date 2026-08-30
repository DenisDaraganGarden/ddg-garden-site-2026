import React from 'react';
import ddgLogo from '../../../portfolio/DDG_logo.png';
import './SiteLoadingScreen.css';

const SiteLoadingScreen = ({
    isExiting = false,
    label = '3D scene is loading',
}) => (
    <div
        className={`site-loading-screen ${isExiting ? 'site-loading-screen--exit' : ''}`}
        data-testid="site-loading-screen"
        data-state={isExiting ? 'ready' : 'loading'}
        role="status"
        aria-label={label}
        aria-hidden={isExiting ? 'true' : undefined}
    >
        <div className="site-loading-screen__identity" aria-hidden="true">
            <img
                className="site-loading-screen__logo"
                src={ddgLogo}
                alt=""
            />
            <div className="site-loading-screen__wordmark">
                <span className="site-loading-screen__name">DENIS DARAGAN</span>
                <span className="site-loading-screen__bureau">БЮРО</span>
            </div>
        </div>
    </div>
);

export default SiteLoadingScreen;
