import React from 'react';

const shapes = {
    all: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    bollard: <><path d="M8 21V5a4 4 0 0 1 8 0v16M6 21h12M8 8h8M10 11v6m4-6v6"/></>,
    inground: <><path d="M2 18h20M6 18v3h12v-3"/><ellipse cx="12" cy="16" rx="6" ry="2"/><path d="M12 10V3M7 11 5 6m12 5 2-5"/></>,
    spike: <><path d="m11 12-4 9M4 21h7"/><rect x="8" y="5" width="10" height="7" rx="1" transform="rotate(-30 13 8.5)"/><path d="m19 4 2-2m-1 7h3"/></>,
    wall: <><path d="M5 2v20M5 9h5m-5 6h5"/><rect x="10" y="8" width="8" height="8" rx="1"/><path d="m10 5 4-3 4 3m-8 14 4 3 4-3"/></>,
    step: <><path d="M2 7h10v7h10v7"/><rect x="4" y="10" width="5" height="2" rx=".5"/><path d="m5 15-2 3m5-3 2 3"/></>,
    post: <><path d="M12 21V6M8 21h8M6 6h12l-2-4H8ZM7 6v6h10V6m-5 0v6"/></>,
};

export function LuminaireKindIcon({ kind }) {
    return <svg className="lum-kind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[kind] ?? shapes.all}</svg>;
}
