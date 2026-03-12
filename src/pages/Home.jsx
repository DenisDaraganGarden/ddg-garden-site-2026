import React, { useEffect } from 'react';
import WaterScene from '../components/effects/WaterScene';
import { usePublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import '../styles/Home.css';

const Home = () => {
    const { settings } = usePublishedHomeSceneSettings();

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const { documentElement, body } = document;
        const previousHtmlOverflow = documentElement.style.overflow;
        const previousHtmlOverscroll = documentElement.style.overscrollBehavior;
        const previousBodyOverflow = body.style.overflow;
        const previousBodyOverscroll = body.style.overscrollBehavior;

        documentElement.style.overflow = 'hidden';
        documentElement.style.overscrollBehavior = 'none';
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';
        window.scrollTo(0, 0);

        return () => {
            documentElement.style.overflow = previousHtmlOverflow;
            documentElement.style.overscrollBehavior = previousHtmlOverscroll;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehavior = previousBodyOverscroll;
        };
    }, []);

    return (
        <div className="home-page" data-testid="home-page">
            <div className="home-cinematic-frame home-cinematic-frame--top" />
            <div className="home-cinematic-frame home-cinematic-frame--bottom" />
            
            <div className="home-water-container" style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
                <WaterScene settings={settings} sceneId="water-scene" />
            </div>
            
            <div className="home-content" style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
                {/* Content can go here, pointerEvents: none allows interaction with water */}
            </div>
        </div>
    );
};

export default Home;
