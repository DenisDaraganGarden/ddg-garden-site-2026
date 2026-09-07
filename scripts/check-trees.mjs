import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {makeCoastTree} from '../src/plants/treeModel.js';
import {TREE_KINDS,TREE_SPECIES} from '../src/plants/treeSpecies.js';
import {makeBranchGeometry,makeLeafGeometry} from '../src/plants/oleasterModel.js';
import {createTerrainDefinition,createTerrainQuery} from '../src/terrain/terrainModel.js';
import {buildCoastRocks,attachRockCollisions} from '../src/terrain/terrainRocks.js';
import {createCoastTreePlanting} from '../src/plants/coastPlanting.js';
import {DEFAULT_SHRUB_SETTINGS,DEFAULT_TREE_SETTINGS,normalizeTreeSettings,treeAssetSettings} from '../src/plants/settings.js';

// Crown centroid projected downwind, in the frame the wind bends foliage in.
const crownOffset=(model)=>{
 const bearing=model.settings.windBearing*Math.PI/180,lee=new THREE.Vector3(Math.sin(bearing),0,-Math.cos(bearing));
 const centre=new THREE.Vector3();for(const l of model.leaves)centre.add(l.pivot);
 return centre.divideScalar(Math.max(1,model.leaves.length)).dot(lee);
};
let attachments=0;const budgets={};
for(const options of [{},{seed:3,height:9,spread:8,lean:1},{seed:77,height:2.5,spread:2,lean:0,deadwood:1}]){
 const model=makeCoastTree(options),again=makeCoastTree(options);
 assert.deepEqual(model.leaves.map(l=>l.pivot.toArray()),again.leaves.map(l=>l.pivot.toArray()),'same seed must regrow exactly');
 const trunk=model.branches[0];
 assert.ok(trunk.trunk&&trunk.parent===-1&&trunk.radiusEnd<trunk.radius&&trunk.radiusEnd>trunk.radius*.3,'the trunk keeps a real radius up to its limbs');
 for(const b of model.branches){
  if(b.parent>=0){assert.ok(b.curve.getPoint(0).distanceTo(model.branches[b.parent].curve.getPoint(b.parentT))<1e-6,'every branch starts on its parent');attachments++;}
 }
 for(const l of model.leaves){assert.ok(l.pivot.distanceTo(model.branches[l.parent].curve.getPoint(l.t))<1e-9);assert.ok(l.normal.y>0);assert.ok(!model.branches[l.parent].dead,'dead wood carries no leaves');attachments++;}
 assert.ok(model.branches.some(b=>b.root&&b.curve.getPoint(1).y<0),'buttress roots go into the ground');
 const h=options.height??DEFAULT_TREE_SETTINGS.treesHeight;
 assert.ok(model.height>h*.9&&model.height<h*1.2,`height ${model.height} follows the setting ${h}`);
 const tri=[];
 for(let lod=0;lod<2;lod++){
  const bark=makeBranchGeometry(model,lod),leaf=makeLeafGeometry(model,lod);tri.push((bark.index.count+leaf.index.count)/3);
  for(const g of [bark,leaf]){
   for(const attr of Object.values(g.attributes))assert.ok(attr.array.every(Number.isFinite));
   const n=g.attributes.normal;for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
   g.dispose();
  }
 }
 // Near leaves are already two triangles a row; the mid LOD halves them and
 // drops the bark rings, so the saving is smaller than a shrub's.
 assert.ok(tri[1]<tri[0]*.5,'mid LOD saves at least half the triangles');
 budgets[JSON.stringify(options)]=tri;
 if(options.deadwood===1)assert.ok(model.branches.filter(b=>b.dead).length>0,'full deadwood leaves at least one dead limb');
}
assert.ok(crownOffset(makeCoastTree({lean:1}))>crownOffset(makeCoastTree({lean:0})),'a leaning tree carries its crown to leeward');
assert.equal(makeCoastTree({deadwood:0}).branches.filter(b=>b.dead).length,0,'no deadwood means no dead limbs');

const definition=createTerrainDefinition({}),query=attachRockCollisions(createTerrainQuery(definition),buildCoastRocks(definition));
const options={...DEFAULT_SHRUB_SETTINGS,...DEFAULT_TREE_SETTINGS};
const plants=createCoastTreePlanting(query,definition,options);
assert.deepEqual(plants,createCoastTreePlanting(query,definition,options),'planting is deterministic');
assert.ok(plants.length>=8,`the default grove has trees (${plants.length})`);
for(const p of plants){const s=query.surfaceAt(p.x,p.z,0);assert.equal(p.y,s.height);assert.ok(s.vegetation.trees>0&&s.habitat==='plateau','trees stand on the plateau');assert.ok(p.dryness>=0&&p.dryness<=1);}
for(let i=0;i<plants.length;i++)for(let j=i+1;j<plants.length;j++)assert.ok(Math.hypot(plants[i].x-plants[j].x,plants[i].z-plants[j].z)>=DEFAULT_TREE_SETTINGS.treesSpacing,'trunks keep their spacing');
assert.equal(createCoastTreePlanting(query,definition,{...options,treesEnabled:false}).length,0);
assert.deepEqual(createCoastTreePlanting(query,definition,{...options,shrubsDryness:.9}).map(p=>[p.x,p.z]),plants.map(p=>[p.x,p.z]),'colour edits keep the grove where it is');
assert.equal(normalizeTreeSettings({treesCount:99999}).treesCount,256);assert.equal(normalizeTreeSettings({treesLean:-2}).treesLean,0);
const asset=treeAssetSettings({...options,shrubsDryness:.7},{speed:9,bearing:200});
assert.equal(asset.dryness,.7);assert.equal(asset.windBearing,200);assert.equal(asset.flex,DEFAULT_TREE_SETTINGS.treesFlex);
// Species (treeSpecies.js): each form regrows exactly and attaches, a snag
// carries no leaves, a sheaf has its trunks, budgets stay near the oleaster's.
// The default oleaster is pinned by fingerprint: the species knobs at their
// defaults must not move a single authored leaf.
const fingerprint=m=>createHash('sha1').update(JSON.stringify([m.leaves.map(l=>[...l.pivot.toArray(),...l.axis.toArray(),l.length,l.width,l.variant,l.tint]),m.branches.map(b=>[b.parent,b.parentT,b.radius,b.radiusEnd??null,...b.curve.getPoint(0).toArray(),...b.curve.getPoint(.5).toArray(),...b.curve.getPoint(1).toArray(),!!b.root])])).digest('hex').slice(0,16);
assert.equal(fingerprint(makeCoastTree({})),'59a651d9a78b4f18','the authored oleaster (seed 7) regrows exactly');
const species={};
for(const kind of TREE_KINDS){
 const s=TREE_SPECIES[kind],m=makeCoastTree(s.form),again=makeCoastTree(s.form);
 assert.deepEqual(m.leaves.map(l=>l.pivot.toArray()),again.leaves.map(l=>l.pivot.toArray()),`${kind} regrows exactly`);
 for(const b of m.branches)if(b.parent>=0)assert.ok(b.curve.getPoint(0).distanceTo(m.branches[b.parent].curve.getPoint(b.parentT))<1e-6,`${kind}: every branch starts on its parent`);
 for(const l of m.leaves)assert.ok(!m.branches[l.parent].dead,`${kind}: dead wood carries no leaves`);
 assert.equal(m.branches.filter(b=>b.trunk).length,Math.max(1,Math.round(s.form.stems??1)),`${kind}: stems are trunks`);
 const bark=makeBranchGeometry(m,0),leaf=makeLeafGeometry(m,0),tri=(bark.index.count+leaf.index.count)/3;bark.dispose();leaf.dispose();
 assert.ok(tri<130000,`${kind}: near budget ${tri}`);species[kind]={leaves:m.leaves.length,branches:m.branches.length,tri,height:Number(m.height.toFixed(2))};
}
assert.equal(species.snag.leaves,0,'a snag carries no leaves');
console.log(JSON.stringify({passed:true,attachments,budgets,grove:plants.length,species}));
