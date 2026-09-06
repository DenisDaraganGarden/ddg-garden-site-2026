import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../i18n/useLanguage';
import { DEFAULT_EDITOR_PATH, resolveEditorPath } from './editor/editorTree';
import { CheckboxControl, SectionHeading } from './HomeEditorControls';
import { sceneObjectsForNode } from '../lib/sceneObjects';

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
    gizmo,
    onPublish,
    onDeploy,
    onAdoptPublished,
    publishState,
    hasPublishChanges = false,
    publishEnabled = false,
    publishHint = '',
    audioLab,
}) => {
    const { t } = useLanguage();
    const panelRef = useRef(null);
    const sectionRef = useRef(null);
    const resizeStateRef = useRef(null);
    const [storedState] = useState(readPanelState);
    const [collapsed, setCollapsed] = useState(() => Boolean(storedState.collapsed));
    const [panelHeight, setPanelHeight] = useState(() => (
        typeof storedState.height === 'number' ? storedState.height : DEFAULT_PANEL_HEIGHT
    ));
    // The editor itself is already dev-only. Keeping diagnostics behind an
    // additional query flag made the performance tools effectively invisible.
    const showDeveloperTab = import.meta.env.DEV;

    const { groups, group, node } = resolveEditorPath(activeTab ?? DEFAULT_EDITOR_PATH, {
        includeDevOnly: showDeveloperTab,
    });
    // Two steps on purpose: this throws the current draft away, and the draft is
    // where an unpublished afternoon of work lives.
    const [confirmAdopt, setConfirmAdopt] = useState(false);
    const canPublish = publishEnabled && typeof onPublish === 'function';
    const canDeploy = publishEnabled && typeof onDeploy === 'function';
    const isPublishDisabled = publishState?.busy || !hasPublishChanges || !canPublish;

    useEffect(() => {
        if (sectionRef.current) {
            sectionRef.current.scrollTop = 0;
        }
    }, [group.id, node.id]);
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

    const animationPaused = Boolean(settings?.animationPaused);
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
                {/* Lives in the header rather than in a tab: it is wanted
                    while working inside Light, Atmosphere or Render, and a
                    switch you have to leave the tab to reach is a switch you
                    stop using. */}
                <button
                    type="button"
                    className={`home-editor-panel-collapse home-editor-panel-pause ${animationPaused ? 'home-editor-panel-pause--on' : ''}`}
                    onClick={() => handleSettingChange(
                        { target: { checked: !animationPaused } },
                        'animationPaused',
                        'boolean',
                    )}
                    aria-label={animationPaused
                        ? t('homeEditor.panel.resumeAnimation')
                        : t('homeEditor.panel.pauseAnimation')}
                    title={animationPaused
                        ? t('homeEditor.panel.resumeAnimation')
                        : t('homeEditor.panel.pauseAnimation')}
                    aria-pressed={animationPaused}
                    data-testid="home-editor-panel-pause"
                >
                    {animationPaused ? '▶' : '❙❙'}
                </button>
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
                    <div className="home-editor-tabs home-editor-tabs--groups">
                        {groups.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`home-editor-tab ${group.id === item.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(`${item.id}/${item.nodes[0].id}`)}
                                data-testid={`home-editor-group-${item.id}`}
                            >
                                {t(`homeEditor.groups.${item.id}`)}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="home-editor-tab"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => {
                                if (!confirmAdopt) {
                                    setConfirmAdopt(true);
                                    return;
                                }

                                setConfirmAdopt(false);
                                onAdoptPublished?.();
                            }}
                            onBlur={() => setConfirmAdopt(false)}
                            disabled={typeof onAdoptPublished !== 'function'}
                            data-testid="home-editor-adopt-published"
                            title={t('homeEditor.publish.adoptHint')}
                        >
                            {confirmAdopt
                                ? t('homeEditor.publish.adoptConfirm')
                                : t('homeEditor.publish.adopt')}
                        </button>
                        <button
                            type="button"
                            className="home-editor-tab home-editor-tab--publish"
                            onClick={canPublish ? onPublish : undefined}
                            disabled={isPublishDisabled}
                            data-testid="home-editor-publish"
                            title={publishHint || undefined}
                        >
                            {publishState?.busy ? t('homeEditor.publish.publishing') : t('homeEditor.publish.publish')}
                        </button>
                        <button
                            type="button"
                            className="home-editor-tab home-editor-tab--publish home-editor-tab--deploy"
                            onClick={canDeploy ? onDeploy : undefined}
                            disabled={publishState?.busy || !canDeploy}
                            data-testid="home-editor-deploy"
                            title={t('homeEditor.publish.deployHint')}
                        >
                            {t('homeEditor.publish.deploy')}
                        </button>
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

                    <div className="home-editor-tabs home-editor-tabs--nodes">
                        {group.nodes.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`home-editor-tab home-editor-tab--node ${node.id === item.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(`${group.id}/${item.id}`)}
                                data-testid={`home-editor-tab-${item.id}`}
                            >
                                {t(`homeEditor.nodes.${item.id}`)}
                            </button>
                        ))}
                        {gizmo?.selection ? (
                            <span className="home-editor-gizmo" data-testid="home-editor-gizmo">
                                {['translate', 'rotate', 'scale'].map((toolMode) => (
                                    <button
                                        key={toolMode}
                                        type="button"
                                        className={`home-editor-tab home-editor-tab--node ${gizmo.mode === toolMode ? 'active' : ''}`}
                                        onClick={() => gizmo.setMode(toolMode)}
                                        title={t(`homeEditor.gizmo.${toolMode}Hint`)}
                                    >
                                        {t(`homeEditor.gizmo.${toolMode}`)}
                                    </button>
                                ))}
                            </span>
                        ) : null}
                    </div>

                    <div className="home-editor-section" ref={sectionRef}>
                        <div className="home-editor-controls">
                            {/* The object's own switch, from the registry: the same value the
                                visibility sheet shows, drawn once, above the object's controls. */}
                            {sceneObjectsForNode(`${group.id}/${node.id}`).map(({ key }) => (
                                <CheckboxControl
                                    key={key}
                                    label={t(`homeEditor.controls.${key}`)}
                                    checked={Boolean(settings?.[key])}
                                    onChange={(event) => handleSettingChange(event, key, 'boolean')}
                                    testId={`home-editor-object-${key}`}
                                />
                            ))}
                            {node.aspects.map(({ id, Section }) => (
                                <React.Fragment key={id}>
                                    {node.aspects.length > 1 ? (
                                        <SectionHeading label={t(`homeEditor.aspects.${id}`)} />
                                    ) : null}
                                    <Section
                                        settings={settings}
                                        handleSettingChange={handleSettingChange}
                                        layoutEditor={layoutEditor}
                                        audioLab={audioLab}
                                    />
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default HomeEditorPanel;
