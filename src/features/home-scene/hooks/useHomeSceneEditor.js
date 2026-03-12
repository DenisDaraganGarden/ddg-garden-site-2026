import { useState } from 'react';
import { useHomeSceneDraftSettings } from './useHomeSceneSettings';

export const useHomeSceneEditor = () => {
    const { settings, setSettings } = useHomeSceneDraftSettings();

    const [activeTab, setActiveTab] = useState('water');

    const handleSettingChange = (event, key, valueType = 'float') => {
        let value;

        if (valueType === 'color' || valueType === 'string') {
            value = event.target.value;
        } else if (valueType === 'integer') {
            value = parseInt(event.target.value, 10);
        } else {
            value = parseFloat(event.target.value);
        }

        setSettings(prev => ({
            ...prev,
            [key]: value,
        }));
    };

    return {
        settings,
        setSettings,
        activeTab,
        setActiveTab,
        handleSettingChange,
    };
};
