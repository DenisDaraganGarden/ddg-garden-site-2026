import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/useLanguage';

export default function MaterialQuickLook({ title, onClose, children }) {
    const dialog = useRef(null);
    const { language } = useLanguage();
    useEffect(() => {
        const focused = document.activeElement;
        dialog.current.showModal();
        return () => { if (focused?.isConnected) focused.focus(); };
    }, []);
    return <dialog ref={dialog} className="material-quick-look" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}
        onKeyDown={(event) => {
            event.stopPropagation();
            if (event.code === 'Space' && !event.target.closest('input,textarea,select,[contenteditable=true]')) { event.preventDefault(); if (!event.repeat) onClose(); }
        }}>
        <header><strong>{title}</strong><span>{language === 'ru' ? 'Пробел / Esc' : 'Space / Esc'}</span><button type="button" aria-label={language === 'ru' ? 'Закрыть' : 'Close'} onClick={onClose}>×</button></header>
        <div className="material-quick-look__body">{children}</div>
    </dialog>;
}
