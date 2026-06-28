import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaterScene from '../components/effects/WaterScene';
import {
    getPublishedHomeSceneSettings,
    sanitizeHomeSceneSettingsForPublish,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import { resolveLayoutKey } from '../features/home-scene/lib/layout';
import { useHomeSceneEditor } from '../features/home-scene/hooks/useHomeSceneEditor';
import HomeEditorPanel from '../features/home-scene/components/HomeEditorPanel';
import { publishHomeSceneSettings } from '../features/home-scene/lib/homeScenePublishClient';
import { useLanguage } from '../i18n/useLanguage';
import '../styles/HomeEditor.css';

const INITIAL_PUBLISHED_SNAPSHOT = JSON.stringify(
    sanitizeHomeSceneSettingsForPublish(getPublishedHomeSceneSettings()),
);
const LOCAL_EDIT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const getCurrentLayoutKey = () => {
    if (typeof window === 'undefined') {
        return 'desktop';
    }

    const screenWidth = window.screen ? window.screen.width : window.innerWidth;
    const screenHeight = window.screen ? window.screen.height : window.innerHeight;
    return resolveLayoutKey(window.innerWidth, window.innerHeight, screenWidth, screenHeight);
};

const HomeEdit = () => {
    const { t } = useLanguage();
    const {
        settings,
        setSettings,
        activeTab,
        setActiveTab,
        handleSettingChange,
    } = useHomeSceneEditor();
    const isLocalPublishAvailable = typeof window !== 'undefined'
        && LOCAL_EDIT_HOSTS.has(window.location.hostname);
    const [publishState, setPublishState] = useState({ busy: false, message: '' });
    const publishRequestRef = useRef(0);
    const lastPublishedSnapshotRef = useRef(INITIAL_PUBLISHED_SNAPSHOT);
    const cameraRigApiRef = useRef(null);
    const [selectedLayoutKey, setSelectedLayoutKey] = useState(getCurrentLayoutKey);
    const [currentLayoutKey, setCurrentLayoutKey] = useState(getCurrentLayoutKey);
    const publishableSettings = useMemo(
        () => sanitizeHomeSceneSettingsForPublish(settings),
        [settings],
    );
    const serializedPublishSettings = useMemo(
        () => JSON.stringify(publishableSettings),
        [publishableSettings],
    );
    const [hasPublishChanges, setHasPublishChanges] = useState(
        serializedPublishSettings !== lastPublishedSnapshotRef.current,
    );

    useEffect(() => {
        setHasPublishChanges(serializedPublishSettings !== lastPublishedSnapshotRef.current);
    }, [serializedPublishSettings]);

    // Track which bucket the live window falls into (for the "current" badge in the UI).
    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleResize = () => setCurrentLayoutKey(getCurrentLayoutKey());
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleCameraRigApi = useCallback((api) => {
        cameraRigApiRef.current = api;
    }, []);

    // Bake the bucket's currently-effective values (inherited from desktop when not yet
    // customised), then apply the patch and mark it independent.
    const updateLayout = useCallback((key, patch) => {
        setSettings((previous) => {
            const layouts = previous.layouts ?? {};
            const current = layouts[key];
            const source = (current && current.customized)
                ? current
                : (layouts.desktop ?? current ?? {});
            const nextLayout = {
                customized: true,
                cameraPosition: { ...source.cameraPosition },
                cameraTarget: { ...source.cameraTarget },
                cameraFov: source.cameraFov,
                boatPosition: { ...source.boatPosition },
                sculpturePosition: { ...source.sculpturePosition },
                ...patch,
            };

            return {
                ...previous,
                layouts: { ...layouts, [key]: nextLayout },
            };
        });
    }, [setSettings]);

    const captureLayout = useCallback((key) => {
        const pose = cameraRigApiRef.current?.capturePose?.();

        if (!pose) {
            return;
        }

        updateLayout(key, {
            cameraPosition: pose.cameraPosition,
            cameraTarget: pose.cameraTarget,
            cameraFov: pose.cameraFov,
        });
    }, [updateLayout]);

    const resetLayout = useCallback((key) => {
        setSettings((previous) => {
            const layouts = previous.layouts ?? {};
            if (!layouts[key]) {
                return previous;
            }

            return {
                ...previous,
                layouts: {
                    ...layouts,
                    [key]: { ...layouts[key], customized: false },
                },
            };
        });
    }, [setSettings]);

    const handleLayoutFovChange = useCallback((value) => {
        updateLayout(selectedLayoutKey, { cameraFov: value });
    }, [updateLayout, selectedLayoutKey]);

    const handleBoatPositionChange = useCallback((position) => {
        if (!position) {
            return;
        }

        updateLayout(selectedLayoutKey, {
            boatPosition: {
                x: Number(position.x.toFixed(4)),
                z: Number(position.z.toFixed(4)),
            },
        });
    }, [updateLayout, selectedLayoutKey]);

    const handleSculpturePositionChange = useCallback((position) => {
        if (!position) {
            return;
        }

        updateLayout(selectedLayoutKey, {
            sculpturePosition: {
                x: Number(position.x.toFixed(4)),
                z: Number(position.z.toFixed(4)),
            },
        });
    }, [updateLayout, selectedLayoutKey]);

    const layoutEditor = useMemo(() => ({
        selectedKey: selectedLayoutKey,
        setSelectedKey: setSelectedLayoutKey,
        currentKey: currentLayoutKey,
        layouts: settings.layouts,
        captureLayout,
        resetLayout,
        updateLayout,
        onFovChange: handleLayoutFovChange,
    }), [
        selectedLayoutKey,
        currentLayoutKey,
        settings.layouts,
        captureLayout,
        resetLayout,
        updateLayout,
        handleLayoutFovChange,
    ]);

    const handlePublish = async () => {
        if (!hasPublishChanges) {
            return;
        }

        const requestId = publishRequestRef.current + 1;

        publishRequestRef.current = requestId;
        setPublishState({
            busy: true,
            message: t('homeEditor.publish.progress'),
        });

        try {
            await publishHomeSceneSettings(publishableSettings);

            if (publishRequestRef.current !== requestId) {
                return;
            }

            lastPublishedSnapshotRef.current = serializedPublishSettings;
            setHasPublishChanges(false);
            setPublishState({
                busy: false,
                message: t('homeEditor.publish.success'),
            });
        } catch (error) {
            if (publishRequestRef.current !== requestId) {
                return;
            }

            setPublishState({
                busy: false,
                message: t('homeEditor.publish.error', {
                    message: error instanceof Error ? error.message : 'Unknown error',
                }),
            });
        }
    };

    return (
        <div className="home-editor-page" data-testid="home-editor-page">
            <div className="home-editor-stage">
                <WaterScene
                    sceneId="home-scene-editor"
                    mode="editor"
                    testId="home-editor-scene"
                    fallbackTestId="home-editor-fallback"
                    settings={settings}
                    layoutOverride={selectedLayoutKey}
                    onCameraRigApi={handleCameraRigApi}
                    onBoatPositionChange={handleBoatPositionChange}
                    onSculpturePositionChange={handleSculpturePositionChange}
                />
            </div>

            <HomeEditorPanel
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                settings={settings}
                handleSettingChange={handleSettingChange}
                layoutEditor={layoutEditor}
                onPublish={isLocalPublishAvailable ? handlePublish : undefined}
                publishState={publishState}
                hasPublishChanges={hasPublishChanges}
                publishEnabled={isLocalPublishAvailable}
                publishHint={isLocalPublishAvailable ? '' : t('homeEditor.publish.unavailable')}
            />
        </div>
    );
};

export default HomeEdit;
