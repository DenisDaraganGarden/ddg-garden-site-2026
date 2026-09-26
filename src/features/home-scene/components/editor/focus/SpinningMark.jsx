import React, { useEffect, useRef } from 'react';

// Логотип OUROBOROS — индикатор: в покое медленно поворачивается (оборот за
// полминуты), пока движок работает — быстро; скорость меняется плавно.
// При «уменьшить движение» в системе в покое стоит.
const IDLE = 12, BUSY = 300; // градусов в секунду
export function SpinningMark({ busy, children, className }) {
    const node = useRef(null), wanted = useRef(busy);
    wanted.current = busy;
    useEffect(() => {
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let frame = 0, last = performance.now(), angle = 0, speed = still ? 0 : IDLE;
        const tick = (now) => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const target = wanted.current ? BUSY : still ? 0 : IDLE;
            speed += (target - speed) * Math.min(1, dt * 2.5);
            angle = (angle + speed * dt) % 360;
            if (node.current) node.current.style.transform = `rotate(${angle.toFixed(2)}deg)`;
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, []);
    return <svg ref={node} className={className} viewBox="243 157 535 535" aria-hidden="true" data-busy={busy ? 'true' : 'false'}>{children}</svg>;
}
