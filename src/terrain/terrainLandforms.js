// Metre-space landforms. Keep the small GLSL counterpart below in agreement:
// water, habitat and collision all consume this surface independently of LOD.
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const bell=x=>{const t=Math.max(0,1-x*x);return t*t*t;};
export function landformHash(cell,seed,salt=0){
 let n=((cell+8192)*131+seed*17+salt*173)%4093;
 n=(n*n*13+n*31)%4093;
 return ((n*n*7+n*157+23)%4093)/4093;
}
export function coastLandforms(s,p){
 const scale=p.terrainFeatureScale,k=Math.floor(s/scale);
 let slide=0,ravine=0,descent=0;
 for(let j=-1;j<=1;j++){
  const cell=k+j,r=landformHash(cell,p.terrainSeed),v=landformHash(cell,p.terrainSeed,1);
  const centre=(cell+.18+r*.64)*scale,ds=s-centre;
  slide+=bell(ds/(scale*(.16+.12*v)))*(.65+.35*r)*smooth(.15,.6,v)*p.terrainLandslides;
  ravine+=bell((ds-scale*.3)/(scale*(.04+.045*r)))*(.55+.45*v)*p.terrainErosion;
  descent+=bell((ds+scale*.25)/(scale*(.10+.06*v)))*smooth(0,.15,p.terrainPaths-landformHash(cell,p.terrainSeed,2)*.85);
 }
 return {slide:clamp(slide),ravine:clamp(ravine),descent:clamp(descent)};
}
export function coastProfile(s,p){
 const f=coastLandforms(s,p),seed=p.terrainSeed*.137;
 const beach=p.terrainBeachWidth*(1+.12*Math.sin(s*.021));
 const base=Math.max(1.8,beach+1.5*Math.sin(s*.067+seed)+p.terrainRelief*(.45*Math.sin(s*.29+seed)+.18*Math.sin(s*.83)));
 const width=p.terrainCliffSlope*(1+.18*Math.sin(s*.051+seed));
 const bank=p.terrainCliffHeight*(.82+.18*Math.sin(s*.012+1.1))*(1-.42*Math.exp(-Math.pow((s-p.terrainCapePosition)/p.terrainCapeWidth,2)));
 const foot=Math.max(1.5,base-bank*(f.slide*.7+f.descent*.95));
 const notch=Math.pow(Math.max(0,Math.sin(s*.4+Math.sin(s*.17+seed)*1.5)),4)*p.terrainErosion*Math.min(1.2,bank*.2);
 const top=base+width+notch+bank*(f.slide*1.8+f.ravine*.65+f.descent*3.8);
 return {...f,beach,bank,foot,top,width:top-foot};
}
export function coastPathMask(q,s,p){
 if(p.terrainPaths<=0||q<1)return 0;
 const scale=p.terrainFeatureScale,k=Math.floor(s/scale);let path=0;
 for(let j=-1;j<=1;j++){
  const cell=k+j,r=landformHash(cell,p.terrainSeed),centre=(cell+.18+r*.64-.25)*scale;
  const pathPresence=smooth(0,.15,p.terrainPaths-landformHash(cell,p.terrainSeed,2)*.85);
  const bend=Math.sin(q*.085+r*6.28)*1.1+Math.sin(q*.21)*.35;
  path=Math.max(path,(1-smooth(p.terrainPathWidth*.5,p.terrainPathWidth*.5+.7,Math.abs(s-centre-bend)))*pathPresence);
 }
 return path*smooth(1,5,q)*(1-smooth(p.terrainBeachWidth+p.terrainCliffSlope+p.terrainCliffHeight*4+12,p.terrainBeachWidth+p.terrainCliffSlope+p.terrainCliffHeight*4+28,q));
}
export const landformsShader=/* glsl */`
uniform vec4 uCoastLandforms;
float landformBell(float x){float t=max(0.0,1.0-x*x);return t*t*t;}
float landformHash(float cell,float salt){
 int n=int(mod((cell+8192.0)*131.0+uCoastShape.w*17.0+salt*173.0,4093.0));
 // Integer arithmetic avoids driver-dependent floating hash discontinuities.
 n=(n*n*13+n*31)%4093;
 return float((n*n*7+n*157+23)%4093)/4093.0;
}
vec3 coastLandforms(float s){
 float scale=uCoastLandforms.x,k=floor(s/scale);vec3 result=vec3(0.0);
 for(int j=-1;j<=1;j++){
  float cell=k+float(j),r=landformHash(cell,0.0),v=landformHash(cell,1.0);
  float centre=(cell+.18+r*.64)*scale,ds=s-centre;
  result.x+=landformBell(ds/(scale*(.16+.12*v)))*(.65+.35*r)*smoothstep(.15,.6,v)*uCoastLandforms.y;
  result.y+=landformBell((ds-scale*.3)/(scale*(.04+.045*r)))*(.55+.45*v)*uCoastGeology.x;
  result.z+=landformBell((ds+scale*.25)/(scale*(.10+.06*v)))*smoothstep(0.0,.15,uCoastLandforms.z-landformHash(cell,2.0)*.85);
 }
 return clamp(result,0.0,1.0);
}
vec4 coastProfile(float s,vec3 f){
 float seed=uCoastShape.w*.137,beach=uCoastDimensions.z*(1.0+.12*sin(s*.021));
 float base=max(1.8,beach+1.5*sin(s*.067+seed)+uCoastSurface.z*(.45*sin(s*.29+seed)+.18*sin(s*.83)));
 float width=uCoastDetail.x*(1.0+.18*sin(s*.051+seed));
 float bank=uCoastDimensions.w*(.82+.18*sin(s*.012+1.1))*(1.0-.42*exp(-pow((s-uCoastDetail.w)/uCoastSurface.x,2.0)));
 float foot=max(1.5,base-bank*(f.x*.7+f.z*.95));
 float notch=pow(max(0.0,sin(s*.4+sin(s*.17+seed)*1.5)),4.0)*uCoastGeology.x*min(1.2,bank*.2);
 float top=base+width+notch+bank*(f.x*1.8+f.y*.65+f.z*3.8);
 return vec4(foot,top,bank,beach);
}
float coastPathMask(vec2 qs){
 if(uCoastLandforms.z<=0.0||qs.x<1.0)return 0.0;
 float scale=uCoastLandforms.x,k=floor(qs.y/scale),path=0.0;
 for(int j=-1;j<=1;j++){
  float cell=k+float(j),r=landformHash(cell,0.0),centre=(cell+.18+r*.64-.25)*scale;
  float pathPresence=smoothstep(0.0,.15,uCoastLandforms.z-landformHash(cell,2.0)*.85);
  float bend=sin(qs.x*.085+r*6.28)*1.1+sin(qs.x*.21)*.35;
  path=max(path,(1.0-smoothstep(uCoastLandforms.w*.5,uCoastLandforms.w*.5+.7,abs(qs.y-centre-bend)))*pathPresence);
 }
 float end=uCoastDimensions.z+uCoastDetail.x+uCoastDimensions.w*4.0;
 return path*smoothstep(1.0,5.0,qs.x)*(1.0-smoothstep(end+12.0,end+28.0,qs.x));
}
`;
