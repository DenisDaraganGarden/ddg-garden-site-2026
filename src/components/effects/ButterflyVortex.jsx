import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec2 uMouse;
uniform float uSpeed;
uniform float uDensity;
uniform float uStrength;
uniform float uComplexity;
uniform float uBlackLevel;
uniform float uHighlight;

varying vec2 vUv;

// Simplex 2D noise implementation
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = vUv;
    float t = uTime * uSpeed * 0.5;
    float dist = distance(uv, uMouse);
    float mouseEffect = smoothstep(0.5, 0.0, dist) * uStrength;
    
    vec2 displacement = vec2(
        snoise(uv * uComplexity + t),
        snoise(uv * uComplexity + t + 100.0)
    ) * uDensity;
    
    vec2 distortedUv = uv + displacement + (normalize(uv - uMouse) * mouseEffect * 0.1);
    
    float n1 = snoise(distortedUv * 3.0 - t * 0.2);
    float n2 = snoise(distortedUv * 6.0 + t * 0.3);
    float n3 = snoise(distortedUv * 12.0 - t * 0.4);
    float finalNoise = n1 * 0.5 + n2 * 0.25 + n3 * 0.125;
    
    // Create sharp ridges by taking the absolute value (folding the noise)
    float ridges = abs(finalNoise);
    // Invert so ridges become 1.0 (peaks) and flats become 0.0
    ridges = 1.0 - ridges;
    
    // Crush the greys into deep black using the uBlackLevel
    // uBlackLevel from 0-1 maps to a power of 1 to 50
    float powerCurve = mix(1.0, 50.0, uBlackLevel);
    float lines = pow(ridges, powerCurve);
    
    // Deep black oil base
    vec3 colorBase = vec3(0.005, 0.005, 0.008);
    // Subtle silver highlight
    vec3 colorHighlight = vec3(0.7, 0.75, 0.8) * uHighlight;
    
    vec3 finalColor = mix(colorBase, colorHighlight, lines);
    
    float vignette = length(uv - 0.5);
    finalColor *= smoothstep(0.8, 0.2, vignette);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const ButterflyVortex = ({ settings }) => {
    const meshRef = useRef();
    const materialRef = useRef();

    const config = {
        speed: settings?.speed ?? 15,
        density: settings?.density ?? 30,
        strength: settings?.strength ?? 40,
        complexity: settings?.complexity ?? 25,
        blackLevel: settings?.blackLevel ?? 70,
        highlight: settings?.highlight ?? 50
    };

    const uniforms = useMemo(
        () => ({
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) },
            uSpeed: { value: config.speed / 100 },
            uDensity: { value: config.density / 100 },
            uStrength: { value: config.strength / 100 },
            uComplexity: { value: (config.complexity / 100) * 5.0 + 1.0 },
            uBlackLevel: { value: config.blackLevel / 100 },
            uHighlight: { value: config.highlight / 100 }
        }),
        []
    );

    useEffect(() => {
        if (materialRef.current) {
            materialRef.current.uniforms.uSpeed.value = config.speed / 100;
            materialRef.current.uniforms.uDensity.value = config.density / 100;
            materialRef.current.uniforms.uStrength.value = config.strength / 100;
            materialRef.current.uniforms.uComplexity.value = (config.complexity / 100) * 5.0 + 1.0;
            materialRef.current.uniforms.uBlackLevel.value = config.blackLevel / 100;
            materialRef.current.uniforms.uHighlight.value = config.highlight / 100;
        }
    }, [config.speed, config.density, config.strength, config.complexity, config.blackLevel, config.highlight]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
            const mouseX = (state.pointer.x + 1) / 2;
            const mouseY = (state.pointer.y + 1) / 2;
            materialRef.current.uniforms.uMouse.value.x += (mouseX - materialRef.current.uniforms.uMouse.value.x) * 0.05;
            materialRef.current.uniforms.uMouse.value.y += (mouseY - materialRef.current.uniforms.uMouse.value.y) * 0.05;
        }
    });

    const { viewport } = useThree();

    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[Math.max(viewport.width, viewport.height) * 1.5, Math.max(viewport.width, viewport.height) * 1.5]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
            />
        </mesh>
    );
};

export default ButterflyVortex;
