import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TOPIARY_LIMITS } from './settings.js';
import { makeTopiaryCore } from './topiaryGeometry.js';

// A stroke lives here only while the pointer is captured. One pointerup creates
// exactly one undoable author object; Escape/cancel/blur commit nothing.
export default function TopiaryBrush({ enabled, settings, orbitRef, onStroke }) {
    const { gl,camera,invalidate }=useThree();
    const cursor=useRef(),callback=useRef(onStroke);callback.current=onStroke;
    const [preview,setPreview]=useState(null);
    const geometry=useMemo(()=>preview?makeTopiaryCore({points:preview,width:settings.topiaryBrushWidth,height:settings.topiaryBrushHeight,roundness:.55}):null,[preview,settings.topiaryBrushWidth,settings.topiaryBrushHeight]);
    useEffect(()=>()=>geometry?.dispose(),[geometry]);
    useEffect(()=>{
        if(!enabled)return undefined;
        const canvas=gl.domElement,plane=new THREE.Plane(new THREE.Vector3(0,1,0),-settings.topiaryPlaneY),ray=new THREE.Raycaster(),hit=new THREE.Vector3();
        let stroke=null,frame=0,oldOrbit=true,lastPreview=0;
        const point=event=>{const b=canvas.getBoundingClientRect();ray.setFromCamera({x:2*(event.clientX-b.left)/b.width-1,y:1-2*(event.clientY-b.top)/b.height},camera);return ray.ray.intersectPlane(plane,hit)&&ray.ray.origin.distanceTo(hit)<400?[hit.x,hit.z]:null;};
        const stop=()=>{const active=stroke;stroke=null;if(active&&canvas.hasPointerCapture(active.id))canvas.releasePointerCapture(active.id);cancelAnimationFrame(frame);if(orbitRef.current)orbitRef.current.enabled=oldOrbit;setPreview(null);invalidate();};
        const update=event=>{
            const p=point(event);if(!p)return;
            if(cursor.current){cursor.current.visible=true;cursor.current.position.set(p[0],settings.topiaryPlaneY+.02,p[1]);}
            if(stroke&&event.pointerId===stroke.id){
                const last=stroke.points.at(-1),origin=stroke.points[0];
                if(stroke.points.length<TOPIARY_LIMITS.points&&Math.hypot(p[0]-origin[0],p[1]-origin[1])<=TOPIARY_LIMITS.span&&Math.hypot(p[0]-last[0],p[1]-last[1])>Math.max(.07,settings.topiaryBrushWidth*.12))stroke.points.push(p);
                if(performance.now()-lastPreview>65&&!frame)frame=requestAnimationFrame(()=>{frame=0;lastPreview=performance.now();if(stroke)setPreview([...stroke.points]);});
            }invalidate();
        };
        const down=event=>{if(event.button!==0||stroke)return;const p=point(event);if(!p)return;event.preventDefault();event.stopImmediatePropagation();oldOrbit=orbitRef.current?.enabled??true;if(orbitRef.current)orbitRef.current.enabled=false;stroke={id:event.pointerId,points:[p]};canvas.setPointerCapture(event.pointerId);setPreview([p]);};
        const move=event=>{if(stroke){event.preventDefault();event.stopImmediatePropagation();}update(event);};
        const up=event=>{if(!stroke||event.pointerId!==stroke.id||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();update(event);const points=stroke.points;stop();callback.current?.(points);};
        const cancel=()=>{if(stroke)stop();};
        const key=event=>{if(event.key==='Escape')cancel();};
        const leave=()=>{if(cursor.current&&!stroke)cursor.current.visible=false;invalidate();};
        canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);
        canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('pointerleave',leave);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
        return()=>{canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('pointerleave',leave);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);stop();};
    },[enabled,gl,camera,settings.topiaryPlaneY,settings.topiaryBrushWidth,orbitRef,invalidate]);
    if(!enabled)return null;
    return <group>
        <gridHelper args={[80,80,'#77786b','#55584d']} position={[0,settings.topiaryPlaneY+.005,0]} raycast={()=>{}} />
        <mesh ref={cursor} rotation={[-Math.PI/2,0,0]} visible={false} raycast={()=>{}}><ringGeometry args={[settings.topiaryBrushWidth/2-.015,settings.topiaryBrushWidth/2,48]}/><meshBasicMaterial color="#d9ca8c" depthTest={false} transparent opacity={.8}/></mesh>
        {geometry?<mesh geometry={geometry} position={[0,settings.topiaryPlaneY,0]} raycast={()=>{}}><meshStandardMaterial color="#6c7a40" transparent opacity={.65} depthWrite={false}/></mesh>:null}
    </group>;
}
