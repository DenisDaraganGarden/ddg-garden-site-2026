import React from 'react';

const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    terrain: <><path d="m2 19 6-12 4 7 3-5 7 10Z"/><path d="m6 11 3 2 2-1"/></>,
    water: <path d="M2 7c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 12c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 17c3-4 5 4 8 0s5 4 8 0 4 0 4 0"/>,
    leaf: <><path d="M20 3C10 2 2 8 6 16s17 0 14-13Z"/><path d="M3 21 16 8"/></>,
    box: <><path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10M7 4.8l9 5"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.5 1.5m12.6 12.6 1.5 1.5m0-15.6-1.5 1.5M5.7 18.3l-1.5 1.5"/></>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/></>,
    sliders: <><path d="M4 3v18M12 3v18M20 3v18"/><path d="M1 8h6m2 8h6m2-10h6" strokeWidth="3"/></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    settings: <><path d="m10 2-.7 3-2.5 1.4-3-.6-2 3 2.2 2.3v2.8l-2 2.3 2 3 3-.6L9.3 20l.7 3h4l.7-3 2.5-1.4 3 .6 2-3-2.2-2.3v-2.8l2-2.3-2-3-3 .6L14.7 5 14 2Z" transform="translate(0 -1) scale(1 .96)"/><circle cx="12" cy="12" r="3"/></>,
    cloud: <path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11Z"/>,
    eye: <><path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    cursor: <path d="m4 2 15 11-7 1-4 7Z"/>,
    light: <><path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0l-1 3H9Z"/></>,
    target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    fish: <><path d="M17 12c-5-8-11-6-15 0 4 6 10 8 15 0l5 5V7Z"/><circle cx="6" cy="11" r=".6" fill="currentColor" stroke="none"/></>,
    bird: <path d="M3 14c3-5 6-5 9 0 3-5 6-5 9 0"/>,
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
            {paths[name] ?? paths.box}
        </svg>
    );
}
