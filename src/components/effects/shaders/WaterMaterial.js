import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

export const WaterMaterial = shaderMaterial(
  {
    uHeightmap: null,
    uNormalmap: null,
    uEnvMap: null,
    uTime: 0,
    uBaseColor: new THREE.Color('#000000'),
    uWaterColor: new THREE.Color('#050505'),
    uBrightness: 0.5,
    uSunDirection: new THREE.Vector3(1, 1, 1).normalize(),
    uCameraPosition: new THREE.Vector3(),
  },
  // vertex shader
  `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  uniform sampler2D uHeightmap;

  void main() {
    vUv = uv;
    float h = texture2D(uHeightmap, vUv).x;
    vec3 newPosition = position + normal * h * 2.0;
    vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
  `,
  // fragment shader
  `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  
  uniform sampler2D uHeightmap;
  uniform sampler2D uNormalmap;
  uniform samplerCube uEnvMap;
  uniform vec3 uBaseColor;
  uniform vec3 uWaterColor;
  uniform vec3 uSunDirection;
  uniform vec3 uCameraPosition;
  uniform float uBrightness;

  void main() {
    // Normal estimation from heightmap or normalmap
    vec3 normal = vNormal;
    
    // Simple black water shading
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
    
    // Reflection
    vec3 reflectDir = reflect(-viewDir, normal);
    vec3 reflection = textureCube(uEnvMap, reflectDir).rgb;
    
    // Moonlit highlight (specular)
    float spec = pow(max(dot(reflectDir, uSunDirection), 0.0), 64.0) * 2.0;
    
    vec3 color = mix(uBaseColor, reflection * 0.5 + spec, fresnel);
    color += spec * 1.2; // Stronger moonlit specular
    
    gl_FragColor = vec4(color, 0.8); // More transparent to see caustics
  }
  `
);
