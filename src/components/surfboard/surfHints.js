// What the ride's HUD shows for keys (SurfHud.jsx): only what can be done
// where he is — lying, standing, on his feet, swimming — in the device his
// hand is on, and all of them on H. A hint is [keys, [ru, en] words]; a key is
// { label, shape } — a letter, a word ('wide'), a gamepad button ('round',
// a trigger's 'pill', a 'stick').

// A key cap: a letter; a word (a wide cap); a gamepad button (round, a
// trigger's pill, a stick's ring).
const key = (label, shape = '') => ({ label, shape });
const SPACE = key(['пробел', 'space'], 'wide');
const SHIFT = key('shift', 'wide');
export const letters = (...list) => list.map((letter) => key(letter));
const pad = (button) => key(button, button.length === 1 ? 'round' : 'pill');
const STICK = key('L', 'stick');

// What F and L would do now (riderController out.hud), in words.
const BOARD = {
  jump: ['спрыгнуть', 'jump off'], climb: ['залезть', 'climb on'], lift: ['взять доску', 'pick it up'], put: ['положить доску', 'put it down'],
};
const LEASH = { off: ['отстегнуть лиш', 'leash off'], on: ['пристегнуть лиш', 'leash on'] };

// Only what can be done where he is: lying, standing, on his feet, swimming.
// A hint is [keys, words]; the id says when the row has changed.
export function hintsFor(s) {
  const gamepad = s.device === 'gamepad', mouse = s.device === 'mouse';
  const board = BOARD[s.board] ? [[gamepad ? pad('X') : key('F')], BOARD[s.board]] : null;
  const leash = LEASH[s.leash] ? [[gamepad ? pad('↓') : key('L')], LEASH[s.leash]] : null;
  // Getting up he is as good as standing, lying down as lying; in the air off
  // the ground as on his feet (the row stays), off the board nothing.
  const rider = s.rider === 'popup' ? 'stand' : s.rider === 'liedown' ? 'prone'
    : s.rider === 'jump' ? (s.jumpFrom === 'ground' ? 'walk' : 'air') : s.rider;
  let hints = [];
  if (rider === 'prone') {
    hints = gamepad ? [[[STICK], ['грести', 'paddle']], [[pad('A')], ['встать', 'stand up']], board]
      : mouse ? [[[key(['ЛКМ', 'LMB'], 'wide'), key(['ПКМ', 'RMB'], 'wide')], ['гребок', 'stroke']], [[SPACE], ['встать', 'stand up']], board]
        : [[letters('W'), ['грести', 'paddle']], [letters('A', 'D'), ['рулить', 'steer']], [[SPACE], ['встать', 'stand up']], board];
  } else if (rider === 'stand') {
    hints = gamepad ? [[[STICK], ['наклон', 'lean']], [[pad('RT')], ['присед', 'crouch']], [[pad('A')], ['прыжок', 'jump']], board]
      : mouse ? [[[key(['мышь', 'mouse'], 'wide')], ['наклон', 'lean']], [[key(['ЛКМ', 'LMB'], 'wide')], ['присед', 'crouch']], [[SPACE], ['прыжок', 'jump']], board]
        : [[letters('A', 'D'), ['наклон', 'lean']], [[SHIFT], ['присед', 'crouch']], [[SPACE], ['прыжок', 'jump']], board];
  } else if (rider === 'walk') {
    hints = gamepad ? [[[STICK], ['идти', 'walk']], [[pad('RT')], ['бежать', 'run']], [[pad('A')], ['прыжок', 'jump']], board, leash]
      : [[letters('W', 'A', 'S', 'D'), ['идти', 'walk']], [[SHIFT], ['бежать', 'run']], [[SPACE], ['прыжок', 'jump']], board, leash];
  } else if (rider === 'swim') {
    hints = s.swimBack ? [[gamepad ? [STICK] : letters('A', 'D'), ['плыть самому', 'swim yourself']]]
      : gamepad ? [[[STICK], ['плыть', 'swim']], board]
        : [[letters('W'), ['плыть', 'swim']], [letters('A', 'D'), ['поворот', 'turn']], [[SHIFT], ['быстрее', 'faster']], board];
  }
  return { id: `${s.device}-${rider}-${s.swimBack}-${s.board}-${s.leash}`, hints: hints.filter(Boolean) };
}

// All the keys, on H.
export const ALL_KEYS = {
  keyboard: [
    [letters('W', 'S'), ['вес · гребок · идти', 'weight · paddle · walk']],
    [letters('A', 'D'), ['наклон · поворот', 'lean · turn']],
    [[SHIFT], ['присед · бег', 'crouch · run']],
    [[SPACE], ['встать · прыжок', 'stand up · jump']],
    [letters('F'), ['доска: спрыгнуть · залезть · взять', 'board: jump off · climb on · carry']],
    [letters('L'), ['лиш', 'leash']],
    [letters('Q'), ['оглянуться', 'look back']],
    [letters('C'), ['камера · 1–4', 'camera · 1–4']],
    [letters('R'), ['на чекпоинт', 'to checkpoint']],
    [letters('T'), ['чекпоинт здесь', 'checkpoint here']],
    [[key(['клик', 'click'], 'wide')], ['мышь рулит', 'mouse steers']],
    [[key(['колесо', 'wheel'], 'wide')], ['ближе · дальше', 'closer · further']],
  ],
  gamepad: [
    [[STICK], ['наклон · вес · идти', 'lean · weight · walk']],
    [[key('R', 'stick')], ['обзор', 'look']],
    [[pad('RT')], ['присед · гребок · бег', 'crouch · stroke · run']],
    [[pad('LT')], ['хват · гребок', 'grab · stroke']],
    [[pad('A')], ['встать · прыжок', 'stand up · jump']],
    [[pad('X')], ['доска', 'board']],
    [[pad('↓')], ['лиш', 'leash']],
    [[pad('Y')], ['камера', 'camera']],
    [[pad('LB')], ['оглянуться', 'look back']],
    [[pad('View')], ['на чекпоинт', 'to checkpoint']],
  ],
};
