/* Standalone UI study. No connection to the scene, publication API or editor storage. */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  terrain:'<path d="m2 19 6-12 4 7 3-5 7 10Z"/><path d="m6 11 3 2 2-1"/>',
  water:'<path d="M2 7c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 12c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 17c3-4 5 4 8 0s5 4 8 0 4 0 4 0"/>',
  leaf:'<path d="M20 3C10 2 2 8 6 16s17 0 14-13Z"/><path d="M3 21 16 8"/>',
  box:'<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10M7 4.8l9 5"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.5 1.5m12.6 12.6 1.5 1.5m0-15.6-1.5 1.5M5.7 18.3l-1.5 1.5"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  sliders:'<path d="M4 3v18M12 3v18M20 3v18"/><path d="M1 8h6m2 8h6m2-10h6" stroke-width="3"/>',
  sound:'<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  settings:'<path d="m10 2-.7 3-2.5 1.4-3-.6-2 3 2.2 2.3v2.8l-2 2.3 2 3 3-.6L9.3 20l.7 3h4l.7-3 2.5-1.4 3 .6 2-3-2.2-2.3v-2.8l2-2.3-2-3-3 .6L14.7 5 14 2Z" transform="translate(0 -1) scale(1 .96)"/><circle cx="12" cy="12" r="3"/>',
  cloud:'<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11Z"/>',
  eye:'<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="m3 3 18 18M10 5a12 12 0 0 1 12 7 19 19 0 0 1-4 4M7 6a19 19 0 0 0-5 6s4 7 10 7a11 11 0 0 0 4-1"/>',
  cursor:'<path d="m4 2 15 11-7 1-4 7Z"/>',
  light:'<path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0l-1 3H9Z"/>',
  fish:'<path d="M17 12c-5-8-11-6-15 0 4 6 10 8 15 0l5 5V7Z"/><circle cx="6" cy="11" r=".6" fill="currentColor"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  chevron:'<path d="m7 10 5 5 5-5"/>',
  right:'<path d="m9 5 7 7-7 7"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  folder:'<path d="M3 6V4h6l3 3h9v13H3Z"/>',
  desktop:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  mobile:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  pause:'<path d="M8 5v14m8-14v14" stroke-width="3"/>',
  play:'<path d="m7 4 14 8-14 8Z"/>',
  upload:'<path d="M12 16V2m-5 5 5-5 5 5M3 15v6h18v-6"/>',
  undo:'<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>',
  redo:'<path d="m15 5 6 6-6 6m6-6H10a7 7 0 0 0-7 7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3l-1 2m0 3v.1"/>',
  move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
  rotate:'<path d="M20 8a9 9 0 1 0 1 9M20 2v6h-6"/>',
  scale:'<rect x="3" y="11" width="10" height="10"/><path d="m13 11 8-8m-7 0h7v7"/>',
  hand:'<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 4-3 7-7 7-3 0-5-1-7-4l-4-5a2 2 0 0 1 3-2l3 3Z"/>',
  focus:'<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
  panel:'<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M15 3v18"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  capture:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5"/><circle cx="12" cy="12" r="4"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  pin:'<path d="m9 2 7 3-2 5 3 4-3 3-4-3-5 2-3-7 5 1Zm1 12-6 7"/>',
};
const icon = (key) => `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[key] || paths.box}</svg>`;
const tip = (s, en='') => `data-tip="${esc(s)}"${en ? ` data-tip-en="${esc(en)}"` : ''}`;
const ib = (key, action, label, extra='') => `<button class="icon" data-action="${action}" aria-label="${esc(label)}" ${tip(label)} ${extra}>${icon(key)}</button>`;
const catalogue = window.OUROBOROS_CATALOG;
const domains = catalogue.domains;
const nodes = domains.flatMap(d => d.groups.flatMap(g => g.items.map(n => ({...n, domain:d.id, domainLabel:d.label, group:g.label, groupKey:d.id+':'+g.label}))));
const nodeMap = new Map(nodes.map(n => [n.id,n]));
const query = new URLSearchParams(location.search);
const layouts = {studio:{number:'01',label:'Студия',summary:'Дерево слева · параметры справа',description:'Вся структура сцены остаётся перед глазами. Удобно собирать сложную сцену и часто переходить между объектами.'},focus:{number:'02',label:'Фокус',summary:'Одна панель · больше сцены',description:'Одна панель справа и короткая полоса инструментов. Дерево раскрывается по запросу, поиск ведёт сразу к параметру. Мой выбор для MacBook.'},atelier:{number:'03',label:'Ателье',summary:'Всё управление слева · светлая тема',description:'Навигация и настройки собраны на одной стороне. Сцена целиком справа; светлые панели спокойнее рядом с дневными пейзажами.'}};
const state = {
 layout:'focus',domain:'scene',node:nodeMap.has(query.get('node'))?query.get('node'):'water',
 selectedByDomain:{scene:'water',look:'sun',cameras:'camera',render:'post',audio:'mixer',workspace:'settings'},
 owner:'work1',format:'desktop',values:{},hidden:new Set(),pins:new Set(['sun:sunIntensity','water:seaSurfHeight']),
 paramsTab:'all',filter:'',treeFilter:'',paused:true,tool:'select',gizmoShown:false,cameraStrip:query.get('strip')==='1',navOpen:false,focus:false,preview:false,
 cameras:[{id:'work1',name:'Рабочая 1',kind:'work',main:true},{id:'work2',name:'Урез',kind:'work'},{id:'scene1',name:'Общий вид',kind:'scene',enabled:true,holdSeconds:8},{id:'scene2',name:'Коса',kind:'scene',enabled:true,holdSeconds:8}],
 fov:{},undo:[],redo:[],dirty:false,lang:'ru',tooltipEnabled:true,openSections:{},inspectorHidden:false
};
state.domain=nodeMap.get(state.node).domain;
if(query.get('layout')!=='focus'){const url=new URL(location.href);url.searchParams.set('layout','focus');history.replaceState(null,'',url);}
const iconColors=window.createOuroborosIconColors({
 nodes,groups:domains.flatMap(d=>d.groups.map(g=>({id:d.id+':'+g.label,label:g.label}))),
 onOpen:()=>hideTip(),
 onChange:()=>$$('[data-color-target]').forEach(el=>{const target=el.querySelector('.node-mark,.group-mark')||el;const color=iconColors.color(el.dataset.colorTarget);if(color)target.style.setProperty('--label-color',color);else target.style.removeProperty('--label-color');})
});
const colorStyle=key=>iconColors.color(key)?'--label-color:'+iconColors.color(key):'';

const currentNode=()=>nodeMap.get(state.node);
const currentCamera=()=>state.cameras.find(c=>c.id===state.owner);
const currentDomain=()=>domains.find(d=>d.id===state.domain);
const valueKey=(nodeId,fieldId)=>`${nodeMap.get(nodeId).domain==='audio'?'global':nodeId==='settings'||nodeId==='debug'?'local':state.owner}:${nodeId}:${fieldId}`;
let projectBaseline={values:{},hidden:[],cameras:state.cameras.filter(c=>c.kind==='scene').map(c=>({...c})),fov:{}};
const projectValues=()=>Object.fromEntries(Object.entries(state.values).filter(([k])=>k.startsWith('scene')||k.startsWith('global:')));
function saveBaseline(){projectBaseline={values:{...projectValues()},hidden:[...state.hidden].filter(k=>k.startsWith('scene')),cameras:state.cameras.filter(c=>c.kind==='scene').map(c=>({...c})),fov:Object.fromEntries(Object.entries(state.fov).filter(([k])=>k.startsWith('scene')))};}
function scopeDetails(n){return n.domain==='audio'?{label:'Общий звук сцены',icon:'sound',hint:'Звук общий для всех камер и входит в проект.',camera:false}:n.id==='settings'||n.id==='debug'?{label:'Только этот редактор',icon:'settings',hint:'Локальные настройки рабочего места. В снимки камер и публикацию не входят.',camera:false}:{label:currentCamera().name,icon:currentCamera().kind==='work'?'lock':'camera',hint:'Полный снимок выбранной камеры. Рабочие камеры остаются локальными.',camera:true};}
const getValue=(n,f)=>Object.hasOwn(state.values,valueKey(n.id,f.id))?state.values[valueKey(n.id,f.id)]:f.value;
const num=(v)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(3)).toString():String(v);
const textLabel=(item)=>state.lang==='en'?item.en||item.label:item.label;
const allFields=()=>nodes.flatMap(n=>n.sections.flatMap(s=>s.fields.map(f=>({n,s,f}))));
const refSvg=(className='',position='xMidYMid slice')=>`<svg class="${className}" viewBox="0 180 1080 388" preserveAspectRatio="${position}" aria-hidden="true"><image href="assets/editor-reference.png" width="1080" height="997"/></svg>`;
const brandMark=()=>`<svg viewBox="${state.layout==='atelier'?'1156 315 250 250':'243 157 535 535'}" aria-hidden="true"><image href="assets/logo-reference.png" width="1536" height="1024"/></svg>`;
function setClasses(){const tab=$('.inspector-tab');if(tab){tab.setAttribute('aria-expanded',String(!state.inspectorHidden));tab.setAttribute('aria-label',state.inspectorHidden?'Развернуть инспектор':'Свернуть инспектор');tab.dataset.tip=state.inspectorHidden?'ЛКМ — развернуть параметры':'ЛКМ — свернуть параметры к правому краю';}document.body.dataset.layout=state.layout;document.body.classList.toggle('nav-open',state.navOpen);document.body.classList.toggle('canvas-focus',state.focus);document.body.classList.toggle('inspector-hidden',state.inspectorHidden);}
function render(){
 const stripScroll=$('.camera-strip-scroll')?.scrollLeft??0;
 setClasses(); const n=currentNode(),cam=currentCamera();
 $('#app').innerHTML=`
 <div class="studybar"><span class="study-label">UI STUDY</span><span class="study-title">Фокус</span><span class="spacer"></span><span class="study-type">Интерактивный HTML-эскиз</span><button class="about-button quiet" data-action="about">${icon('help')}О схеме</button></div>
 <header class="topbar"><div class="brand">${brandMark()}<div class="brand-text"><div class="brand-name">OUROBOROS</div><div class="brand-sub">ENGINE</div></div></div><button class="project-name" data-action="project" ${tip('Состояние проекта, локальное сохранение и публикация')}>Азовское побережье${icon('chevron')}</button><span class="draft-state" ${tip('Правки сохраняются автоматически в локальный снимок выбранной камеры. В этом эскизе — только в памяти страницы.')}><span class="dot ${state.dirty?'dirty':''}"></span><span class="save-label">Автосохранено</span></span><span class="spacer"></span><div class="camera-owner" ${tip(`${cam.kind==='work'?'Локальная рабочая камера':'Публикуемая сцена'}: ${cam.name}. Камеры переключаются в ленте внизу.`)}>${icon(cam.kind==='work'?'lock':'camera')}<span>${esc(cam.name)}</span></div><div class="segmented" aria-label="Формат камеры">${['desktop','mobile'].map(f=>`<button class="icon ${state.format===f?'active':''}" data-format="${f}" aria-label="${f==='desktop'?'Десктоп':'Мобайл'}" aria-pressed="${state.format===f}" ${tip(`${f==='desktop'?'Десктоп':'Мобайл'} — отдельный ракурс и FOV этой камеры`)}>${icon(f)}</button>`).join('')}</div><span class="separator"></span>${ib(state.paused?'play':'pause','pause',state.paused?'Продолжить анимацию · Пробел':'Пауза анимации · Пробел')}${ib('eye','preview','Просмотр страницы сайта без рабочих инструментов')}<span class="separator"></span><div class="save-cluster">${ib('undo','revert','Откатить к опубликованной сцене…')}<button class="primary" data-action="save" ${tip('Сохранить обычные сцены в проект. Рабочие камеры остаются локальными.')}>В проект</button><button class="publish" data-action="publish" ${tip('Публикация на сайт — отдельное действие с просмотром состава изменений.')}>На сайт${icon('chevron')}</button></div></header>
 <main class="workspace"><nav class="rail" aria-label="Рабочие области">${domains.map(d=>`<button data-domain="${d.id}" class="${state.domain===d.id?'active':''}" aria-label="${esc(d.label)}" ${tip(d.label,d.en)}>${icon(d.icon)}</button>`).join('')}<div class="rail-bottom"></div>${ib('search','search','Найти объект, параметр или команду · ⌘K')}${ib('help','help','Горячие клавиши · ?')}</nav><aside class="navigator" aria-label="Навигатор сцены"></aside><section class="viewport ${state.preview?'site-preview':''}" aria-label="Эскиз рабочей сцены"><div class="viewport-image">${refSvg()}</div><div class="site-preview-header"><b>DENIS DARAGAN</b><small>ПОРТФОЛИО ИНФО КАРТА АРХИВ</small></div><div class="view-top"><div class="glass"><span class="view-label">${icon('camera')}Перспектива</span><button data-action="technical" ${tip('Технические ракурсы: осмотр сцены без перезаписи камер')}>Виды${icon('chevron')}</button></div><span class="spacer"></span><div class="glass">${ib('undo','undo','Отменить изменение в эскизе · ⌘Z',state.undo.length?'':'disabled')}${ib('redo','redo','Повторить изменение · ⌘⇧Z',state.redo.length?'':'disabled')}</div></div><div class="view-tools glass"></div><svg class="axis-compass" viewBox="0 0 60 60" aria-hidden="true"><path d="M30 29V8m0 21 20 12m-20-12L10 41" stroke="#edece0" stroke-width="1"/><circle cx="30" cy="8" r="7" fill="#b6c1a7"/><circle cx="50" cy="41" r="7" fill="#bb8d7f"/><circle cx="10" cy="41" r="7" fill="#8b9eaf"/><g font-family="sans-serif" font-size="8" fill="#202a2c" text-anchor="middle"><text x="30" y="11">Y</text><text x="50" y="44">X</text><text x="10" y="44">Z</text></g></svg><div id="frame-guide"></div><div id="gizmo-wrap"></div><div id="camera-strip"></div><div class="viewport-footer"><div class="glass"><button data-action="strip" ${tip('Открыть полосу камер')}>${icon('camera')}Камеры${icon('chevron')}</button><span class="mode-label" ${tip('Рабочие камеры сохраняют полный снимок сцены только локально')}>${cam.kind==='work'?'Рабочая':'Сцена'}</span></div><span class="spacer"></span><span class="snapshot-note" ${tip('Для сравнения схем используется статичный кадр из вашего скриншота. Управление здесь демонстрирует только интерфейс.')}>Кадр для эскиза</span></div>${state.focus?`<div class="view-reveal glass"><button data-action="focus">${icon('panel')}Панели <kbd>Tab</kbd></button></div>`:''}${state.preview?`<div class="view-reveal glass" style="top:114px"><button data-action="preview">${icon('undo')}К редактору</button></div>`:''}</section><aside class="inspector" aria-label="Инспектор параметров" id="inspector"></aside><button class="inspector-tab" data-action="panel" aria-controls="inspector" aria-expanded="${!state.inspectorHidden}" aria-label="${state.inspectorHidden?'Развернуть инспектор':'Свернуть инспектор'}" ${tip(state.inspectorHidden?'ЛКМ — развернуть параметры':'ЛКМ — свернуть параметры к правому краю')}>${icon('right')}</button></main>
 <footer class="statusbar"><span>${n.domainLabel===n.label?esc(n.label):esc(n.domainLabel)+" / "+esc(n.label)}</span><span class="spacer"></span>${n.gizmo?`<span class="status-key"><kbd>G</kbd> перенос${n.gizmo==='object'?' <kbd>R</kbd> поворот <kbd>S</kbd> масштаб':''}</span>`:''}<span class="status-key"><kbd>Пробел</kbd> пауза</span></footer>`;
 renderTree();renderInspector();renderViewport();bindResize();if($('.camera-strip-scroll'))$('.camera-strip-scroll').scrollLeft=stripScroll;
}
function renderTree(){
 const d=currentDomain();
 $('.navigator').innerHTML=`<div class="panel-title">${esc(textLabel(d))}<span class="count">${d.groups.reduce((s,g)=>s+g.items.length,0)}</span><span class="spacer"></span><button class="icon tiny navigator-pop-close" data-action="close-nav" aria-label="Закрыть дерево">${icon('close')}</button></div><div class="panel-search">${icon('search')}<input type="search" id="tree-filter" aria-label="Фильтр объектов" placeholder="Объекты…" value="${esc(state.treeFilter)}"></div><div class="tree-scroll">${treeContent()}</div>`;
}
function treeContent(){
 const q=state.treeFilter.toLowerCase();
 return currentDomain().groups.map(g=>{const items=g.items.filter(n=>`${n.label} ${n.en}`.toLowerCase().includes(q));return items.length?`<details class="tree-group" open><summary data-color-target="group:${esc(currentDomain().id+':'+g.label)}" ${tip('ПКМ — цвет группы; значки объектов наследуют его')} >${icon('chevron')}<span class="group-mark" style="${colorStyle('group:'+currentDomain().id+':'+g.label)}">${icon('folder')}</span>${esc(g.label)}</summary>${items.map(n=>`<div class="tree-item ${state.node===n.id?'active':''}"><button class="select-node" data-node="${n.id}" data-color-target="node:${n.id}" ${tip(n.description+' ПКМ — цвет значка.',n.en)}><span class="node-mark" style="${colorStyle('node:'+n.id)}">${icon(n.icon)}</span><span>${esc(textLabel(n))}</span></button>${state.domain==='scene'||state.domain==='look'?`<button class="eye tiny icon ${state.hidden.has(state.owner+':'+n.id)?'off':''}" data-visibility="${n.id}" aria-label="${state.hidden.has(state.owner+':'+n.id)?'Показать':'Скрыть'} ${esc(n.label)}" ${tip('Видимость объекта в эскизе')}>${icon(state.hidden.has(state.owner+':'+n.id)?'eyeoff':'eye')}</button>`:''}</div>`).join('')}</details>`:''}).join('')||'<div class="empty">Ничего не найдено</div>';
}
function renderInspector(){
 const n=currentNode(),cam=currentCamera(),scope=scopeDetails(n);
 $('.inspector').innerHTML=`<div class="inspector-resize" role="separator" aria-label="Ширина панели" aria-orientation="vertical" tabindex="0" ${tip('ЛКМ — свернуть. Перетаскивание — ширина. Стрелки ← → — с клавиатуры.')}></div><div class="inspector-head"><div class="breadcrumb"><span>${esc(n.domainLabel)}</span>${icon('right')}<span>${esc(n.group)}</span><span class="spacer"></span></div><div class="object-title"><button class="object-mark" data-color-button data-color-target="node:${n.id}" style="${colorStyle('node:'+n.id)}" aria-label="Цвет значка ${esc(n.label)}" ${tip('ЛКМ или ПКМ — цвет значка')}>${icon(n.icon)}</button><h1 ${tip(n.description,n.en)}>${esc(textLabel(n))}</h1>${state.domain==='scene'||state.domain==='look'?`<label class="switch" ${tip('Видимость выбранного объекта')}><input type="checkbox" aria-label="Видимость ${esc(n.label)}" data-node-visible="${n.id}" ${state.hidden.has(state.owner+':'+n.id)?'':'checked'}><span></span></label>`:''}</div><div class="scope-line" ${tip(scope.hint)}>${icon(scope.icon)}${scope.camera?(cam.kind==='work'?'Локальный снимок':'Сцена в проекте'):esc(scope.label)}${scope.camera?`<span class="spacer"></span><span>FOV</span><input aria-label="FOV выбранной камеры" id="camera-fov" ${tip("ЛКМ + движение — FOV; Shift — точнее")} type="number" min="15" max="100" step="0.1" value="${state.fov[state.owner+state.format]??(state.format==='desktop'?46:54)}" style="width:36px;height:20px;background:var(--input);border:0;border-radius:3px;text-align:right;font-size:10px;padding:2px"><span>°</span>`:''}</div></div><div class="inspector-tabs"><button data-param-tab="all" class="${state.paramsTab==='all'?'active':''}">Параметры</button><button data-param-tab="pinned" class="${state.paramsTab==='pinned'?'active':''}">${icon('star')}Избранное</button><span class="spacer"></span>${n.id==='camera'&&state.paramsTab==='all'?'':`<button data-action="collapse-sections" aria-label="Свернуть разделы" ${tip('Свернуть или развернуть группы параметров')}>${icon('chevron')}</button>`}</div>${n.id!=='camera'?`<div class="params-filter">${icon('search')}<input type="search" id="params-filter" aria-label="Найти параметр" placeholder="Найти параметр…" value="${esc(state.filter)}"></div>`:''}<div class="inspector-scroll">${inspectorContent()}</div><div class="inspector-bottom"><span>${state.paramsTab==='pinned'?'Избранные параметры':''}</span><span class="spacer"></span><button data-action="language" ${tip('Язык коротких подписей параметров')}>${state.lang.toUpperCase()}${icon('chevron')}</button></div>`;
}
function inspectorContent(){
 if(currentNode().id==='camera'&&state.paramsTab==='all')return cameraManager();
 const q=state.filter.toLowerCase();
 const candidates=state.paramsTab==='pinned'?nodes:[currentNode()];
 const blocks=candidates.flatMap(n=>n.sections.map((s,idx)=>{const fields=s.fields.filter(f=>(state.paramsTab!=='pinned'||state.pins.has(`${n.id}:${f.id}`))&&`${f.label} ${f.en} ${f.hint}`.toLowerCase().includes(q));
 if(!fields.length)return '';const key=`${n.id}:${idx}`;const open=state.openSections[key]!==false||q;
 return `<details class="param-section" data-section="${key}" ${open?'open':''}><summary>${icon('chevron')}${state.paramsTab==='pinned'?esc(n.label)+' · ':''}${esc(s.title)}<span class="section-count">${fields.length}</span></summary>${fields.map(f=>fieldRow(n,f)).join('')}</details>`;}));
 return blocks.join('')||`<div class="empty">${state.paramsTab==='pinned'?'Наведите курсор на параметр и нажмите звёздочку, чтобы закрепить его здесь.':'Параметр не найден. Попробуйте поиск по всей сцене — ⌘K.'}</div>`;
}
function fieldRow(n,f){
 const v=getValue(n,f),key=`${n.id}:${f.id}`,label=textLabel(f),inputId=`p-${n.id}-${f.id}`;
 const attrs=`data-field="${esc(f.id)}" data-field-node="${n.id}"`;
 let control='';
 if(f.type==='range'){const fill=Math.max(0,Math.min(100,(v-f.min)/(f.max-f.min)*100));control=`<input id="${inputId}" type="range" ${attrs} min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" style="--fill:${fill}%" aria-label="${esc(label)}"><input class="value" type="number" ${attrs} ${tip("ЛКМ + движение — изменить; Shift — точнее; клик — ввести число")} min="${f.min}" max="${f.max}" step="${f.step}" value="${num(v)}" aria-label="${esc(label)} — точное значение"><span class="unit">${esc(f.unit)}</span>`;}
 if(f.type==='toggle')control=`<label class="switch"><input id="${inputId}" type="checkbox" ${attrs} ${v?'checked':''} aria-label="${esc(label)}"><span></span></label>`;
 if(f.type==='select')control=`<select id="${inputId}" ${attrs} aria-label="${esc(label)}">${f.options.map(o=>`<option value="${esc(o)}" ${String(v)===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
 if(f.type==='color')control=`<input id="${inputId}" type="color" ${attrs} value="${esc(v)}" aria-label="${esc(label)}"><span class="hex">${esc(v)}</span>`;
 return `<div class="param-row" data-row="${esc(key)}"><button class="pin ${state.pins.has(key)?'active':''}" data-pin="${esc(key)}" aria-label="${state.pins.has(key)?'Открепить':'Закрепить'} ${esc(label)}" ${tip('Закрепить параметр в избранном')}>${icon('star')}</button><label for="${inputId}" ${tip(f.hint||f.label,f.en)}>${esc(label)}</label>${control}</div>`;
}
function renderViewport(){
 const n=currentNode();
 $('.view-tools').innerHTML=`${ib('cursor','tool-select','Выбор объекта',`aria-pressed="${state.tool==='select'}"`)}${n.gizmo?`${ib('move','tool-move','Перемещение · G',`aria-pressed="${state.tool==='move'}"`)}${n.gizmo==='object'?`${ib('rotate','tool-rotate','Поворот по Y · R',`aria-pressed="${state.tool==='rotate'}"`)}${ib('scale','tool-scale','Равномерный масштаб · S',`aria-pressed="${state.tool==='scale'}"`)}`:''}<div class="tool-divider"></div>`:''}${ib('hand','navigation','Управление обзором: орбита и свободный полёт')}`;
 $('#frame-guide').innerHTML=state.format==='mobile'?'<div class="frame-guide" aria-label="Вертикальный кадр"></div>':'';
 $('#gizmo-wrap').innerHTML=n.gizmo&&state.gizmoShown?`<div class="gizmo" data-gizmo="true" role="img" aria-label="${esc(n.label)} — схема ${state.tool==='rotate'?'поворота':state.tool==='scale'?'масштабирования':'перемещения'}"><svg viewBox="0 0 160 145">${state.tool==='rotate'?'<ellipse cx="80" cy="72" rx="62" ry="26" fill="none" stroke="#c7d4bb" stroke-width="2"/><path d="m139 72-7-6 1 10" fill="#c7d4bb"/>':state.tool==='scale'?'<path d="M80 74 132 98M80 74 28 98" stroke="#e4d4aa" stroke-width="2"/><rect x="127" y="93" width="9" height="9" fill="#e4d4aa"/><rect x="22" y="94" width="9" height="9" fill="#e4d4aa"/>':`<path d="M80 74 135 98" stroke="#d89681" stroke-width="2"/><path d="m135 98-11-2 4-8Z" fill="#d89681"/><path d="M80 74 28 99" stroke="#96b9d1" stroke-width="2"/><path d="m28 99 7-10 5 8Z" fill="#96b9d1"/>${n.gizmo==='light'?'<path d="M80 74V17" stroke="#bfd1a5" stroke-width="2"/><path d="m80 17-5 11h10Z" fill="#bfd1a5"/>':''}`}<circle cx="80" cy="74" r="5" fill="#eee6d2" stroke="#222" stroke-width="1"/></svg><span class="gizmo-label glass">${esc(n.label)}</span></div>`:'';
 renderCameraStrip();
 const gizmo=$('.gizmo');if(gizmo){gizmo.addEventListener('pointerdown',e=>{e.preventDefault();gizmo.setPointerCapture(e.pointerId);const start={x:e.clientX,y:e.clientY,left:gizmo.offsetLeft,top:gizmo.offsetTop};gizmo.onpointermove=m=>{const r=$('.viewport').getBoundingClientRect();gizmo.style.left=Math.min(r.width-60,Math.max(60,start.left+m.clientX-start.x))+'px';gizmo.style.top=Math.min(r.height-75,Math.max(75,start.top+m.clientY-start.y))+'px';};gizmo.onpointerup=()=>{gizmo.onpointermove=null;toast('В эскизе перемещается манипулятор. Сам кадр статичен.');};});}
}
function cameraTile(c){return `<button class="camera-tile ${state.owner===c.id?'active':''}" data-owner="${c.id}" ${tip(`${c.name} — ${c.kind==='work'?'локальный рабочий снимок':'сцена для публикации'}`)}>${refSvg()}<span>${esc(c.name)}</span></button>`;}
function renderCameraStrip(){
  const host=$('#camera-strip');
  if(!host)return;
  const scrollLeft=host.querySelector('.camera-strip-scroll')?.scrollLeft||0;
  host.innerHTML=state.cameraStrip?`<div class="camera-strip glass" data-camera-strip tabindex="0" aria-label="Лента камер. Колесо, перетягивание или стрелки листают ленту."><div class="camera-strip-scroll"><span class="strip-label">РАБОЧИЕ</span>${state.cameras.filter(c=>c.kind==='work').map(cameraTile).join('')}<span class="strip-label strip-label--scenes">СЦЕНЫ</span>${state.cameras.filter(c=>c.kind==='scene').map(cameraTile).join('')}</div><button class="camera-tile add" data-camera-add-menu aria-label="Добавить камеру">${icon('plus')}</button></div>`:'';
  const scroller=host.querySelector('.camera-strip-scroll');
  if(scroller)scroller.scrollLeft=scrollLeft;
  window.OuroborosCameraStrip?.enhance?.(host);
}
function cameraManager(){const group=(kind,title,meta)=>{const cameras=state.cameras.filter(c=>c.kind===kind);return `<section class="camera-section camera-section--${kind}" aria-label="${title}"><div class="camera-section-head">${icon(kind==='work'?'lock':'camera')}<div><strong>${title}</strong><small>${meta}</small></div><span class="spacer"></span><button class="icon tiny" data-add-camera="${kind}" aria-label="Добавить ${kind==='work'?'рабочую камеру':'сцену'}" ${tip(kind==='work'?'Добавить локальный рабочий снимок':'Добавить сцену для публикации')}>${icon('plus')}</button></div><div class="camera-section-list">${cameras.map(c=>`<div class="camera-list-card ${state.owner===c.id?'active':''} ${c.kind==='scene'&&c.enabled===false?'disabled':''}"><div class="camera-card-top"><button data-owner="${c.id}">${icon(c.kind==='work'?'lock':'camera')}<span>${esc(c.name)}</span></button>${ib('more',`camera-menu:${c.id}`,'Настройки камеры')}</div><div class="camera-card-meta"><span>Desktop · Mobile${kind==='scene'?` · ${Number(c.holdSeconds??8)} с`:''}</span><button class="capture" data-capture="${c.id}" aria-label="Захватить ракурс ${esc(c.name)}" ${tip('Захватить текущий ракурс только в выбранный формат этой камеры')}>${icon('capture')}</button></div></div>`).join('')}</div></section>`;};return `<div class="camera-manager">${group('work','Рабочие камеры','Только этот браузер · в публикацию не входят')}${group('scene','Сцены','Порядок и включение входят в проект')}</div>`;}
function chooseNode(id){const n=nodeMap.get(id);if(!n)return;state.node=id;state.domain=n.domain;state.selectedByDomain[n.domain]=id;state.filter='';state.treeFilter='';state.navOpen=false;state.inspectorHidden=false;state.paramsTab='all';state.tool=n.gizmo?'move':'select';state.gizmoShown=Boolean(n.gizmo);const u=new URL(location.href);u.searchParams.set('node',id);history.replaceState(null,'',u);render();}
function chooseDomain(id){const hasTree=nodes.filter(n=>n.domain===id).length>1;if(state.domain===id&&state.layout!=='studio'){state.navOpen=hasTree&&!state.navOpen;setClasses();return;}chooseNode(state.selectedByDomain[id]||nodes.find(n=>n.domain===id).id);if(state.layout!=='studio'){state.navOpen=hasTree;setClasses();}}
function changeLayout(id){state.layout=id;state.navOpen=false;state.focus=false;state.inspectorHidden=false;document.documentElement.style.removeProperty('--inspector');const u=new URL(location.href);u.searchParams.set('layout',id);history.replaceState(null,'',u);render();}
function setOwner(id){if(!state.cameras.some(c=>c.id===id))return;state.owner=id;state.undo=[];state.redo=[];render();}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300);}
const dialog=$('#dialog');
function closeDialog(){dialog.close();dialog.className='';$('#tooltip').hidden=true;}
function openDialog(title,body,footer='',className=''){dialog.className=className;dialog.setAttribute('aria-labelledby','dialog-title');dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-foot">${footer}</div>`:''}`;if(!dialog.open)dialog.showModal();}
function saveDialog(kind){
 const c=currentCamera();const isPublish=kind==='publish';
 openDialog(isPublish?'Публикация на сайт':'Сохранение в проект',`<p>Обычные сцены и их два формата кадра.</p><div class="info-line"><span>Сейчас выбрана</span><strong>${esc(c.name)} · ${c.kind==='work'?'рабочая камера':'сцена'}</strong></div><div class="info-line"><span>В проект</span><span>${state.cameras.filter(c=>c.kind==='scene').map(c=>esc(c.name)).join(', ')}<br><span class="muted">Начальное состояние — из первой обычной сцены.</span></span></div><div class="info-line"><span>Остаётся локально</span><span>Рабочие камеры, настройки редактора</span></div>${c.kind==='work'?'<div class="inline-note">Правки текущей рабочей камеры остаются в её локальном снимке. Для подготовки публикации выберите обычную сцену.</div>':''}${isPublish?'<div class="inline-note">В рабочем редакторе это действие сохраняет файл, создаёт коммит и обновляет живой сайт.</div>':''}`,`<span>Эскиз: файлы и сайт не изменятся.</span><span class="spacer"></span><button data-action="close-dialog">Отмена</button><button class="primary" data-action="demo-${kind}">${isPublish?'Опубликовать':'В проект'}</button>`);
}
function showProject(){openDialog('Азовское побережье',`<p>Три состояния проекта всегда различимы.</p><div class="info-line"><span>В браузере</span><span>${icon('check')} Автосохранение · ${esc(currentCamera().name)}</span></div><div class="info-line"><span>В проекте</span><span>Обычные сцены и настройки</span></div><div class="info-line"><span>На сайте</span><span>Последняя опубликованная версия</span></div>`);}
function showAbout(){openDialog('Фокус · выбранная схема',`<p>Компактный инспектор справа, объекты по запросу, камеры в нижней ленте.</p><div class="info-line"><span>Цветные метки</span><span>ПКМ на группе или объекте. Значок в инспекторе открывает ту же палитру из 15 цветов.</span></div><div class="info-line"><span>Числа</span><span>ЛКМ + движение влево / вправо. Shift — точнее, Esc — отменить жест. Клик — ввести число.</span></div><div class="info-line"><span>Панель</span><span>Корешок сворачивает её к правому краю; потяните границу для изменения ширины.</span></div><div class="info-line"><span>Камеры</span><span>Лента прокручивается колесом, трекпадом и перетаскиванием. Рабочие камеры отделены от сцен.</span></div><div class="inline-note">Статичный кадр и демонстрационные значения. Цветные метки сохраняются только в этом эскизе; основной редактор и сайт не изменяются.</div>`);}

function showHelp(){
 const row=(label,keys)=>`<div class="shortcut-row"><span>${label}</span>${keys.map(k=>`<kbd>${k}</kbd>`).join('')}</div>`;
 openDialog('Горячие клавиши',`<p>Подсказки также появляются при наведении на кнопку или её фокусе с клавиатуры.</p><div class="shortcut-section">Уже есть в движке</div>${row('Пауза / продолжить',['Пробел'])}${row('Перемещение объекта',['G'])}${row('Поворот объекта',['R'])}${row('Равномерный масштаб',['S'])}${row('Скрыть манипулятор',['Esc'])}${row('Полёт при фокусе сцены',['W','A','S','D','Q','E'])}${row('Ускорить полёт',['Shift'])}<div class="shortcut-section">Предложения · работают в этом эскизе</div>${row('Найти объект, параметр или команду',['⌘','K'])}${row('Отменить / повторить параметр',['⌘Z','⌘⇧Z'])}${row('Скрыть / вернуть панели',['Tab'])}${row('Изменять число',['ЛКМ ↔'])}${row('Точное изменение числа',['Shift','ЛКМ ↔'])}${row('Отменить перетаскивание числа',['Esc'])}${row('Цвет значка в списке',['ПКМ'])}${row('Открыть эту памятку',['?'])}<div class="inline-note">G / R / S зависят от выбранного объекта. Свет и его цель поддерживают перемещение. В полях ввода горячие клавиши не мешают печатать. Tab с фокусом на контроле продолжает обычную навигацию.</div>`);
}
let searchResults=[],searchIndex=0;
function openSearch(initial=''){
 dialog.className='command-dialog';dialog.removeAttribute('aria-labelledby');dialog.innerHTML=`<div class="command-input">${icon('search')}<input id="command-search" type="search" role="combobox" aria-expanded="true" aria-controls="command-list" aria-autocomplete="list" placeholder="Объект, параметр или действие…" aria-label="Поиск по всем функциям" value="${esc(initial)}" autocomplete="off"><button class="icon" data-action="close-dialog" aria-label="Закрыть поиск">${icon('close')}</button></div><div class="command-results" id="command-list" role="listbox" aria-label="Результаты поиска"></div><div class="command-hint">Поиск по сцене<span class="spacer"></span><kbd>↑↓</kbd> выбрать <kbd>↵</kbd> открыть <kbd>Esc</kbd> закрыть</div>`;if(!dialog.open)dialog.showModal();renderSearch(initial);$('#command-search').focus();
}
function renderSearch(query){
 const q=query.trim().toLocaleLowerCase();const actions=[{title:'Камеры',sub:'Рабочие снимки и сцены',action:'cameras',icon:'camera'},{title:'Пауза / продолжить',sub:'Пробел',action:'pause',icon:'pause'},{title:'Скрыть панели',sub:'Режим фокуса · Tab',action:'focus',icon:'focus'},{title:'В проект',sub:'Сохранение обычных сцен',action:'save',icon:'upload'},{title:'Горячие клавиши',sub:'Памятка по управлению',action:'help',icon:'help'}];
 const nodeResults=nodes.map(n=>({title:textLabel(n),sub:`${n.domainLabel} / ${n.group}`,node:n.id,icon:n.icon,search:`${n.label} ${n.en} ${n.description}`}));
 const fieldResults=allFields().map(({n,s,f})=>({title:textLabel(f),sub:`${n.label} / ${s.title}`,node:n.id,field:f.id,icon:n.icon,search:`${f.label} ${f.en} ${f.hint} ${n.label}`}));
 const source=q?[...nodeResults,...fieldResults,...actions]:[...actions,...nodeResults.filter(r=>['water','sun','boat','terrain','clouds','post'].includes(r.node))];
 searchResults=source.filter(r=>!q||`${r.title} ${r.sub} ${r.search||''}`.toLowerCase().includes(q)).slice(0,35);searchIndex=0;
 $('.command-results').innerHTML=searchResults.map((r,i)=>`<button class="command-result ${i===0?'selected':''}" data-search-result="${i}" id="command-option-${i}" role="option" aria-selected="${i===0}">${icon(r.icon)}<span><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></span><span class="result-tail">${r.field?'Параметр':r.action?'Команда':'Объект'}</span></button>`).join('')||'<div class="empty">Ничего не найдено. Можно искать по-русски или по-английски.</div>';
 if(searchResults.length)$('#command-search').setAttribute('aria-activedescendant','command-option-0');else $('#command-search').removeAttribute('aria-activedescendant');
}
function runSearchResult(index){const r=searchResults[index];if(!r)return;closeDialog();if(r.action){action(r.action);return;}chooseNode(r.node);if(r.field){const field=$(`[data-row="${r.node}:${r.field}"]`);if(field){field.closest('details').open=true;field.scrollIntoView({block:'center'});field.classList.add('field-flash');$('input,select',field)?.focus();}}}
function moveCamera(id,direction){const from=state.cameras.findIndex(c=>c.id===id);const c=state.cameras[from];if(!c)return;const same=state.cameras.map((entry,index)=>({entry,index})).filter(({entry})=>entry.kind===c.kind);const at=same.findIndex(({entry})=>entry.id===id);const target=same[at+direction];if(!target)return;if(c.kind==='work'&&(c.main||target.entry.main))return;[state.cameras[from],state.cameras[target.index]]=[state.cameras[target.index],state.cameras[from]];cameraSettings(id);}
function removeCamera(id){const c=state.cameras.find(c=>c.id===id);if(!c||c.main)return;const same=state.cameras.filter(entry=>entry.kind===c.kind);if(c.kind==='scene'&&same.length<=1)return;state.cameras=state.cameras.filter(entry=>entry.id!==id);if(state.owner===id)state.owner=(c.kind==='work'?state.cameras.find(entry=>entry.main):state.cameras.find(entry=>entry.kind==='scene'))?.id||'work1';closeDialog();render();toast(`Камера «${c.name}» удалена только из эскиза.`);}
function cameraSettings(id){const c=state.cameras.find(c=>c.id===id);if(!c)return;const peers=state.cameras.filter(entry=>entry.kind===c.kind);const index=peers.findIndex(entry=>entry.id===id);const canEarlier=index>0&&!(c.kind==='work'&&(c.main||peers[index-1].main));const canLater=index<peers.length-1&&!c.main;const canDelete=!c.main&&(c.kind==='work'||peers.length>1);const sceneControls=c.kind==='scene'?`<label class="info-line"><span>В слайдшоу</span><input type="checkbox" data-camera-enabled="${id}" ${c.enabled!==false?'checked':''} aria-label="Включить ${esc(c.name)} в слайдшоу"></label><label class="info-line"><span>Задержка, с</span><input type="number" data-camera-delay="${id}" min="1" max="3600" step="0.5" value="${Number(c.holdSeconds??8)}" aria-label="Задержка камеры в секундах"></label>`:'';openDialog('Настройки камеры',`<label style="display:block;font-size:11px;color:var(--muted);margin:0 0 6px" for="rename-camera">Название</label><input id="rename-camera" value="${esc(c.name)}" data-rename-camera="${id}" type="text"><div class="info-line"><span>Назначение</span><span>${c.kind==='work'?'Рабочий снимок · только локально':'Обычная сцена · входит в проект'}</span></div><div class="info-line"><span>Формат</span><span>Desktop + Mobile</span></div>${sceneControls}<div class="info-line"><span>Порядок</span><span><button class="icon tiny" data-camera-move="${id}" data-direction="-1" aria-label="Переместить раньше" ${canEarlier?'':'disabled'}>${icon('undo')}</button><button class="icon tiny" data-camera-move="${id}" data-direction="1" aria-label="Переместить позже" ${canLater?'':'disabled'}>${icon('redo')}</button></span></div><div class="inline-note">Камера хранит весь вид: ландшафт, объекты, свет и обработку. Захват ракурса меняет только выбранный формат.</div>`,`<span>${c.main?'Главная рабочая камера':c.kind==='scene'?'Сцена для публикации':'Локальная закладка'}</span><span class="spacer"></span><button data-camera-delete="${id}" ${canDelete?'':'disabled'}>${c.main?'Главную удалить нельзя':'Удалить'}</button><button class="primary" data-action="close-dialog">Готово</button>`);}
function bindResize(){
 const grip=$('.inspector-resize');if(!grip)return;
 let drag=null;
 const finish=(cancel=false)=>{if(!drag)return;const was=drag;drag=null;document.body.classList.remove('panel-resizing');if(cancel){document.documentElement.style.setProperty('--inspector',was.width+'px');}else if(!was.moved){action('panel');}try{grip.releasePointerCapture(was.id);}catch{}};
 grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,width:$('.inspector').getBoundingClientRect().width,moved:false};grip.setPointerCapture(e.pointerId);});
 grip.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x;if(!drag.moved&&Math.abs(dx)<4)return;drag.moved=true;document.body.classList.add('panel-resizing');const width=Math.max(280,Math.min(420,drag.width-dx));document.documentElement.style.setProperty('--inspector',width+'px');grip.setAttribute('aria-valuenow',width);});
 grip.addEventListener('pointerup',()=>finish());grip.addEventListener('pointercancel',()=>finish(true));grip.addEventListener('lostpointercapture',()=>finish(true));
 grip.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const width=Math.max(280,Math.min(420,$('.inspector').getBoundingClientRect().width+(e.key==='ArrowLeft'?10:-10)));document.documentElement.style.setProperty('--inspector',width+'px');grip.setAttribute('aria-valuenow',width);}if(e.key==='Enter'){e.preventDefault();action('panel');}});
}

function action(name){
 if(name.startsWith('camera-menu:')){cameraSettings(name.split(':')[1]);return;}
 if(name.startsWith('tool-')){const mode=name.slice(5);state.tool=mode;state.gizmoShown=mode!=='select'&&Boolean(currentNode().gizmo);renderViewport();return;}
 switch(name){
 case 'about':showAbout();break;
 case 'help':showHelp();break;
 case 'search':openSearch();break;
 case 'close-dialog':closeDialog();break;
 case 'project':showProject();break;
 case 'save':saveDialog('save');break;
 case 'publish':saveDialog('publish');break;
 case 'demo-save':saveBaseline();closeDialog();toast('Демонстрация: обычные сцены сохранены в проект.');state.dirty=false;render();break;
 case 'demo-publish':saveBaseline();state.dirty=false;closeDialog();render();toast('Демонстрация публикации завершена. Живой сайт не менялся.');break;
 case 'revert':openDialog('Откатить к проекту?',`<p>Обычные сцены вернутся к опубликованному состоянию. Рабочие камеры и настройки редактора сохранятся.</p><div class="inline-note">Здесь действие сбросит только демонстрационные значения обычных сцен этого эскиза.</div>`,`<button data-action="close-dialog">Отмена</button><span class="spacer"></span><button class="primary" data-action="confirm-revert">Откатить</button>`);break;
 case 'confirm-revert':for(const key of Object.keys(state.values)){if(key.startsWith('scene')||key.startsWith('global:'))delete state.values[key];}Object.assign(state.values,projectBaseline.values);state.hidden=new Set([...state.hidden].filter(k=>k.startsWith('work')).concat(projectBaseline.hidden));for(const key of Object.keys(state.fov)){if(key.startsWith('scene'))delete state.fov[key];}Object.assign(state.fov,projectBaseline.fov);state.cameras=[...state.cameras.filter(c=>c.kind==='work'),...projectBaseline.cameras.map(c=>({...c}))];state.owner=projectBaseline.cameras[0].id;state.undo=[];state.redo=[];state.dirty=false;closeDialog();render();toast('Обычные сцены эскиза восстановлены; рабочие снимки сохранены.');break;
 case 'pause':state.paused=!state.paused;render();toast(state.paused?'Анимация приостановлена — пример состояния кнопки.':'Анимация включена — в эскизе используется неподвижный кадр.');break;
 case 'preview':state.preview=!state.preview;render();break;
 case 'tree':state.navOpen=!state.navOpen;setClasses();break;
 case 'close-nav':state.navOpen=false;setClasses();break;
 case 'panel':state.inspectorHidden=!state.inspectorHidden;setClasses();break;
 case 'focus':state.focus=!state.focus;state.navOpen=false;render();break;
 case 'strip':state.cameraStrip=!state.cameraStrip;renderViewport();break;
 case 'cameras':chooseNode('camera');break;
 case 'language':state.lang=state.lang==='ru'?'en':'ru';renderTree();renderInspector();bindResize();break;
 case 'node-info':openDialog(currentNode().label,`<p>${esc(currentNode().description)}</p><div class="info-line"><span>Область</span><span>${esc(currentNode().domainLabel)} / ${esc(currentNode().group)}</span></div><div class="info-line"><span>Правки</span><span>${esc(currentCamera().name)} · полный снимок сцены</span></div>`);break;
 case 'collapse-sections':{const items=$$('.param-section',$('.inspector'));const close=items.some(d=>d.open);for(const d of items){d.open=!close;if(d.dataset.section)state.openSections[d.dataset.section]=!close;}break;}
 case 'technical':openDialog('Технические виды',`<p>Осмотр сцены без перезаписи сохранённых камер.</p><div class="technical-list">${['Вдоль берега','К морю','Кромка прибоя','Танкер','Лодка','Скульптура','Пруд сверху'].map(n=>`<button data-technical="${n}">${icon('eye')}${n}</button>`).join('')}</div>`);break;
 case 'navigation':openDialog('Управление обзором',`<div class="info-line"><span>Орбита</span><span>Перетягивание мышью или трекпадом по сцене</span></div><div class="info-line"><span>Свободный полёт</span><span>Фокус на сцене · W A S D Q E</span></div><div class="info-line"><span>Ускорение</span><span>Shift</span></div><div class="info-line"><span>Объекты</span><span>Выберите лодку, скульптуру или источник света. Манипулятор появится рядом с объектом.</span></div><div class="inline-note">Навигация камерой здесь схематична. Для сравнения компоновок используется неподвижный кадр.</div>`);break;
 case 'undo':historyStep(false);break;
 case 'redo':historyStep(true);break;
 }
}
function historyStep(redo){const source=redo?state.redo:state.undo,target=redo?state.undo:state.redo;const item=source.pop();if(!item)return;state.values[item.key]=redo?item.after:item.before;target.push(item);state.dirty=true;render();}
function commitField(el,final=false){
 const n=nodeMap.get(el.dataset.fieldNode);if(!n)return;const f=n.sections.flatMap(s=>s.fields).find(f=>f.id===el.dataset.field);if(!f)return;
 let v=el.type==='checkbox'?el.checked:el.value;if(f.type==='range'){if(el.value===''){if(final)el.value=getValue(n,f);return;}const raw=Number(v);if(!Number.isFinite(raw))return;if(!final&&el.type==='number'&&(raw<f.min||raw>f.max))return;v=Math.min(f.max,Math.max(f.min,raw));}
 const key=valueKey(n.id,f.id),before=getValue(n,f);if(final&&el.type==='number')el.value=v;if(before===v||(f.type==='select'&&String(before)===String(v)))return;
 state.values[key]=v;state.dirty=true;
 // Coalesce a drag/typing gesture into one undo item; change ends the gesture.
 const last=state.undo[state.undo.length-1];if(last&&last.key===key&&last.gesture){last.after=v;}else state.undo.push({key,before,after:v,gesture:true});state.redo=[];
 const row=el.closest('.param-row');if(row){for(const input of $$('input',row)){if(input===el)continue;if(input.type==='checkbox')input.checked=Boolean(v);else input.value=v;}const range=$('input[type=range]',row);if(range)range.style.setProperty('--fill',((v-f.min)/(f.max-f.min)*100)+'%');const hex=$('.hex',row);if(hex)hex.textContent=v;}
 const dot=$('.draft-state .dot');if(dot)dot.classList.add('dirty');
 const undo=$('[data-action=undo]');if(undo)undo.disabled=false;
}
document.addEventListener('click',e=>{
 const target=e.target.closest('button,[data-owner]');if(!target)return;
 if(target.dataset.layoutChoice){changeLayout(target.dataset.layoutChoice);if(target.hasAttribute('data-close-after'))closeDialog();return;}
 if(target.dataset.domain){chooseDomain(target.dataset.domain);return;}
 if(target.dataset.node){chooseNode(target.dataset.node);return;}
 if(target.dataset.format){state.format=target.dataset.format;render();return;}
 if(target.dataset.owner){setOwner(target.dataset.owner);return;}
 if(target.dataset.visibility){const id=target.dataset.visibility;state.hidden.has(state.owner+':'+id)?state.hidden.delete(state.owner+':'+id):state.hidden.add(state.owner+':'+id);renderTree();renderInspector();bindResize();toast(`${nodeMap.get(id).label}: видимость ${state.hidden.has(state.owner+':'+id)?'выключена':'включена'} в эскизе.`);return;}
 if(target.dataset.paramTab){state.paramsTab=target.dataset.paramTab;state.filter='';renderInspector();bindResize();return;}
 if(target.dataset.pin){const key=target.dataset.pin;state.pins.has(key)?state.pins.delete(key):state.pins.add(key);const scroller=$('.inspector-scroll'),top=scroller.scrollTop;scroller.innerHTML=inspectorContent();scroller.scrollTop=top;return;}
 if(target.dataset.searchResult){runSearchResult(Number(target.dataset.searchResult));return;}
 if(target.dataset.capture){const c=state.cameras.find(c=>c.id===target.dataset.capture);toast(`Ракурс «${c.name}» захвачен для ${state.format==='desktop'?'Desktop':'Mobile'} — демонстрация.`);return;}
 if(target.dataset.cameraMove){moveCamera(target.dataset.cameraMove,Number(target.dataset.direction));return;}
 if(target.dataset.cameraDelete){removeCamera(target.dataset.cameraDelete);return;}
 if(target.dataset.addCamera){const kind=target.dataset.addCamera;const count=state.cameras.filter(c=>c.kind===kind).length+1;const id=(kind==='work'?'work':'scene')+Date.now();state.cameras.push({id,name:(kind==='work'?'Рабочая ':'Сцена ')+count,kind,...(kind==='scene'?{enabled:true,holdSeconds:8}:{})});state.owner=id;render();toast('Новый снимок добавлен только в эскиз.');return;}
 if(target.dataset.technical){if(dialog.open)closeDialog();toast(`Технический вид «${target.dataset.technical}» — сохранённые камеры не изменяются.`);return;}
 if(target.dataset.action)action(target.dataset.action);
});
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.id==='tree-filter'){state.treeFilter=el.value;$('.tree-scroll').innerHTML=treeContent();return;}
 if(el.id==='params-filter'){state.filter=el.value;$('.inspector-scroll').innerHTML=inspectorContent();return;}
 if(el.id==='command-search'){renderSearch(el.value);return;}
 if(el.id==='camera-fov'){if(el.value!=='')state.fov[state.owner+state.format]=Math.min(100,Math.max(15,Number(el.value)));return;}
 if(el.dataset.renameCamera){const c=state.cameras.find(c=>c.id===el.dataset.renameCamera);if(c)c.name=el.value||'Камера';return;}
 if(el.dataset.cameraDelay){const c=state.cameras.find(c=>c.id===el.dataset.cameraDelay);if(c&&el.value!=='')c.holdSeconds=Math.min(3600,Math.max(1,Number(el.value)||1));return;}
 if(el.dataset.field)commitField(el);
});
document.addEventListener('change',e=>{
 if(e.target.id==='camera-fov'){e.target.value=String(state.fov[state.owner+state.format]??(state.format==='desktop'?46:54));return;}
 if(e.target.dataset.cameraDelay){const c=state.cameras.find(c=>c.id===e.target.dataset.cameraDelay);if(c)e.target.value=String(c.holdSeconds??8);return;}
 if(e.target.dataset.nodeVisible){const id=e.target.dataset.nodeVisible;e.target.checked?state.hidden.delete(state.owner+':'+id):state.hidden.add(state.owner+':'+id);renderTree();return;}
 if(e.target.dataset.cameraEnabled){const c=state.cameras.find(c=>c.id===e.target.dataset.cameraEnabled);if(c)c.enabled=e.target.checked;return;}
 if(e.target.dataset.field){commitField(e.target,true);const last=state.undo[state.undo.length-1];if(last)last.gesture=false;}
});
document.addEventListener('toggle',e=>{if(e.target.dataset?.section)state.openSections[e.target.dataset.section]=e.target.open;},true);
dialog.addEventListener('close',()=>{hideTip();if($('[data-rename-camera]',dialog))render();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
document.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.code==='KeyK'){e.preventDefault();openSearch();return;}
 if(dialog.open){if($('#command-search')){if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();searchIndex=Math.max(0,Math.min(searchResults.length-1,searchIndex+(e.key==='ArrowDown'?1:-1)));$$('.command-result').forEach((r,i)=>{r.classList.toggle('selected',i===searchIndex);r.setAttribute('aria-selected',i===searchIndex);});$('#command-search').setAttribute('aria-activedescendant','command-option-'+searchIndex);$('.command-result.selected')?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'){e.preventDefault();runSearchResult(searchIndex);}}return;}
 const typing=e.target.matches('input,select,textarea,[contenteditable=true]');if(typing)return;
 if((e.metaKey||e.ctrlKey)&&e.code==='KeyZ'){e.preventDefault();historyStep(e.shiftKey);return;}
 if(e.code==='Space'&&!e.target.closest('button,summary,[role=button]')){e.preventDefault();action('pause');return;}
 if(e.key==='?'){e.preventDefault();showHelp();return;}
 if(e.key==='Escape'){state.gizmoShown=false;state.navOpen=false;setClasses();renderViewport();return;}
 if(e.key==='Tab'&&!e.target.closest('button,a,summary,[tabindex]')){e.preventDefault();action('focus');return;}
 if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&currentNode().gizmo){const mode={KeyG:'move',KeyR:'rotate',KeyS:'scale'}[e.code];if(mode&&(currentNode().gizmo==='object'||mode==='move')){e.preventDefault();state.tool=mode;state.gizmoShown=true;renderViewport();}}
});
let tipTimer,tipTarget;
function showTip(target){if(!target||!state.tooltipEnabled)return;const t=$('#tooltip');t.innerHTML=`${esc(target.dataset.tip)}${target.dataset.tipEn?`<small>${esc(target.dataset.tipEn)}</small>`:''}`;t.hidden=false;const r=target.getBoundingClientRect(),tr=t.getBoundingClientRect();let x=r.left+r.width/2-tr.width/2,y=r.bottom+8;if(y+tr.height>innerHeight-12)y=r.top-tr.height-8;t.style.left=Math.max(10,Math.min(innerWidth-tr.width-10,x))+'px';t.style.top=Math.max(8,y)+'px';}
function hideTip(){clearTimeout(tipTimer);$('#tooltip').hidden=true;tipTarget=null;}
document.addEventListener('mouseover',e=>{const t=e.target.closest('[data-tip]');if(t===tipTarget)return;hideTip();if(t){tipTarget=t;tipTimer=setTimeout(()=>showTip(t),500);}});
document.addEventListener('mouseout',e=>{if(tipTarget&&!tipTarget.contains(e.relatedTarget))hideTip();});
document.addEventListener('focusin',e=>{const t=e.target.closest('[data-tip]');if(t){hideTip();tipTarget=t;tipTimer=setTimeout(()=>showTip(t),600);}});
document.addEventListener('focusout',hideTip);document.addEventListener('pointerdown',hideTip);document.addEventListener('scroll',hideTip,true);
let scrubCheckpoint=null;
window.setupOuroborosNumericScrub({
 selector:'.param-row input.value[type="number"], #camera-fov, [data-camera-delay]',
 onStart({input}){
   hideTip();scrubCheckpoint={input,values:{...state.values},fov:{...state.fov},cameras:state.cameras.map(c=>({...c})),undo:state.undo.map(item=>({...item})),redo:state.redo.map(item=>({...item})),dirty:state.dirty};
   const last=state.undo.at(-1);if(last)last.gesture=false;
 },
 onCommit(){scrubCheckpoint=null;},
 onCancel({input}){const saved=scrubCheckpoint;scrubCheckpoint=null;if(!saved||saved.input!==input)return;Object.assign(state,{values:saved.values,fov:saved.fov,cameras:saved.cameras,undo:saved.undo,redo:saved.redo,dirty:saved.dirty});render();return false;}
});
render();
})();
