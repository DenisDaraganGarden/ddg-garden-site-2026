import React, { Suspense, lazy } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
} from 'react-router-dom';
import Navigation from './components/ui/Navigation';
import { archiveNavigationItems } from './config/siteNavigation';
import { useLanguage } from './i18n/useLanguage';
const Home = lazy(() => import('./pages/Home'));
const Info = lazy(() => import('./pages/Info'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Map = lazy(() => import('./pages/Map'));
const HomeEdit = lazy(() => import('./pages/HomeEdit'));

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
        <div className="route-loading-fallback" aria-live="polite">
            {t('app.routeLoading')}
        </div>
    );

    return (
        <>
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
        </>
    );
}

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppShell />
        </Router>
    );
}

export default App;
