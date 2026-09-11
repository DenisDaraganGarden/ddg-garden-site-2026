import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, RangeControl, SectionHeading } from '../../HomeEditorControls';

const formatPercent = (value) => Math.round(Number(value) * 100);

export const SeagullsSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl controlId={'seagullCount'}
                label={t('homeEditor.controls.seagullCount')}
                value={settings.seagullCount}
                min={1}
                max={9}
                step={1}
                onChange={(event) => handleSettingChange(event, 'seagullCount', 'integer')}
                testId="home-editor-seagull-count"
            />
            <RangeControl controlId={'seagullFlightActivity'}
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
            <RangeControl controlId={'seagullLandingDensity'}
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
            <CheckboxControl controlId={'seagullPointerInteraction'}
                label={t('homeEditor.controls.seagullPointerInteraction')}
                checked={Boolean(settings.seagullPointerInteraction)}
                onChange={(event) => handleSettingChange(event, 'seagullPointerInteraction', 'boolean')}
                testId="home-editor-seagull-pointer-interaction"
            />
            <CheckboxControl controlId={'seagullShootingEnabled'}
                label={t('homeEditor.controls.seagullShootingEnabled')}
                checked={Boolean(settings.seagullShootingEnabled)}
                onChange={(event) => handleSettingChange(event, 'seagullShootingEnabled', 'boolean')}
                testId="home-editor-seagull-shooting-enabled"
            />

            <SectionHeading label={t('homeEditor.blocks.seagullTerritory')} subtle />
            <RangeControl controlId={'seagullTerritoryRadius'} label={t('homeEditor.controls.seagullTerritoryRadius')} value={settings.seagullTerritoryRadius} min={3} max={120} step={0.5} unit="m" onChange={(event) => handleSettingChange(event, 'seagullTerritoryRadius', 'float')} />
            <RangeControl controlId={'seagullTerritoryX'} label={t('homeEditor.controls.seagullTerritoryX')} value={settings.seagullTerritoryX} min={-400} max={400} step={0.5} unit="m" onChange={(event) => handleSettingChange(event, 'seagullTerritoryX', 'float')} />
            <RangeControl controlId={'seagullTerritoryZ'} label={t('homeEditor.controls.seagullTerritoryZ')} value={settings.seagullTerritoryZ} min={-400} max={400} step={0.5} unit="m" onChange={(event) => handleSettingChange(event, 'seagullTerritoryZ', 'float')} />
            <RangeControl controlId={'seagullAltitudeMin'} label={t('homeEditor.controls.seagullAltitudeMin')} value={settings.seagullAltitudeMin} min={0.2} max={30} step={0.1} unit="m" onChange={(event) => handleSettingChange(event, 'seagullAltitudeMin', 'float')} />
            <RangeControl controlId={'seagullAltitudeMax'} label={t('homeEditor.controls.seagullAltitudeMax')} value={settings.seagullAltitudeMax} min={1} max={80} step={0.1} unit="m" onChange={(event) => handleSettingChange(event, 'seagullAltitudeMax', 'float')} />

            <SectionHeading label={t('homeEditor.blocks.seagullPerches')} subtle />
            <CheckboxControl controlId={'seagullPerchTerrain'} label={t('homeEditor.controls.seagullPerchTerrain')} checked={Boolean(settings.seagullPerchTerrain)} onChange={(event) => handleSettingChange(event, 'seagullPerchTerrain', 'boolean')} />
            <CheckboxControl controlId={'seagullPerchRocks'} label={t('homeEditor.controls.seagullPerchRocks')} checked={Boolean(settings.seagullPerchRocks)} onChange={(event) => handleSettingChange(event, 'seagullPerchRocks', 'boolean')} />
            <CheckboxControl controlId={'seagullPerchObjects'} label={t('homeEditor.controls.seagullPerchObjects')} checked={Boolean(settings.seagullPerchObjects)} onChange={(event) => handleSettingChange(event, 'seagullPerchObjects', 'boolean')} />
            <RangeControl controlId={'seagullPerchCount'} label={t('homeEditor.controls.seagullPerchCount')} value={settings.seagullPerchCount} min={0} max={48} step={1} onChange={(event) => handleSettingChange(event, 'seagullPerchCount', 'integer')} />
        </>
    );
};

export const FishSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <CheckboxControl controlId={'fishPointerInteraction'}
                label={t('homeEditor.controls.fishPointerInteraction')}
                checked={Boolean(settings.fishPointerInteraction)}
                onChange={(event) => handleSettingChange(event, 'fishPointerInteraction', 'boolean')}
                testId="home-editor-fish-pointer-interaction"
            />
            <RangeControl controlId={'fishCount'}
                label={t('homeEditor.controls.fishCount')}
                value={settings.fishCount}
                min={0}
                max={50}
                step={1}
                onChange={(event) => handleSettingChange(event, 'fishCount', 'integer')}
                testId="home-editor-fish-count"
            />
            <RangeControl controlId={'fishSchooling'}
                label={t('homeEditor.controls.fishSchooling')}
                value={settings.fishSchooling}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'fishSchooling', 'float')}
                testId="home-editor-fish-schooling"
            />
            <RangeControl controlId={'fishActivity'}
                label={t('homeEditor.controls.fishActivity')}
                value={settings.fishActivity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'fishActivity', 'float')}
                testId="home-editor-fish-activity"
            />
            <RangeControl controlId={'fishDepthBand'}
                label={t('homeEditor.controls.fishDepthBand')}
                value={settings.fishDepthBand}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={formatPercent}
                onChange={(event) => handleSettingChange(event, 'fishDepthBand', 'float')}
                testId="home-editor-fish-depth-band"
            />
        </>
    );
};
