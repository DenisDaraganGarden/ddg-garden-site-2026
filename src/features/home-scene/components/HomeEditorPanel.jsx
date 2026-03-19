import React from 'react';
import { useLanguage } from '../../../i18n/useLanguage';
import {
    CameraTab,
    DebugTab,
    DepthTab,
    LightingTab,
    WaterTab,
    BoatTab,
    SculptureTab,
} from './HomeEditorTabs';

const HomeEditorPanel = ({
    activeTab,
    setActiveTab,
    settings,
    handleSettingChange,
    onCaptureCameraPosePortrait,
    onResetCameraPosePortrait,
    onCaptureCameraPoseLandscape,
    onResetCameraPoseLandscape,
    onPublish,
    publishState,
    hasPublishChanges = false,
    publishEnabled = false,
    publishHint = '',
}) => {
    const { t } = useLanguage();
    const tabs = [
        { id: 'water', label: t('homeEditor.tabs.water') },
        { id: 'lighting', label: t('homeEditor.tabs.lighting') },
        { id: 'depth', label: t('homeEditor.tabs.depth') },
        { id: 'camera', label: t('homeEditor.tabs.camera') },
        { id: 'boat', label: t('homeEditor.tabs.boat') },
        { id: 'sculpture', label: t('homeEditor.tabs.sculpture') },
        { id: 'debug', label: t('homeEditor.tabs.debug') },
    ];
    const canPublish = publishEnabled && typeof onPublish === 'function';
    const isPublishDisabled = publishState?.busy || !hasPublishChanges || !canPublish;

    return (
        <div className="home-editor-panel">
            <div className="home-editor-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`home-editor-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        data-testid={`home-editor-tab-${tab.id}`}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    type="button"
                    className="home-editor-tab"
                    onClick={canPublish ? onPublish : undefined}
                    disabled={isPublishDisabled}
                    data-testid="home-editor-publish"
                    style={{ marginLeft: 'auto' }}
                    title={publishHint || undefined}
                >
                    {publishState?.busy ? t('homeEditor.publish.publishing') : t('homeEditor.publish.publish')}
                </button>
            </div>

            <div className="home-editor-status">
                {hasPublishChanges ? t('common.unsaved') : t('common.saved')}
            </div>

            {publishHint ? (
                <div className="home-editor-status">
                    {publishHint}
                </div>
            ) : null}

            {publishState?.message ? (
                <div className="home-editor-status">
                    {publishState.message}
                </div>
            ) : null}

            <div className="home-editor-section">
                <div className="home-editor-controls">
                    {activeTab === 'water' && <WaterTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'lighting' && <LightingTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'depth' && <DepthTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'camera' && (
                        <CameraTab
                            settings={settings}
                            handleSettingChange={handleSettingChange}
                            onCaptureCameraPosePortrait={onCaptureCameraPosePortrait}
                            onResetCameraPosePortrait={onResetCameraPosePortrait}
                            onCaptureCameraPoseLandscape={onCaptureCameraPoseLandscape}
                            onResetCameraPoseLandscape={onResetCameraPoseLandscape}
                        />
                    )}
                    {activeTab === 'boat' && <BoatTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'sculpture' && <SculptureTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'debug' && <DebugTab settings={settings} handleSettingChange={handleSettingChange} />}
                </div>
            </div>
        </div>
    );
};

export default HomeEditorPanel;
