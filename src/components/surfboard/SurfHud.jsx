import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLanguage } from '../../i18n/useLanguage';
import { getSurfPlaySnapshot, subscribeSurfPlay, surfPlay } from './surfPlayStore.js';
import './SurfHud.css';

const CAMERAS = {
  chase: ['сзади', 'chase'],
  first: ['глаза', 'first person'],
  side: ['с канала', 'from the channel'],
  orbit: ['вокруг', 'orbit'],
};
// The legend follows the hand that last steered: the keys, the captured mouse
// or the gamepad. A control that reads differently in the two languages is a
// pair; the full list is in the editor's help.
const LEGENDS = {
  keyboard: [
    ['W S', 'вес · гребок', 'weight · paddle'],
    ['A D', 'наклон', 'lean'],
    ['Shift', 'присед', 'crouch'],
    ['Space', 'встать · прыжок', 'stand up · jump'],
    ['F', 'доска: спрыгнуть · залезть · взять', 'board: jump off · climb on · carry'],
    ['L', 'лиш', 'leash'],
    ['Q', 'оглянуться', 'look back'],
    ['C 1–4', 'камера', 'camera'],
    ['R', 'на чекпоинт', 'to checkpoint'],
    ['T', 'чекпоинт здесь', 'checkpoint here'],
    [['тащить', 'drag'], 'обзор', 'look'],
    [['колесо', 'wheel'], 'ближе/дальше', 'closer/further'],
  ],
  mouse: [
    [['мышь', 'mouse'], 'наклон · вес', 'lean · weight'],
    [['ЛКМ', 'LMB'], 'присед · гребок', 'crouch · stroke'],
    [['ПКМ', 'RMB'], 'хват · гребок', 'grab · stroke'],
    [['средняя', 'middle'], 'оглянуться', 'look back'],
    ['Space', 'встать · прыжок', 'stand up · jump'],
    ['F', 'доска: спрыгнуть · залезть · взять', 'board: jump off · climb on · carry'],
    ['C 1–4', 'камера', 'camera'],
    [['колесо', 'wheel'], 'ближе/дальше', 'closer/further'],
    ['Esc', 'отпустить мышь', 'release the mouse'],
  ],
  gamepad: [
    [['л. стик', 'L stick'], 'наклон · вес', 'lean · weight'],
    [['п. стик', 'R stick'], 'обзор', 'look'],
    ['RT', 'присед · гребок', 'crouch · stroke'],
    ['LT', 'хват · гребок', 'grab · stroke'],
    ['A', 'встать · прыжок', 'stand up · jump'],
    ['X', 'доска: спрыгнуть · залезть · взять', 'board: jump off · climb on · carry'],
    ['↓', 'лиш', 'leash'],
    ['Y', 'камера', 'camera'],
    ['LB', 'оглянуться', 'look back'],
    ['View', 'на чекпоинт', 'to checkpoint'],
    ['Menu', 'выйти', 'exit'],
  ],
};
// Lying on a board slower than this with no stroke going, he is resting.
const RESTING_SPEED = 1.5;
// How far the dot goes from the middle of the stick's ring at full deflection,
// px: the ring's inner radius less the dot's.
const STICK_REACH = 16;

// What the rider is doing, from his own state first: in the water he is
// fallen, swimming or climbing on (R is not asked for), getting up is its own
// moment, off the board he walks or jumps; on the board, the worst thing that
// is true wins. «On the wave» means a breaker under the board, not any slope of the
// swell. The breaker share and the stroke are read live: the snapshot only
// says when to look again.
const rideState = ({ rider, wipeout, airborne, planing, speed }) => (
  rider === 'fallen' ? ['упал', 'wiped out']
    : rider === 'swim' ? ['плывёт', 'swimming']
      : rider === 'walk' ? ['идёт', 'walking']
      : rider === 'jump' ? ['прыжок', 'jumping']
      : rider === 'recover' ? ['забирается на доску', 'climbing on']
      : rider === 'popup' ? ['встаёт', 'getting up']
        : rider === 'liedown' ? ['ложится', 'lying down']
          : wipeout ? ['упал', 'wiped out']
            : airborne ? ['в воздухе', 'airborne']
              : surfPlay.board.onBreaker > 0.5 ? ['на волне', 'on the wave']
                : rider === 'stand' ? (planing > 0.5 ? ['глиссирует', 'planing'] : ['стоит', 'standing'])
                  : speed < RESTING_SPEED && !(surfPlay.intent.trim > 0.2) ? ['лежит', 'resting']
                    : ['гребёт', 'paddling']
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

// A controller in outline, drawn like the editor's icons.
const PadGlyph = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M7 7h10a5 5 0 0 1 4.9 6l-.8 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-2.3 2.1a2.5 2.5 0 0 1-4.3-1.1l-.8-4A5 5 0 0 1 7 7Z" />
  <path d="M7 10v3m-1.5-1.5h3" />
  <circle cx="16" cy="10.5" r=".7" fill="currentColor" stroke="none" />
  <circle cx="17.8" cy="12.5" r=".7" fill="currentColor" stroke="none" />
</svg>;

// What the rider needs at a glance and nothing else; the scene draws the rest.
export default function SurfHud({ onExit }) {
  const { language } = useLanguage();
  const pick = ([ru, en]) => (language === 'ru' ? ru : en);
  const snapshot = useSyncExternalStore(subscribeSurfPlay, getSurfPlaySnapshot, getSurfPlaySnapshot);
  if (!snapshot.playing) return null;
  const speed = Math.max(0, snapshot.speed || 0);
  const legend = LEGENDS[snapshot.device] ?? LEGENDS.keyboard;
  return <div className="surf-hud" data-testid="surf-hud">
    <div className="surf-hud__top">
      <div className="surf-hud__glass surf-hud__ride">
        <span className="surf-hud__speed">{Math.round(speed * 3.6)}<small>{pick(['км/ч', 'km/h'])}</small></span>
        <span className="surf-hud__ms">{speed.toFixed(1)} {pick(['м/с', 'm/s'])}</span>
        <span className={`surf-hud__state${snapshot.wipeout || snapshot.rider === 'fallen' ? ' is-wipeout' : ''}`}>{pick(rideState(snapshot))}</span>
        <span className="surf-hud__camera">{pick(['камера', 'camera'])} · {pick(CAMERAS[snapshot.camera] ?? CAMERAS.chase)}</span>
      </div>
      <div className="surf-hud__side">
        {snapshot.gamepad ? <span className="surf-hud__glass surf-hud__pad" role="img" aria-label={pick(['Геймпад подключён', 'Gamepad connected'])} data-testid="surf-hud-gamepad"><PadGlyph /></span> : null}
        <button type="button" className="surf-hud__glass surf-hud__exit" onClick={onExit} data-testid="surf-hud-exit">{pick(['Выйти · Esc', 'Exit · Esc'])}</button>
      </div>
    </div>
    <div className="surf-hud__glass surf-hud__keys">
      {legend.map(([keys, ru, en]) => <span key={en}><kbd>{typeof keys === 'string' ? keys : pick(keys)}</kbd>{pick([ru, en])}</span>)}
    </div>
    {snapshot.mouseLocked ? <MouseStick />
      : snapshot.device !== 'gamepad' ? <div className="surf-hud__glass surf-hud__hint"><kbd>{pick(['клик', 'click'])}</kbd>{pick(['мышь рулит', 'mouse steers'])}</div>
        : null}
  </div>;
}
