import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    ColorControl,
    RangeControl,
    SectionHeading,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';
import { resolveLayout } from '../../../lib/layout';

export const BoatSection = ({ settings, handleSettingChange, layoutEditor }) => {
    const { t } = useLanguage();
    const activeBoat = (layoutEditor
        ? resolveLayout(layoutEditor.layouts, layoutEditor.selectedKey)?.boatPosition
        : null) ?? settings.boatPosition ?? { x: 0, z: 0 };
    const setBoatAxis = (axis, value) => {
        if (!layoutEditor) {
            return;
        }
        layoutEditor.updateLayout(layoutEditor.selectedKey, {
            boatPosition: { ...activeBoat, [axis]: value },
        });
    };

    return (
        <>
            <SectionHeading label={t('homeEditor.blocks.transform')} subtle />
            <RangeControl
                label={t('homeEditor.controls.boatPositionX')}
                value={activeBoat.x ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setBoatAxis('x', parseFloat(event.target.value))}
            />
            <RangeControl
                label={t('homeEditor.controls.boatPositionZ')}
                value={activeBoat.z ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setBoatAxis('z', parseFloat(event.target.value))}
            />
            <RangeControl
                label={t('homeEditor.controls.boatYaw')}
                value={settings.boatYaw}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'boatYaw')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatHeightOffset')}
                value={settings.boatHeightOffset}
                min={-0.6}
                max={0.6}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatHeightOffset')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatScale')}
                value={settings.boatScale}
                min={0.001}
                max={0.05}
                step={0.001}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'boatScale')}
            />
            <SectionHeading label={t('homeEditor.blocks.material')} subtle />
            <ColorControl
                label={t('homeEditor.controls.boatColor')}
                value={settings.boatColor}
                onChange={(event) => handleSettingChange(event, 'boatColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatRoughness')}
                value={settings.boatRoughness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatRoughness')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatReflectionIntensity')}
                value={settings.boatReflectionIntensity}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatReflectionIntensity')}
            />
        </>
    );
};

export const SculptureSection = ({ settings, handleSettingChange, layoutEditor }) => {
    const { t } = useLanguage();
    const activeSculpture = (layoutEditor
        ? resolveLayout(layoutEditor.layouts, layoutEditor.selectedKey)?.sculpturePosition
        : null) ?? settings.sculpturePosition ?? { x: 0, z: 0 };
    const setSculptureAxis = (axis, value) => {
        if (!layoutEditor) {
            return;
        }
        layoutEditor.updateLayout(layoutEditor.selectedKey, {
            sculpturePosition: { ...activeSculpture, [axis]: value },
        });
    };

    return (
        <>
            <SectionHeading label={t('homeEditor.blocks.transform')} subtle />
            <RangeControl
                label={t('homeEditor.controls.sculpturePositionX')}
                value={activeSculpture.x ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setSculptureAxis('x', parseFloat(event.target.value))}
            />
            <RangeControl
                label={t('homeEditor.controls.sculpturePositionZ')}
                value={activeSculpture.z ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setSculptureAxis('z', parseFloat(event.target.value))}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureRotationY')}
                value={settings.sculptureRotationY}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'sculptureRotationY')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureBottomOffset')}
                value={settings.sculptureBottomOffset}
                min={-2}
                max={2}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureBottomOffset')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureScale')}
                value={settings.sculptureScale}
                min={0.005}
                max={0.2}
                step={0.001}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'sculptureScale')}
            />
            <SectionHeading label={t('homeEditor.blocks.material')} subtle />
            <ColorControl
                label={t('homeEditor.controls.sculptureColor')}
                value={settings.sculptureColor}
                onChange={(event) => handleSettingChange(event, 'sculptureColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureLayering')}
                value={settings.sculptureLayering}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureLayering')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureLayerScale')}
                value={settings.sculptureLayerScale}
                min={0.35}
                max={4.5}
                step={0.05}
                formatValue={(value) => `×${formatFloat(value, 2)}`}
                onChange={(event) => handleSettingChange(event, 'sculptureLayerScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureLayerRelief')}
                value={settings.sculptureLayerRelief}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureLayerRelief')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureLayerSharpness')}
                value={settings.sculptureLayerSharpness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureLayerSharpness')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureLayerEdgeChips')}
                value={settings.sculptureLayerEdgeChips}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureLayerEdgeChips')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureFracture')}
                value={settings.sculptureFracture}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureFracture')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureFractureScale')}
                value={settings.sculptureFractureScale}
                min={0.35}
                max={4.5}
                step={0.05}
                formatValue={(value) => `×${formatFloat(value, 2)}`}
                onChange={(event) => handleSettingChange(event, 'sculptureFractureScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureVeins')}
                value={settings.sculptureVeins}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureVeins')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureVeinScale')}
                value={settings.sculptureVeinScale}
                min={0.35}
                max={4.5}
                step={0.05}
                formatValue={(value) => `×${formatFloat(value, 2)}`}
                onChange={(event) => handleSettingChange(event, 'sculptureVeinScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculpturePolish')}
                value={settings.sculpturePolish}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculpturePolish')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureWearScale')}
                value={settings.sculptureWearScale}
                min={0.35}
                max={4.5}
                step={0.05}
                formatValue={(value) => `×${formatFloat(value, 2)}`}
                onChange={(event) => handleSettingChange(event, 'sculptureWearScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureWetness')}
                value={settings.sculptureWetness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureWetness')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureDryRoughness')}
                value={settings.sculptureDryRoughness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureDryRoughness')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureMicroRelief')}
                value={settings.sculptureMicroRelief}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureMicroRelief')}
            />
        </>
    );
};
