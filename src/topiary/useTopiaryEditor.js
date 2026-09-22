import { useCallback, useRef, useState } from 'react';
import { createTopiaryStroke, normalizeTopiaryObject, TOPIARY_LIMITS } from './settings.js';

export function useTopiaryEditor({ settings, history, setActiveTab, setTool, tool, language }) {
    const [selectedId, setSelectedId]=useState(null);
    const live=useRef();live.current={settings,history,language};
    const select=useCallback(id=>{setSelectedId(id);setActiveTab('greenery/topiary');setTool('select');},[setActiveTab,setTool]);
    const update=useCallback((id,patch)=>{
        const {settings,history}=live.current;
        history.applySettings({topiaryObjects:settings.topiaryObjects.map((o,i)=>o.id===id?normalizeTopiaryObject({...o,...patch},i):o)});
    },[]);
    const onStroke=useCallback(points=>{
        const {settings,history,language}=live.current;
        if(settings.topiaryObjects.length>=TOPIARY_LIMITS.objects)return;
        const used=new Set(settings.topiaryObjects.map(o=>o.name));let n=1,name;
        do{name=`${language==='ru'?'Изгородь':'Hedge'} ${n++}`;}while(used.has(name));
        const object=createTopiaryStroke(points,settings,name);
        history.applySettings({topiaryEnabled:true,topiaryObjects:[...settings.topiaryObjects,object]});
        setSelectedId(object.id);
    },[]);
    const begin=useCallback(()=>{setActiveTab('greenery/topiary');setTool('topiary');},[setActiveTab,setTool]);
    const remove=useCallback(id=>{const {settings,history}=live.current;history.applySettings({topiaryObjects:settings.topiaryObjects.filter(o=>o.id!==id)});setSelectedId(null);},[]);
    return { selectedId:settings.topiaryObjects.some(o=>o.id===selectedId)?selectedId:null, select, update, onStroke, begin, stop:()=>setTool('select'), remove, drawing:tool==='topiary' };
}
