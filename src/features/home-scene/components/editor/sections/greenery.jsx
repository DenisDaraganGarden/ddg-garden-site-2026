import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    ColorControl,
    RangeControl,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';

export const LiliesSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.surfacePlantAmount')}
                value={settings.surfacePlantAmount}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantAmount')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantClustering')}
                value={settings.surfacePlantClustering}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantClustering')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantCenterX')}
                value={settings.surfacePlantCenterX}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantCenterX')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantCenterZ')}
                value={settings.surfacePlantCenterZ}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantCenterZ')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantRadius')}
                value={settings.surfacePlantRadius}
                min={0}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantRadius')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantSize')}
                value={settings.surfacePlantSize}
                min={0}
                max={0.6}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantSize')}
            />
            <ColorControl
                label={t('homeEditor.controls.surfacePlantColor')}
                value={settings.surfacePlantColor}
                onChange={(event) => handleSettingChange(event, 'surfacePlantColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantSaturation')}
                value={settings.surfacePlantSaturation}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantSaturation')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantTranslucency')}
                value={settings.surfacePlantTranslucency}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantTranslucency')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantReflection')}
                value={settings.surfacePlantReflection}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantReflection')}
            />

            <RangeControl
                label={t('homeEditor.controls.plantAoStrength')}
                value={settings.plantAoStrength}
                min={0}
                max={1.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'plantAoStrength')}
            />
        </>
    );
};

export const AlgaeSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeAmount')}
                value={settings.underwaterAlgaeAmount}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeAmount')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeCenterX')}
                value={settings.underwaterAlgaeCenterX}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeCenterX')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeCenterZ')}
                value={settings.underwaterAlgaeCenterZ}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeCenterZ')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeRadius')}
                value={settings.underwaterAlgaeRadius}
                min={0}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeRadius')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeLength')}
                value={settings.underwaterAlgaeLength}
                min={0}
                max={3}
                step={0.05}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeLength')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeSway')}
                value={settings.underwaterAlgaeSway}
                min={0}
                max={1.5}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeSway')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeFlowDirection')}
                value={settings.underwaterAlgaeFlowDirection}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeFlowDirection')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeFlowStrength')}
                value={settings.underwaterAlgaeFlowStrength}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeFlowStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeSpeciesMix')}
                value={settings.underwaterAlgaeSpeciesMix}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeSpeciesMix')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaePatchiness')}
                value={settings.underwaterAlgaePatchiness}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaePatchiness')}
            />
            <ColorControl
                label={t('homeEditor.controls.underwaterAlgaeColor')}
                value={settings.underwaterAlgaeColor}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeSaturation')}
                value={settings.underwaterAlgaeSaturation}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeSaturation')}
            />
        </>
    );
};

// Placeholder for a species group that has no geometry in the scene yet. Shown so
// the tree reads as the scene's structure rather than as a list of what is done.
export const EmptySection = () => {
    const { t } = useLanguage();

    return <div className="home-editor-status">{t('homeEditor.panel.emptyNode')}</div>;
};
