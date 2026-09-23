import React, { useSyncExternalStore } from 'react';
import { useLanguage } from '../../i18n/useLanguage';
import { getSurfPlaySnapshot, subscribeSurfPlay, surfPlay } from './surfPlayStore.js';
import './SurfHud.css';

const CAMERAS = {
  chase: ['сзади', 'chase'],
  first: ['глаза', 'first person'],
  side: ['с канала', 'from the channel'],
  orbit: ['вокруг', 'orbit'],
};
const KEYS = [
  ['W S', 'гребок · вес', 'paddle · weight'],
  ['A D', 'поворот', 'turn'],
  ['Space', 'прыжок', 'pop'],
  ['Shift', 'пампинг', 'pump'],
  ['C 1–4', 'камера', 'camera'],
  ['R', 'на чекпоинт', 'to checkpoint'],
  ['T', 'чекпоинт здесь', 'checkpoint here'],
  [['мышь', 'mouse'], 'обзор', 'look'],
  [['колесо', 'wheel'], 'ближе/дальше', 'closer/further'],
];
// Below this ground speed the physics has the rider lying down (boardPhysics'
// posture starts at 1.5 m/s), so with no stroke he is resting, not paddling.
const RESTING_SPEED = 1.5;

// The worst thing that is true wins: a wipeout is reported even mid-air. The
// board comes back on its own after a wipeout, so R is not asked for. «On the
// wave» means a breaker under the board, not any slope of the swell. The
// breaker share and the stroke are read live: the snapshot only says when to
// look again.
const rideState = ({ wipeout, airborne, planing, speed }) => (
  wipeout ? ['упал', 'wiped out']
    : airborne ? ['в воздухе', 'airborne']
      : surfPlay.board.onBreaker > 0.5 ? ['на волне', 'on the wave']
        : planing > 0.5 ? ['глиссирует', 'planing']
          : !surfPlay.input.forward && speed < RESTING_SPEED ? ['лежит', 'resting']
            : ['гребёт', 'paddling']
);

// What the rider needs at a glance and nothing else; the scene draws the rest.
export default function SurfHud({ onExit }) {
  const { language } = useLanguage();
  const pick = ([ru, en]) => (language === 'ru' ? ru : en);
  const snapshot = useSyncExternalStore(subscribeSurfPlay, getSurfPlaySnapshot, getSurfPlaySnapshot);
  if (!snapshot.playing) return null;
  const speed = Math.max(0, snapshot.speed || 0);
  return <div className="surf-hud" data-testid="surf-hud">
    <div className="surf-hud__top">
      <div className="surf-hud__glass surf-hud__ride">
        <span className="surf-hud__speed">{Math.round(speed * 3.6)}<small>{pick(['км/ч', 'km/h'])}</small></span>
        <span className="surf-hud__ms">{speed.toFixed(1)} {pick(['м/с', 'm/s'])}</span>
        <span className={`surf-hud__state${snapshot.wipeout ? ' is-wipeout' : ''}`}>{pick(rideState(snapshot))}</span>
        <span className="surf-hud__camera">{pick(['камера', 'camera'])} · {pick(CAMERAS[snapshot.camera] ?? CAMERAS.chase)}</span>
      </div>
      <button type="button" className="surf-hud__glass surf-hud__exit" onClick={onExit} data-testid="surf-hud-exit">{pick(['Выйти · Esc', 'Exit · Esc'])}</button>
    </div>
    <div className="surf-hud__glass surf-hud__keys">
      {KEYS.map(([keys, ru, en]) => <span key={en}><kbd>{typeof keys === 'string' ? keys : pick(keys)}</kbd>{pick([ru, en])}</span>)}
    </div>
  </div>;
}
