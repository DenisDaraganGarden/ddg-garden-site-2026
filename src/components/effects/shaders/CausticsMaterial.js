import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';

export const CausticsMaterial = shaderMaterial(
  {
    uHeightmap: null,
    uResolution: new THREE.Vector2(256, 256),
    uLightPos: new THREE.Vector3(10, 10, 10),
    uDepth: 5.0,
    uColor: new THREE.Color('#050505'),
    uCausticsIntensity: 0.5,
  },
  // Vertex Shader
  `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  // High-performance noise for relief
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    vUv = uv;
    
    // Add some organic relief displacement
    float d = noise(vUv * 4.0) * 1.5;
    vec3 displaced = position + vec3(0.0, 0.0, d);
    
    vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
  `,
  // Fragment Shader
  `
  uniform sampler2D uHeightmap;
  uniform vec2 uResolution;
  uniform vec3 uLightPos;
  uniform float uDepth;
  uniform vec3 uColor;
  uniform float uCausticsIntensity;
  
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vec2 cellSize = 1.0 / uResolution;
    
    // Sample water height and normal
    // We approximate the normal from the heightmap derivatives
    float h = texture2D(uHeightmap, vUv).r;
    float hL = texture2D(uHeightmap, vUv - vec2(cellSize.x, 0.0)).r;
    float hR = texture2D(uHeightmap, vUv + vec2(cellSize.x, 0.0)).r;
    float hD = texture2D(uHeightmap, vUv - vec2(0.0, cellSize.y)).r;
    float hU = texture2D(uHeightmap, vUv + vec2(0.0, cellSize.y)).r;
    
    vec3 normal = normalize(vec3(hL - hR, 2.0, hD - hU));
    
    // Refraction logic (simplified)
    vec3 lightDir = normalize(uLightPos - vWorldPosition);
    vec3 refracted = refract(-lightDir, normal, 0.75); // 1.0 / 1.33
    
    // Calculate how much the refracted rays focus on this ground point
    // This is a crude approximation: we look at the divergence of the normal
    float curvature = (hL + hR + hD + hU - 4.0 * h);
    float caustics = max(0.0, curvature * 100.0 * uCausticsIntensity);
    
    // Add some soft noise/base caustics
    caustics += pow(max(0.0, dot(normal, lightDir)), 20.0) * 0.1;
    
    vec3 finalColor = uColor + vec3(caustics);
    
    // Depth fog
    float fog = exp(-0.2 * uDepth);
    finalColor *= fog;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
);
