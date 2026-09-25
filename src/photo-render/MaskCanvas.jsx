import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

function paint(canvas, strokes, width, height) {
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    for (const stroke of strokes) {
        ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#d8c68c'; ctx.fillStyle = '#d8c68c';
        ctx.lineWidth = stroke.size * Math.min(width, height) / 100;
        const [first, ...rest] = stroke.points;
        if (!rest.length) { ctx.beginPath(); ctx.arc(first[0] * width, first[1] * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(first[0] * width, first[1] * height); rest.forEach(([x, y]) => ctx.lineTo(x * width, y * height)); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = 'source-over';
}

const MaskCanvas = forwardRef(function MaskCanvas({ image, original, compare, enabled, size, erase, disabled, tr, onChange }, ref) {
    const canvas = useRef(null), stage = useRef(null), drawing = useRef(null), strokes = useRef([]);
    const [dimensions, setDimensions] = useState([1, 1]), [space, setSpace] = useState([1, 1]), [cursor, setCursor] = useState(null);
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setSpace([entry.contentRect.width, entry.contentRect.height]));
        observer.observe(stage.current); return () => observer.disconnect();
    }, []);
    const redraw = () => { if (canvas.current) paint(canvas.current, strokes.current, ...dimensions); onChange(strokes.current.length); };
    useEffect(() => { strokes.current = []; drawing.current = null; if (canvas.current) paint(canvas.current, [], ...dimensions); onChange(0); }, [image, dimensions, onChange]);
    useImperativeHandle(ref, () => ({
        undo() { strokes.current.pop(); redraw(); },
        clear() { strokes.current = []; redraw(); },
        mask() {
            const source = canvas.current;
            const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height);
            let marked = false;
            for (let i = 0; i < pixels.data.length; i += 4) {
                if (pixels.data[i + 3] > 0) marked = true;
                pixels.data[i] = 0; pixels.data[i + 1] = 0; pixels.data[i + 2] = 0;
                pixels.data[i + 3] = 255 - pixels.data[i + 3];
            }
            if (!marked) throw new Error(tr('Закрасьте область изменения.', 'Paint an area to edit.'));
            const output = document.createElement('canvas'); output.width = source.width; output.height = source.height;
            output.getContext('2d').putImageData(pixels, 0, 0); return output.toDataURL('image/png');
        },
    }));
    const point = (event) => { const r = event.currentTarget.getBoundingClientRect(); return [Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (event.clientY - r.top) / r.height))]; };
    const finish = (event) => {
        if (drawing.current?.pointer !== event.pointerId) return;
        drawing.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        redraw();
    };
    const k = Math.min(space[0] / dimensions[0], space[1] / dimensions[1]);
    const display = [Math.max(1, dimensions[0] * k), Math.max(1, dimensions[1] * k)];
    return <div className="photo-stage" ref={stage}>
        {image ? <div className="photo-picture" style={{ width: display[0], height: display[1] }}>
            <img src={image} alt={tr('Кадр для визуализации', 'Visualization frame')} draggable={false} onLoad={(event) => { const { naturalWidth: w, naturalHeight: h } = event.currentTarget; setDimensions((old) => old[0] === w && old[1] === h ? old : [w, h]); }} />
            {compare && original ? <img className="photo-before" src={original} alt={tr('Исходник', 'Original')} draggable={false} /> : null}
            <canvas ref={canvas} aria-label={tr('Маска: закрасьте область мышью', 'Mask: paint an area with the pointer')} data-testid="photo-mask" className={enabled && !disabled ? 'is-drawing' : ''}
                style={{ pointerEvents: enabled && !disabled && !compare ? 'auto' : 'none', opacity: compare ? 0 : 0.4 }}
                onPointerDown={(event) => {
                    if (event.button !== 0 || drawing.current) return;
                    event.preventDefault();
                    if (strokes.current.length >= 100) return;
                    const stroke = { erase, size, points: [point(event)] }; strokes.current.push(stroke);
                    drawing.current = { pointer: event.pointerId, stroke }; event.currentTarget.setPointerCapture(event.pointerId); redraw();
                }}
                onPointerMove={(event) => {
                    const p = point(event); setCursor(p);
                    if (drawing.current?.pointer !== event.pointerId) return;
                    drawing.current.stroke.points.push(p); redraw();
                }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onPointerLeave={() => setCursor(null)} />
            {cursor && enabled && !disabled && !compare ? <span className="photo-brush-cursor" style={{ left: `${cursor[0] * 100}%`, top: `${cursor[1] * 100}%`, width: size * Math.min(...display) / 100, height: size * Math.min(...display) / 100 }} /> : null}
        </div> : <p>{tr('Получаю кадр камеры…', 'Capturing camera…')}</p>}
    </div>;
});

export default MaskCanvas;
