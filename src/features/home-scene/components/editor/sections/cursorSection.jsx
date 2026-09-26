import React, { useSyncExternalStore } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    RangeControl,
    SectionHeading,
    SelectControl,
} from '../../HomeEditorControls';
import { activeProjectId } from '../../../../engine/projectApi.js';
import {
    getCursorFlashlightServerSnapshot,
    getCursorFlashlightSnapshot,
    setEditorFlashlight,
    subscribeToCursorFlashlight,
} from '../../../../cursor/cursorFlashlightStore.js';

const formatPercent = (value) => Math.round(Number(value) * 100);

// Курсор и фонарь. В редакторе — два своих выбора этого браузера: какой
// курсор (системная стрелка или точка) и горит ли фонарь (он же — долгое ПКМ
// во вьюпорте). Показывать курсор и «фонарь по умолчанию» — настройки
// самого сайта, в проекте движка их нет.
export const CursorSection = ({ settings, handleSettingChange }) => {
    const { t, language } = useLanguage();
    const tr = (ru, en) => (language === 'ru' ? ru : en);
    const inProject = Boolean(activeProjectId());
    const flashlight = useSyncExternalStore(subscribeToCursorFlashlight, getCursorFlashlightSnapshot, getCursorFlashlightServerSnapshot);

    return (
        <>
            <SelectControl controlId={'editorCursor'}
                label={t('homeEditor.controls.editorCursor')}
                value={settings.editorCursor ? 'dot' : 'system'}
                options={[{ value: 'system', label: tr('Системный', 'System') }, { value: 'dot', label: tr('Точка', 'Dot') }]}
                onChange={(event) => handleSettingChange({ target: { checked: event.target.value === 'dot' } }, 'editorCursor', 'boolean')}
                testId="home-editor-editor-cursor"
            />
            {inProject ? null : <CheckboxControl controlId={'cursorEnabled'}
                label={t('homeEditor.controls.cursorEnabled')}
                checked={Boolean(settings.cursorEnabled)}
                onChange={(event) => handleSettingChange(event, 'cursorEnabled', 'boolean')}
                testId="home-editor-cursor-enabled"
            />}
            <RangeControl controlId={'cursorPointSize'}
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
            <CheckboxControl controlId={'editorFlashlight'}
                label={t('homeEditor.controls.editorFlashlight')}
                checked={Boolean(flashlight.enabled)}
                onChange={(event) => setEditorFlashlight(event.target.checked)}
                testId="home-editor-flashlight"
            />
            <div className="home-editor-status">{tr(
                'Во вьюпорте: зажать правую кнопку на 2 секунды — фонарь включить или выключить; правая кнопка + колесо — фокус пучка. Фонарь светит, когда курсор — точка.',
                'In the viewport: hold the right button for 2 seconds to switch the flashlight on or off; right button + wheel focuses the beam. It shines when the cursor is the dot.',
            )}</div>
            {inProject ? null : <CheckboxControl controlId={'cursorLightEnabled'}
                label={t('homeEditor.controls.cursorLightEnabled')}
                checked={Boolean(settings.cursorLightEnabled)}
                onChange={(event) => handleSettingChange(event, 'cursorLightEnabled', 'boolean')}
                testId="home-editor-cursor-light-enabled"
            />}
            <RangeControl controlId={'cursorLightBeamAngle'}
                label={t('homeEditor.controls.cursorLightBeamAngle')}
                value={settings.cursorLightBeamAngle}
                min={12}
                max={70}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'cursorLightBeamAngle', 'float')}
                testId="home-editor-cursor-light-beam"
            />
            <RangeControl controlId={'cursorLightIntensity'}
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
            <RangeControl controlId={'cursorLightSoftness'}
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
