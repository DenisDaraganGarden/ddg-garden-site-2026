import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../../i18n/useLanguage';
import { getSurfPlaySnapshot, subscribeSurfPlay, surfPlay } from './surfPlayStore.js';
import { ALL_KEYS, hintsFor, letters } from './surfHints.js';
import './SurfHud.css';

// The ride's HUD, set like a magazine cover over the picture: what he is doing
// in one word of the site's serif, thin white keys for only what can be done
// right now, the rest of the keys on H. Nothing is boxed; a soft shadow keeps
// the white legible over sky and sand.

const CAMERAS = {
  chase: ['сзади', 'chase'],
  first: ['глаза', 'first person'],
  side: ['с канала', 'from the channel'],
  orbit: ['вокруг', 'orbit'],
};
// Lying on a board slower than this with no stroke going, he is resting.
const RESTING_SPEED = 1.5;
// How far the dot goes from the middle of the stick's ring at full deflection,
// px: the ring's inner radius less the dot's.
const STICK_REACH = 14;
// The camera's name shows this long (ms) after it changes.
const CAMERA_NOTE_MS = 1600;

// What the rider is doing, from his own state first; on the board, the worst
// thing that is true wins. «On the wave» means a breaker under the board, not
// any slope of the swell. The breaker share and the stroke are read live: the
// snapshot only says when to look again.
const rideState = (s) => (
  s.rider === 'fallen' ? ['Упал', 'Wiped out']
    : s.rider === 'swim' ? (s.swimBack ? ['Плывёт к доске', 'Swimming back'] : ['Плывёт', 'Swimming'])
      : s.rider === 'recover' ? ['Забирается', 'Climbing on']
        : s.rider === 'walk' ? (s.carrying ? ['Несёт доску', 'Carrying the board'] : s.running ? ['Бежит', 'Running'] : ['Идёт', 'Walking'])
          : s.rider === 'jump' ? ['Прыжок', 'Jumping']
            : s.rider === 'popup' ? ['Встаёт', 'Getting up']
              : s.rider === 'liedown' ? ['Ложится', 'Lying down']
                : s.wipeout ? ['Упал', 'Wiped out']
                  : s.airborne ? ['В воздухе', 'Airborne']
                    : surfPlay.board.onBreaker > 0.5 ? ['На волне', 'On the wave']
                      : s.rider === 'stand' ? (s.planing > 0.5 ? ['Глиссирует', 'Planing'] : ['Стоит', 'Standing'])
                        : s.speed < RESTING_SPEED && !(surfPlay.intent.trim > 0.2) ? ['Лежит', 'Resting']
                          : ['Гребёт', 'Paddling']
);

// Where the captured mouse's stick stands. The snapshot changes a few times a
// second, so the dot is moved every frame straight from the store instead.
function MouseStick() {
  const dot = useRef(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const { x, y } = surfPlay.mouse;
      if (dot.current) dot.current.style.transform = `translate(${x * STICK_REACH}px, ${y * STICK_REACH}px)`;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="surf-hud__stick" aria-hidden="true"><i ref={dot} /></div>;
}

// A controller in outline, thin like the keys.
const PadGlyph = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M7 7h10a5 5 0 0 1 4.9 6l-.8 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.3 2.1a2.5 2.5 0 0 1-4.3-1.1l-.8-4A5 5 0 0 1 7 7Z" />
  <path d="M7 10v3m-1.5-1.5h3" />
  <circle cx="16" cy="10.5" r=".7" fill="currentColor" stroke="none" />
  <circle cx="17.8" cy="12.5" r=".7" fill="currentColor" stroke="none" />
</svg>;

const Keys = ({ keys, pick }) => <span className="surf-hud__caps">
  {keys.map((k) => {
    const label = typeof k.label === 'string' ? k.label : pick(k.label);
    return <kbd key={label} className={k.shape ? `is-${k.shape}` : undefined}>{label}</kbd>;
  })}
</span>;

const Hint = ({ keys, words, pick, quiet = false }) => <span className={`surf-hud__hint${quiet ? ' is-quiet' : ''}`}>
  <Keys keys={keys} pick={pick} /><span className="surf-hud__words">{pick(words)}</span>
</span>;

// The camera's name, for a moment after it changes.
function useCameraNote(camera) {
  const [note, setNote] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    setNote(true);
    const timer = setTimeout(() => setNote(false), CAMERA_NOTE_MS);
    return () => clearTimeout(timer);
  }, [camera]);
  return note;
}

export default function SurfHud({ onExit }) {
  const { language } = useLanguage();
  const pick = ([ru, en]) => (language === 'ru' ? ru : en);
  const snapshot = useSyncExternalStore(subscribeSurfPlay, getSurfPlaySnapshot, getSurfPlaySnapshot);
  const cameraNote = useCameraNote(snapshot.camera);
  if (!snapshot.playing) return null;
  const onBoard = !['walk', 'jump', 'swim', 'fallen', 'recover'].includes(snapshot.rider);
  const speed = Math.max(0, snapshot.speed || 0);
  const { id, hints } = hintsFor(snapshot);
  const keyboard = snapshot.device !== 'gamepad';
  return <div className="surf-hud" data-testid="surf-hud">
    <div className="surf-hud__top">
      <div className="surf-hud__now">
        <span className="surf-hud__state">{pick(rideState(snapshot))}</span>
        {onBoard ? <span className="surf-hud__speed">{Math.round(speed * 3.6)} {pick(['км/ч', 'km/h'])}</span> : null}
      </div>
      <div className="surf-hud__side">
        <div className="surf-hud__buttons">
          {snapshot.gamepad ? <span className="surf-hud__pad" role="img" aria-label={pick(['Геймпад подключён', 'Gamepad connected'])} data-testid="surf-hud-gamepad"><PadGlyph /></span> : null}
          <button type="button" className="surf-hud__exit" onClick={onExit} data-testid="surf-hud-exit">{pick(['Выйти', 'Exit'])}<span>esc</span></button>
        </div>
        <span className={`surf-hud__note${cameraNote ? ' is-shown' : ''}`}>{pick(['камера', 'camera'])} · {pick(CAMERAS[snapshot.camera] ?? CAMERAS.chase)}</span>
      </div>
    </div>
    {snapshot.keysOpen ? <div className="surf-hud__all" data-testid="surf-hud-keys">
      <span className="surf-hud__all-title">{pick(['Клавиши', 'Keys'])}</span>
      {(keyboard ? ALL_KEYS.keyboard : ALL_KEYS.gamepad).map(([keys, words]) => <Hint key={pick(words)} keys={keys} words={words} pick={pick} />)}
    </div> : null}
    <div className="surf-hud__bottom">
      {snapshot.mouseLocked ? <MouseStick /> : null}
      <div key={id} className="surf-hud__hints" data-testid="surf-hud-hints">
        {hints.map(([keys, words]) => <Hint key={pick(words)} keys={keys} words={words} pick={pick} />)}
        {keyboard ? <Hint keys={letters('H')} words={snapshot.keysOpen ? ['скрыть', 'hide'] : ['все клавиши', 'all keys']} pick={pick} quiet /> : null}
      </div>
    </div>
  </div>;
}
