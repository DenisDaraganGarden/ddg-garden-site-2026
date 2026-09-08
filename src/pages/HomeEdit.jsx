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
    HOME_SCENE_SNAPSHOT_KEYS,
    getPublishedHomeSceneSettings,
    sanitizeHomeSceneSettingsForPublish,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import { WORK_CAMERA_MAIN_ID } from '../features/home-scene/lib/sceneCameras';
import {
    addEditorCamera,
    removeEditorCamera,
    selectEditorCamera,
    syncActiveEditorCamera,
    updateEditorLayout,
} from '../features/home-scene/lib/editorCameraState.js';
import {
    DEFAULT_LAYOUT_FRAME_INSETS,
    resolveLayoutFrameInset,
    resolveLayoutKey,
} from '../features/home-scene/lib/layout';
import { useHomeSceneEditor } from '../features/home-scene/hooks/useHomeSceneEditor';
import { useHomeChromeVisibility } from '../features/home-scene/hooks/useHomeChromeVisibility';
import { useEditorTool } from '../features/home-scene/hooks/useEditorTool';
import { resolveEditorPath } from '../features/home-scene/components/editor/editorTree';
import { sceneObjectsForNode } from '../features/home-scene/lib/sceneObjects';
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

const syncActiveCameraScene = (settings) => syncActiveEditorCamera(settings, HOME_SCENE_SNAPSHOT_KEYS);
const updateLayoutInSettings = updateEditorLayout;

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
        applySettings,
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
    const [selectedLayoutKey, setSelectedLayoutKey] = useState(() => settings.editorLayoutKey ?? getCurrentLayoutKey());
    const [currentLayoutKey, setCurrentLayoutKey] = useState(getCurrentLayoutKey);
    const [cameraPoseRevision, setCameraPoseRevision] = useState(0);
    const deferredSettings = useDeferredValue(settings);
    const audioSettingsFingerprint = JSON.stringify(settings.audio);
    // Snapshots are committed by setSettings; deferred state only drives the
    // inexpensive publish-dirty indicator, never a camera transition.
    const preparedSettings = deferredSettings;
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

    // Space pauses and resumes the animation from anywhere but a text field.
    useEffect(() => {
        const isTextTarget = (target) => target instanceof HTMLElement && (
            target.isContentEditable
            || target.tagName === 'TEXTAREA'
            || target.tagName === 'SELECT'
            || (target.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(target.type))
        );
        const handleKeyDown = (event) => {
            if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTextTarget(event.target)) {
                return;
            }
            event.preventDefault();
            setSettings((previous) => ({ ...previous, animationPaused: !previous.animationPaused }));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setSettings]);

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
            // Keep local work scenes when replacing the site's camera catalogue.
            workCameras: previous.workCameras ?? [],
            activeWorkCameraId: null,
            editorLayoutKey: previous.editorLayoutKey,
            animationPaused: previous.animationPaused,
            editorHeadingColor: previous.editorHeadingColor,
            editorCursor: previous.editorCursor,
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
        setSettings((previous) => selectEditorCamera(previous, id, 'scene', HOME_SCENE_SNAPSHOT_KEYS));
        setCameraPoseRevision((value) => value + 1);
    }, [setSettings]);

    const addCamera = useCallback(() => {
        const pose = cameraRigApiRef.current?.capturePose?.();
        if (!pose) return;
        setSettings((previous) => addEditorCamera(previous, {
            kind: 'scene', layoutKey: selectedLayoutKey, pose,
        }, HOME_SCENE_SNAPSHOT_KEYS));
    }, [selectedLayoutKey, setSettings]);

    const removeCamera = useCallback((id) => {
        setSettings((previous) => removeEditorCamera(previous, id, 'scene', HOME_SCENE_SNAPSHOT_KEYS));
        if (!settings.activeWorkCameraId && id === settings.activeCameraId) {
            setCameraPoseRevision((value) => value + 1);
        }
    }, [setSettings, settings.activeCameraId, settings.activeWorkCameraId]);

    const selectLayout = useCallback((key) => {
        setSelectedLayoutKey(key);
        setSettings((previous) => ({ ...previous, editorLayoutKey: key }));
        setCameraPoseRevision((value) => value + 1);
    }, [setSettings]);

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

    // Work cameras own local scene snapshots and use the same two-format
    // capture contract as site cameras. Only their catalogue stays editor-local.
    const activeWorkCameraId = settings.activeWorkCameraId ?? null;

    const updateWorkCamera = useCallback((id, patch) => {
        setSettings((previous) => ({
            ...previous,
            workCameras: (previous.workCameras ?? []).map((camera) => (
                camera.id === id ? { ...camera, ...patch } : camera
            )),
        }));
    }, [setSettings]);

    // Always re-applies the pose, so the number button is also the way back
    // to a bookmark after orbiting away. The name field guards its own focus.
    const selectWorkCamera = useCallback((id) => {
        setSettings((previous) => selectEditorCamera(previous, id, 'work', HOME_SCENE_SNAPSHOT_KEYS));
        setCameraPoseRevision((value) => value + 1);
    }, [setSettings]);

    const addWorkCamera = useCallback(() => {
        const pose = cameraRigApiRef.current?.capturePose?.();
        if (!pose) return;
        setSettings((previous) => addEditorCamera(previous, {
            kind: 'work', layoutKey: selectedLayoutKey, pose,
        }, HOME_SCENE_SNAPSHOT_KEYS));
    }, [selectedLayoutKey, setSettings]);

    const removeWorkCamera = useCallback((id) => {
        setSettings((previous) => removeEditorCamera(previous, id, 'work', HOME_SCENE_SNAPSHOT_KEYS));
        if (id !== WORK_CAMERA_MAIN_ID && id === settings.activeWorkCameraId) {
            setCameraPoseRevision((value) => value + 1);
        }
    }, [setSettings, settings.activeWorkCameraId]);

    const moveWorkCamera = useCallback((id, direction) => {
        setSettings((previous) => {
            const cameras = previous.workCameras ?? [];
            const next = swapById(cameras, id, direction);
            // The main camera stays first.
            return cameras[0]?.id === WORK_CAMERA_MAIN_ID && next[0]?.id !== WORK_CAMERA_MAIN_ID
                ? previous
                : { ...previous, workCameras: next };
        });
    }, [setSettings]);

    const renameWorkCamera = useCallback((id, name) => {
        updateWorkCamera(id, { name: name.slice(0, 80) });
    }, [updateWorkCamera]);

    const captureWorkCamera = useCallback((id) => {
        if (id === settings.activeWorkCameraId) captureLayout(selectedLayoutKey);
    }, [captureLayout, selectedLayoutKey, settings.activeWorkCameraId]);

    const setWorkCameraFov = useCallback((id, cameraFov) => {
        if (id === settings.activeWorkCameraId) updateLayout(selectedLayoutKey, { cameraFov });
    }, [selectedLayoutKey, settings.activeWorkCameraId, updateLayout]);

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
    // An object switched off has left the scene graph; the gizmo has nothing to hold.
    const gizmoTargetShown = sceneObjectsForNode(`${gizmoGroup.id}/${gizmoNode.id}`).every(({ key }) => settings[key] !== false);
    const editorGizmo = useMemo(() => ({
        selection: (!gizmoSuppressed && gizmoTargetShown && ((gizmoGroup.id === 'objects' && gizmoNode.id !== 'tanker') || gizmoGroup.id === 'lights'))
            ? gizmoNode.id
            : null,
        mode: gizmoMode,
        onTransform: handleGizmoTransform,
    }), [gizmoSuppressed, gizmoTargetShown, gizmoGroup.id, gizmoNode.id, gizmoMode, handleGizmoTransform]);


    const layoutEditor = useMemo(() => ({
        previewPose: pose => cameraRigApiRef.current?.previewPose?.(pose),
        frameObject: (name, options) => cameraRigApiRef.current?.frameObject?.(name, options),
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

    // deploy: the file goes to the project AND to the site - the server
    // commits it and pushes main, GitHub builds the page. Without deploy the
    // file only lands in the project, which is what the smoke test exercises.
    const handlePublish = async ({ deploy = false } = {}) => {
        const currentPreparedSettings = syncActiveCameraScene(settings);
        const currentPublishableSettings = sanitizeHomeSceneSettingsForPublish(
            currentPreparedSettings,
        );
        const currentSerializedSettings = JSON.stringify(currentPublishableSettings);

        if (!deploy && currentSerializedSettings === lastPublishedSnapshotRef.current) {
            setHasPublishChanges(false);
            return;
        }

        const requestId = publishRequestRef.current + 1;

        publishRequestRef.current = requestId;
        setPublishState({
            busy: true,
            message: t(deploy ? 'homeEditor.publish.deployProgress' : 'homeEditor.publish.progress'),
        });
        setSettings(currentPreparedSettings);

        try {
            const payload = await publishHomeSceneSettings(currentPublishableSettings, { deploy });

            if (publishRequestRef.current !== requestId) {
                return;
            }

            lastPublishedSnapshotRef.current = currentSerializedSettings;
            setHasPublishChanges(false);
            let message = t('homeEditor.publish.success');
            if (deploy) {
                message = payload?.deploy?.ok === false
                    ? t('homeEditor.publish.deployFailed', { message: payload.deploy.message })
                    : t('homeEditor.publish.deployed', {
                        commit: payload?.deploy?.head ?? '',
                        branch: payload?.deploy?.branch ?? '',
                    });
            }
            setPublishState({ busy: false, message });
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
                applySettings={applySettings}
                layoutEditor={layoutEditor}
                gizmo={{ mode: gizmoMode, setMode: setGizmoMode, selection: editorGizmo.selection }}
                onPublish={isLocalPublishAvailable ? () => handlePublish() : undefined}
                onDeploy={isLocalPublishAvailable ? () => handlePublish({ deploy: true }) : undefined}
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
