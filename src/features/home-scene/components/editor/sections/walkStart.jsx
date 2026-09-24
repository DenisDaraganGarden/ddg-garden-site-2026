import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FocusIcon } from '../focus/FocusIcons';
import './annotations.css';

// Старт прогулки (src/walk): инструмент «Старт» (K) — нажатие на поверхность
// ставит белый значок, протяжка от него — куда он будет смотреть. Прогулка
// начинается с него; в самой прогулке T ставит старт там, где он стоит.
const START_KEY = 'walkStart';

export function WalkStartSection({ settings, applySettings, layoutEditor, gizmo }) {
    const { language } = useLanguage(), ru = language === 'ru', scope = useFocusControlScope();
    if (scope?.catalogOnly) return null;
    const start = settings[START_KEY], active = gizmo?.tool === 'start';
    const frame = () => layoutEditor?.previewPose?.({
        cameraPosition: { x: start.x - Math.sin(start.yaw) * 6, y: start.y + 4, z: start.z - Math.cos(start.yaw) * 6 },
        cameraTarget: { x: start.x, y: start.y + 0.5, z: start.z }, cameraFov: 45,
    });
    return <>
        <button type="button" className={`annotations-tool${active ? ' is-active' : ''}`} onClick={() => gizmo?.setTool?.(active ? 'select' : 'start')} data-testid="walk-start-place">
            <FocusIcon name="flag" /><span>{start ? (ru ? 'Переставить старт' : 'Move the start') : (ru ? 'Поставить старт' : 'Place the start')}</span><kbd>K</kbd>
        </button>
        <p className="annotations-hint">{active
            ? (ru ? 'Нажать на поверхность — старт там; не отпуская, протянуть — куда он будет смотреть. Щелчок — лицом от камеры. Esc — выйти.' : 'Press on a surface to put the start there; drag before letting go to set where he faces. A click faces away from the camera. Esc to leave.')
            : start
                ? (ru ? 'Прогулка начинается отсюда. В прогулке T — старт там, где стоишь, R — вернуться на старт.' : 'The walk starts here. While walking, T puts the start where you stand, R takes you back to it.')
                : (ru ? 'Без старта прогулка начинается там, куда смотрит камера.' : 'Without a start the walk begins where the camera looks.')}</p>
        {start ? <div className="annotations-list">
            <div className="annotations-row">
                <button type="button" className="annotations-row__value" onClick={frame} title={ru ? 'Показать' : 'Frame it'} data-testid="walk-start-frame">
                    <FocusIcon name="flag" /><span>{ru ? 'Старт' : 'Start'}</span>
                </button>
                <button type="button" className="annotations-row__action" onClick={() => applySettings?.({ [START_KEY]: null })} title={ru ? 'Убрать старт' : 'Remove the start'} data-testid="walk-start-remove"><FocusIcon name="trash" /></button>
            </div>
        </div> : null}
    </>;
}
