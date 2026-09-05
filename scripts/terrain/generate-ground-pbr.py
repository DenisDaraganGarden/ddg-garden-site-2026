"""Periodic ground litter, low living cover and eroded loam; no baked lighting.
Only generates the three supplementary materials. Existing shell maps stay intact.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

N = 1024
ROOT = Path(__file__).resolve().parents[2] / 'public/textures/azov'
rng = np.random.default_rng(37912)

def noise(scale):
    kx = np.fft.fftfreq(N)[None, :]
    ky = np.fft.fftfreq(N)[:, None]
    out = np.fft.ifft2(np.fft.fft2(rng.normal(size=(N, N))) * np.exp(-(kx*kx+ky*ky)*scale*scale*5)).real
    return out / max(1e-9, out.std())

def save(name, color, height, rough, tile, span):
    dx = (np.roll(height, -1, 1)-np.roll(height, 1, 1))/(2*tile/N)
    dy = (np.roll(height, -1, 0)-np.roll(height, 1, 0))/(2*tile/N)
    normal = np.stack([-dx, dy, np.ones_like(dx)], -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    broad = sum(np.roll(height, d, axis) for d in [-3, 3] for axis in [0, 1])/4
    ao = np.clip(1-(broad-height)*70, .6, 1)
    surface = np.stack([np.clip(rough, 0, 1), ao, np.clip(height/span+.5, 0, 1)], -1)
    for channel, data in [('color', color), ('normal', normal*.5+.5), ('surface', surface)]:
        Image.fromarray(np.uint8(np.clip(data, 0, 1)*255+.5)).save(ROOT/f'{name}-{channel}.webp', lossless=channel!='color', quality=93, method=6)

fine, meso, broad = noise(.7), noise(5), noise(55)
height = fine*.0004+meso*.0006+broad*.0012
soil = np.array([.37, .31, .215])*(1+(fine*.07+meso*.08+broad*.1)[..., None])
fresh, dry = soil.copy(), soil.copy()*np.array([1.2, 1.13, 1.0])
rough = np.clip(.91+fine*.015, .75, .98)
# Short overlapping blades, petiole fragments and leaf litter. Every stroke
# wraps at the tile edge and contributes to all maps through the same mask.
for i in range(7400):
    cx, cy = rng.integers(0, N, 2)
    leaf = i % 5 == 0
    length = rng.uniform(5, 24) if leaf else rng.uniform(8, 58)
    width = rng.uniform(2.4, 6.5) if leaf else rng.uniform(.65, 1.8)
    angle = rng.uniform(0, np.pi*2)
    rad = int(length+3)
    xx, yy = np.meshgrid(np.arange(-rad, rad+1), np.arange(-rad, rad+1))
    u = (xx*np.cos(angle)+yy*np.sin(angle))/length
    v = (-xx*np.sin(angle)+yy*np.cos(angle))/width
    v -= np.sin(u*2)*(.3 if leaf else .7)
    shape = np.maximum(0, 1-u*u-v*v) if leaf else np.maximum(0, 1-v*v)*np.maximum(0, 1-u*u)
    local = height[cy, cx]+.0006+shape*rng.uniform(.0004, .0022)
    Y, X = (yy+cy) % N, (xx+cx) % N
    mask = (shape>.02) & (local>height[Y, X]) & (np.abs(u)<1)
    tint = rng.uniform(.75, 1.2)
    live = np.array([.255, .34, .135]) if leaf else np.array([.33, .385, .17])
    straw = np.array([.57, .475, .285]) if leaf else np.array([.65, .55, .34])
    # Pale veins are albedo, not a fake directional highlight.
    vein = 1+.1*np.exp(-v*v*25)
    fresh[Y[mask], X[mask]] = (live*tint*vein[..., None])[mask]
    dry[Y[mask], X[mask]] = (straw*tint*vein[..., None])[mask]
    height[Y[mask], X[mask]] = local[mask]
    rough[Y[mask], X[mask]] = .79 if leaf else .85
save('ground-fresh', fresh, height, rough, 1.6, .016)
save('ground-dry', dry, height, np.minimum(.98, rough+.05), 1.6, .016)

# Fine crumbly clay, chipped grains and irregular desiccation pockets.
fine, medium, broad = noise(.8), noise(9), noise(62)
loam_h = fine*.00035+medium*.0022+broad*.004
loam_c = np.array([.57, .405, .24])*(1+(fine*.04+medium*.065+broad*.065)[..., None])
for i in range(1800):
    cx, cy = rng.integers(0, N, 2)
    rad = rng.uniform(1.5, 12)
    ir = int(rad+2)
    xx, yy = np.meshgrid(np.arange(-ir, ir+1), np.arange(-ir, ir+1))
    r = np.sqrt((xx/rad)**2+(yy/rad)**2)
    Y, X = (yy+cy) % N, (xx+cx) % N
    mask = r<1
    dome = np.maximum(0, 1-r*r)
    loam_h[Y[mask], X[mask]] += dome[mask]*rng.uniform(-.006, .004)
    loam_c[Y[mask], X[mask]] *= rng.uniform(.88, 1.1)
# Interrupted vertical shrinkage cracks and drainage grooves. World-space
# triplanar projection keeps their long axis vertical on the bluff face.
for i in range(130):
    cx,cy=rng.integers(0,N,2)
    length=rng.uniform(28,180);width=rng.uniform(.7,2.5)
    xx,yy=np.meshgrid(np.arange(-13,14),np.arange(-int(length),int(length)+1))
    drift=np.sin(yy/length*2.5+i)*2.2+yy/length*rng.uniform(-2,2)
    groove=np.exp(-((xx-drift)/width)**2)*np.maximum(0,1-(yy/length)**2)**.5
    Y,X=(yy+cy)%N,(xx+cx)%N
    loam_h[Y,X]-=groove*rng.uniform(.002,.011)
    loam_c[Y,X]*=(1-groove*.035)[...,None]
save('loam', loam_c, loam_h, np.clip(.91+fine*.02, .8, .99), 1.8, .04)

manifest = json.loads((ROOT/'manifest.json').read_text())
manifest['groundGenerator'] = {'script': 'scripts/terrain/generate-ground-pbr.py', 'seed': 37912}
for name, tile, span in [('ground-fresh', 1.6, .016), ('ground-dry', 1.6, .016), ('loam', 1.8, .04)]:
    manifest['materials'][name] = {'tileMetres': tile, 'heightRangeMetres': span}
(ROOT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Generated fresh/dry litter and loam: 9 PBR maps, periodic in both axes')
