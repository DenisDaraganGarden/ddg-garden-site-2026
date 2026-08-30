import React, { Suspense, lazy } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
} from 'react-router-dom';
import Navigation from './components/ui/Navigation';
import { SiteAudioProvider } from './features/audio/SiteAudioProvider';
import { archiveNavigationItems } from './config/siteNavigation';
import { useLanguage } from './i18n/useLanguage';
import ddgLogo from '../portfolio/DDG_logo.webp';
const Home = lazy(() => import('./pages/Home'));
const Info = lazy(() => import('./pages/Info'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Map = lazy(() => import('./pages/Map'));
const HomeEdit = lazy(() => import('./pages/HomeEdit'));
const CursorConceptLab = lazy(() => import('./components/ui/CursorConceptLab'));

function AppShell() {
    const { t } = useLanguage();

    const PlaceholderPage = ({ sectionKey }) => (
        <section className="stub-page">
            <div>
                <h2>{t(`app.placeholders.${sectionKey}.title`)}</h2>
                <p style={{ marginTop: '1rem', color: 'rgba(255, 255, 255, 0.62)' }}>
                    {t(`app.placeholders.${sectionKey}.body`)}
                </p>
            </div>
        </section>
    );

    const NotFound = () => (
        <section className="stub-page" data-testid="not-found-page">
            <div>
                <h2 data-testid="not-found-title">{t('app.notFoundTitle')}</h2>
                <p style={{ marginTop: '1rem', color: 'rgba(255, 255, 255, 0.62)' }}>
                    {t('app.notFoundBody')}
                </p>
            </div>
        </section>
    );

    const archiveRouteDefinitions = archiveNavigationItems.map((item) => ({
        path: item.path,
        element: <PlaceholderPage sectionKey={item.key} />,
    }));

    const publicRouteDefinitions = [
        { path: '/', element: <Home /> },
        { path: '/info', element: <Info /> },
        { path: '/portfolio', element: <Portfolio /> },
        { path: '/portfolio/:projectId', element: <ProjectDetail /> },
        { path: '/map', element: <Map /> },
        ...archiveRouteDefinitions,
    ];

    const internalToolRoutes = [
        { path: '/home/edit', element: <HomeEdit /> },
    ];

    const routeDefinitions = [
        ...publicRouteDefinitions,
        ...internalToolRoutes,
        { path: '*', element: <NotFound /> },
    ];

    const routeFallback = (
        <div className="route-loading-fallback" aria-live="polite" aria-label={t('app.routeLoading')}>
            <img
                src={ddgLogo}
                alt=""
                aria-hidden="true"
                style={{
                    width: 'clamp(3.8rem, 8vw, 6.2rem)',
                    height: 'clamp(3.8rem, 8vw, 6.2rem)',
                    objectFit: 'contain',
                    opacity: 0.9,
                    filter: 'drop-shadow(0 0 14px rgba(255, 255, 255, 0.2))',
                    animation: 'ouroboros-spin 4.3s linear infinite',
                }}
            />
        </div>
    );

    return (
        <>
            <Navigation />

            <main className="app-content" style={{ position: 'relative', width: '100%', height: '100%' }}>
                <Suspense fallback={routeFallback}>
                    <Routes>
                        {routeDefinitions.map((route) => (
                            <Route key={route.path} path={route.path} element={route.element} />
                        ))}
                    </Routes>
                </Suspense>
            </main>

            <Suspense fallback={null}>
                <CursorConceptLab />
            </Suspense>
        </>
    );
}

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <SiteAudioProvider>
                <AppShell />
            </SiteAudioProvider>
        </Router>
    );
}

export default App;
