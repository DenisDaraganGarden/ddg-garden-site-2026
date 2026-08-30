import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl } from '../../HomeEditorControls';

const formatPercent = (value) => Math.round(Number(value) * 100);

export const SeagullsSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <CheckboxControl
                label={t('homeEditor.controls.seagullsEnabled')}
                checked={Boolean(settings.seagullsEnabled)}
                onChange={(event) => handleSettingChange(event, 'seagullsEnabled', 'boolean')}
                testId="home-editor-seagulls-enabled"
            />
            <RangeControl
                label={t('homeEditor.controls.seagullCount')}
                value={settings.seagullCount}
                min={1}
                max={9}
                step={1}
                onChange={(event) => handleSettingChange(event, 'seagullCount', 'integer')}
                testId="home-editor-seagull-count"
            />
            <RangeControl
                label={t('homeEditor.controls.seagullFlightActivity')}
                value={settings.seagullFlightActivity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'seagullFlightActivity', 'float')}
                testId="home-editor-seagull-flight-activity"
            />
            <RangeControl
                label={t('homeEditor.controls.seagullLandingDensity')}
                value={settings.seagullLandingDensity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'seagullLandingDensity', 'float')}
                testId="home-editor-seagull-landing-density"
            />
            <CheckboxControl
                label={t('homeEditor.controls.seagullPointerInteraction')}
                checked={Boolean(settings.seagullPointerInteraction)}
                onChange={(event) => handleSettingChange(event, 'seagullPointerInteraction', 'boolean')}
                testId="home-editor-seagull-pointer-interaction"
            />
            <CheckboxControl
                label={t('homeEditor.controls.seagullShootingEnabled')}
                checked={Boolean(settings.seagullShootingEnabled)}
                onChange={(event) => handleSettingChange(event, 'seagullShootingEnabled', 'boolean')}
                testId="home-editor-seagull-shooting-enabled"
            />
        </>
    );
};
