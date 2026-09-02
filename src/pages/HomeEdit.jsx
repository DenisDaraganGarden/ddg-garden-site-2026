import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import WaterScene from '../components/effects/WaterScene';
import {
    applyHomeSceneSnapshot,
    createHomeSceneSnapshot,
    getPublishedHomeSceneSettings,
    sanitizeHomeSceneSettingsForPublish,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import { DEFAULT_SCENE_CAMERA_HOLD_SECONDS } from '../features/home-scene/lib/sceneCameras';
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
import { useSiteAudio } from '../features/audio/SiteAudioContext';
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

const syncActiveCameraScene = (settings) => {
    const cameras = Array.isArray(settings.sceneCameras) ? settings.sceneCameras : [];
    const activeId = settings.activeCameraId ?? cameras[0]?.id;

    if (!activeId) {
        return settings;
    }

    const snapshot = createHomeSceneSnapshot(settings);
    let changed = false;
    const sceneCameras = cameras.map((camera) => {
        if (camera.id !== activeId) {
            return camera;
        }

        changed = true;
        return { ...camera, scene: snapshot };
    });

    return changed ? { ...settings, sceneCameras } : settings;
};

const updateLayoutInSettings = (settings, key, patch) => {
    const layouts = settings.layouts ?? {};
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
        ...settings,
        layouts: { ...layouts, [key]: nextLayout },
    };
};

const makeCameraId = (cameras, prefix = 'camera') => {
    const used = new Set(cameras.map((camera) => camera.id));
    let index = cameras.length + 1;
    let candidate = `${prefix}-${index}`;

    while (used.has(candidate)) {
        index += 1;
        candidate = `${prefix}-${index}`;
    }

    return candidate;
};

const swapById = (list, id, direction) => {
    const items = [...list];
    const from = items.findIndex((item) => item.id === id);
    const to = from + direction;

    if (from < 0 || to < 0 || to >= items.length) {
        return list;
    }

    [items[from], items[to]] = [items[to], items[from]];
    return items;
};

const HomeEdit = () => {
    const { t } = useLanguage();
    const {
        state: audioState,
        editorPreviewEnabled,
        setEditorPreviewEnabled,
        previewTrack,
        setSceneSettings: setAudioSettings,
        setCameraTransition,
        setSoloTrack,
        runtime: audioRuntime,
    } = useSiteAudio();
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
    const [cameraPoseRevision, setCameraPoseRevision] = useState(0);
    const deferredSettings = useDeferredValue(settings);
    const audioSettingsFingerprint = JSON.stringify(settings.audio);
    const preparedSettings = useMemo(
        () => syncActiveCameraScene(deferredSettings),
        [deferredSettings],
    );
    const publishableSettings = useMemo(
        () => sanitizeHomeSceneSettingsForPublish(preparedSettings),
        [preparedSettings],
    );
    const serializedPublishSettings = useMemo(
        () => JSON.stringify(publishableSettings),
        [publishableSettings],
    );
    const [hasPublishChanges, setHasPublishChanges] = useState(
        serializedPublishSettings !== lastPublishedSnapshotRef.current,
    );

    useEffect(() => {
        setAudioSettings(JSON.parse(audioSettingsFingerprint));
    }, [audioSettingsFingerprint, setAudioSettings]);

    useEffect(() => {
        setCameraTransition('idle', 0);

        return () => {
            setAudioSettings(getPublishedHomeSceneSettings().audio);
            void setEditorPreviewEnabled(false);
            setSoloTrack(null);
        };
    }, [setAudioSettings, setCameraTransition, setEditorPreviewEnabled, setSoloTrack]);

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

    const handleAdoptPublished = useCallback(() => {
        const published = getPublishedHomeSceneSettings();
        const firstCamera = published.sceneCameras?.[0];
        const next = firstCamera
            ? applyHomeSceneSnapshot(published, firstCamera.scene)
            : published;

        setSettings((previous) => ({
            ...next,
            activeCameraId: firstCamera?.id ?? published.activeCameraId,
            freeCamera: true,
            // Work cameras are the author's viewport bookmarks, not scene content.
            workCameras: previous.workCameras ?? [],
            activeWorkCameraId: previous.activeWorkCameraId ?? null,
        }));
        setCameraPoseRevision((value) => value + 1);
    }, [setSettings]);

    const handleCameraRigApi = useCallback((api) => {
        cameraRigApiRef.current = api;
    }, []);

    const updateLayout = useCallback((key, patch) => {
        setSettings((previous) => syncActiveCameraScene(
            updateLayoutInSettings(previous, key, patch),
        ));
    }, [setSettings]);

    const captureLayout = useCallback((key) => {
        const pose = cameraRigApiRef.current?.capturePose?.();

        if (!pose) {
            return;
        }

        setSettings((previous) => syncActiveCameraScene(updateLayoutInSettings(previous, key, {
            cameraPosition: pose.cameraPosition,
            cameraTarget: pose.cameraTarget,
            cameraFov: pose.cameraFov,
        })));
    }, [setSettings]);

    const resetLayout = useCallback((key) => {
        setSettings((previous) => {
            const layouts = previous.layouts ?? {};
            if (!layouts[key]) {
                return previous;
            }

            return syncActiveCameraScene({
                ...previous,
                layouts: {
                    ...layouts,
                    [key]: {
                        ...layouts[key],
                        customized: false,
                        frameInset: DEFAULT_LAYOUT_FRAME_INSETS[key],
                    },
                },
            });
        });
        setCameraPoseRevision((value) => value + 1);
    }, [setSettings]);

    const selectCamera = useCallback((id) => {
        if (id === settings.activeCameraId) {
            // Re-selecting the active scene camera only moves the viewport when it
            // is leaving a work camera; focusing its name field must not snap it.
            const leavingWorkCamera = Boolean(settings.activeWorkCameraId);
            setSettings((previous) => ({
                ...syncActiveCameraScene(previous),
                activeWorkCameraId: null,
            }));
            if (leavingWorkCamera) {
                setCameraPoseRevision((value) => value + 1);
            }
            return;
        }

        setSettings((previous) => {
            const prepared = syncActiveCameraScene(previous);
            const target = prepared.sceneCameras?.find((camera) => camera.id === id);

            if (!target || target.id === prepared.activeCameraId) {
                return prepared;
            }

            return {
                ...applyHomeSceneSnapshot(prepared, target.scene),
                activeCameraId: target.id,
                activeWorkCameraId: null,
                freeCamera: true,
            };
        });
        setCameraPoseRevision((value) => value + 1);
    }, [setSettings, settings.activeCameraId, settings.activeWorkCameraId]);

    const addCamera = useCallback(() => {
        const pose = cameraRigApiRef.current?.capturePose?.();

        setSettings((previous) => {
            const cameras = Array.isArray(previous.sceneCameras) ? previous.sceneCameras : [];
            const withPose = pose
                ? updateLayoutInSettings(previous, selectedLayoutKey, {
                    cameraPosition: pose.cameraPosition,
                    cameraTarget: pose.cameraTarget,
                    cameraFov: pose.cameraFov,
                })
                : previous;
            const prepared = syncActiveCameraScene(withPose);
            const id = makeCameraId(cameras);
            const scene = createHomeSceneSnapshot(prepared);
            const activeCamera = prepared.sceneCameras?.find(
                (camera) => camera.id === prepared.activeCameraId,
            );
            const camera = {
                id,
                name: `Камера ${cameras.length + 1}`,
                enabled: true,
                holdSeconds: activeCamera?.holdSeconds ?? DEFAULT_SCENE_CAMERA_HOLD_SECONDS,
                scene,
            };

            return {
                ...prepared,
                sceneCameras: [...(prepared.sceneCameras ?? []), camera],
                activeCameraId: id,
                activeWorkCameraId: null,
                freeCamera: true,
            };
        });
    }, [selectedLayoutKey, setSettings]);

    const removeCamera = useCallback((id) => {
        setSettings((previous) => {
            const prepared = syncActiveCameraScene(previous);
            const cameras = prepared.sceneCameras ?? [];

            if (cameras.length <= 1) {
                return prepared;
            }

            const removedIndex = cameras.findIndex((camera) => camera.id === id);
            const sceneCameras = cameras.filter((camera) => camera.id !== id);

            if (removedIndex < 0 || id !== prepared.activeCameraId) {
                return { ...prepared, sceneCameras };
            }

            const target = sceneCameras[Math.min(removedIndex, sceneCameras.length - 1)];

            return {
                ...applyHomeSceneSnapshot({ ...prepared, sceneCameras }, target.scene),
                activeCameraId: target.id,
                activeWorkCameraId: null,
                freeCamera: true,
            };
        });
        if (id === settings.activeCameraId) {
            setCameraPoseRevision((value) => value + 1);
        }
    }, [setSettings, settings.activeCameraId]);

    const selectLayout = useCallback((key) => {
        setSelectedLayoutKey(key);
        setCameraPoseRevision((value) => value + 1);
    }, []);

    const moveCamera = useCallback((id, direction) => {
        setSettings((previous) => ({
            ...previous,
            sceneCameras: swapById(previous.sceneCameras ?? [], id, direction),
        }));
    }, [setSettings]);

    const updateCamera = useCallback((id, patch) => {
        setSettings((previous) => ({
            ...previous,
            sceneCameras: (previous.sceneCameras ?? []).map((camera) => (
                camera.id === id ? { ...camera, ...patch } : camera
            )),
        }));
    }, [setSettings]);

    const renameCamera = useCallback((id, name) => {
        updateCamera(id, { name: name.slice(0, 80) });
    }, [updateCamera]);

    const setCameraEnabled = useCallback((id, enabled) => {
        updateCamera(id, { enabled: Boolean(enabled) });
    }, [updateCamera]);

    const setCameraHoldSeconds = useCallback((id, holdSeconds) => {
        updateCamera(id, { holdSeconds: Math.min(3600, Math.max(1, holdSeconds)) });
    }, [updateCamera]);

    // Work cameras: named viewport poses for the author's own use. Selecting
    // one looks from it without touching the active scene camera; the scene
    // keeps its authored composition and nothing here is published.
    const activeWorkCameraId = settings.activeWorkCameraId ?? null;

    const updateWorkCamera = useCallback((id, patch) => {
        setSettings((previous) => ({
            ...previous,
            workCameras: (previous.workCameras ?? []).map((camera) => (
                camera.id === id ? { ...camera, ...patch } : camera
            )),
        }));
    }, [setSettings]);

    const selectWorkCamera = useCallback((id) => {
        if (id === activeWorkCameraId) {
            return;
        }

        setSettings((previous) => (
            (previous.workCameras ?? []).some((camera) => camera.id === id)
                ? { ...previous, activeWorkCameraId: id }
                : previous
        ));
        setCameraPoseRevision((value) => value + 1);
    }, [activeWorkCameraId, setSettings]);

    const addWorkCamera = useCallback(() => {
        const pose = cameraRigApiRef.current?.capturePose?.();

        if (!pose) {
            return;
        }

        setSettings((previous) => {
            const cameras = previous.workCameras ?? [];
            const id = makeCameraId(cameras, 'work');

            return {
                ...previous,
                workCameras: [...cameras, { id, name: `Рабочая ${cameras.length + 1}`, ...pose }],
                activeWorkCameraId: id,
            };
        });
    }, [setSettings]);

    const removeWorkCamera = useCallback((id) => {
        setSettings((previous) => ({
            ...previous,
            workCameras: (previous.workCameras ?? []).filter((camera) => camera.id !== id),
            activeWorkCameraId: previous.activeWorkCameraId === id ? null : previous.activeWorkCameraId,
        }));
    }, [setSettings]);

    const moveWorkCamera = useCallback((id, direction) => {
        setSettings((previous) => ({
            ...previous,
            workCameras: swapById(previous.workCameras ?? [], id, direction),
        }));
    }, [setSettings]);

    const renameWorkCamera = useCallback((id, name) => {
        updateWorkCamera(id, { name: name.slice(0, 80) });
    }, [updateWorkCamera]);

    const captureWorkCamera = useCallback((id) => {
        const pose = cameraRigApiRef.current?.capturePose?.();

        if (pose) {
            updateWorkCamera(id, pose);
        }
    }, [updateWorkCamera]);

    const setWorkCameraFov = useCallback((id, cameraFov) => {
        updateWorkCamera(id, { cameraFov });
    }, [updateWorkCamera]);

    const updateSlideshow = useCallback((patch) => {
        setSettings((previous) => ({
            ...previous,
            slideshow: { ...previous.slideshow, ...patch },
        }));
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
        // A light and its target are plain XYZ - no layout bucket, because a
        // light is not part of the authored composition the way the boat is.
        const lightMatch = /^light([12])(target)?$/.exec(id);
        if (lightMatch && patch.position) {
            const prefix = `light${lightMatch[1]}${lightMatch[2] ? 'Target' : ''}`;
            setSettings((previous) => ({
                ...previous,
                [`${prefix}X`]: Number(patch.position.x.toFixed(3)),
                [`${prefix}Y`]: Number(patch.position.y.toFixed(3)),
                [`${prefix}Z`]: Number(patch.position.z.toFixed(3)),
            }));
            return;
        }

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
        selection: (!gizmoSuppressed && (gizmoGroup.id === 'objects' || gizmoGroup.id === 'lights'))
            ? gizmoNode.id
            : null,
        mode: gizmoMode,
        onTransform: handleGizmoTransform,
    }), [gizmoSuppressed, gizmoGroup.id, gizmoNode.id, gizmoMode, handleGizmoTransform]);


    const layoutEditor = useMemo(() => ({
        cameras: settings.sceneCameras,
        activeCameraId: settings.activeCameraId,
        selectCamera,
        addCamera,
        removeCamera,
        moveCamera,
        renameCamera,
        setCameraEnabled,
        setCameraHoldSeconds,
        selectedKey: selectedLayoutKey,
        setSelectedKey: selectLayout,
        currentKey: currentLayoutKey,
        layouts: settings.layouts,
        currentScene: settings,
        captureLayout,
        resetLayout,
        updateLayout,
        onFovChange: handleLayoutFovChange,
        onFrameInsetChange: handleFrameInsetChange,
        slideshow: settings.slideshow,
        updateSlideshow,
        workCameras: settings.workCameras ?? [],
        activeWorkCameraId,
        selectWorkCamera,
        addWorkCamera,
        removeWorkCamera,
        moveWorkCamera,
        renameWorkCamera,
        captureWorkCamera,
        setWorkCameraFov,
    }), [
        settings,
        selectedLayoutKey,
        currentLayoutKey,
        selectCamera,
        addCamera,
        removeCamera,
        moveCamera,
        renameCamera,
        setCameraEnabled,
        setCameraHoldSeconds,
        selectLayout,
        captureLayout,
        resetLayout,
        updateLayout,
        handleLayoutFovChange,
        handleFrameInsetChange,
        updateSlideshow,
        activeWorkCameraId,
        selectWorkCamera,
        addWorkCamera,
        removeWorkCamera,
        moveWorkCamera,
        renameWorkCamera,
        captureWorkCamera,
        setWorkCameraFov,
    ]);

    const selectedFrameInset = resolveLayoutFrameInset(settings.layouts, selectedLayoutKey);
    const cameraPoseKey = String(cameraPoseRevision);

    const handlePublish = async () => {
        const currentPreparedSettings = syncActiveCameraScene(settings);
        const currentPublishableSettings = sanitizeHomeSceneSettingsForPublish(
            currentPreparedSettings,
        );
        const currentSerializedSettings = JSON.stringify(currentPublishableSettings);

        if (currentSerializedSettings === lastPublishedSnapshotRef.current) {
            setHasPublishChanges(false);
            return;
        }

        const requestId = publishRequestRef.current + 1;

        publishRequestRef.current = requestId;
        setPublishState({
            busy: true,
            message: t('homeEditor.publish.progress'),
        });
        setSettings(currentPreparedSettings);

        try {
            await publishHomeSceneSettings(currentPublishableSettings);

            if (publishRequestRef.current !== requestId) {
                return;
            }

            lastPublishedSnapshotRef.current = currentSerializedSettings;
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
                    className={[
                        'home-editor-viewport',
                        `home-editor-viewport--${selectedLayoutKey}`,
                    ].filter(Boolean).join(' ')}
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
                            cameraPoseKey={cameraPoseKey}
                            audioRuntime={audioRuntime}
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
                onAdoptPublished={handleAdoptPublished}
                publishState={publishState}
                hasPublishChanges={hasPublishChanges}
                publishEnabled={isLocalPublishAvailable}
                publishHint={isLocalPublishAvailable ? '' : t('homeEditor.publish.unavailable')}
                audioLab={{
                    state: audioState,
                    previewEnabled: editorPreviewEnabled,
                    setPreviewEnabled: setEditorPreviewEnabled,
                    previewTrack,
                    setSoloTrack,
                }}
            />
        </div>
    );
};

export default HomeEdit;
