import React from 'react';
import { useLanguage } from '../../../i18n/useLanguage';
import {
    CameraTab,
    DebugTab,
    DepthTab,
    LightingTab,
    WaterTab,
    BoatTab,
} from './HomeEditorTabs';

const HomeEditorPanel = ({
    activeTab,
    setActiveTab,
    settings,
    handleSettingChange,
    onPublish,
    publishState,
}) => {
    const { t } = useLanguage();
    const tabs = [
        { id: 'water', label: t('homeEditor.tabs.water') },
        { id: 'lighting', label: t('homeEditor.tabs.lighting') },
        { id: 'depth', label: t('homeEditor.tabs.depth') },
        { id: 'camera', label: t('homeEditor.tabs.camera') },
        { id: 'boat', label: t('homeEditor.tabs.boat') },
        { id: 'debug', label: t('homeEditor.tabs.debug') },
    ];
    const canPublish = typeof onPublish === 'function';

    return (
        <div className="home-editor-panel">
            <div className="home-editor-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`home-editor-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        data-testid={`home-editor-tab-${tab.id}`}
                    >
                        {tab.label}
                    </button>
                ))}
                {canPublish ? (
                    <button
                        type="button"
                        className="home-editor-tab"
                        onClick={onPublish}
                        disabled={publishState?.busy}
                        data-testid="home-editor-publish"
                        style={{ marginLeft: 'auto' }}
                    >
                        {publishState?.busy ? t('homeEditor.publish.publishing') : t('homeEditor.publish.publish')}
                    </button>
                ) : null}
            </div>

            {canPublish && publishState?.message ? (
                <div className="home-editor-status">
                    {publishState.message}
                </div>
            ) : null}

            <div className="home-editor-section">
                <div className="home-editor-controls">
                    {activeTab === 'water' && <WaterTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'lighting' && <LightingTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'depth' && <DepthTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'camera' && <CameraTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'boat' && <BoatTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'debug' && <DebugTab settings={settings} handleSettingChange={handleSettingChange} />}
                </div>
            </div>
        </div>
    );
};

export default HomeEditorPanel;
