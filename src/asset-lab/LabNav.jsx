import React, { useMemo } from 'react';
import { ASSET_CATALOG, ASSET_GROUPS } from './assetCatalog';
import { setLabLightMode, useLabLightMode } from './labLighting';

// Where «back to the editor» leads. Opened from the editor or the project menu
// on the same server: straight back to that page (its ?project= included).
// Otherwise the editor route of this server; the standalone lab server (41215,
// AGENTS.md §4) has no editor, so from there the link crosses to 41212.
function editorHref() {
  try {
    const from = document.referrer ? new URL(document.referrer) : null;
    if (from && from.origin === window.location.origin && /^\/(engine|home\/edit)/.test(from.pathname)) return from.href;
  } catch {
    // an unparsable referrer is no referrer
  }
  const { protocol, hostname, port, origin } = window.location;
  return `${port === '41215' ? `${protocol}//${hostname}:41212` : origin}/home/edit`;
}

// The same compact index on every page: one row per editor group, each entry a
// number and a short name, the current one dark, the full title in the tooltip.
export default function LabNav({ current, lang = 'ru', label }) {
  const light = useLabLightMode();
  const copy = lang === 'en'
    ? { light: 'Light', scene: 'Scene', studio: 'Studio', editor: 'Editor', back: 'Back to the editor' }
    : { light: 'Свет', scene: 'Сцена', studio: 'Студия', editor: 'Редактор', back: 'Вернуться в редактор' };
  const back = useMemo(editorHref, []);
  return (
    <nav className="lab-nav" aria-label={label ?? (lang === 'en' ? 'Collections' : 'Коллекции')}>
      <div className="lab-nav__group">{copy.editor}</div>
      <div className="lab-nav__items"><a href={back} data-testid="lab-back-to-editor">← {copy.back}</a></div>
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
      {/* One light for every collection: the home scene's sky and sun, or the white studio. */}
      <div className="lab-nav__group">{copy.light}</div>
      <div className="lab-nav__items">
        {['scene', 'studio'].map((mode) => (
          <button key={mode} type="button" aria-pressed={light === mode} onClick={() => setLabLightMode(mode)}>{copy[mode]}</button>
        ))}
      </div>
    </nav>
  );
}
