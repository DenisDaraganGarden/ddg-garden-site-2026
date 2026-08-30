import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './CursorConceptLab.css';

const CURSOR_CONCEPTS = [
    { id: 'point', number: '01', label: 'Точка' },
    { id: 'cross', number: '02', label: 'Крест' },
    { id: 'lens', number: '03', label: 'Линза' },
];

const CURSOR_CONCEPT_IDS = new Set(CURSOR_CONCEPTS.map(({ id }) => id));
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
const CONTEXT_LABELS = {
    ambient: 'Фон',
    interactive: 'Ссылка',
    water: 'Вода',
};

const getCursorMode = (search) => {
    const requestedMode = new URLSearchParams(search).get('cursor');
    return CURSOR_CONCEPT_IDS.has(requestedMode) ? requestedMode : null;
};

const CursorConceptLab = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const mode = useMemo(() => getCursorMode(location.search), [location.search]);
    const layerRef = useRef(null);
    const coreRef = useRef(null);
    const followerRef = useRef(null);
    const impactRef = useRef(null);
    const contextLabelRef = useRef(null);

    const selectConcept = useCallback((nextMode) => {
        const searchParams = new URLSearchParams(location.search);
        searchParams.set('cursor', nextMode);
        navigate({
            pathname: location.pathname,
            search: `?${searchParams.toString()}`,
            hash: location.hash,
        }, { replace: true });
    }, [location.hash, location.pathname, location.search, navigate]);

    const closeLab = useCallback(() => {
        const searchParams = new URLSearchParams(location.search);
        searchParams.delete('cursor');
        const nextSearch = searchParams.toString();
        navigate({
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : '',
            hash: location.hash,
        }, { replace: true });
    }, [location.hash, location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!mode || typeof window === 'undefined') {
            return undefined;
        }

        const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
        if (!finePointer.matches) {
            return undefined;
        }

        const root = document.documentElement;
        const layer = layerRef.current;
        const core = coreRef.current;
        const follower = followerRef.current;
        const impact = impactRef.current;
        const contextLabel = contextLabelRef.current;

        if (!layer || !core || !follower || !impact) {
            return undefined;
        }

        let targetX = -80;
        let targetY = -80;
        let followerX = -80;
        let followerY = -80;
        let followerFrame = null;
        let isFollowerInitialized = false;
        let currentContext = 'ambient';

        root.dataset.cursorConcept = mode;

        const setContext = (eventTarget, clientX, clientY) => {
            const targetElement = eventTarget instanceof Element ? eventTarget : null;
            let nextContext = targetElement?.closest(INTERACTIVE_SELECTOR)
                ? 'interactive'
                : 'ambient';

            if (nextContext === 'ambient') {
                const waterContainer = document.querySelector('.home-water-container');
                if (waterContainer) {
                    const rect = waterContainer.getBoundingClientRect();
                    const isWithinWaterFrame = clientX >= rect.left
                        && clientX <= rect.right
                        && clientY >= rect.top
                        && clientY <= rect.bottom;

                    if (isWithinWaterFrame) {
                        nextContext = 'water';
                    }
                }
            }

            if (nextContext === currentContext) {
                return;
            }

            currentContext = nextContext;
            layer.dataset.context = nextContext;
            if (contextLabel) {
                contextLabel.textContent = CONTEXT_LABELS[nextContext];
            }
        };

        const moveFollower = () => {
            const ease = mode === 'lens' ? 0.14 : 0.2;
            followerX += (targetX - followerX) * ease;
            followerY += (targetY - followerY) * ease;
            follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0)`;

            if (Math.abs(targetX - followerX) > 0.08 || Math.abs(targetY - followerY) > 0.08) {
                followerFrame = window.requestAnimationFrame(moveFollower);
            } else {
                followerFrame = null;
            }
        };

        const handlePointerMove = (event) => {
            targetX = event.clientX;
            targetY = event.clientY;
            core.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;

            if (mode === 'point') {
                followerX = targetX;
                followerY = targetY;
                follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0)`;
            } else if (!isFollowerInitialized) {
                followerX = targetX;
                followerY = targetY;
                follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0)`;
                isFollowerInitialized = true;
            } else if (followerFrame === null) {
                followerFrame = window.requestAnimationFrame(moveFollower);
            }

            layer.dataset.visible = 'true';
            setContext(event.target, event.clientX, event.clientY);
        };

        const handlePointerDown = (event) => {
            if (event.button !== 0) {
                return;
            }

            layer.dataset.pressed = 'true';
            impact.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
            impact.classList.remove('is-active');
            void impact.offsetWidth;
            impact.classList.add('is-active');
        };

        const handlePointerUp = () => {
            layer.dataset.pressed = 'false';
        };

        const handlePointerExit = (event) => {
            if (event.relatedTarget === null) {
                layer.dataset.visible = 'false';
            }
        };

        const hideCursor = () => {
            layer.dataset.visible = 'false';
            layer.dataset.pressed = 'false';
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('pointerdown', handlePointerDown, { passive: true });
        window.addEventListener('pointerup', handlePointerUp, { passive: true });
        window.addEventListener('pointercancel', handlePointerUp, { passive: true });
        window.addEventListener('mouseout', handlePointerExit, { passive: true });
        window.addEventListener('blur', hideCursor);

        return () => {
            if (followerFrame !== null) {
                window.cancelAnimationFrame(followerFrame);
            }
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            window.removeEventListener('mouseout', handlePointerExit);
            window.removeEventListener('blur', hideCursor);
            delete root.dataset.cursorConcept;
        };
    }, [mode]);

    if (!mode) {
        return null;
    }

    const activeConcept = CURSOR_CONCEPTS.find(({ id }) => id === mode);

    return (
        <>
            <div
                ref={layerRef}
                className="cursor-concept"
                data-mode={mode}
                data-context="ambient"
                data-visible="false"
                data-pressed="false"
                data-testid="cursor-concept"
                aria-hidden="true"
            >
                <div ref={coreRef} className="cursor-concept__anchor cursor-concept__anchor--core">
                    <span className="cursor-concept__core-shape" />
                </div>
                <div ref={followerRef} className="cursor-concept__anchor cursor-concept__anchor--follower">
                    <span className="cursor-concept__follower-shape" />
                </div>
                <div ref={impactRef} className="cursor-concept__anchor cursor-concept__anchor--impact">
                    <span className="cursor-concept__impact-shape" />
                </div>
            </div>

            <aside className="cursor-lab" aria-label="Варианты интерактивного курсора" data-testid="cursor-lab">
                <div className="cursor-lab__header">
                    <div>
                        <span className="cursor-lab__eyebrow">Cursor study</span>
                        <strong className="cursor-lab__title">
                            {activeConcept.number} / {activeConcept.label}
                        </strong>
                    </div>
                    <button
                        type="button"
                        className="cursor-lab__close"
                        onClick={closeLab}
                        aria-label="Закрыть варианты курсора"
                    >
                        ×
                    </button>
                </div>

                <div className="cursor-lab__options" role="group" aria-label="Выбор курсора">
                    {CURSOR_CONCEPTS.map((concept) => (
                        <button
                            key={concept.id}
                            type="button"
                            className="cursor-lab__option"
                            data-testid={`cursor-option-${concept.id}`}
                            aria-pressed={concept.id === mode}
                            onClick={() => selectConcept(concept.id)}
                        >
                            <span>{concept.number}</span>
                            {concept.label}
                        </button>
                    ))}
                </div>

                <div className="cursor-lab__footer">
                    <span>Двигайте и нажимайте на воду</span>
                    <span ref={contextLabelRef} className="cursor-lab__context" data-testid="cursor-context">
                        Фон
                    </span>
                </div>
            </aside>
        </>
    );
};

export default CursorConceptLab;
