import { useEffect, useState } from 'react';

// Выбранная вкладка рабочего места (WorkspaceTabs) — на этом компьютере, по
// ключу; неизвестная или старая — первая из ids (или fallback).
export function useWorkspaceTab(key, ids, fallback = ids[0]) {
    const [tab, setTab] = useState(() => {
        try { const saved = localStorage.getItem(key); return ids.includes(saved) ? saved : fallback; } catch { return fallback; }
    });
    useEffect(() => { try { localStorage.setItem(key, tab); } catch { /* local UI only */ } }, [key, tab]);
    return [ids.includes(tab) ? tab : fallback, setTab];
}
