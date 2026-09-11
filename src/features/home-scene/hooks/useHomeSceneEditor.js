import { useState } from 'react';
import { useHomeSceneDraftSettings } from './useHomeSceneSettings';

export const useHomeSceneEditor = (project = null) => {
    const { settings, setSettings } = useHomeSceneDraftSettings(project);

    const [activeTab, setActiveTab] = useState('landscape/water');
    const applySettings = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

    const handleSettingChange = (event, key, valueType = 'float') => {
        let value;

        if (valueType === 'boolean') {
            value = event.target.checked;
        } else if (valueType === 'color' || valueType === 'string') {
            value = event.target.value;
        } else if (valueType === 'integer') {
            value = parseInt(event.target.value, 10);
        } else {
            value = parseFloat(event.target.value);
        }

        if (typeof key === 'string' && key.includes('.')) {
            const path = key.split('.');

            setSettings((prev) => {
                const next = { ...prev };
                let cursor = next;

                for (let index = 0; index < path.length - 1; index += 1) {
                    const part = path[index];
                    const current = cursor[part];
                    cursor[part] = current && typeof current === 'object' && !Array.isArray(current)
                        ? { ...current }
                        : {};
                    cursor = cursor[part];
                }

                cursor[path[path.length - 1]] = value;
                return next;
            });

            return;
        }

        setSettings((prev) => ({
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
        applySettings,
    };
};
