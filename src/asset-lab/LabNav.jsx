import React from 'react';
import { ASSET_CATALOG, ASSET_GROUPS } from './assetCatalog';

// The same compact index on every page: one row per editor group, each entry a
// number and a short name, the current one dark, the full title in the tooltip.
export default function LabNav({ current, lang = 'ru', label }) {
  return (
    <nav className="lab-nav" aria-label={label ?? (lang === 'en' ? 'Collections' : 'Коллекции')}>
      {ASSET_GROUPS.map((group) => (
        <React.Fragment key={group.id}>
          <div className="lab-nav__group">{group[lang] ?? group.ru}</div>
          <div className="lab-nav__items">
            {ASSET_CATALOG.filter((entry) => entry.group === group.id).map((entry) => (
              <a
                key={entry.id}
                href={`?collection=${entry.id}`}
                title={entry.title[lang] ?? entry.title.ru}
                aria-current={entry.id === current ? 'page' : undefined}
              >
                <b>{entry.index}</b> {entry[lang] ?? entry.ru}
              </a>
            ))}
          </div>
        </React.Fragment>
      ))}
    </nav>
  );
}
