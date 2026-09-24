import React, { useSyncExternalStore } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { getWalkSnapshot, subscribeWalk, toggleWalkView } from './walkStore.js';
import '../components/surfboard/SurfHud.css';

// Подсказки прогулки — в том же наборе, что у доски (SurfHud.css): что он
// делает — одним словом, внизу — клавиши (или кнопки геймпада, если правят
// им), справа — выход и вид.
const STATES = {
    stand: ['Стоит', 'Standing'], walk: ['Идёт', 'Walking'], run: ['Бежит', 'Running'], jump: ['Прыжок', 'Jumping'], fall: ['Падает', 'Falling'],
};
const VIEWS = { first: ['от глаз', 'first person'], third: ['со стороны', 'third person'] };

// Клавиша — [надпись, форма]: буква, слово (wide), кнопка (round), курок
// (pill), стик (stick).
const Hint = ({ keys, words }) => <span className="surf-hud__hint">
    <span className="surf-hud__caps">{keys.map(([label, shape]) => <kbd key={label} className={shape ? `is-${shape}` : undefined}>{label}</kbd>)}</span>
    <span className="surf-hud__words">{words}</span>
</span>;
const HINTS = {
    keys: [[[['W'], ['A'], ['S'], ['D']], ['идти', 'walk']], [[['shift', 'wide']], ['бежать', 'run']], [[[['пробел', 'space'], 'wide']], ['прыжок', 'jump']], [[['C']], ['вид', 'view']], [[['T']], ['старт здесь', 'start here']], [[['R']], ['на старт', 'back to start']]],
    pad: [[[['L', 'stick']], ['идти', 'walk']], [[['R', 'stick']], ['смотреть', 'look']], [[['RT', 'pill']], ['бежать', 'run']], [[['A', 'round']], ['прыжок', 'jump']], [[['Y', 'round']], ['вид', 'view']], [[['↑', 'round']], ['старт здесь', 'start here']], [[['View', 'pill']], ['на старт', 'back to start']]],
};

export default function WalkHud({ onExit }) {
    const { language } = useLanguage();
    const pick = ([ru, en]) => (language === 'ru' ? ru : en);
    const s = useSyncExternalStore(subscribeWalk, getWalkSnapshot, getWalkSnapshot);
    const pad = s.device === 'pad';
    return <div className="surf-hud" data-testid="walk-hud">
        <div className="surf-hud__top">
            <div className="surf-hud__now"><span className="surf-hud__state" data-testid="walk-hud-state">{pick(STATES[s.state] ?? STATES.stand)}</span></div>
            <div className="surf-hud__side">
                <div className="surf-hud__buttons">
                    <button type="button" className="surf-hud__exit" onClick={toggleWalkView} data-testid="walk-hud-view">{pick(VIEWS[s.view])}<span>{pad ? 'y' : 'c'}</span></button>
                    <button type="button" className="surf-hud__exit" onClick={onExit} data-testid="walk-hud-exit">{pick(['Выйти', 'Exit'])}<span>{pad ? 'menu' : 'esc'}</span></button>
                </div>
            </div>
        </div>
        <div className="surf-hud__bottom">
            <div className="surf-hud__hints">
                {HINTS[pad ? 'pad' : 'keys'].map(([keys, words]) => <Hint key={words[1]} keys={keys.map(([label, shape]) => [typeof label === 'string' ? label : pick(label), shape])} words={pick(words)} />)}
                {pad ? null : <span className="surf-hud__hint is-quiet"><span className="surf-hud__words">{s.locked ? pick(['esc — отпустить мышь', 'esc — free the mouse']) : pick(['клик — мышь в сцену · колесо — дальше, ближе', 'click — mouse into the scene · wheel — closer, farther'])}</span></span>}
            </div>
        </div>
    </div>;
}
