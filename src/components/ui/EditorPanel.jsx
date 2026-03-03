import React from 'react';
import { PlaneTab, GeometryTab, ShaderTab, LightingTab, CameraTab, DevTab } from './EditorTabs';

const EditorPanel = ({ activeTab, setActiveTab, settings, setSettings, handleSettingChange }) => {
    const tabs = [
        { id: 'plane', label: 'Плейн' },
        { id: 'geometry', label: 'Змея - Геометрия' },
        { id: 'shader', label: 'Змея - Шейдер' },
        { id: 'lighting', label: 'Освещение' },
        { id: 'camera', label: 'Камеры' },
        { id: 'dev', label: 'Дев' },
    ];

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
            </div>

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
