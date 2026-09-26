import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { usePlantAtlas } from '../plants/usePlantAtlas.js';
import { makePlantMaterials, plantUniforms, updatePlantUniforms } from '../plants/plantMaterials.js';
import { makeTopiaryCard, makeTopiaryCore, sampleTopiaryFoliage } from './topiaryGeometry.js';
import { TOPIARY_LIMITS } from './settings.js';
import TopiaryFence from './TopiaryFence.jsx';

const ATLAS = Object.freeze({ color: '/textures/topiary/thuja-albedo.png', normal: '/textures/topiary/thuja-normal.png', surface: '/textures/topiary/thuja-surface.png', singleSided: true, normalScale: .22, alphaTest: .43 });
const NO_RAYCAST = () => {};
function coreMaterial(atlas, size) {
    const material = new THREE.MeshStandardMaterial({ map: atlas.color.texture, color: '#ffffff', roughness: .8 });
    material.onBeforeCompile = shader => {
        shader.uniforms.uTopiaryTile = { value: size * 1.2 };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTopiaryPosition;varying vec3 vTopiaryNormal;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTopiaryPosition=position;vTopiaryNormal=normal;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTopiaryPosition;varying vec3 vTopiaryNormal;uniform float uTopiaryTile;')
            .replace('#include <map_fragment>', /* glsl */`
                vec3 axis=abs(vTopiaryNormal);
                vec2 uv=axis.y>max(axis.x,axis.z)?vTopiaryPosition.xz:(axis.x>axis.z?vTopiaryPosition.zy:vTopiaryPosition.xy);
                uv/=uTopiaryTile;
                vec4 a=texture2D(map,fract(uv));
                vec4 b=texture2D(map,fract(uv+vec2(.47,.31)));
                vec4 c=texture2D(map,fract(uv+vec2(.19,.68)));
                vec3 foliage=vec3(.066,.084,.028);
                foliage=mix(foliage,a.rgb,a.a);foliage=mix(foliage,b.rgb,b.a);foliage=mix(foliage,c.rgb,c.a);
                diffuseColor.rgb*=foliage*vec3(.84,1.06,.76)*.87;
            `);
    };
    material.customProgramCacheKey = () => 'topiary-core-v1';
    return material;
}
function TopiaryObject({ object, atlas, capacity, selected, lowPower, envMapIntensity }) {
    const group = useRef(), leaves = useRef();
    const { invalidate } = useThree();
    const [resources, setResources] = useState(null);
    const pathKey = JSON.stringify(object.points);
    const uniforms = useMemo(plantUniforms, []);
    const lod = useRef({ elapsed: 1, fraction: 1 });
    useLayoutEffect(() => {
        const config = { points: JSON.parse(pathKey), width: object.width, height: object.height, roundness: object.roundness, leafSize: object.leafSize, seed: object.seed };
        const core = makeTopiaryCore(config), card = makeTopiaryCard();
        const pool = sampleTopiaryFoliage(core, config, capacity);
        card.setAttribute('plantExposure', new THREE.InstancedBufferAttribute(new Float32Array(pool.count), 1));
        card.setAttribute('plantHabitat', new THREE.InstancedBufferAttribute(new Float32Array(pool.count).fill(.5), 1));
        const materials = makePlantMaterials(atlas, uniforms), coreMat = coreMaterial(atlas, object.leafSize);
        // The slider sets the leaf surface; the map only modulates its fine
        // variation. Multiplying both full ranges produced mirror-like patches.
        const leafCompile = materials.leaves.onBeforeCompile;
        materials.leaves.onBeforeCompile = (shader, renderer) => {
            leafCompile(shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughness*.85+roughnessFactor*.15,.25,1.0);');
        };
        materials.leaves.customProgramCacheKey = () => 'topiary-leaf-v3';
        const outline = new THREE.EdgesGeometry(core, 32);
        const result = { core, card, pool, materials, coreMat, outline };
        setResources(result); lod.current.elapsed = 1; invalidate();
        return () => {core.dispose();card.dispose();outline.dispose();materials.dispose();coreMat.dispose();};
    }, [pathKey, object.width, object.height, object.roundness, object.leafSize, object.seed, capacity, atlas, uniforms, invalidate]);
    useLayoutEffect(() => {
        if (!resources || !leaves.current) return;
        const mesh = leaves.current;
        mesh.instanceMatrix.array.set(resources.pool.matrices);mesh.instanceMatrix.needsUpdate=true;
        if(!mesh.instanceColor)mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(resources.pool.colors.length),3);
        mesh.instanceColor.array.set(resources.pool.colors);mesh.instanceColor.needsUpdate=true;
        mesh.computeBoundingBox();mesh.computeBoundingSphere();
    }, [resources]);
    useLayoutEffect(() => {
        if(!resources)return;
        updatePlantUniforms(uniforms,{dryness:0,wind:0,windBearing:0,flutter:0,translucency:object.translucency},0);
        resources.materials.leaves.roughness=object.roughness;
        resources.materials.leaves.envMapIntensity=resources.coreMat.envMapIntensity=envMapIntensity;
        resources.coreMat.roughness=Math.max(.45,object.roughness*.8);
        if(leaves.current)leaves.current.count=Math.floor(resources.pool.count*object.density*lod.current.fraction);
        invalidate();
    }, [resources, object.roughness, object.translucency, object.density, envMapIntensity, uniforms, invalidate]);
    const center=useMemo(()=>new THREE.Vector3(),[]);
    useFrame(({camera,size},delta)=>{
        if(!resources||!group.current||!leaves.current)return;
        lod.current.elapsed+=delta;if(lod.current.elapsed<.15)return;lod.current.elapsed=0;
        // Projected branch size, using the nearest point of the whole volume.
        // A long hedge never loses detail just because its origin is far away.
        center.copy(resources.core.boundingSphere.center);group.current.localToWorld(center);
        const distance=Math.max(.2,camera.position.distanceTo(center)-resources.core.boundingSphere.radius*object.scale);
        const pixels=object.leafSize*object.scale*size.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance);
        const desired=Math.min(lowPower?.7:1,Math.max(0,Math.min(1,(pixels-1.5)/12)));
        if(Math.abs(desired-lod.current.fraction)<.045)return;
        lod.current.fraction=desired;
        leaves.current.count=Math.floor(resources.pool.count*object.density*desired);
    });
    if(!resources)return null;
    return <group ref={group} name={`topiary-${object.id}`} position={[object.x,object.baseY,object.z]} rotation={[0,THREE.MathUtils.degToRad(object.rotation),0]} scale={object.scale} userData={{ topiaryId: object.id }}>
        <mesh geometry={resources.core} material={resources.coreMat} castShadow receiveShadow />
        <instancedMesh key={resources.pool.count} ref={leaves} args={[resources.card,resources.materials.leaves,resources.pool.count]} customDepthMaterial={resources.materials.leafDepth} receiveShadow castShadow={false} raycast={NO_RAYCAST} />
        {object.fenceStyle !== 'none' ? <TopiaryFence object={object} /> : null}
        {selected ? <lineSegments geometry={resources.outline} raycast={NO_RAYCAST}><lineBasicMaterial color="#d9ca8c" transparent opacity={.65} depthTest={false} /></lineSegments> : null}
    </group>;
}
function FenceOnlyObject({ object }) {
    return <group name={`topiary-${object.id}`} position={[object.x,object.baseY,object.z]} rotation={[0,THREE.MathUtils.degToRad(object.rotation),0]} scale={object.scale} userData={{ topiaryId: object.id }}>
        {object.fenceStyle !== 'none' ? <TopiaryFence object={object} /> : null}
    </group>;
}
function ReadyTopiaryObjects({ objects, selectedId, qualityProfile, envMapIntensity=1 }) {
    const atlas=usePlantAtlas(ATLAS);
    const capacity=Math.min(TOPIARY_LIMITS.cards,Math.floor(TOPIARY_LIMITS.totalCards/Math.max(1,objects.length)));
    if(!atlas)return null;
    return <group name="topiary">{objects.map(object=>object.foliageVisible===false?<FenceOnlyObject key={object.id} object={object}/>:<TopiaryObject key={object.id} object={object} atlas={atlas} capacity={capacity} selected={object.id===selectedId} lowPower={qualityProfile?.isLowPower} envMapIntensity={envMapIntensity} />)}</group>;
}

export default function TopiaryObjects(props) {
    const [started,setStarted]=useState(false);
    useLayoutEffect(()=>{useLoader.preload(THREE.TextureLoader,[ATLAS.color,ATLAS.normal,ATLAS.surface]);setStarted(true);},[]);
    if (!props.objects.some(object=>object.foliageVisible!==false)) return <group name="topiary">{props.objects.map(object=><FenceOnlyObject key={object.id} object={object}/>)}</group>;
    return started?<React.Suspense fallback={null}><ReadyTopiaryObjects {...props}/></React.Suspense>:null;
}
