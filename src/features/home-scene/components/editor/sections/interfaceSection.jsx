import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl } from '../../HomeEditorControls';

const UI_TOGGLES = [
    'uiBrandVisible',
    'uiSubtitleVisible',
    'uiMenuVisible',
    'uiLanguageVisible',
    'uiSoundVisible',
    'uiFrameVisible',
];

export const InterfaceSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            {UI_TOGGLES.map((key) => (
                <CheckboxControl
                    key={key}
                    label={t(`homeEditor.controls.${key}`)}
                    checked={Boolean(settings[key])}
                    onChange={(event) => handleSettingChange(event, key, 'boolean')}
                />
            ))}
        </>
    );
};
