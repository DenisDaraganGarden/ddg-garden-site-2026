import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaterScene from '../components/effects/WaterScene';
import {
    getPublishedHomeSceneSettings,
    sanitizeHomeSceneSettingsForPublish,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import {
    DEFAULT_LAYOUT_FRAME_INSETS,
    resolveLayoutFrameInset,
    resolveLayoutKey,
} from '../features/home-scene/lib/layout';
import { useHomeSceneEditor } from '../features/home-scene/hooks/useHomeSceneEditor';
import { useHomeChromeVisibility } from '../features/home-scene/hooks/useHomeChromeVisibility';
import { useEditorTool } from '../features/home-scene/hooks/useEditorTool';
import { resolveEditorPath } from '../features/home-scene/components/editor/editorTree';
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

    return resolveLayoutKey(window.innerWidth, window.innerHeight);
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
    // Preview the chrome toggles in the editor itself, not only after publishing.
    useHomeChromeVisibility(settings);
    const { mode: gizmoMode, setMode: setGizmoMode, suppressed: gizmoSuppressed } = useEditorTool();
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
        window.addEventListener('orientationchange', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
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
            const inherited = layouts.desktop ?? current ?? {};
            const source = (current && current.customized)
                ? current
                : {
                    ...inherited,
                    frameInset: resolveLayoutFrameInset(layouts, key),
                };
            const nextLayout = {
                customized: true,
                cameraPosition: { ...source.cameraPosition },
                cameraTarget: { ...source.cameraTarget },
                cameraFov: source.cameraFov,
                frameInset: source.frameInset,
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
                    [key]: {
                        ...layouts[key],
                        customized: false,
                        frameInset: DEFAULT_LAYOUT_FRAME_INSETS[key],
                    },
                },
            };
        });
    }, [setSettings]);

    const handleLayoutFovChange = useCallback((value) => {
        updateLayout(selectedLayoutKey, { cameraFov: value });
    }, [updateLayout, selectedLayoutKey]);

    const handleFrameInsetChange = useCallback((value) => {
        updateLayout(selectedLayoutKey, { frameInset: value });
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

    // Picking an object in the tree is the selection; the gizmo writes back into
    // the same settings the sliders do, so the two are one value seen two ways.
    const handleGizmoTransform = useCallback((id, patch) => {
        if (patch.position) {
            if (id === 'boat') {
                handleBoatPositionChange(patch.position);
            } else {
                handleSculpturePositionChange(patch.position);
            }
            return;
        }

        if (typeof patch.rotationY === 'number') {
            const key = id === 'boat' ? 'boatYaw' : 'sculptureRotationY';
            setSettings((previous) => ({ ...previous, [key]: patch.rotationY }));
            return;
        }

        if (typeof patch.scale === 'number') {
            const key = id === 'boat' ? 'boatScale' : 'sculptureScale';
            setSettings((previous) => ({ ...previous, [key]: patch.scale }));
        }
    }, [handleBoatPositionChange, handleSculpturePositionChange, setSettings]);

    const { group: gizmoGroup, node: gizmoNode } = resolveEditorPath(activeTab, { includeDevOnly: true });
    const editorGizmo = useMemo(() => ({
        selection: (!gizmoSuppressed && gizmoGroup.id === 'objects') ? gizmoNode.id : null,
        mode: gizmoMode,
        onTransform: handleGizmoTransform,
    }), [gizmoSuppressed, gizmoGroup.id, gizmoNode.id, gizmoMode, handleGizmoTransform]);


    const layoutEditor = useMemo(() => ({
        selectedKey: selectedLayoutKey,
        setSelectedKey: setSelectedLayoutKey,
        currentKey: currentLayoutKey,
        layouts: settings.layouts,
        captureLayout,
        resetLayout,
        updateLayout,
        onFovChange: handleLayoutFovChange,
        onFrameInsetChange: handleFrameInsetChange,
    }), [
        selectedLayoutKey,
        currentLayoutKey,
        settings.layouts,
        captureLayout,
        resetLayout,
        updateLayout,
        handleLayoutFovChange,
        handleFrameInsetChange,
    ]);

    const selectedFrameInset = resolveLayoutFrameInset(settings.layouts, selectedLayoutKey);

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
                <div
                    className={`home-editor-viewport home-editor-viewport--${selectedLayoutKey}`}
                    style={{ '--home-editor-frame-inset': `${selectedFrameInset * 100}%` }}
                >
                    <div className="home-editor-render-frame">
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
                            editorGizmo={editorGizmo}
                        />
                    </div>
                    <div className="home-editor-frame-mask home-editor-frame-mask--top" aria-hidden="true" />
                    <div className="home-editor-frame-mask home-editor-frame-mask--bottom" aria-hidden="true" />
                </div>
            </div>

            <HomeEditorPanel
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                settings={settings}
                handleSettingChange={handleSettingChange}
                layoutEditor={layoutEditor}
                gizmo={{ mode: gizmoMode, setMode: setGizmoMode, selection: editorGizmo.selection }}
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
