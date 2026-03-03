import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/ui/Navigation';
const Home = lazy(() => import('./pages/Home'));
const Info = lazy(() => import('./pages/Info'));
const InfoEdit = lazy(() => import('./pages/InfoEdit'));
const HomeEdit = lazy(() => import('./pages/HomeEdit'));
const SnakeEdit = lazy(() => import('./pages/SnakeEdit'));
const PlaceholderPage = ({ title }) => (
    <section className="stub-page">
        <h2>{title}</h2>
    </section>
);

const News = () => <PlaceholderPage title="News" />;
const Monographs = () => <PlaceholderPage title="Monographs" />;
const Press = () => <PlaceholderPage title="Press" />;
const MapView = () => <PlaceholderPage title="Map" />;
const Archive = () => <PlaceholderPage title="Archive" />;

const routeDefinitions = [
    { path: '/', element: <Home /> },
    { path: '/home/edit', element: <HomeEdit /> },
    { path: '/home-edit', element: <HomeEdit /> },
    { path: '/snake/edit', element: <SnakeEdit /> },
    { path: '/snake-edit', element: <SnakeEdit /> },
    { path: '/news', element: <News /> },
    { path: '/info', element: <Info /> },
    { path: '/info/edit', element: <InfoEdit /> },
    { path: '/monographs', element: <Monographs /> },
    { path: '/press', element: <Press /> },
    { path: '/map', element: <MapView /> },
    { path: '/archive', element: <Archive /> },
];

const routeFallback = (
    <div className="route-loading-fallback" aria-live="polite">
        Loading...
    </div>
);

function App() {
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
