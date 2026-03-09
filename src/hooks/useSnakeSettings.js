import { useEffect, useState } from 'react';
import { publishedSnakeSettings } from '../data/publishedSnakeSettings';

export const SNAKE_SETTINGS_STORAGE_KEY = 'ddg_snake_settings_v4';
const LEGACY_SNAKE_SETTINGS_STORAGE_KEY = 'ddg_snake_settings_v3';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getBaseSnakeSettings = () => ({
    length: 40,
    curl: 100, // 100% curl makes a perfect circle
    scaleDensity: 70,
    roughness: 85,
    metalness: 10,
    tailFactor: 50,
    bodyFactor: 50,
    neckFactor: 50,
    headFactor: 60,
    noseFactor: 40,
    eyeDimple: 30,
    cheekbone: 50,
    jaw: 40,
    crown: 30,
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

const mergeSnakeSettings = (baseSettings, overrideSettings = {}) => ({
    ...baseSettings,
    ...overrideSettings,
    snakePos: {
        ...baseSettings.snakePos,
        ...(overrideSettings.snakePos ?? {}),
    },
    planePos: {
        ...baseSettings.planePos,
        ...(overrideSettings.planePos ?? {}),
    },
});

export const getDefaultSnakeSettings = () => mergeSnakeSettings(
    getBaseSnakeSettings(),
    publishedSnakeSettings,
);

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
        ...mergeSnakeSettings(defaultSettings, rest),
        planeTrailSpan: migratedTrailSpan,
        planeTrailPersistence: migratedTrailPersistence,
    };
};

export const useSnakeSettings = () => {
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem(SNAKE_SETTINGS_STORAGE_KEY)
            ?? localStorage.getItem(LEGACY_SNAKE_SETTINGS_STORAGE_KEY);

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
        localStorage.removeItem(LEGACY_SNAKE_SETTINGS_STORAGE_KEY);
    }, [settings]);

    return {
        settings,
        setSettings,
    };
};
