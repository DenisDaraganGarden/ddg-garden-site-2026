import React from 'react';
import { useLanguage } from '../../i18n/LanguageProvider';
import { PlaneTab, GeometryTab, ShaderTab, LightingTab, CameraTab, DevTab } from './EditorTabs';

const EditorPanel = ({
    activeTab,
    setActiveTab,
    settings,
    setSettings,
    handleSettingChange,
    onPublish,
    publishState,
}) => {
    const { t } = useLanguage();
    const tabs = [
        { id: 'plane', label: t('snakeEditor.tabs.plane') },
        { id: 'geometry', label: t('snakeEditor.tabs.geometry') },
        { id: 'shader', label: t('snakeEditor.tabs.shader') },
        { id: 'lighting', label: t('snakeEditor.tabs.lighting') },
        { id: 'camera', label: t('snakeEditor.tabs.camera') },
        { id: 'dev', label: t('snakeEditor.tabs.dev') },
    ];
    const canPublish = typeof onPublish === 'function';

    return (
        <div className="cia-snake-panel">
            <div className="cia-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`cia-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
                {canPublish ? (
                    <button
                        type="button"
                        className="cia-tab"
                        onClick={onPublish}
                        disabled={publishState?.busy}
                        style={{ marginLeft: 'auto' }}
                    >
                        {publishState?.busy ? t('snakeEditor.publish.publishing') : t('snakeEditor.publish.publish')}
                    </button>
                ) : null}
            </div>

            {canPublish && publishState?.message ? (
                <div className="cia-value-readout" style={{ padding: '0.2rem 0.15rem 0.75rem', opacity: 0.85 }}>
                    {publishState.message}
                </div>
            ) : null}

            <div className="cia-toolbar-section">
                <div className="cia-controls-grid">
                    {activeTab === 'plane' && <PlaneTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'geometry' && <GeometryTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'shader' && <ShaderTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'lighting' && <LightingTab settings={settings} handleSettingChange={handleSettingChange} />}
                    {activeTab === 'camera' && <CameraTab settings={settings} setSettings={setSettings} />}
                    {activeTab === 'dev' && <DevTab settings={settings} setSettings={setSettings} />}
                </div>
            </div>
        </div>
    );
};

export default EditorPanel;
