import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { buildCover, COVER_BUDGET } from './model.js';
import { gridSurface } from './field.js';
import { receiverSurface, resolveCoverSurface } from './surface.js';

const EMPTY = Object.freeze([]);
export default function Groundcover({ bed, month = 6, envMapIntensity = 1, surface = null, exclusions = EMPTY, budget = COVER_BUDGET, onStats }) {
    const { scene, invalidate } = useThree();
    const root = useRef();
    const runtime = useRef(null), current = useRef({ month, envMapIntensity, onStats });
    current.current = { month, envMapIntensity, onStats };
    useEffect(() => {
        const holder = root.current;
        let model = null, stamp = '', elapsed = 1, statsElapsed = 0, statsDirty = true;
        const refresh = () => {
            const mesh = bed.coverSurface ? resolveCoverSurface(scene, bed.coverSurface) : null;
            mesh?.updateWorldMatrix(true, false);
            const next = bed.coverSurface ? mesh ? `${mesh.uuid}:${mesh.geometry.uuid}:${mesh.geometry.attributes.position.version}:${mesh.matrixWorld.elements.join(',')}` : 'missing' : 'grid';
            if (next === stamp) return; stamp = next;
            if (model) { holder.remove(model.group); model.dispose(); model = null; }
            // A temporarily unloaded receiver must not leave a floating fallback.
            const query = surface ?? (bed.coverSurface ? mesh && receiverSurface(mesh, bed.coverSurface.face) : gridSurface(bed));
            if (!query) { current.current.onStats?.(null); return; }
            model = buildCover(bed, query, { exclusions, budget, onReady: invalidate }); model.update(current.current.month, current.current.envMapIntensity);
            holder.add(model.group); current.current.onStats?.({ ...model.stats }); statsDirty = true; invalidate();
        };
        refresh();
        runtime.current = {
            tick(delta, camera, height) {
                elapsed += delta; statsElapsed += delta;
                if (bed.coverSurface && elapsed > .5) { elapsed = 0; refresh(); }
                if (!model) return;
                statsDirty = model.updateView(camera, height) || statsDirty;
                if (statsDirty && statsElapsed > .3) {
                    statsElapsed = 0; statsDirty = false; current.current.onStats?.({ ...model.stats });
                }
            },
            update() { model?.update(current.current.month, current.current.envMapIntensity); statsDirty = true; invalidate(); },
        };
        return () => { runtime.current = null; if (model) holder.remove(model.group); model?.dispose(); };
    }, [bed, scene, surface, exclusions, budget, invalidate]);
    useEffect(() => runtime.current?.update(), [month, envMapIntensity]);
    useFrame(({ camera, size }, delta) => runtime.current?.tick(delta, camera, size.height));
    return <group ref={root} name={`cover-receiver-${bed.id}`} />;
}
