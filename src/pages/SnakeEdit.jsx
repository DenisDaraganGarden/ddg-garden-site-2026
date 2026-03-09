import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSnakeEditor } from '../hooks/useSnakeEditor';
import EditorScene from '../components/effects/EditorScene';
import EditorPanel from '../components/ui/EditorPanel';
import { publishSnakeSettings } from '../lib/snakePublishClient';
import { useLanguage } from '../i18n/LanguageProvider';
import '../styles/CIAEditor.css';

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
    const isLocalPublishAvailable = import.meta.env.DEV;
    const [publishState, setPublishState] = useState({ busy: false, message: '' });

    const handlePublish = async () => {
        setPublishState({
            busy: true,
            message: t('snakeEditor.publish.progress'),
        });

        try {
            await publishSnakeSettings(settings);
            setPublishState({
                busy: false,
                message: t('snakeEditor.publish.success'),
            });
        } catch (error) {
            setPublishState({
                busy: false,
                message: t('snakeEditor.publish.error', {
                    message: error instanceof Error ? error.message : 'Unknown error',
                }),
            });
        }
    };

    return (
        <div className="cia-editor-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Background Canvas */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
                <Canvas shadows camera={{ fov: settings.cameraFov, position: [0, 50, 0.01], up: [0, 1, 0] }}>
                    <EditorScene
                        settings={settings}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        isDragging={isDragging}
                        setIsDragging={setIsDragging}
                        handleTransformUpdate={handleTransformUpdate}
                    />
                </Canvas>
            </div>

            {/* UI Panel */}
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
