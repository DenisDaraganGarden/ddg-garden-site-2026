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
const MIN_PANEL_HEIGHT = 150;
const DEFAULT_PANEL_HEIGHT = 320;

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

// Leave enough of the stage visible that the composition is still judgeable.
const clampPanelHeight = (height) => {
    const ceiling = typeof window !== 'undefined'
        ? Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 120)
        : Number.POSITIVE_INFINITY;

    return Math.min(Math.max(height, MIN_PANEL_HEIGHT), ceiling);
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
    const resizeStateRef = useRef(null);
    const [storedState] = useState(readPanelState);
    const [collapsed, setCollapsed] = useState(() => Boolean(storedState.collapsed));
    const [panelHeight, setPanelHeight] = useState(() => (
        typeof storedState.height === 'number' ? storedState.height : DEFAULT_PANEL_HEIGHT
    ));
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
    // Persist height + collapsed state.
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(
            PANEL_STATE_KEY,
            JSON.stringify({ collapsed, height: panelHeight }),
        );
    }, [collapsed, panelHeight]);

    // Report the height the panel actually occupies so the stage can reserve it.
    // Measuring beats recomputing: this covers the collapsed bar and a wrapped
    // tab row without duplicating any of that layout maths here.
    useLayoutEffect(() => {
        const node = panelRef.current;

        if (!node || typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        const publishHeight = () => {
            document.documentElement.style.setProperty(
                '--home-editor-panel-height',
                `${Math.round(node.getBoundingClientRect().height)}px`,
            );
        };

        publishHeight();
        const observer = new ResizeObserver(publishHeight);
        observer.observe(node);

        return () => {
            observer.disconnect();
            document.documentElement.style.removeProperty('--home-editor-panel-height');
        };
    }, []);

    // A shorter window can leave the stored height taller than the ceiling allows.
    useEffect(() => {
        const handleResize = () => setPanelHeight((value) => clampPanelHeight(value));

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleResizePointerDown = useCallback((event) => {
        if (collapsed || event.button !== 0 || !panelRef.current) {
            return;
        }
        // Don't hijack clicks on the collapse button / interactive header bits.
        if (event.target.closest('button, input, select, a')) {
            return;
        }

        resizeStateRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: panelRef.current.getBoundingClientRect().height,
        };

        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            /* no-op */
        }
    }, [collapsed]);

    const handleResizePointerMove = useCallback((event) => {
        const resize = resizeStateRef.current;
        if (!resize || event.pointerId !== resize.pointerId) {
            return;
        }

        // Dragging the header upwards grows the panel.
        setPanelHeight(clampPanelHeight(resize.startHeight + (resize.startY - event.clientY)));
    }, []);

    const endResize = useCallback((event) => {
        const resize = resizeStateRef.current;
        if (!resize) {
            return;
        }

        if (resize.pointerId != null && event?.currentTarget?.releasePointerCapture) {
            try {
                event.currentTarget.releasePointerCapture(resize.pointerId);
            } catch {
                /* no-op */
            }
        }

        resizeStateRef.current = null;
    }, []);

    const panelStyle = collapsed ? undefined : { height: `${panelHeight}px` };
    const panelClassName = [
        'home-editor-panel',
        collapsed ? 'home-editor-panel--collapsed' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={panelClassName} ref={panelRef} style={panelStyle}>
            <div
                className="home-editor-panel-header"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                onLostPointerCapture={endResize}
                title={collapsed ? undefined : t('homeEditor.panel.resizeHint')}
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
