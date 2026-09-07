// Shared screen triangle and one world-space cloud transmittance contract.
export const screenVertex = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }
`;

export const cloudShadowSampling = /* glsl */`
  uniform sampler2D uCloudShadow;
  uniform vec2 uShadowOrigin;
  uniform float uShadowExtent;
  uniform float uShadowStrength;
  uniform vec3 uSun;
  float cloudTransmission(vec3 p) {
    vec2 projected = p.xz-uSun.xz*p.y/max(uSun.y,.08);
    vec2 uv=(projected-uShadowOrigin)/uShadowExtent+.5;
    float bounds=smoothstep(0.,.025,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
    return mix(1.,texture2D(uCloudShadow,clamp(uv,0.,1.)).r,bounds*uShadowStrength);
  }
`;
