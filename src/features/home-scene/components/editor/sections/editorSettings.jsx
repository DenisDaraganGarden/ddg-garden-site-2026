import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, ColorControl } from '../../HomeEditorControls';
import { version } from '../../../../../../package.json';

// Editor preferences. They live in the draft as editor-local keys: they ride
// the draft's origin, survive «Откатить», and never reach the published file.
export const EditorSettingsSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <div className="home-editor-status home-editor-signature" data-testid="home-editor-signature">
                Ouroboros Engine · {version}
            </div>
            <ColorControl controlId={'editorHeadingColor'}
                label={t('homeEditor.controls.editorHeadingColor')}
                value={settings.editorHeadingColor}
                onChange={(event) => handleSettingChange(event, 'editorHeadingColor', 'color')}
                testId="home-editor-heading-color"
            />
            <CheckboxControl controlId={'editorCursor'}
                label={t('homeEditor.controls.editorCursor')}
                checked={Boolean(settings.editorCursor)}
                onChange={(event) => handleSettingChange(event, 'editorCursor', 'boolean')}
                testId="home-editor-editor-cursor"
            />
            <CheckboxControl controlId={'editorPieFill'}
                label={t('homeEditor.controls.editorPieFill')}
                checked={settings.editorPieFill !== false}
                onChange={(event) => handleSettingChange(event, 'editorPieFill', 'boolean')}
                testId="home-editor-pie-fill"
            />
            <CheckboxControl controlId={'editorPieOutline'}
                label={t('homeEditor.controls.editorPieOutline')}
                checked={settings.editorPieOutline !== false}
                onChange={(event) => handleSettingChange(event, 'editorPieOutline', 'boolean')}
                testId="home-editor-pie-outline"
            />
            <div className="home-editor-status">{t('homeEditor.controls.editorSettingsHint')}</div>
        </>
    );
};
