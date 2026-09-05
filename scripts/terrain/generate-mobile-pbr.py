"""Half-resolution terrain source maps: touch devices never decode the 1K set."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[2]/'public/textures/azov'
manifest=json.loads((root/'manifest.json').read_text())
(root/'mobile').mkdir(exist_ok=True)
for material in manifest['materials']:
    for channel in ['color','normal','surface']:
        name=f'{material}-{channel}.webp'
        im=Image.open(root/name).convert('RGB').resize((512,512),Image.Resampling.LANCZOS)
        if channel=='normal':
            n=np.asarray(im).astype(np.float32)/127.5-1
            n/=np.maximum(1e-6,np.linalg.norm(n,axis=-1,keepdims=True))
            im=Image.fromarray(np.uint8(np.clip(n*.5+.5,0,1)*255+.5))
        im.save(root/'mobile'/name,quality=92,lossless=channel!='color',method=6)
manifest['mobileResolution']=512
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Generated 18 touch-device maps at 512 square')
