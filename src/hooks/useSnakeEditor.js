import { useState } from 'react';
import { useSnakeDraftSettings } from './useSnakeSettings';

export const useSnakeEditor = () => {
    const { settings, setSettings } = useSnakeDraftSettings();

    const [selectedId, setSelectedId] = useState(null);
    const [activeTab, setActiveTab] = useState('plane');
    const [isDragging, setIsDragging] = useState(false);

    const handleSettingChange = (e, key, isColor = false) => {
        const value = isColor ? e.target.value : parseInt(e.target.value, 10);
        setSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleTransformUpdate = (id, pos) => {
        setSettings(prev => ({
            ...prev,
            [`${id}Pos`]: pos
        }));
    };

    return {
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
    };
};
