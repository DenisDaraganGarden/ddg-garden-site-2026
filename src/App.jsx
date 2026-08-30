import React, {
    Suspense,
    lazy,
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    useLocation,
} from 'react-router-dom';
import Navigation from './components/ui/Navigation';
import SiteLoadingScreen from './components/ui/SiteLoadingScreen';
import { archiveNavigationItems } from './config/siteNavigation';
import { useLanguage } from './i18n/useLanguage';
import ddgLogo from '../portfolio/DDG_logo.png';
const Home = lazy(() => import('./pages/Home'));
const Info = lazy(() => import('./pages/Info'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Map = lazy(() => import('./pages/Map'));
const HomeEdit = lazy(() => import('./pages/HomeEdit'));
const PortfolioEdit = lazy(() => import('./pages/PortfolioEdit'));

const HOME_LOADER_MINIMUM_MS = 1400;

function HomeEntry({ onBootChange }) {
    const [isSceneReady, setIsSceneReady] = useState(false);
    const [isMinimumElapsed, setIsMinimumElapsed] = useState(false);

    // A route entry is the unit of loading: leaving Home unmounts this boundary,
    // while clicking the brand again on Home keeps the ready scene untouched.
    // Layout timing prevents the previous entry's ready chrome from painting for
    // one frame when the user returns from another page.
    useLayoutEffect(() => {
        onBootChange(false);
    }, [onBootChange]);

    useEffect(() => {
        const minimumTimer = window.setTimeout(() => {
            setIsMinimumElapsed(true);
        }, HOME_LOADER_MINIMUM_MS);

        return () => window.clearTimeout(minimumTimer);
    }, []);

    useEffect(() => {
        if (isSceneReady && isMinimumElapsed) {
            onBootChange(true);
        }
    }, [isMinimumElapsed, isSceneReady, onBootChange]);

    const handleSceneReady = useCallback(() => {
        setIsSceneReady(true);
    }, []);

    return (
        <Suspense fallback={null}>
            <Home onSceneReady={handleSceneReady} />
        </Suspense>
    );
}

function AppShell() {
    const { t } = useLanguage();
    const location = useLocation();
    const isHomeRoute = location.pathname === '/';
    const [isHomeReady, setIsHomeReady] = useState(false);
    const handleHomeBootChange = useCallback((isReady) => {
        setIsHomeReady(isReady);
    }, []);

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
        { path: '/', element: <HomeEntry onBootChange={handleHomeBootChange} /> },
        { path: '/info', element: <Info /> },
        { path: '/portfolio', element: <Portfolio /> },
        { path: '/portfolio/:projectId', element: <ProjectDetail /> },
        { path: '/map', element: <Map /> },
        ...archiveRouteDefinitions,
    ];

    const internalToolRoutes = [
        { path: '/home/edit', element: <HomeEdit /> },
        { path: '/portfolio/edit', element: <PortfolioEdit /> },
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
            {!isHomeRoute || isHomeReady ? <Navigation /> : null}

            <main className="app-content" style={{ position: 'relative', width: '100%', height: '100%' }}>
                <Suspense fallback={routeFallback}>
                    <Routes>
                        {routeDefinitions.map((route) => (
                            <Route key={route.path} path={route.path} element={route.element} />
                        ))}
                    </Routes>
                </Suspense>
            </main>

            {isHomeRoute ? (
                <SiteLoadingScreen
                    isExiting={isHomeReady}
                    label={t('app.routeLoading')}
                />
            ) : null}
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
