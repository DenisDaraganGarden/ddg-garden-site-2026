import { FocusIcon } from './FocusIcons';
import React, { useEffect, useRef, useState } from 'react';

// Вкладки рабочего места в правой панели — одни на все («Посадки»,
// «Светильники», «ТЗ»): разделы вместо длинной ленты. Строка вкладок
// прилипает к верху панели и прокручивается вбок, когда вкладок больше,
// чем ширина; выбранная вкладка помнится на этом компьютере
// (useWorkspaceTab.js).
// tabs — [{ id, label, count? }]; число показывается, когда оно больше нуля.
// Край, за которым есть ещё вкладки, гаснет; выбранная сама въезжает в вид.
export function WorkspaceTabs({ tabs, value, onChange, testId, label, variant }) {
    const bar = useRef(null), [edges, setEdges] = useState('');
    const measure = () => {
        const node = bar.current;
        if (!node) return;
        const left = node.scrollLeft > 1, right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
        setEdges(`${left ? ' has-more-left' : ''}${right ? ' has-more-right' : ''}`);
    };
    useEffect(() => {
        const node = bar.current;
        if (!node) return undefined;
        node.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(node);
        return () => observer?.disconnect();
    }, [value, tabs.length]);
    return <nav ref={bar} className={`planting-tabs workspace-tabs${variant ? ` workspace-tabs--${variant}` : ''}${edges}`} role="tablist" aria-label={label} onScroll={measure} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const current = tabs.findIndex((tab) => tab.id === value);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        onChange(tabs[next].id);
        bar.current?.querySelectorAll('[role="tab"]')[next]?.focus();
    }}>
        {tabs.map(({ id, label: text, count, icon }) => <button key={id} type="button" role="tab" tabIndex={value === id ? 0 : -1} aria-selected={value === id} className={value === id ? 'is-active' : ''}
            onClick={() => onChange(id)} data-testid={`${testId}-${id}`}>{icon ? <FocusIcon name={icon} /> : null}<span>{text}</span>{count ? <small className="lighting-tab-count">{count}</small> : null}</button>)}
    </nav>;
}
