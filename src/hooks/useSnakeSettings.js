import { useEffect, useState } from 'react';

export const SNAKE_SETTINGS_STORAGE_KEY = 'ddg_snake_settings_v3';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getDefaultSnakeSettings = () => ({
    length: 48,
    curl: 18,
    scaleDensity: 70,
    roughness: 85,
    metalness: 10,
    tailFactor: 16,
    bodyFactor: 92,
    neckFactor: 26,
    headFactor: 58,
    noseFactor: 38,
    eyeDimple: 18,
    cheekbone: 22,
    jaw: 32,
    crown: 18,
    planeColor: '#dddddd',
    planeHeight: 200,
    planeRadius: 350,
    planeTrailSpan: 30,
    planeTrailPersistence: 15,
    planeSharpness: 20,
    planeHeadTaper: 15,
    planeTailTaper: 50,
    planeMeshDensity: 128,
    baseColor: '#566047',
    bellyColor: '#c8c1ab',
    hdrExposure: 60,
    lightIntensity: 450,
    lightColor: '#ffffff',
    lightAngle: 45,
    lightDistance: 200,
    lightHeight: 350,
    cameraFov: 35,
    freeCamera: false,
    devWireframe: false,
    devNormals: false,
    devAxes: false,
    devStats: false,
    snakePos: { x: 0, y: -1, z: 0 },
    planePos: { x: 0, y: -1, z: 0 },
    tongueSpeed: 50,
    tongueAmplitude: 80,
    tongueLength: 60,
});

const normalizeSnakeSettings = (savedSettings = {}) => {
    const defaultSettings = getDefaultSnakeSettings();
    const {
        planeTrailLength,
        planeTrailSpan,
        planeTrailPersistence,
        ...rest
    } = savedSettings;

    const migratedTrailSpan = planeTrailSpan ?? (
        typeof planeTrailLength === 'number'
            ? clamp(Math.round(planeTrailLength * 2), 8, 100)
            : defaultSettings.planeTrailSpan
    );
    const migratedTrailPersistence = planeTrailPersistence ?? (
        typeof planeTrailLength === 'number'
            ? clamp(planeTrailLength, 1, 50)
            : defaultSettings.planeTrailPersistence
    );

    return {
        ...defaultSettings,
        ...rest,
        planeTrailSpan: migratedTrailSpan,
        planeTrailPersistence: migratedTrailPersistence,
    };
};

export const useSnakeSettings = () => {
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem(SNAKE_SETTINGS_STORAGE_KEY);

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return normalizeSnakeSettings(parsed);
            } catch (error) {
                console.error('Failed to parse snake settings', error);
            }
        }

        return getDefaultSnakeSettings();
    });

    useEffect(() => {
        localStorage.setItem(SNAKE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }, [settings]);

    return {
        settings,
        setSettings,
    };
};
