"""Deterministic, tileable Azov material maps. Heights are in metres; no baked light.
Run with NumPy + Pillow. Albedo is sRGB; normal and packed R=rough/G=AO/B=height are linear.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
N=1024
ROOT=Path(__file__).resolve().parents[2]/'public/textures/azov'
ROOT.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(37091)
y,x=np.mgrid[0:N,0:N]/N

def noise(scale):
    base=rng.normal(size=(N,N))
    kx=np.fft.fftfreq(N)[None,:];ky=np.fft.fftfreq(N)[:,None]
    out=np.fft.ifft2(np.fft.fft2(base)*np.exp(-(kx*kx+ky*ky)*(scale**2)*5)).real
    return out/(out.std()+1e-9)

def save(name,color,height,rough,tile,height_range):
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))/(2*tile/N)
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))/(2*tile/N)
    normals=np.stack([-dx,dy,np.ones_like(dx)],-1)
    normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
    # Local concavity affects only ambient light, never albedo.
    broad=(np.roll(height,3,0)+np.roll(height,-3,0)+np.roll(height,3,1)+np.roll(height,-3,1))*.25
    ao=np.clip(1-(broad-height)*90,.5,1)
    packed=np.stack([np.clip(rough,0,1),ao,np.clip(height/height_range+.5,0,1)],-1)
    for suffix,data in [('color',color),('normal',normals*.5+.5),('surface',packed)]:
        data=np.uint8(np.clip(data,0,1)*255+.5)
        Image.fromarray(data).save(ROOT/f'{name}-{suffix}.webp',quality=92,lossless=suffix!='color',method=6)

fine=noise(.65);mid=noise(6);large=noise(80)
sand_height=.00045*fine+.0006*mid+.0014*large+.003*np.sin((x*9+y*2)*np.pi*2+noise(50)*.22)
sand_color=np.array([.67,.59,.45])[None,None,:]*(1+(fine*.045+mid*.025+large*.035)[...,None])
sand_color+=np.clip(fine-1.6,0,1)[...,None]*np.array([.09,.085,.07])
save('sand',sand_color,sand_height,np.full((N,N),.88)+fine*.025,1.2,.018)

height=sand_height.copy();color=sand_color.copy();rough=np.full((N,N),.8)
palette=np.array([[.85,.82,.72],[.72,.69,.59],[.44,.39,.32],[.24,.26,.25],[.91,.87,.74],[.65,.55,.4]])
for i in range(3100):
    cx,cy=rng.integers(0,N,2);radius=rng.uniform(2.4,16);ratio=rng.uniform(.45,.95);angle=rng.uniform(0,np.pi*2)
    r=int(radius+2);xx,yy=np.meshgrid(np.arange(-r,r+1),np.arange(-r,r+1))
    u=(xx*np.cos(angle)+yy*np.sin(angle))/radius;v=(-xx*np.sin(angle)+yy*np.cos(angle))/(radius*ratio)
    theta=np.arctan2(v,u);dist=np.sqrt(u*u+v*v)
    scallop=1+.045*np.sin(theta*13)
    mask=dist<scallop
    if i%3:mask &= (u+v*.3>rng.uniform(-.9,.1))
    dome=np.maximum(0,1-dist*dist)**.6
    rib=np.sin(theta*(9+i%9)+dist*2)*.00045*dome
    relief=(.0015+dome*rng.uniform(.001,.006)+rib)
    Y=(yy+cy)%N;X=(xx+cx)%N
    base_height=sand_height[cy,cx]
    visible=mask & (base_height+relief>height[Y,X])
    tint=palette[rng.integers(len(palette))]
    ring=.95+.045*np.sin(dist*22+theta*.2)
    patch=np.clip(tint[None,None,:]*ring[...,None],0,1)
    color[Y[visible],X[visible]]=patch[visible]
    height[Y[visible],X[visible]]=base_height+relief[visible]
    rough[Y[visible],X[visible]]=rng.uniform(.53,.79)
save('shells',color,height,rough,1.2,.024)

broad=noise(90);rock=noise(16);grain=noise(1.1)
# Unequal sediment beds and eroded joints: avoid a regular corrugated wall.
strata=np.sin(y*np.pi*2*5+broad*.6)+.28*np.sin(y*np.pi*2*13+broad*.95)
# Periodic oblique joints intersect bedding; a narrow recessed centre has chipped shoulders.
joint=np.abs(np.sin(x*np.pi*2*4+y*np.pi*2+broad*.15))
crack=np.exp(-(joint/.048)**2)
stone_h=.0025*strata+.003*rock+.0002*grain-crack*.012
stone_c=np.array([.66,.51,.35])[None,None,:]*(1+(strata*.045+rock*.055+broad*.1+grain*.025)[...,None])
stone_c+=np.maximum(strata-.4,0)[...,None]*np.array([.025,.025,.022])
save('sandstone',stone_c,stone_h,np.full((N,N),.89)+grain*.02,2.8,.05)
(ROOT/'manifest.json').write_text(json.dumps({'generator':'scripts/terrain/generate-pbr.py','seed':37091,'resolution':N,'format':'WebP, color quality 92; lossless data','license':'project-generated procedural maps','encoding':{'color':'sRGB','normal':'linear, tangent +Y','surface':'linear: R roughness, G AO, B height centred at 0.5'},'materials':{'sand':{'tileMetres':1.2,'heightRangeMetres':.018},'shells':{'tileMetres':1.2,'heightRangeMetres':.024},'sandstone':{'tileMetres':2.8,'heightRangeMetres':.05}}},indent=2)+'\n')
print('Generated 9 seamless physical material maps at',ROOT)
