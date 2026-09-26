import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { TOPIARY_DEFAULT, TOPIARY_LIMITS, TOPIARY_RANGES } from '../../../../../topiary/settings.js';
import { useFocusControlScope } from '../focus/FocusControlsContext';

const controls=[
    ['width','Толщина','Width',' m'],['height','Высота','Height',' m'],['density','Плотность хвои','Foliage density',''],
    ['leafSize','Размер веточки','Sprig size',' m'],['roundness','Скругление','Roundness',''],
    ['roughness','Шероховатость','Roughness',''],['translucency','Просвечивание','Translucency',''],
    ['x','Положение X','Position X',' m'],['z','Положение Z','Position Z',' m'],['baseY','Основание Y','Base Y',' m'],['rotation','Поворот','Rotation','°'],['scale','Масштаб','Scale',''],
];
export function TopiarySection({settings,handleSettingChange,topiaryEditor,layoutEditor}) {
    const {language}=useLanguage(),ru=language==='ru',scope=useFocusControlScope();
    const objects=settings.topiaryObjects??[], selected=objects.find(o=>o.id===topiaryEditor?.selectedId);
    const object=selected??TOPIARY_DEFAULT;
    return <>
        <div className="home-editor-tabs">
            <button type="button" className={`home-editor-tab ${topiaryEditor?.drawing?'is-active':''}`} disabled={objects.length>=TOPIARY_LIMITS.objects&&!topiaryEditor?.drawing} onClick={()=>topiaryEditor?.drawing?topiaryEditor.stop():topiaryEditor?.begin()} data-testid="topiary-draw">{topiaryEditor?.drawing?(ru?'Завершить · Esc':'Finish · Esc'):(ru?'Рисовать · B':'Draw · B')}</button>
            <button type="button" className="home-editor-tab" onClick={()=>{const x=selected?.x??0,z=selected?.z??0,y=settings.topiaryPlaneY;layoutEditor?.previewPose?.({cameraPosition:{x,y:y+18,z:z+.01},cameraTarget:{x,y,z},cameraFov:50});}} data-testid="topiary-top-view">{ru?'Сверху':'Top'}</button>
            {selected?<button type="button" className="home-editor-tab" onClick={()=>layoutEditor?.frameObject?.(`topiary-${selected.id}`)}>{ru?'Показать':'Frame'}</button>:null}
        </div>
        <SectionHeading label={ru?'Кисть':'Brush'} subtle/>
        {[['topiaryBrushWidth','Толщина мазка','Stroke width',.3,8],['topiaryBrushHeight','Высота мазка','Stroke height',.3,12],['topiaryPlaneY','Плоскость Y','Plane Y',-20,40]].map(([key,r,e,min,max])=><RangeControl key={key} controlId={key} label={ru?r:e} value={settings[key]} min={min} max={max} step={.05} unit=" m" onChange={event=>handleSettingChange(event,key)}/>)}
        <SectionHeading label={`${ru?'Формы':'Shapes'} · ${objects.length}/${TOPIARY_LIMITS.objects}`} subtle/>
        <SelectControl controlId="topiaryObjects" label={ru?'Объект':'Object'} value={selected?.id??''} options={[{value:'',label:ru?'Выбрать…':'Select…'},...objects.map(o=>({value:o.id,label:o.name}))]} onChange={event=>topiaryEditor?.select(event.target.value)}/>
        {selected?<div className="home-editor-control-group"><input className="home-editor-select" aria-label={ru?'Имя формы':'Shape name'} value={selected.name} maxLength={64} onChange={event=>topiaryEditor.update(selected.id,{name:event.target.value})}/></div>:null}
        {selected||scope?.catalogOnly?controls.map(([key,r,e,unit])=>{const[min,max,step]=TOPIARY_RANGES[key];return <RangeControl key={key} controlId={`topiaryObjects[].${key}`} testId={`topiary-${key}`} label={ru?r:e} value={object[key]} min={min} max={max} step={step} unit={unit} formatValue={v=>Number(v.toFixed(2))} onChange={event=>selected&&topiaryEditor.update(selected.id,{[key]:Number(event.target.value)})}/>;}):null}
        {selected?<div className="home-editor-tabs"><button type="button" className="home-editor-tab" onClick={()=>topiaryEditor.remove(selected.id)} data-testid="topiary-delete">{ru?'Удалить форму':'Delete shape'}</button></div>:null}
    </>;
}
