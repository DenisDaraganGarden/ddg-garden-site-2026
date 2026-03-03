import React from 'react';
import { RangeControl, ColorControl, CheckboxControl } from './Controls';

export const PlaneTab = ({ settings, handleSettingChange }) => (
    <>
        <ColorControl
            label="Цвет плоскости"
            value={settings.planeColor}
            onChange={(e) => handleSettingChange(e, 'planeColor', true)}
        />
        <RangeControl
            label="ВЫСОТА ВОЛНЫ"
            value={settings.planeHeight}
            min={0}
            max={500}
            unit="%"
            onChange={(e) => handleSettingChange(e, 'planeHeight')}
        />
        <RangeControl
            label="ШИРИНА ВОЛНЫ"
            value={settings.planeRadius}
            min={50}
            max={1000}
            unit="%"
            onChange={(e) => handleSettingChange(e, 'planeRadius')}
        />
        <RangeControl
            label="ДЛИНА ХВОСТА"
            value={settings.planeTrailSpan}
            min={1}
            max={100}
            unit="%"
            onChange={(e) => handleSettingChange(e, 'planeTrailSpan')}
        />
        <RangeControl
            label="ВРЕМЯ ЗАТУХАНИЯ"
            value={settings.planeTrailPersistence}
            min={1}
            max={50}
            unit="s"
            onChange={(e) => handleSettingChange(e, 'planeTrailPersistence')}
        />
        <RangeControl
            label="ОСТРОТА КРАЕВ"
            value={settings.planeSharpness}
            min={1}
            max={100}
            unit="%"
            onChange={(e) => handleSettingChange(e, 'planeSharpness')}
        />
        <RangeControl
            label="СГЛАЖИВАНИЕ НАЧАЛА"
            value={settings.planeHeadTaper}
            min={0}
            max={100}
            unit="%"
            onChange={(e) => handleSettingChange(e, 'planeHeadTaper')}
        />
        <RangeControl
            label="СГЛАЖИВАНИЕ КОНЦА"
            value={settings.planeTailTaper}
            min={0}
            max={150}
            unit="%"
            onChange={(e) => handleSettingChange(e, 'planeTailTaper')}
        />
        <RangeControl
            label="ПЛОТНОСТЬ СЕТКИ"
            value={settings.planeMeshDensity}
            min={16}
            max={2048}
            step={8}
            onChange={(e) => handleSettingChange(e, 'planeMeshDensity')}
        />
    </>
);

export const GeometryTab = ({ settings, handleSettingChange }) => (
    <>
        <RangeControl label="ДЛИНА" value={settings.length} min={10} max={200} unit="м" onChange={(e) => handleSettingChange(e, 'length')} />
        <RangeControl label="СВОРАЧИВАНИЕ" value={settings.curl} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'curl')} />
        <RangeControl label="ХВОСТ" value={settings.tailFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tailFactor')} />
        <RangeControl label="ТЕЛО" value={settings.bodyFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'bodyFactor')} />
        <RangeControl label="ШЕЯ" value={settings.neckFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'neckFactor')} />
        <RangeControl label="ГОЛОВА" value={settings.headFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'headFactor')} />
        <RangeControl label="НОС" value={settings.noseFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'noseFactor')} />
        <RangeControl label="ГЛАЗА (ВПАДИНЫ)" value={settings.eyeDimple} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'eyeDimple')} />
        <RangeControl label="СКУЛЫ" value={settings.cheekbone} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'cheekbone')} />
        <RangeControl label="ЧЕЛЮСТЬ" value={settings.jaw} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'jaw')} />
        <RangeControl label="КОРОНА" value={settings.crown} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'crown')} />
        <RangeControl label="СКОРОСТЬ ЯЗЫКА" value={settings.tongueSpeed} min={10} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tongueSpeed')} />
        <RangeControl label="АМПЛИТУДА ЯЗЫКА" value={settings.tongueAmplitude} min={10} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tongueAmplitude')} />
        <RangeControl label="ДЛИНА ЯЗЫКА" value={settings.tongueLength} min={10} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tongueLength')} />
    </>
);

export const ShaderTab = ({ settings, handleSettingChange }) => (
    <>
        <ColorControl label="ОСНОВНОЙ ЦВЕТ" value={settings.baseColor} onChange={(e) => handleSettingChange(e, 'baseColor', true)} />
        <ColorControl label="ЦВЕТ БРЮШКА" value={settings.bellyColor} onChange={(e) => handleSettingChange(e, 'bellyColor', true)} />
        <RangeControl label="ПЛОТНОСТЬ ЧЕШУИ" value={settings.scaleDensity} min={10} max={200} onChange={(e) => handleSettingChange(e, 'scaleDensity')} />
        <RangeControl label="ШЕРОХОВАТОСТЬ" value={settings.roughness} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'roughness')} />
        <RangeControl label="МЕТАЛЛИЧНОСТЬ" value={settings.metalness} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'metalness')} />
    </>
);

export const LightingTab = ({ settings, handleSettingChange }) => (
    <>
        <RangeControl label="ОБЩАЯ ЯРКОСТЬ (HDR)" value={settings.hdrExposure} min={10} max={300} unit="x" onChange={(e) => handleSettingChange(e, 'hdrExposure')} />
        <ColorControl label="ЦВЕТ ПРОЖЕКТОРА" value={settings.lightColor} onChange={(e) => handleSettingChange(e, 'lightColor', true)} />
        <RangeControl label="ЯРКОСТЬ ПРОЖЕКТОРА" value={settings.lightIntensity} min={0} max={1000} unit="x" onChange={(e) => handleSettingChange(e, 'lightIntensity')} />
        <RangeControl label="ВЫСОТА (Y)" value={settings.lightHeight} min={10} max={600} unit="m" onChange={(e) => handleSettingChange(e, 'lightHeight')} />
        <RangeControl label="ДИСТАНЦИЯ ОТ ЦЕНТРА" value={settings.lightDistance} min={0} max={400} unit="m" onChange={(e) => handleSettingChange(e, 'lightDistance')} />
        <RangeControl label="УГОЛ ПОВОРОТА (X/Z)" value={settings.lightAngle} min={0} max={360} unit="°" onChange={(e) => handleSettingChange(e, 'lightAngle')} />
    </>
);

export const CameraTab = ({ settings, setSettings }) => (
    <>
        <RangeControl
            label="УГОЛ ОБЗОРА (FOV)"
            value={settings.cameraFov}
            min={10}
            max={120}
            unit="°"
            onChange={(e) => setSettings(prev => ({ ...prev, cameraFov: parseInt(e.target.value, 10) }))}
        />
        <CheckboxControl
            label="СВОБОДНАЯ КАМЕРА"
            checked={settings.freeCamera}
            onChange={(e) => setSettings(prev => ({ ...prev, freeCamera: e.target.checked }))}
        />
    </>
);

export const DevTab = ({ settings, setSettings }) => (
    <>
        <CheckboxControl
            label="WIREFRAME"
            checked={settings.devWireframe}
            onChange={(e) => setSettings(prev => ({ ...prev, devWireframe: e.target.checked }))}
        />
        <CheckboxControl
            label="NORMALS"
            checked={settings.devNormals}
            onChange={(e) => setSettings(prev => ({ ...prev, devNormals: e.target.checked }))}
        />
        <CheckboxControl
            label="AXES"
            checked={settings.devAxes}
            onChange={(e) => setSettings(prev => ({ ...prev, devAxes: e.target.checked }))}
        />
        <CheckboxControl
            label="STATS"
            checked={settings.devStats}
            onChange={(e) => setSettings(prev => ({ ...prev, devStats: e.target.checked }))}
        />
    </>
);
