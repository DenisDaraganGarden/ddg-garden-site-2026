import React from 'react';
import { focusActionPaths } from './focusActionPaths';

const paths = {
    picture: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-4 5 6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    terrain: <><path d="m2 19 6-12 4 7 3-5 7 10Z"/><path d="m6 11 3 2 2-1"/></>,
    water: <path d="M2 7c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 12c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 17c3-4 5 4 8 0s5 4 8 0 4 0 4 0"/>,
    leaf: <><path d="M20 3C10 2 2 8 6 16s17 0 14-13Z"/><path d="M3 21 16 8"/></>,
    bed: <><path d="M4 15c-2.5-5 2.5-10 8.5-9.5S22 9 19.5 14 6.5 21 4 15Z"/><circle cx="9" cy="12" r="1.3"/><circle cx="14" cy="10.5" r="1.3"/><circle cx="13" cy="15.5" r="1.3"/></>,
    // Лиана: побег по стене с листьями и усиком.
    vine: <><path d="M6 21c0-4 5-5 5-9s-4-4-4-8"/><path d="M11 12c2.5 0 4.5-1.5 4.5-4-2.5 0-4.5 1.5-4.5 4Z"/><path d="M8.5 17c-2.5 0-4-1.3-4-3.4 2.3 0 4 1.2 4 3.4Z"/><path d="M8 7c2 0 3-1.5 3-3.2"/><path d="M15.5 8c2.4.5 3.5 2.3 2.5 4.2-.8 1.4-2.6.9-2.3-.5"/></>,
    sprout: <><path d="M12 21v-9"/><path d="M12 12C12 7.5 8.5 5 4 5c0 4.5 3.5 7 8 7Z"/><path d="M12 14.5c0-4 3-6.5 8-6.5 0 4-3 6.5-8 6.5Z"/></>,
    box: <><path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10M7 4.8l9 5"/></>,
    // Расстановка: дерево, камень, копия, «на землю», удалить.
    tree: <><path d="M12 22v-7"/><path d="M12 15c-5 0-7-3-6-6 .4-1.4 1.6-2.1 2.4-2.2C9 4 10.6 2.8 12.4 3c2.2.2 3.4 1.9 3.5 3.5 2 .3 3.3 2 2.8 4-.6 2.6-3.2 4.5-6.7 4.5Z"/></>,
    rock: <path d="M3 18.5 6 11l4-4 6 1 4 5 1 5.5Z"/>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></>,
    ground: <><path d="M12 3v11m-4-4 4 4 4-4"/><path d="M3 19h18"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6"/></>,
    // Отметка уровня: стрелка остриём в поверхность, полочка, число.
    level: <><path d="M3 21h18"/><path d="m5.5 16.5 3 4.5 3-4.5"/><path d="M8.5 21V9h11"/><path d="M11 6h7" strokeWidth="1.2"/></>,
    // Ветер: три струи с завитками.
    wind: <><path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/></>,
    // ТЗ проекта: планшет с двумя отмеченными строками.
    brief: <><path d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v14A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 17.5 4H15"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><path d="m8.5 11 1.5 1.5 2.5-2.5M8.5 16.5 10 18l2.5-2.5M14.5 11.5H16M14.5 17H16"/></>,
    // Старт прогулки: флажок.
    flag: <><path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/></>,
    // Прогулка: идущий человек.
    walk: <><circle cx="13" cy="4" r="2"/><path d="m9 21 3-6 3 2v4"/><path d="m12 15 1-6-4 2-1 4"/><path d="m13 9 2 3 3 1"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.5 1.5m12.6 12.6 1.5 1.5m0-15.6-1.5 1.5M5.7 18.3l-1.5 1.5"/></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/></>,
    sliders: <><path d="M4 3v18M12 3v18M20 3v18"/><path d="M1 8h6m2 8h6m2-10h6" strokeWidth="3"/></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    settings: <><path d="m10 2-.7 3-2.5 1.4-3-.6-2 3 2.2 2.3v2.8l-2 2.3 2 3 3-.6L9.3 20l.7 3h4l.7-3 2.5-1.4 3 .6 2-3-2.2-2.3v-2.8l2-2.3-2-3-3 .6L14.7 5 14 2Z" transform="translate(0 -1) scale(1 .96)"/><circle cx="12" cy="12" r="3"/></>,
    cloud: <path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11Z"/>,
    eye: <><path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    cursor: <path d="m4 2 15 11-7 1-4 7Z"/>,
    light: <><path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0l-1 3H9Z"/></>,
    // Компас: кольцо и стрелка на север.
    compass: <><circle cx="12" cy="12" r="9"/><path d="m12 5 3.2 8.5L12 11.5l-3.2 2Z"/></>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    fish: <><path d="M17 12c-5-8-11-6-15 0 4 6 10 8 15 0l5 5V7Z"/><circle cx="6" cy="11" r=".6" fill="currentColor" stroke="none"/></>,
    bird: <path d="M3 14c3-5 6-5 9 0 3-5 6-5 9 0"/>,
    fire: <path d="M12 2c1 4.5 6 6 6 11.5A6 6 0 0 1 6 13.5c0-2.2 1.2-3.8 1.2-3.8S8 13 10 13c-.5-3.5-.5-6.5 2-11Z"/>,
    panel: <><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M15 3v18"/></>,
    bug: <><rect x="7" y="7" width="10" height="12" rx="4"/><path d="M12 3v4M4 9h3m10 0h3M4 15h3m10 0h3M9 3l1 2m5-2-1 2"/><circle cx="10" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".7" fill="currentColor" stroke="none"/></>,
};

export function FocusIcon({ name = 'box', title, className = '', ...props }) {
    return (
        <svg
            className={`focus-icon ${className}`.trim()}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            {...props}
        >
            {title ? <title>{title}</title> : null}
            {paths[name] ?? (focusActionPaths[name] ? <g dangerouslySetInnerHTML={{ __html: focusActionPaths[name] }} /> : paths.box)}
        </svg>
    );
}
