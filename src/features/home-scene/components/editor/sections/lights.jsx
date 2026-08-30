import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    ColorControl,
    RangeControl,
    SectionHeading,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';

// A light object and the point it aims at are separate handles in the scene,
// the way a Corona Light works: pick the body to place it, pick the pivot to aim
// it, and the gizmo does both because they are ordinary named objects.
//
// The sliders are here as well, because a number typed to the metre is sometimes
// what you want and dragging is sometimes what you want, and they are the same
// value seen two ways.

const LightBody = ({ settings, handleSettingChange, slot }) => {
    const { t } = useLanguage();
    const prefix = `light${slot}`;

    return (
        <>
            <CheckboxControl
                label={t('homeEditor.controls.lightEnabled')}
                checked={Boolean(settings[`${prefix}Enabled`])}
                onChange={(event) => handleSettingChange(event, `${prefix}Enabled`, 'boolean')}
            />
            <ColorControl
                label={t('homeEditor.controls.lightColor')}
                value={settings[`${prefix}Color`]}
                onChange={(event) => handleSettingChange(event, `${prefix}Color`, 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.lightIntensity')}
                value={settings[`${prefix}Intensity`]}
                min={0}
                max={200}
                step={0.5}
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, `${prefix}Intensity`)}
            />

            <SectionHeading label={t('homeEditor.blocks.cone')} subtle />
            <RangeControl
                label={t('homeEditor.controls.lightConeAngle')}
                value={settings[`${prefix}ConeAngle`]}
                min={4}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, `${prefix}ConeAngle`)}
            />
            <RangeControl
                label={t('homeEditor.controls.lightSoftness')}
                value={settings[`${prefix}Softness`]}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, `${prefix}Softness`)}
            />

            <SectionHeading label={t('homeEditor.blocks.position')} subtle />
            {['X', 'Y', 'Z'].map((axis) => (
                <RangeControl
                    key={axis}
                    label={t(`homeEditor.controls.lightPosition${axis}`)}
                    value={settings[`${prefix}${axis}`]}
                    min={axis === 'Y' ? -10 : -40}
                    max={40}
                    step={0.05}
                    unit="m"
                    formatValue={(value) => formatFloat(value)}
                    onChange={(event) => handleSettingChange(event, `${prefix}${axis}`)}
                />
            ))}

            <SectionHeading label={t('homeEditor.blocks.visibility')} subtle />
            <CheckboxControl
                label={t('homeEditor.controls.lightSourceVisible')}
                checked={settings[`${prefix}SourceVisible`] !== false}
                onChange={(event) => handleSettingChange(event, `${prefix}SourceVisible`, 'boolean')}
            />
            <CheckboxControl
                label={t('homeEditor.controls.lightInReflections')}
                checked={settings[`${prefix}InReflections`] !== false}
                onChange={(event) => handleSettingChange(event, `${prefix}InReflections`, 'boolean')}
            />
        </>
    );
};

const LightTarget = ({ settings, handleSettingChange, slot }) => {
    const { t } = useLanguage();
    const prefix = `light${slot}`;

    return (
        <>
            {['X', 'Y', 'Z'].map((axis) => (
                <RangeControl
                    key={axis}
                    label={t(`homeEditor.controls.lightTarget${axis}`)}
                    value={settings[`${prefix}Target${axis}`]}
                    min={axis === 'Y' ? -10 : -40}
                    max={40}
                    step={0.05}
                    unit="m"
                    formatValue={(value) => formatFloat(value)}
                    onChange={(event) => handleSettingChange(event, `${prefix}Target${axis}`)}
                />
            ))}
        </>
    );
};

export const Light1Section = (props) => <LightBody {...props} slot={1} />;
export const Light1TargetSection = (props) => <LightTarget {...props} slot={1} />;
export const Light2Section = (props) => <LightBody {...props} slot={2} />;
export const Light2TargetSection = (props) => <LightTarget {...props} slot={2} />;
