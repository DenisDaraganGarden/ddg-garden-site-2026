import { useCallback, useEffect, useRef, useState } from 'react';
import { findPart, partChain, partName, sketchupModelEntry } from '../placed/sketchupModel.js';
import { materialMeshKey, sourceGeometry, sourceMaterial, targetAt, targetKey, triangleCount } from './selection.js';

export function useMaterialEditor({ tool, setTool, placedEditor, language }) {
    const [opened, setOpened] = useState(false), [scope, setScopeState] = useState('face'), [targets, setTargets] = useState([]);
    const [reference, setReference] = useState(null), [edgePicking, setEdgePicking] = useState(false);
    const latest = useRef(null), live = useRef(null), edgeAction = useRef(null);
    live.current = { scope, placedEditor, language };
    const pick = useCallback((hit, forceScope) => {
        const { scope: chosen, language } = live.current, mode = forceScope ?? chosen;
        const root = sketchupModelEntry(hit?.placedId)?.root, target = targetAt(hit, root);
        if (edgeAction.current && !forceScope) {
            if (target) { const action = edgeAction.current; edgeAction.current = null; setEdgePicking(false); action(target); }
            return;
        }
        if (!target) { if (!hit?.shift) setTargets([]); return; }
        latest.current = hit;
        setReference(target);
        const names = partChain(root, hit.object).map((node) => partName(node, language === 'ru'));
        let picked = [{ ...target, label: names.join(' › ') || target.materialName }];
        if (mode === 'component') {
            const chain = partChain(root, hit.object);
            const node = hit.componentNode ?? [...chain].reverse().find((object) => !object.isMesh) ?? hit.object;
            const label = partName(node, language === 'ru');
            picked = [];
            (node ?? hit.object).traverse((mesh) => {
                if (!mesh.isMesh) return;
                for (const material of [sourceMaterial(mesh)].flat()) if (material?.name && material.isMeshStandardMaterial) picked.push({ placedId: hit.placedId,
                    materialName: material.name, material, mesh, asset: root.userData.materialModel, meshKey: materialMeshKey(mesh, root), count: triangleCount(sourceGeometry(mesh)), triangles: null, label });
            });
        }
        setTargets((current) => {
            if (!hit.shift || mode === 'material') return picked;
            const keys = new Set(picked.map(targetKey)), already = picked.every((target) => current.some((item) => targetKey(item) === targetKey(target)));
            return already ? current.filter((item) => !keys.has(targetKey(item))) : [...current.filter((item) => !keys.has(targetKey(item))), ...picked];
        });
    }, []);
    const open = useCallback((hit) => { setOpened(true); setTool('material'); if (hit) pick(hit); }, [pick, setTool]);
    const requestEdge = useCallback((action) => { edgeAction.current = action; setEdgePicking(Boolean(action)); }, []);
    const close = useCallback(() => { requestEdge(null); setOpened(false); setTargets([]); setReference(null); latest.current = null; setTool('select'); }, [requestEdge, setTool]);
    const setScope = useCallback((value) => { requestEdge(null); setScopeState(value); if (latest.current) pick({ ...latest.current, shift: false }, value); }, [pick, requestEdge]);
    useEffect(() => {
        if (!edgePicking) return undefined;
        const escape = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestEdge(null); } };
        window.addEventListener('keydown', escape, true);
        return () => window.removeEventListener('keydown', escape, true);
    }, [edgePicking, requestEdge]);
    useEffect(() => { if (tool !== 'material') requestEdge(null); }, [tool, requestEdge]);
    const selectedPart = `${placedEditor.selectedId ?? ''}:${placedEditor.part?.node ?? ''}`;
    const previousPart = useRef(selectedPart);
    useEffect(() => {
        if (previousPart.current === selectedPart) return;
        previousPart.current = selectedPart;
        if (!opened && tool !== 'material') return;
        const id = placedEditor.selectedId, root = sketchupModelEntry(id)?.root;
        const node = root && (placedEditor.part ? findPart(root, placedEditor.part.node) : root);
        let mesh = null; node?.traverse((object) => { if (!mesh && object.isMesh) mesh = object; });
        if (mesh) { setScopeState('component'); pick({ placedId: id, object: mesh, componentNode: node }, 'component'); }
        else setTargets([]);
    }, [selectedPart, opened, tool, placedEditor.selectedId, placedEditor.part, pick]);
    return { opened: opened || tool === 'material', targets, reference, scope, pick, open, close, setScope, requestEdge, edgePicking };
}
