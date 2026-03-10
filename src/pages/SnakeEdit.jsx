import React, { useEffect, useRef, useState } from 'react';
import SceneCanvas from '../components/effects/SceneCanvas';
import {
    getPublishedSnakeSettings,
    sanitizeSnakeSettingsForPublish,
} from '../hooks/useSnakeSettings';
import { useSnakeEditor } from '../hooks/useSnakeEditor';
import EditorScene from '../components/effects/EditorScene';
import EditorPanel from '../components/ui/EditorPanel';
import { publishSnakeSettings } from '../lib/snakePublishClient';
import { useLanguage } from '../i18n/LanguageProvider';
import '../styles/CIAEditor.css';

const AUTO_PUBLISH_DELAY_MS = 250;
const INITIAL_PUBLISHED_SNAPSHOT = JSON.stringify(
    sanitizeSnakeSettingsForPublish(getPublishedSnakeSettings()),
);
const LOCAL_EDIT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const SnakeEdit = () => {
    const { t } = useLanguage();
    const {
        settings,
        setSettings,
        selectedId,
        setSelectedId,
        activeTab,
        setActiveTab,
        isDragging,
        setIsDragging,
        handleSettingChange,
        handleTransformUpdate
    } = useSnakeEditor();
    const isLocalPublishAvailable = typeof window !== 'undefined'
        && LOCAL_EDIT_HOSTS.has(window.location.hostname);
    const [publishState, setPublishState] = useState({ busy: false, message: '' });
    const publishRequestRef = useRef(0);
    const lastPublishedSnapshotRef = useRef(INITIAL_PUBLISHED_SNAPSHOT);

    const handlePublish = async () => {
        const publishableSettings = sanitizeSnakeSettingsForPublish(settings);
        const serializedSettings = JSON.stringify(publishableSettings);
        const requestId = publishRequestRef.current + 1;

        publishRequestRef.current = requestId;
        setPublishState({
            busy: true,
            message: t('snakeEditor.publish.progress'),
        });

        try {
            await publishSnakeSettings(publishableSettings);

            if (publishRequestRef.current !== requestId) {
                return;
            }

            lastPublishedSnapshotRef.current = serializedSettings;
            setPublishState({
                busy: false,
                message: t('snakeEditor.publish.success'),
            });
        } catch (error) {
            if (publishRequestRef.current !== requestId) {
                return;
            }

            setPublishState({
                busy: false,
                message: t('snakeEditor.publish.error', {
                    message: error instanceof Error ? error.message : 'Unknown error',
                }),
            });
        }
    };

    useEffect(() => {
        if (!isLocalPublishAvailable || typeof window === 'undefined') {
            return undefined;
        }

        const publishableSettings = sanitizeSnakeSettingsForPublish(settings);
        const serializedSettings = JSON.stringify(publishableSettings);

        if (serializedSettings === lastPublishedSnapshotRef.current) {
            return undefined;
        }

        const requestId = publishRequestRef.current + 1;
        publishRequestRef.current = requestId;
        setPublishState({
            busy: true,
            message: t('snakeEditor.publish.progress'),
        });

        const timeoutId = window.setTimeout(async () => {
            try {
                await publishSnakeSettings(publishableSettings);

                if (publishRequestRef.current !== requestId) {
                    return;
                }

                lastPublishedSnapshotRef.current = serializedSettings;
                setPublishState({
                    busy: false,
                    message: t('snakeEditor.publish.success'),
                });
            } catch (error) {
                if (publishRequestRef.current !== requestId) {
                    return;
                }

                setPublishState({
                    busy: false,
                    message: t('snakeEditor.publish.error', {
                        message: error instanceof Error ? error.message : 'Unknown error',
                    }),
                });
            }
        }, AUTO_PUBLISH_DELAY_MS);

        return () => window.clearTimeout(timeoutId);
    }, [isLocalPublishAvailable, settings, t]);

    return (
        <div className="cia-editor-container" data-testid="snake-editor-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
                <SceneCanvas
                    sceneId="snake-editor"
                    mode="editor"
                    testId="snake-editor-scene"
                    fallbackTestId="snake-editor-fallback"
                    settings={settings}
                    camera={{ fov: settings.cameraFov, position: [0, 50, 0.01], up: [0, 1, 0] }}
                >
                    <EditorScene
                        settings={settings}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        isDragging={isDragging}
                        setIsDragging={setIsDragging}
                        handleTransformUpdate={handleTransformUpdate}
                    />
                </SceneCanvas>
            </div>

            <EditorPanel
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                settings={settings}
                setSettings={setSettings}
                handleSettingChange={handleSettingChange}
                onPublish={isLocalPublishAvailable ? handlePublish : undefined}
                publishState={publishState}
            />
        </div>
    );
};

export default SnakeEdit;
