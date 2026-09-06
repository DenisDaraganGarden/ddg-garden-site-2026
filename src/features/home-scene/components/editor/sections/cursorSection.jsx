import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    RangeControl,
    SectionHeading,
} from '../../HomeEditorControls';

const formatPercent = (value) => Math.round(Number(value) * 100);

export const CursorSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            {settings.editorCursor ? null : (
                <div className="home-editor-status" data-testid="home-editor-cursor-editor-off">
                    {t('homeEditor.controls.cursorEditorOff')}
                </div>
            )}
            <CheckboxControl
                label={t('homeEditor.controls.cursorEnabled')}
                checked={Boolean(settings.cursorEnabled)}
                onChange={(event) => handleSettingChange(event, 'cursorEnabled', 'boolean')}
                testId="home-editor-cursor-enabled"
            />
            <RangeControl
                label={t('homeEditor.controls.cursorPointSize')}
                value={settings.cursorPointSize}
                min={3}
                max={12}
                step={0.5}
                unit=" px"
                onChange={(event) => handleSettingChange(event, 'cursorPointSize', 'float')}
                testId="home-editor-cursor-point-size"
            />

            <SectionHeading label={t('homeEditor.blocks.cursorLight')} subtle />
            <CheckboxControl
                label={t('homeEditor.controls.cursorLightEnabled')}
                checked={Boolean(settings.cursorLightEnabled)}
                onChange={(event) => handleSettingChange(event, 'cursorLightEnabled', 'boolean')}
                testId="home-editor-cursor-light-enabled"
            />
            <RangeControl
                label={t('homeEditor.controls.cursorLightBeamAngle')}
                value={settings.cursorLightBeamAngle}
                min={12}
                max={70}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'cursorLightBeamAngle', 'float')}
                testId="home-editor-cursor-light-beam"
            />
            <RangeControl
                label={t('homeEditor.controls.cursorLightIntensity')}
                value={settings.cursorLightIntensity}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'cursorLightIntensity', 'float')}
                testId="home-editor-cursor-light-intensity"
            />
            <RangeControl
                label={t('homeEditor.controls.cursorLightSoftness')}
                value={settings.cursorLightSoftness}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'cursorLightSoftness', 'float')}
                testId="home-editor-cursor-light-softness"
            />
        </>
    );
};
