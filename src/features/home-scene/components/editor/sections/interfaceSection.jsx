import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl } from '../../HomeEditorControls';
import { activeProjectId } from '../../../../engine/projectApi.js';

// Шапка сайта — название, подпись бюро, меню, язык, звук — есть только у
// сайта; в проекте движка из них остаются киноплёночные полосы кадра.
const PROJECT_TOGGLES = new Set(['uiFrameVisible']);
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
    const inProject = Boolean(activeProjectId());

    return (
        <>
            {UI_TOGGLES.filter((key) => !inProject || PROJECT_TOGGLES.has(key)).map((key) => (
                <CheckboxControl controlId={key}
                    key={key}
                    label={t(`homeEditor.controls.${key}`)}
                    checked={Boolean(settings[key])}
                    onChange={(event) => handleSettingChange(event, key, 'boolean')}
                />
            ))}
        </>
    );
};
