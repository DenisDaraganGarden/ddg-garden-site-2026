import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import ButterflyVortex from '../components/effects/ButterflyVortex';
import { useLanguage } from '../i18n/LanguageProvider';
import '../styles/CIAEditor.css'; // Reusing our established CIA admin UI style

const HomeEdit = () => {
    const { t } = useLanguage();
    // Load from localStorage or set defaults
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('ddg_home_bg_settings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse bg settings", e);
            }
        }
        return {
            speed: 15,
            density: 30,
            strength: 40,
            complexity: 25,
            blackLevel: 70,
            highlight: 50
        };
    });

    // Save on change
    useEffect(() => {
        localStorage.setItem('ddg_home_bg_settings', JSON.stringify(settings));
    }, [settings]);

    const handleSettingChange = (e, key) => {
        setSettings(prev => ({
            ...prev,
            [key]: parseInt(e.target.value, 10)
        }));
    };

    return (
        <div className="cia-editor-container" style={{ paddingTop: '80px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Background Canvas */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
                <Canvas style={{ background: '#050505' }}>
                    <ButterflyVortex settings={settings} />
                </Canvas>
            </div>

            <div className="cia-toolbar cia-toolbar-compact" style={{ position: 'absolute', zIndex: 10, bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(5,5,5,0.6)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', width: 'auto', backdropFilter: 'blur(8px)' }}>
                <div className="cia-toolbar-section" style={{ border: 'none', padding: 0, margin: 0 }}>
                    <div className="cia-controls-grid" style={{ gap: '0.5rem 1.5rem', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center' }}>
                        <div className="cia-control-group" style={{ margin: 0 }}>
                            <label>
                                {t('homeEditor.flowSpeed')}
                                <span className="cia-value-readout">{settings.speed}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.speed}
                                onChange={(e) => handleSettingChange(e, 'speed')}
                                className="cia-slider"
                            />
                        </div>
                        <div className="cia-control-group">
                            <label>
                                {t('homeEditor.fluidDensity')}
                                <span className="cia-value-readout">{settings.density}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.density}
                                onChange={(e) => handleSettingChange(e, 'density')}
                                className="cia-slider"
                            />
                        </div>
                        <div className="cia-control-group">
                            <label>
                                {t('homeEditor.mouseAttraction')}
                                <span className="cia-value-readout">{settings.strength}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.strength}
                                onChange={(e) => handleSettingChange(e, 'strength')}
                                className="cia-slider"
                            />
                        </div>
                        <div className="cia-control-group">
                            <label>
                                {t('homeEditor.noiseComplexity')}
                                <span className="cia-value-readout">{settings.complexity}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.complexity}
                                onChange={(e) => handleSettingChange(e, 'complexity')}
                                className="cia-slider"
                            />
                        </div>
                        <div className="cia-control-group">
                            <label>
                                {t('homeEditor.blackLevel')}
                                <span className="cia-value-readout">{settings.blackLevel}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.blackLevel}
                                onChange={(e) => handleSettingChange(e, 'blackLevel')}
                                className="cia-slider"
                            />
                        </div>
                        <div className="cia-control-group">
                            <label>
                                {t('homeEditor.highlightIntensity')}
                                <span className="cia-value-readout">{settings.highlight}%</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.highlight}
                                onChange={(e) => handleSettingChange(e, 'highlight')}
                                className="cia-slider"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomeEdit;
