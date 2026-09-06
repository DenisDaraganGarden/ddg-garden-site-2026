import React from 'react';
import { ASSET_CATALOG } from './assetCatalog';

// The same row of collection numbers on every page; the current one is dark,
// the name is in the tooltip. Any collection is one click away from any other.
export default function LabNav({ current, lang = 'ru', label }) {
  return (
    <nav className="lab-nav" aria-label={label ?? (lang === 'en' ? 'Collections' : 'Коллекции')}>
      {ASSET_CATALOG.map((entry) => (
        <a
          key={entry.id}
          href={`?collection=${entry.id}`}
          title={entry[lang] ?? entry.ru}
          aria-current={entry.id === current ? 'page' : undefined}
        >
          {entry.index}
        </a>
      ))}
    </nav>
  );
}
