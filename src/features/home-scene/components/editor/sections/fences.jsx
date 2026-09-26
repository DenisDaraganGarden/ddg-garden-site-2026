import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { useFocusControlRegistration, useFocusControlScope } from '../focus/FocusControlsContext';
import { WorkspaceTabs } from '../focus/WorkspaceTabs';
import { useWorkspaceTab } from '../focus/useWorkspaceTab';
import { FENCE_DEFAULT, FENCE_TYPES, STOCK_SECTIONS, STOCK_MEMBERS } from '../../../../../fences/settings.js';
import { segmentCurve } from '../../../../../fences/path.js';
import FenceSchedule from '../../../../../fences/FenceSchedule.jsx';
import { listMaterials } from '../../../../../materials/api.js';
import { libraryFile } from '../../../../../materials/modelMaterials.js';
import './fences.css';

function NumberField({ label, value, onChange, controlId, unit = 'm', step = .01, min }) {
    const scope = useFocusControlScope();
    const registration = useFocusControlRegistration({ kind: 'number', label, value, onChange: event => onChange(Number(event.target.value)), controlId, unit, step, min });
    const [text, setText] = useState(String(value ?? ''));
    useEffect(() => setText(String(value ?? '')), [value]);
    if (scope?.catalogOnly) return null;
    const commit = () => {
        const n = Number(text.replace(',', '.'));
        if (text.trim() && Number.isFinite(n) && (min == null || n >= min)) { if (n !== value) onChange(n); }
        else setText(String(value ?? ''));
    };
    return <label className="fence-number" data-focus-control-id={registration.id}><span>{label}</span><input aria-label={label} type="text" inputMode="decimal" value={text} placeholder="—" onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /><small>{unit}</small></label>;
}

const MATERIAL_ROLES = [['panelMaterial', 'Заполнение', 'Infill'], ['postMaterial', 'Столбы', 'Posts'], ['railMaterial', 'Лаги', 'Rails'], ['capMaterial', 'Крышки', 'Caps']];
function MaterialShelf({ editor, ru, style, mixed, focusRole }) {
    const [items, setItems] = useState([]), [error, setError] = useState(''), [query, setQuery] = useState(''), [role, setRole] = useState('panelMaterial');
    useEffect(() => { if (focusRole) setRole(focusRole); }, [focusRole]);
    useEffect(() => { let alive = true; listMaterials().then(v => { if (alive) setItems(v); }, reason => { if (alive) setError(reason.message); }); return () => { alive = false; }; }, []);
    return <>
        <SelectControl label={ru ? 'Часть' : 'Part'} value={role} options={MATERIAL_ROLES.map(([value, r, e]) => ({ value, label: ru ? r : e }))} onChange={event => setRole(event.target.value)} />
        <input className="home-editor-select" value={query} aria-label={ru ? 'Поиск материала' : 'Search materials'} placeholder={ru ? 'Материал…' : 'Material…'} onChange={e => setQuery(e.target.value)} />
        {error ? <p role="alert">{error}</p> : null}
        <div className="fence-materials" data-focus-control-id={`objects/fences:fenceObjects[].segments[].style.${role}`}><button type="button" aria-pressed={!mixed(role) && !style[role]} onClick={() => editor?.patchStyle({ [role]: '' })}><span className="fence-materials__base" />{ru ? 'По конструкции' : 'Construction'}</button>
            {items.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).map(item => <button type="button" key={item.id} aria-pressed={!mixed(role) && style[role] === item.id} onClick={() => editor?.patchStyle({ [role]: item.id })}><img src={libraryFile(item.id, 'preview.webp')} alt="" loading="lazy" /><span>{item.name}</span></button>)}
        </div>
        <NumberField label={ru ? 'Масштаб материала' : 'Material tile'} value={style.tile} min={.0001} onChange={tile => editor?.patchStyle({ tile })} controlId="fenceObjects[].segments[].style.tile" />
    </>;
}

const EMPTY = [];
const NUMBERS = [
    ['height', 'Высота', 'Height', 'm', .01, .0001], ['spacing', 'Макс. шаг столбов', 'Maximum post spacing', 'm', .01, .0001],
    ['offset', 'Доп. смещение', 'Additional offset', 'm', .01], ['clearance', 'Просвет снизу', 'Ground clearance', 'm', .01, 0],
    ['thickness', 'Толщина стены', 'Wall thickness', 'm', .01, .0001],
    ['postWidth', 'Столб · ширина', 'Post · width', 'm', .001, .0001], ['postDepth', 'Столб · глубина', 'Post · depth', 'm', .001, .0001], ['postWall', 'Стенка профиля столба', 'Post wall thickness', 'm', .001, 0], ['postExtra', 'Столб выше заполнения', 'Post above infill', 'm', .01, 0],
    ['memberWidth', 'Планка · ширина', 'Member · width', 'm', .001, .0001], ['memberDepth', 'Планка · толщина', 'Member · depth', 'm', .001, .0001], ['memberWall', 'Стенка профиля планки', 'Member wall thickness', 'm', .001, 0], ['memberGap', 'Зазор между планками', 'Member gap', 'm', .001, 0],
    ['railCount', 'Лаг на секцию', 'Rails per section', '', 1, 0], ['railWidth', 'Лага · высота', 'Rail · height', 'm', .001, .0001], ['railDepth', 'Лага · толщина', 'Rail · depth', 'm', .001, .0001], ['railWall', 'Стенка профиля лаги', 'Rail wall thickness', 'm', .001, 0],
    ['wire', 'Проволока', 'Wire', 'm', .001, .0001], ['cellWidth', 'Ячейка · ширина', 'Cell · width', 'm', .001, .0001], ['cellHeight', 'Ячейка · высота', 'Cell · height', 'm', .001, .0001],
    ['capHeight', 'Крышка · высота', 'Cap · height', 'm', .001, 0], ['capOverhang', 'Крышка · свес', 'Cap · overhang', 'm', .001, 0],
];
export function FencesSection({ settings, fenceEditor: editor, layoutEditor, focusField }) {
    const { language } = useLanguage(), ru = language !== 'en', scope = useFocusControlScope(), catalog = scope?.catalogOnly;
    const objects = settings.fenceObjects ?? EMPTY, selection = editor?.selection ?? [];
    const chosen = objects.flatMap(f => f.segments.filter(s => selection.includes(`${f.id}/${s.id}`)).map(s => ({ fence: f, segment: s })));
    const style = chosen[0]?.segment.style ?? editor?.draftStyle ?? FENCE_DEFAULT;
    const mixed = key => chosen.some(({ segment }) => segment.style[key] !== style[key]);
    const fences = objects.filter(f => chosen.some(c => c.fence === f));
    const [tab, setTab] = useWorkspaceTab('ouroboros-fence-tab', ['lines', 'structure', 'materials', 'schedule']);
    const focusKey = focusField?.startsWith('objects/fences:') ? focusField.split('.').at(-1) : null;
    const focusRole = MATERIAL_ROLES.some(([key]) => key === focusKey) ? focusKey : null;
    useEffect(() => {
        if (!focusKey || catalog) return;
        setTab(focusRole || focusKey === 'tile' ? 'materials' : focusField.includes('.style.') ? 'structure' : 'lines');
    }, [focusField, focusKey, focusRole, catalog, setTab]);
    const tabs = [['lines', 'Линии', 'Lines'], ['structure', 'Конструкция', 'Construction'], ['materials', 'Материалы', 'Materials'], ['schedule', 'Ведомость', 'Schedule']].map(([id, r, e]) => ({ id, label: ru ? r : e }));
    const node = objects.find(f => f.id === editor?.vertex?.fenceId)?.nodes.find(n => n.id === editor.vertex.nodeId);
    const number = ([key, r, e, unit, step, min]) => <NumberField key={key} label={ru ? r : e} value={mixed(key) ? undefined : style[key]} unit={unit} step={step} min={min} controlId={`fenceObjects[].segments[].style.${key}`} onChange={value => editor?.patchStyle({ [key]: value })} />;
    const choose = (key, r, e, options) => <SelectControl controlId={`fenceObjects[].segments[].style.${key}`} label={ru ? r : e} value={mixed(key) ? '' : style[key]} options={[...(mixed(key) ? [{ value: '', label: ru ? 'Разные' : 'Mixed' }] : []), ...options.map(([value, r, e]) => ({ value, label: ru ? r : e }))]} onChange={event => editor?.patchStyle({ [key]: event.target.value })} />;
    const closed = fences.length === 1 && fences[0].nodes.every(n => fences[0].segments.filter(s => s.a === n.id || s.b === n.id).length === 2);
    const summaries = useMemo(() => objects.map(f => ({ fence: f, lengths: f.segments.map(s => segmentCurve(f, s).getLength()) })), [objects]);
    return <div className="fence-workspace">
        {!catalog ? <>
            <WorkspaceTabs tabs={tabs} value={tab} onChange={setTab} testId="fence-tab" label={ru ? 'Ограждения' : 'Fences'} />
            <div className="planting-tools">
                <button type="button" onClick={() => { editor?.begin(); setTab('lines'); }} data-testid="fence-draw">{ru ? 'Новая линия' : 'New path'}</button>
                {editor?.drawing ? <><button type="button" onClick={editor.finish}>{ru ? 'Завершить ↵' : 'Finish ↵'}</button><button type="button" onClick={editor.close}>{ru ? 'Замкнуть' : 'Close loop'}</button><button type="button" onClick={editor.stop}>Esc</button></> : fences.length === 1 ? <button type="button" onClick={() => layoutEditor?.frameObject?.(`fence-${fences[0].id}`)}>{ru ? 'Показать' : 'Frame'}</button> : null}
            </div>
            <div className="fence-selection">{chosen.length ? `${ru ? 'Участков выбрано' : 'Selected segments'}: ${chosen.length}` : ru ? 'Параметры новой линии' : 'New path settings'}</div>
        </> : null}
        {catalog || tab === 'lines' ? <>
            {!catalog ? <>
                <div className="fence-snap"><label><input type="checkbox" checked={editor?.snap ?? true} onChange={event => editor?.setSnap(event.target.checked)} />{ru ? 'Привязки' : 'Snapping'}</label><label><input type="checkbox" checked={editor?.axis ?? false} onChange={event => editor?.setAxis(event.target.checked)} />{ru ? 'Оси X/Z' : 'X/Z axes'}</label></div>
                <NumberField label={ru ? 'Длина следующего участка' : 'Next segment length'} value={editor?.distance ?? 0} min={0} onChange={v => editor?.setDistance(v)} />
                <NumberField label={ru ? 'Плоскость построения Y' : 'Construction plane Y'} value={editor?.planeY ?? 0} onChange={v => editor?.setPlaneY(v)} />
                {editor?.status ? <output className="fence-selection">{editor.status}</output> : null}
                {node ? <><SectionHeading label={ru ? 'Вершина' : 'Vertex'} subtle />{['X', 'Y', 'Z'].map((key, i) => <NumberField key={key} label={key} value={node.point[i]} onChange={value => editor.updateNode({ [i]: value })} />)}</> : null}
                {chosen.length ? <div className="planting-tools"><button type="button" onClick={editor.reproject}>{ru ? 'По поверхности' : 'Project to surface'}</button><button type="button" onClick={editor.splitSelected}>{ru ? '+ Вершина' : '+ Vertex'}</button><button type="button" onClick={() => editor.setEnabled(false)}>{ru ? 'Разрыв' : 'Gap'}</button><button type="button" onClick={() => editor.setEnabled(true)}>{ru ? 'Восстановить' : 'Restore'}</button><button type="button" onClick={() => editor.setSmooth(true)}>{ru ? 'Сплайн' : 'Spline'}</button><button type="button" onClick={() => editor.setSmooth(false)}>{ru ? 'Прямая' : 'Straight'}</button><button type="button" onClick={editor.removeSelected}>{ru ? 'Удалить' : 'Delete'}</button></div> : null}
                {summaries.map(({ fence, lengths }) => <div className="fence-path" key={fence.id}>
                    <button type="button" className={fences.includes(fence) ? 'is-active' : ''} onClick={event => editor?.select(fence.id, null, event.shiftKey)}>{fence.name}</button>
                    {fences.includes(fence) ? <input className="home-editor-select" aria-label={ru ? 'Имя ограждения' : 'Fence name'} value={fence.name} onChange={e => editor.rename(fence.id, e.target.value)} /> : null}
                    {fence.segments.map((s, i) => <button type="button" key={s.id} aria-pressed={selection.includes(`${fence.id}/${s.id}`)} className="fence-segment" onClick={event => editor?.select(fence.id, s.id, event.shiftKey)}><span>{i + 1}</span><span>{s.enabled ? FENCE_TYPES[s.style.type][ru ? 0 : 1] : ru ? 'Разрыв' : 'Gap'}</span><small>{lengths[i].toFixed(3)} m</small></button>)}
                </div>)}
            </> : <SelectControl controlId="fenceObjects" label={ru ? 'Линии ограждений' : 'Fence paths'} value="" options={[{ value: '', label: '—' }]} onChange={() => {}} />}
        </> : null}
        {catalog || tab === 'structure' ? <>
            <SelectControl controlId="fenceObjects[].segments[].style.type" label={ru ? 'Конструкция' : 'Construction'} value={mixed('type') ? '' : style.type} options={[...(mixed('type') ? [{ value: '', label: ru ? 'Разные' : 'Mixed' }] : []), ...Object.entries(FENCE_TYPES).map(([value, labels]) => ({ value, label: labels[ru ? 0 : 1] }))]} onChange={e => editor?.setType(e.target.value)} />
            {NUMBERS.slice(0, 4).map(number)}
            {choose('alignment', 'Положение к оси', 'Position to axis', [['axis', 'По оси', 'On axis'], ['inside', closed ? 'Внутри' : 'Слева по ходу', closed ? 'Inside' : 'Left along path'], ['outside', closed ? 'Снаружи' : 'Справа по ходу', closed ? 'Outside' : 'Right along path']])}
            {choose('grade', 'Рельеф', 'Slope', [['slope', 'По рельефу', 'Follow slope'], ['step', 'Ступенями', 'Stepped'], ['level', 'Единый верх участка', 'Level segment top']])}
            {choose('up', 'Направление высоты', 'Height direction', [['vertical', 'Вертикально', 'Vertical'], ['normal', 'По нормали поверхности', 'Surface normal']])}
            {catalog || ['concrete', 'brick'].includes(style.type) ? number(NUMBERS[4]) : null}
            <SectionHeading label={ru ? 'Столбы' : 'Posts'} subtle />
            <CheckboxControl controlId="fenceObjects[].segments[].style.postEnabled" label={ru ? 'Столбы' : 'Posts'} checked={style.postEnabled} onChange={e => editor?.patchStyle({ postEnabled: e.target.checked })} />
            {choose('postKind', 'Материал конструкции столба', 'Post construction material', [['metal', 'Металл', 'Metal'], ['timber', 'Дерево', 'Timber'], ['concrete', 'Бетон', 'Concrete'], ['brick', 'Кирпичная кладка', 'Brick masonry']])}
            <SelectControl label={ru ? 'Типовое сечение, мм' : 'Stock section, mm'} value="" options={[{ value: '', label: ru ? 'Своё / выбрать…' : 'Custom / choose…' }, ...STOCK_SECTIONS.map(s => ({ value: s.id, label: `${s.kind === 'metal' ? (ru ? 'Металл' : 'Metal') : (ru ? 'Дерево' : 'Timber')} · ${s.name}` }))]} onChange={event => { const stock = STOCK_SECTIONS.find(s => s.id === event.target.value); if (stock) editor?.patchStyle({ postKind: stock.kind, postWidth: stock.width, postDepth: stock.depth, postWall: stock.wall }); }} />
            {NUMBERS.slice(5, 9).map(number)}
            {catalog || !['concrete', 'brick', 'posts'].includes(style.type) ? <><SectionHeading label={ru ? 'Заполнение' : 'Infill'} subtle /><SelectControl label={ru ? 'Сечение планки, мм' : 'Member section, mm'} value="" options={[{ value: '', label: ru ? 'Своё / выбрать…' : 'Custom / choose…' }, ...STOCK_MEMBERS.map(s => ({ value: s.id, label: s.name }))]} onChange={event => { const stock = STOCK_MEMBERS.find(s => s.id === event.target.value); if (stock) editor?.patchStyle({ memberWidth: stock.width, memberDepth: stock.depth, memberWall: stock.wall }); }} />{(style.type === 'mesh' && !catalog ? NUMBERS.slice(17, 20) : NUMBERS.slice(9, 17)).map(number)}{catalog ? NUMBERS.slice(17, 20).map(number) : null}</> : null}
            <SectionHeading label={ru ? 'Крышки' : 'Caps'} subtle />
            <CheckboxControl controlId="fenceObjects[].segments[].style.caps" label={ru ? 'Крышки столбов' : 'Post caps'} checked={style.caps} onChange={e => editor?.patchStyle({ caps: e.target.checked })} />
            {NUMBERS.slice(20).map(number)}<details className="fence-standards"><summary>{ru ? 'Сортамент и нормы' : 'Stock sizes and standards'}</summary><a href="https://protect.gost.ru/gost/details/87fd82db-4c4e-46bd-b2bc-5bb161d1938a" target="_blank" rel="noreferrer">{ru ? 'ГОСТ 24454-80 · размеры древесины' : 'GOST 24454-80 · timber sizes'}</a><a href="https://zabor.grandline.ru/attachment-options/panelnye-ograzhdeniya.html" target="_blank" rel="noreferrer">{ru ? 'Панельные ограждения · типовые узлы' : 'Panel fences · standard joints'}</a><p className="fence-note">{ru ? 'Сечения — исходные варианты. Размеры можно менять; несущая способность здесь не рассчитывается.' : 'Sections are starting points. Dimensions remain editable; structural capacity is not calculated here.'}</p></details>
        </> : null}
        {!catalog && tab === 'materials' ? <MaterialShelf editor={editor} ru={ru} style={style} mixed={mixed} focusRole={focusRole} /> : null}
        {catalog ? <NumberField label={ru ? 'Масштаб материала' : 'Material tile'} value={1} min={.0001} onChange={() => {}} controlId="fenceObjects[].segments[].style.tile" /> : null}
        {catalog ? MATERIAL_ROLES.map(([key, r, e]) => <SelectControl key={key} controlId={`fenceObjects[].segments[].style.${key}`} label={ru ? `Материал · ${r}` : `Material · ${e}`} value="" options={[{ value: '', label: 'Library' }]} onChange={() => {}} />) : null}
        {!catalog && tab === 'schedule' ? <FenceSchedule objects={objects} ru={ru} /> : null}
    </div>;
}
