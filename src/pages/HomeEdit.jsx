import React, { useRef, useState } from 'react';
import WaterScene from '../components/effects/WaterScene';
import {
    getPublishedHomeSceneSettings,
    sanitizeHomeSceneSettingsForPublish,
} from '../features/home-scene/hooks/useHomeSceneSettings';
import { useHomeSceneEditor } from '../features/home-scene/hooks/useHomeSceneEditor';
import HomeEditorPanel from '../features/home-scene/components/HomeEditorPanel';
import { publishHomeSceneSettings } from '../features/home-scene/lib/homeScenePublishClient';
import { useLanguage } from '../i18n/useLanguage';
import '../styles/HomeEditor.css';

const INITIAL_PUBLISHED_SNAPSHOT = JSON.stringify(
    sanitizeHomeSceneSettingsForPublish(getPublishedHomeSceneSettings()),
);
const LOCAL_EDIT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const HomeEdit = () => {
    const { t } = useLanguage();
    const {
        settings,
        activeTab,
        setActiveTab,
        handleSettingChange,
    } = useHomeSceneEditor();
    const isLocalPublishAvailable = typeof window !== 'undefined'
        && LOCAL_EDIT_HOSTS.has(window.location.hostname);
    const [publishState, setPublishState] = useState({ busy: false, message: '' });
    const publishRequestRef = useRef(0);
    const lastPublishedSnapshotRef = useRef(INITIAL_PUBLISHED_SNAPSHOT);

    const handlePublish = async () => {
        const publishableSettings = sanitizeHomeSceneSettingsForPublish(settings);
        const serializedSettings = JSON.stringify(publishableSettings);
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

            lastPublishedSnapshotRef.current = serializedSettings;
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
                />
            </div>

            <HomeEditorPanel
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                settings={settings}
                handleSettingChange={handleSettingChange}
                onPublish={isLocalPublishAvailable ? handlePublish : undefined}
                publishState={publishState}
            />
        </div>
    );
};

export default HomeEdit;
