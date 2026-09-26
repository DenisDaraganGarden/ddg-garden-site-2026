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
import { LanguageProvider } from './i18n/LanguageProvider';
import { localizePath } from './i18n/languageRoutes';
import { SiteAudioProvider } from './features/audio/SiteAudioProvider';
import SiteLoadingScreen from './components/ui/SiteLoadingScreen';
import { archiveNavigationItems } from './config/siteNavigation';
import { useLanguage } from './i18n/useLanguage';
import ddgLogo from '../portfolio/DDG_logo.webp';
import { PortfolioContentProvider } from './features/portfolio-content';
const Home = lazy(() => import('./pages/Home'));
const Info = lazy(() => import('./pages/Info'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Map = lazy(() => import('./pages/Map'));
const HomeEdit = lazy(() => import('./pages/HomeEdit'));
const Engine = lazy(() => import('./pages/Engine'));
const PlantingReport = lazy(() => import('./pages/PlantingReport'));
const CursorConceptLab = lazy(() => import('./components/ui/CursorConceptLab'));
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
    const isHomeRoute = /^\/(?:en\/?)?$/.test(location.pathname);
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
        // Главное меню движка: проекты и лаборатория. Редактор открывается
        // отсюда с ?project=<id>; без параметра он остаётся редактором сайта.
        { path: '/engine', element: <Engine /> },
        // Отчёт по посадкам проекта для заказчика и дендролога (печать в PDF).
        { path: '/engine/report', element: <PlantingReport /> },
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
                        {routeDefinitions.flatMap((route) => (
                            // Каждый маршрут регистрируется дважды: в корне русский,
                            // под /en английский. Одна ветка «*» ловит всё остальное.
                            route.path === '*'
                                ? [<Route key="*" path="*" element={route.element} />]
                                : [
                                    <Route key={route.path} path={route.path} element={route.element} />,
                                    <Route
                                        key={localizePath(route.path, 'en')}
                                        path={localizePath(route.path, 'en')}
                                        element={route.element}
                                    />,
                                ]
                        ))}
                    </Routes>
                </Suspense>
            </main>

            <Suspense fallback={null}>
                <CursorConceptLab />
            </Suspense>
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
            <LanguageProvider>
                <SiteAudioProvider>
                    <PortfolioContentProvider><AppShell /></PortfolioContentProvider>
                </SiteAudioProvider>
            </LanguageProvider>
        </Router>
    );
}

export default App;
