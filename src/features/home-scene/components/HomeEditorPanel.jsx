import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../i18n/useLanguage';
import {
    CameraTab,
    DebugTab,
    DepthTab,
    LightingTab,
    PostProcessingTab,
    PlantsTab,
    WaterTab,
    BoatTab,
    SculptureTab,
} from './HomeEditorTabs';

const PANEL_STATE_KEY = 'ddg_home_editor_panel_v1';
const PANEL_MARGIN = 12;
const COMPACT_PANEL_MEDIA = '(max-width: 768px), (max-height: 560px)';

const isMobileViewport = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(COMPACT_PANEL_MEDIA).matches;

const readPanelState = () => {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(PANEL_STATE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const clampToViewport = (x, y, width, height) => {
    const maxX = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
    const maxY = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);

    return {
        x: Math.min(Math.max(x, PANEL_MARGIN), maxX),
        y: Math.min(Math.max(y, PANEL_MARGIN), maxY),
    };
};

const HomeEditorPanel = ({
    activeTab,
    setActiveTab,
    settings,
    handleSettingChange,
    layoutEditor,
    onPublish,
    publishState,
    hasPublishChanges = false,
    publishEnabled = false,
    publishHint = '',
}) => {
    const { t } = useLanguage();
    const panelRef = useRef(null);
    const dragStateRef = useRef(null);
    const [storedState] = useState(readPanelState);
    const [collapsed, setCollapsed] = useState(() => Boolean(storedState.collapsed));
    const [position, setPosition] = useState(() => (
        typeof storedState.x === 'number' && typeof storedState.y === 'number'
            ? { x: storedState.x, y: storedState.y }
            : null
    ));
    const [isMobile, setIsMobile] = useState(isMobileViewport);
    // The editor itself is already dev-only. Keeping diagnostics behind an
    // additional query flag made the performance tools effectively invisible.
    const showDeveloperTab = import.meta.env.DEV;

    const tabs = [
        { id: 'water', label: t('homeEditor.tabs.water') },
        { id: 'lighting', label: t('homeEditor.tabs.lighting') },
        { id: 'depth', label: t('homeEditor.tabs.depth') },
        { id: 'plants', label: t('homeEditor.tabs.plants') },
        { id: 'post', label: t('homeEditor.tabs.post') },
        { id: 'camera', label: t('homeEditor.tabs.camera') },
        { id: 'boat', label: t('homeEditor.tabs.boat') },
        { id: 'sculpture', label: t('homeEditor.tabs.sculpture') },
    ];
    if (showDeveloperTab) {
        tabs.push({ id: 'debug', label: t('homeEditor.tabs.debug') });
    }
    const canPublish = publishEnabled && typeof onPublish === 'function';
    const isPublishDisabled = publishState?.busy || !hasPublishChanges || !canPublish;
    const isFloating = !isMobile && position !== null;

    // Track viewport class so we fall back to the docked bottom layout on phones.
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const mediaQuery = window.matchMedia(COMPACT_PANEL_MEDIA);
        const handleChange = () => setIsMobile(mediaQuery.matches);

        handleChange();
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Persist position + collapsed state.
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const payload = { collapsed };
        if (position) {
            payload.x = position.x;
            payload.y = position.y;
        }
        window.localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(payload));
    }, [collapsed, position]);

    // First desktop render with no saved spot: seed it bottom-centred (matches the
    // old docked look) so switching to free-drag doesn't visually jump.
    useLayoutEffect(() => {
        if (isMobile || position || !panelRef.current) {
            return;
        }

        const rect = panelRef.current.getBoundingClientRect();
        const x = (window.innerWidth - rect.width) / 2;
        const y = window.innerHeight - rect.height - 16;
        setPosition(clampToViewport(x, y, rect.width, rect.height));
    }, [isMobile, position]);

    // Keep the panel on-screen when it collapses/expands or the window resizes.
    useLayoutEffect(() => {
        if (isMobile || !position || !panelRef.current) {
            return;
        }

        const rect = panelRef.current.getBoundingClientRect();
        setPosition((previous) => (
            previous ? clampToViewport(previous.x, previous.y, rect.width, rect.height) : previous
        ));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapsed]);

    useEffect(() => {
        if (isMobile) {
            return undefined;
        }

        const handleResize = () => {
            if (!panelRef.current) {
                return;
            }
            const rect = panelRef.current.getBoundingClientRect();
            setPosition((previous) => (
                previous ? clampToViewport(previous.x, previous.y, rect.width, rect.height) : previous
            ));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isMobile]);

    const handleDragPointerDown = useCallback((event) => {
        if (isMobile || event.button !== 0 || !panelRef.current) {
            return;
        }
        // Don't hijack clicks on the collapse button / interactive header bits.
        if (event.target.closest('button, input, select, a')) {
            return;
        }

        const rect = panelRef.current.getBoundingClientRect();
        dragStateRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            width: rect.width,
            height: rect.height,
        };

        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            /* no-op */
        }

        if (!position) {
            setPosition({ x: rect.left, y: rect.top });
        }
    }, [isMobile, position]);

    const handleDragPointerMove = useCallback((event) => {
        const drag = dragStateRef.current;
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        const x = event.clientX - drag.offsetX;
        const y = event.clientY - drag.offsetY;
        setPosition(clampToViewport(x, y, drag.width, drag.height));
    }, []);

    const endDrag = useCallback((event) => {
        const drag = dragStateRef.current;
        if (!drag) {
            return;
        }

        if (drag.pointerId != null && event?.currentTarget?.releasePointerCapture) {
            try {
                event.currentTarget.releasePointerCapture(drag.pointerId);
            } catch {
                /* no-op */
            }
        }

        dragStateRef.current = null;
    }, []);

    const panelStyle = isFloating
        ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto', transform: 'none' }
        : undefined;
    const panelClassName = [
        'home-editor-panel',
        isFloating ? 'home-editor-panel--floating' : '',
        collapsed ? 'home-editor-panel--collapsed' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={panelClassName} ref={panelRef} style={panelStyle}>
            <div
                className="home-editor-panel-header"
                onPointerDown={handleDragPointerDown}
                onPointerMove={handleDragPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
            >
                <span className="home-editor-panel-grip" aria-hidden="true">⠿</span>
                <span className="home-editor-panel-title">{t('homeEditor.panel.title')}</span>
                {!collapsed && hasPublishChanges ? (
                    <span className="home-editor-panel-dot" title={t('common.unsaved')} aria-hidden="true" />
                ) : null}
                <button
                    type="button"
                    className="home-editor-panel-collapse"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-label={collapsed ? t('homeEditor.panel.expand') : t('homeEditor.panel.collapse')}
                    title={collapsed ? t('homeEditor.panel.expand') : t('homeEditor.panel.collapse')}
                    data-testid="home-editor-panel-collapse"
                >
                    {collapsed ? '▢' : '–'}
                </button>
            </div>

            {!collapsed ? (
                <>
                    <div className="home-editor-tabs">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`home-editor-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                data-testid={`home-editor-tab-${tab.id}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="home-editor-tab home-editor-tab--publish"
                            onClick={canPublish ? onPublish : undefined}
                            disabled={isPublishDisabled}
                            data-testid="home-editor-publish"
                            style={{ marginLeft: 'auto' }}
                            title={publishHint || undefined}
                        >
                            {publishState?.busy ? t('homeEditor.publish.publishing') : t('homeEditor.publish.publish')}
                        </button>
                    </div>

                    <div className="home-editor-status">
                        {t('homeEditor.panel.autoSaved')}
                        {hasPublishChanges ? ` · ${t('homeEditor.panel.publishPending')}` : ''}
                    </div>

                    {publishHint ? (
                        <div className="home-editor-status">
                            {publishHint}
                        </div>
                    ) : null}

                    {publishState?.message ? (
                        <div className="home-editor-status">
                            {publishState.message}
                        </div>
                    ) : null}

                    <div className="home-editor-section">
                        <div className="home-editor-controls">
                            {activeTab === 'water' && <WaterTab settings={settings} handleSettingChange={handleSettingChange} />}
                            {activeTab === 'lighting' && <LightingTab settings={settings} handleSettingChange={handleSettingChange} />}
                            {activeTab === 'depth' && <DepthTab settings={settings} handleSettingChange={handleSettingChange} />}
                            {activeTab === 'plants' && <PlantsTab settings={settings} handleSettingChange={handleSettingChange} />}
                            {activeTab === 'post' && <PostProcessingTab settings={settings} handleSettingChange={handleSettingChange} />}
                            {activeTab === 'camera' && (
                                <CameraTab
                                    settings={settings}
                                    handleSettingChange={handleSettingChange}
                                    layoutEditor={layoutEditor}
                                />
                            )}
                            {activeTab === 'boat' && <BoatTab settings={settings} handleSettingChange={handleSettingChange} layoutEditor={layoutEditor} />}
                            {activeTab === 'sculpture' && <SculptureTab settings={settings} handleSettingChange={handleSettingChange} layoutEditor={layoutEditor} />}
                            {showDeveloperTab && activeTab === 'debug' && (
                                <DebugTab settings={settings} handleSettingChange={handleSettingChange} />
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default HomeEditorPanel;
