import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/ui/Navigation';
import { useLanguage } from './i18n/LanguageProvider';
const Home = lazy(() => import('./pages/Home'));
const Info = lazy(() => import('./pages/Info'));
const InfoEdit = lazy(() => import('./pages/InfoEdit'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const PortfolioEdit = lazy(() => import('./pages/PortfolioEdit'));
const Map = lazy(() => import('./pages/Map'));
const SnakeEdit = lazy(() => import('./pages/SnakeEdit'));

function App() {
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

    const News = () => <PlaceholderPage sectionKey="news" />;
    const Monographs = () => <PlaceholderPage sectionKey="monographs" />;
    const Press = () => <PlaceholderPage sectionKey="press" />;
    const Archive = () => <PlaceholderPage sectionKey="archive" />;
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

    const routeDefinitions = [
        { path: '/', element: <Home /> },
        { path: '/home/edit', element: <Navigate replace to="/snake/edit" /> },
        { path: '/home-edit', element: <Navigate replace to="/snake/edit" /> },
        { path: '/snake/edit', element: <SnakeEdit /> },
        { path: '/snake-edit', element: <SnakeEdit /> },
        { path: '/news', element: <News /> },
        { path: '/info', element: <Info /> },
        { path: '/info/edit', element: <InfoEdit /> },
        { path: '/portfolio', element: <Portfolio /> },
        { path: '/portfolio/edit', element: <PortfolioEdit /> },
        { path: '/monographs', element: <Monographs /> },
        { path: '/press', element: <Press /> },
        { path: '/map', element: <Map /> },
        { path: '/archive', element: <Archive /> },
        { path: '*', element: <NotFound /> },
    ];

    const routeFallback = (
        <div className="route-loading-fallback" aria-live="polite">
            {t('app.routeLoading')}
        </div>
    );

    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Navigation />

            <main style={{ position: 'relative', width: '100%', height: '100%' }}>
                <Suspense fallback={routeFallback}>
                    <Routes>
                        {routeDefinitions.map((route) => (
                            <Route key={route.path} path={route.path} element={route.element} />
                        ))}
                    </Routes>
                </Suspense>
            </main>
        </Router>
    );
}

export default App;
