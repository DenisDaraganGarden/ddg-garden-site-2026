import * as THREE from 'three';

const distanceSegment = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
export const strokeDistance = (x, z, points) => {
    let d = Math.hypot(x - points[0][0], z - points[0][1]);
    for (let i = 1; i < points.length; i++) d = Math.min(d, distanceSegment(x, z, points[i - 1], points[i]));
    return d;
};
// Marching squares of the UNION of stroke capsules. Crossings do not leave
// overlapping walls, and a closed ring keeps its courtyard as a real hole.
export function strokeContours(points, radius) {
    const minX = Math.min(...points.map(p => p[0])) - radius - .2;
    const minZ = Math.min(...points.map(p => p[1])) - radius - .2;
    const spanX = Math.max(...points.map(p => p[0])) + radius + .2 - minX;
    const spanZ = Math.max(...points.map(p => p[1])) + radius + .2 - minZ;
    const step = Math.max(.035, radius / 5);
    const nx = Math.ceil(spanX / step), nz = Math.ceil(spanZ / step);
    // Rasterize only a narrow band around each segment. Resolution follows
    // hedge width, never the drawing's bounding box (long thin strokes must
    // not break into islands). Sparse cells bound work to the painted area.
    const field = new Map(), cells = new Set();
    const segments = points.length === 1 ? [[points[0],points[0]]] : points.slice(1).map((p,i)=>[points[i],p]);
    const reach = radius + step * 2;
    for (const [a,b] of segments) {
        const samples = Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/Math.max(step,radius*.7)));
        const seen = new Set();
        for (let j=0;j<=samples;j++) {
            const cx=a[0]+(b[0]-a[0])*j/samples,cz=a[1]+(b[1]-a[1])*j/samples;
            const x0=Math.max(0,Math.floor((cx-reach-minX)/step)),x1=Math.min(nx,Math.ceil((cx+reach-minX)/step));
            const z0=Math.max(0,Math.floor((cz-reach-minZ)/step)),z1=Math.min(nz,Math.ceil((cz+reach-minZ)/step));
            for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++) {
                const id=z*(nx+1)+x;if(seen.has(id))continue;seen.add(id);
                const v=radius-distanceSegment(minX+x*step,minZ+z*step,a,b);
                if(v>(field.get(id)??-Infinity))field.set(id,v);
                if(v>0)for(const [dx,dz] of [[0,0],[-1,0],[0,-1],[-1,-1]])if(x+dx>=0&&x+dx<nx&&z+dz>=0&&z+dz<nz)cells.add((z+dz)*nx+x+dx);
            }
        }
    }
    const vertices = new Map(), links = new Map();
    const tables = {1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],6:[[0,2]],7:[[3,2]],8:[[2,3]],9:[[2,0]],11:[[2,1]],12:[[1,3]],13:[[1,0]],14:[[0,3]]};
    for (const cell of cells) {
        const z=Math.floor(cell/nx),x=cell%nx;
        const ids = [z*(nx+1)+x,z*(nx+1)+x+1,(z+1)*(nx+1)+x+1,(z+1)*(nx+1)+x];
        const values = ids.map(i => field.get(i) ?? -step*3);
        const mask = values.reduce((v, n, i) => v | (n > 0 ? 1 << i : 0), 0);
        if (!mask || mask === 15) continue;
        const corners = [[x,z],[x+1,z],[x+1,z+1],[x,z+1]];
        const edge = e => {
            const n = (e+1)%4, key = [ids[e],ids[n]].sort((a,b)=>a-b).join(':');
            if (!vertices.has(key)) {
                const t = values[e]/(values[e]-values[n]);
                vertices.set(key, new THREE.Vector2(minX+(corners[e][0]+(corners[n][0]-corners[e][0])*t)*step, -(minZ+(corners[e][1]+(corners[n][1]-corners[e][1])*t)*step)));
            }
            return key;
        };
        const inside = values.reduce((a,b)=>a+b,0)>0;
        const pairs = mask === 5 ? (inside?[[0,1],[2,3]]:[[3,0],[1,2]]) : mask === 10 ? (inside?[[3,0],[1,2]]:[[0,1],[2,3]]) : tables[mask];
        for (const [a,b] of pairs) { const ka=edge(a),kb=edge(b); for(const [u,v] of [[ka,kb],[kb,ka]]) { if(!links.has(u))links.set(u,[]);links.get(u).push(v); } }
    }
    const visited=new Set(), contours=[];
    for(const start of links.keys()) {
        if(visited.has(start))continue;
        const contour=[];let key=start,previous=null;
        while(key&&!visited.has(key)) {visited.add(key);contour.push(vertices.get(key));const next=links.get(key).find(k=>k!==previous);previous=key;key=next;}
        if(key===start&&contour.length>=3) contours.push(contour);
    }
    return contours;
}
function simplifyContour(points, tolerance) {
    const closed=[...points,points[0]],keep=new Set([0,closed.length-1]),stack=[[0,closed.length-1]];
    while(stack.length) {
        const [first,last]=stack.pop();let far=-1,best=tolerance;
        const a=[closed[first].x,closed[first].y],b=[closed[last].x,closed[last].y];
        for(let i=first+1;i<last;i++){const d=distanceSegment(closed[i].x,closed[i].y,a,b);if(d>best){best=d;far=i;}}
        if(far>=0){keep.add(far);stack.push([first,far],[far,last]);}
    }
    const result=[...keep].sort((a,b)=>a-b).slice(0,-1).map(i=>closed[i]);
    return result.length>=3?result:points;
}
const contains = (p, polygon) => {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) { const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside; }
    return inside;
};
export function makeTopiaryCore(object) {
    const bevel=Math.min(object.width*.18,object.height*.2,.4)*object.roundness;
    const contours=strokeContours(object.points, Math.max(.08,object.width/2-bevel)).map(points=>simplifyContour(points,Math.min(.025,object.width*.012)));
    contours.sort((a,b)=>Math.abs(THREE.ShapeUtils.area(b))-Math.abs(THREE.ShapeUtils.area(a)));
    const shapes=[];
    for(const contour of contours) {
        const parent=shapes.find(s=>contains(contour[0],s.outline));
        if(parent) parent.shape.holes.push(new THREE.Path(contour));
        else shapes.push({shape:new THREE.Shape(contour),outline:contour});
    }
    const geometry=new THREE.ExtrudeGeometry(shapes.map(s=>s.shape),{depth:object.height-2*bevel,steps:1,bevelEnabled:bevel>.001,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:4});
    geometry.rotateX(-Math.PI/2);geometry.translate(0,bevel,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
}
function random(seed) {let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
// Uniform surface-area sampling; fixed seed and fixed maximum pool keep the
// same leaves in place when density, light or roughness changes.
export function sampleTopiaryFoliage(geometry, object, limit) {
    const pos=geometry.attributes.position,normal=geometry.attributes.normal,areas=[],triangles=[];
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();let area=0;
    for(let i=0;i<pos.count;i+=3) {
        a.fromBufferAttribute(pos,i);b.fromBufferAttribute(pos,i+1);c.fromBufferAttribute(pos,i+2);
        if((normal.getY(i)+normal.getY(i+1)+normal.getY(i+2))/3<-.5)continue;
        const part=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;
        if(part<1e-8)continue;area+=part;areas.push(area);triangles.push(i);
    }
    const count=Math.min(limit,Math.ceil(area*6/(object.leafSize*object.leafSize*.30)));
    const rng=random(object.seed),matrices=new Float32Array(count*16),colors=new Float32Array(count*3),dummy=new THREE.Object3D();
    const p=new THREE.Vector3(),n=new THREE.Vector3(),up=new THREE.Vector3(),side=new THREE.Vector3(),basis=new THREE.Matrix4(),colour=new THREE.Color();
    for(let k=0;k<count;k++) {
        const pick=rng()*area;let lo=0,hi=areas.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(areas[mid]<pick)lo=mid+1;else hi=mid;}
        const i=triangles[lo],s=Math.sqrt(rng()),u=1-s,v=s*(1-rng()),w=1-u-v;
        p.set(0,0,0);n.set(0,0,0);
        for(const [offset,weight] of [[0,u],[1,v],[2,w]]) {p.addScaledVector(a.fromBufferAttribute(pos,i+offset),weight);n.addScaledVector(a.fromBufferAttribute(normal,i+offset),weight);}
        n.normalize();p.addScaledVector(n,.025+rng()*.045);
        up.set(0,1,0);if(Math.abs(n.y)>.9)up.set(0,0,1);side.crossVectors(up,n).normalize();up.crossVectors(n,side).normalize();
        basis.makeBasis(side,up,n);dummy.quaternion.setFromRotationMatrix(basis);dummy.rotateZ((rng()-.5)*1.7);dummy.rotateX((rng()-.5)*.5);dummy.rotateY((rng()-.5)*.4);
        const size=object.leafSize*(.8+rng()*.4);dummy.scale.set(size,size,1);dummy.position.copy(p);dummy.updateMatrix();dummy.matrix.toArray(matrices,k*16);
        colour.setRGB(.77+rng()*.2,.82+rng()*.18,.72+rng()*.2);colour.toArray(colors,k*3);
    }
    return {matrices,colors,count,area};
}
export function makeTopiaryCard() {
    const geometry=new THREE.PlaneGeometry(1,1);
    const n=geometry.attributes.position.count;
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3).fill(1),3));
    for(const [key,size] of [['leafPivot',3],['leafAxis',3],['leafWeight',1],['phase',1]])geometry.setAttribute(key,new THREE.BufferAttribute(new Float32Array(n*size),size));
    // A valid zero-angle rotation axis is still required by the shared shader.
    for(let i=0;i<n;i++)geometry.attributes.leafAxis.setXYZ(i,0,1,0);
    return geometry;
}
