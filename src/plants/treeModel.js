import * as THREE from 'three';
import {createPlantBuilder,randomSequence} from './oleasterModel.js';

// The mature form of the same oleaster: the tree that stands alone on every
// Azov bluff, combed by the sea wind until the trunk leans and the crown
// streams to leeward like a flag. Same leaf, same bark, same wind field as the
// shrubs, so a grove and its undergrowth read as one species.
//
// Since 2026-09-07 the same builder grows the other trees of the coast
// (treeSpecies.js): `stems` trunks from one base, `droop` of the twigs, `gnarl`
// in every bend, `twigs` density and `dead` limbs killed by drought. At their
// defaults the authored oleaster regrows to the leaf: the species knobs draw on
// a second random stream (`form`), so they never shift the first one.
//
// `crown` chooses the architecture: 'lean' is the oleaster's wind-combed flag;
// 'dome' is a rounded crown on a short stout trunk (`trunkShare` of the
// height), `limbs` radiating onto an ellipsoid, the lower ones level and the
// upper ones climbing, each with a fan of long secondaries that hang by
// `droop` - the willow by the water, the elm of the shelterbelt, the plum
// thicket on the bluff.
export const TREE_DEFAULTS=Object.freeze({seed:7,height:6,spread:5.5,lean:.55,twist:.4,density:.8,leafSize:1.8,leafAspect:1.4,deadwood:.3,windBearing:290,midEvery:2,midSkipsThin:false,stems:1,droop:0,gnarl:0,twigs:1,dead:0,crown:'lean',trunkShare:.3,limbs:12});
const point=(x,y,z)=>new THREE.Vector3(x,y,z);

export function makeCoastTree(input={}) {
  const p={...TREE_DEFAULTS,...input};
  const h=Math.max(1.5,p.height), crown=Math.max(.75,p.spread)*.5, dome=p.crown==='dome';
  const {rand,branches,leaves,addBranch,branch,leaf}=createPlantBuilder(p.seed,{density:p.density,leafSize:p.leafSize,leafAspect:p.leafAspect,crownRadius:crown});
  const form=randomSequence(p.seed*31+7);
  // A kink for a gnarled species; exactly zero at gnarl 0.
  const kink=size=>point(form()-.5,(form()-.5)*.6,form()-.5).multiplyScalar(p.gnarl*size*.5);
  // Downwind, in the exact frame plantMaterials bends the foliage in: the lean
  // is the same push, integrated over the tree's life.
  const bearing=p.windBearing*Math.PI/180, lee=point(Math.sin(bearing),0,-Math.cos(bearing)), across=point(-lee.z,0,lee.x);
  const leeAngle=Math.atan2(lee.z,lee.x), twistSign=rand()<.5?-1:1;
  const trunkTop=h*(dome?p.trunkShare:.58), leanRun=p.lean*trunkTop*.45, r0=(dome?.045:.03)*h;
  const stems=Math.max(1,Math.round(p.stems)), twigCount=Math.max(2,Math.round(8*p.twigs)), limbs=[];

  for(let s=0;s<stems;s++){
    // The first stem is the authored trunk; the others lean out of the same
    // base, shorter, the way a tamarisk or a plum grows as a sheaf.
    const angle=s/stems*Math.PI*2+form()*.9, out=s?point(Math.cos(angle),0,Math.sin(angle)):null;
    const hs=s?h*(.7+form()*.22):h, topS=s?hs*(dome?p.trunkShare:.58):trunkTop, r=s?r0*.8:r0;
    // Trunk: one smooth spline. Leaning downwind, with the S the wind twists
    // into a tree that grew a windward side and a leeward side.
    const trunkPoints=[0,.3,.6,1].map(t=>{
      const q=point(0,t*topS,0).addScaledVector(lee,(s?p.lean*topS*.45:leanRun)*t*t).addScaledVector(across,Math.sin(t*Math.PI)*p.twist*.32*twistSign*hs/6);
      if(out)q.addScaledVector(out,r0*1.5+hs*.14*t);
      return q.add(kink(hs*.16*t));
    });
    const trunk=addBranch(new THREE.CatmullRomCurve3(trunkPoints,false,'centripetal'),r,-1,0,{radiusEnd:r*.45,trunk:true});

    // Buttress roots: an old tree holds the bluff, and shows it.
    if(s===0){
      const rootCount=4+Math.floor(rand()*3);
      for(let i=0;i<rootCount;i++){
        const a=i/rootCount*Math.PI*2+(rand()-.5)*.6, reach=h*(.07+rand()*.05);
        branch(point(0,0,0),point(Math.cos(a)*reach,-.1-rand()*.08,Math.sin(a)*reach),point(0,.1+rand()*.06,0),r0*(.3+rand()*.12),trunk.id,0,{radiusEnd:.008,root:true});
      }
    }

    if(dome){
      // Limbs radiate from the upper half of the trunk in every direction onto
      // the crown's ellipsoid: the low ones level, the high ones climbing, a
      // little longer than the envelope so the crown is a mass, not a shell.
      const limbCount=Math.max(4,Math.round(p.limbs*(.9+rand()*.2)/Math.sqrt(stems)));
      const hv=Math.max(.5,hs-topS+crown*.15);
      let azimuth=rand()*Math.PI*2;
      for(let i=0;i<limbCount;i++){
        const u=i/limbCount, t=Math.min(.98,.5+u*.5+(rand()-.5)*.08), at=trunk.curve.getPoint(t);
        azimuth+=2.39996+(rand()-.5)*.6;
        const el=-.15+u*1.25+(rand()-.5)*.25, c=Math.cos(el), sn=Math.sin(el);
        const radial=(.8+rand()*.35)/Math.sqrt((c/crown)**2+(sn/hv)**2), reach=radial*c, rise=radial*sn;
        const dir=point(Math.cos(azimuth),0,Math.sin(azimuth));
        const tip=at.clone().addScaledVector(dir,reach).add(point(0,rise-p.droop*radial*.1,0)).addScaledVector(lee,p.lean*reach*.2);
        const dead=(sn<.2&&rand()<p.deadwood*.5)||form()<p.dead;
        const limb=branch(at,tip,point(0,Math.max(.1,rise*.45+reach*.25*(1-p.droop*.5)),0).addScaledVector(dir,reach*.1).add(kink(radial)),r*.3*(.6+rand()*.4),trunk.id,t,{radiusEnd:dead?.006:.01,azimuth,reach:Math.max(.3,radial),dead,drought:dead});
        limbs.push(limb);
        // A limb forks once or twice on its way out, so the crown is a lattice
        // of branches and not a fan of tentacles.
        const forks=1+Math.floor(rand()*2);
        for(let f=0;f<forks;f++){
          const fu=.45+rand()*.3, from=limb.curve.getPoint(fu), fa=azimuth+(f%2?1:-1)*(.35+rand()*.45), fr=radial*(.45+rand()*.25);
          const ftip=from.clone().add(point(Math.cos(fa)*fr*c,fr*sn*.8+fr*.1-p.droop*fr*.1,Math.sin(fa)*fr*c));
          limbs.push(branch(from,ftip,point(0,fr*.3*(1-p.droop*.5),0).add(kink(fr)),limb.radius*.6,limb.id,fu,{radiusEnd:.006,azimuth:fa,reach:fr*1.2,dead:limb.dead,drought:limb.dead,sub:true}));
        }
      }
      continue;
    }

    // Limbs leave the trunk from mid-height up and arch: steep at the fork,
    // levelling into the crown. Leeward limbs run long and low, windward ones
    // stay short and climb; one of those may be dead wood. Drought (`dead`)
    // kills limbs on any side.
    const limbCount=Math.max(3,Math.round((6+Math.floor(rand()*2))/Math.sqrt(stems)));
    let azimuth=rand()*Math.PI*2;
    for(let i=0;i<limbCount;i++){
      const t=Math.min(.98,.38+(i+rand()*.6)/limbCount*.58), at=trunk.curve.getPoint(t);
      azimuth+=2.39996+(rand()-.5)*.5;
      const downwind=Math.cos(azimuth-leeAngle);
      const reach=crown*(.7+rand()*.3)*(1+.4*downwind)*(stems>1?.8:1), rise=(hs-at.y)*(.38+rand()*.3)*(1-.3*downwind);
      const tip=at.clone().add(point(Math.cos(azimuth)*reach,rise,Math.sin(azimuth)*reach)).addScaledVector(lee,p.lean*reach*.3);
      const windkill=downwind<.15&&rand()<p.deadwood, drought=!windkill&&form()<p.dead, dead=windkill||drought;
      limbs.push(branch(at,tip,point(0,rise*.55,0).addScaledVector(lee,p.lean*reach*.15).add(kink(reach)),r*.45*(.55+rand()*.25),trunk.id,t,{radiusEnd:dead?.006:.012,azimuth,reach,dead,drought}));
    }
    // The leader: the trunk itself, carrying on above the last limb.
    const top=trunk.curve.getPoint(1);
    const leaderTip=top.clone().add(point(0,hs-topS,0)).addScaledVector(lee,p.lean*hs*.16+crown*.12).addScaledVector(across,(rand()-.5)*crown*.2);
    const leaderDead=form()<p.dead;
    limbs.push(branch(top,leaderTip,point(0,(hs-topS)*.3,0).addScaledVector(lee,p.lean*crown*.1).add(kink(crown*.5)),r*.45,trunk.id,1,{radiusEnd:leaderDead?.006:.012,azimuth:leeAngle,reach:crown*.8,dead:leaderDead,drought:leaderDead}));
  }

  if(dome){
    // The crown of a dome: every limb carries a fan of long secondaries that
    // arch up and then hang by `droop`, each with a file of twigs and leaves.
    for(const limb of limbs){
      const secondaries=limb.dead?2:Math.max(2,Math.round((limb.sub?2.5+rand()*1.5:4+rand()*2.5)/Math.sqrt(stems)));
      for(let j=0;j<secondaries;j++){
        const u=.25+(j+rand()*.5)/secondaries*.7, at=limb.curve.getPoint(u);
        const a=limb.azimuth+(j%2?1:-1)*(.45+rand()*.7), length=limb.reach*(.3+rand()*.25)*(1-u*.4)*(limb.dead?.6:1), rise=length*(.4-p.droop*.5+rand()*.15);
        const tip=at.clone().add(point(Math.cos(a)*length,rise,Math.sin(a)*length)).addScaledVector(lee,p.lean*length*.15);
        const secondary=branch(at,tip,point(0,length*(.25+p.droop*.4),0).add(kink(length)),limb.radius*(1-u*.5)*.45,limb.id,u,{radiusEnd:limb.dead?.003:.0035,dead:limb.dead});
        if(limb.dead)continue;
        for(let k=0;k<twigCount;k++){
          const v=.12+k*(.85/twigCount)+rand()*.05, aa=a+(k%2?1:-1)*(.5+rand()*.8), at2=secondary.curve.getPoint(v);
          const reach=crown*(.07+rand()*.1);
          const twig=branch(at2,at2.clone().add(point(Math.cos(aa)*reach,reach*(.25-p.droop*.9+rand()*.2),Math.sin(aa)*reach)),point(0,reach*(.15+p.droop*.1),0),.004*(1-v*.5),secondary.id,v,{radiusEnd:.001});
          for(let n=0;n<14;n++)leaf(twig,.06+n*.066,n);
        }
        for(let n=0;n<10;n++)leaf(secondary,.25+n*.07,n);
      }
      if(!limb.dead)for(let n=0;n<6;n++)leaf(limb,.7+n*.05,n);
    }
  } else
  // The crown is mass, not lines: every secondary carries a fan of short
  // twigs and every twig a close file of leaves, the way the species grows.
  // A drought-killed limb keeps its fan of bare twigs (the crowns on the Azov
  // sand are twiggy skeletons); a wind-killed one stays the bare snag it was.
  for(const limb of limbs){
    const secondaries=limb.dead?(limb.drought?5+Math.floor(form()*4):2):Math.max(3,Math.round((9+Math.floor(rand()*2))/Math.sqrt(stems)));
    for(let j=0;j<secondaries;j++){
      const u=.15+(j+rand()*.5)/secondaries*.8, at=limb.curve.getPoint(u);
      const a=limb.azimuth+(j%2?1:-1)*(.5+rand()*.6), length=limb.reach*(.3+rand()*.22)*(1-u*.3)*(limb.drought?.5+form()*.5:1), rise=length*(.1+rand()*.25-p.droop*.55);
      const tip=at.clone().add(point(Math.cos(a)*length,rise,Math.sin(a)*length)).addScaledVector(lee,p.lean*length*.2);
      const secondary=branch(at,tip,point(0,length*(.25+p.droop*.3),0).add(kink(length)),limb.radius*(1-u*.5)*.5,limb.id,u,{radiusEnd:limb.dead?.003:.004,dead:limb.dead});
      if(limb.dead){
        if(limb.drought)for(let k=0;k<Math.ceil(twigCount/2);k++){
          const v=.2+k*(.75/Math.ceil(twigCount/2)), aa=a+(k%2?1:-1)*(.6+form()*.7), at2=secondary.curve.getPoint(v), reach=crown*(.08+form()*.1);
          branch(at2,at2.clone().add(point(Math.cos(aa)*reach,reach*(.3+form()*.4-p.droop*.7),Math.sin(aa)*reach)),point(0,reach*.15,0),.003*(1-v*.5),secondary.id,v,{radiusEnd:.0008,dead:true});
        }
        continue;
      }
      for(let k=0;k<twigCount;k++){
        const v=.15+k*(.8/twigCount)+rand()*.06, aa=a+(k%2?1:-1)*(.6+rand()*.7), at2=secondary.curve.getPoint(v);
        const reach=crown*(.1+rand()*.12);
        const twig=branch(at2,at2.clone().add(point(Math.cos(aa)*reach,reach*(.15+rand()*.35-p.droop*.7),Math.sin(aa)*reach)),point(0,reach*.2,0),.0045*(1-v*.5),secondary.id,v,{radiusEnd:.0012});
        for(let n=0;n<18;n++)leaf(twig,.05+n*.052,n);
      }
      for(let n=0;n<12;n++)leaf(secondary,.2+n*.064,n);
    }
    if(!limb.dead)for(let n=0;n<8;n++)leaf(limb,.68+n*.04,n);
  }
  let height=0;
  for(const b of branches)height=Math.max(height,b.curve.getPoint(1).y);
  for(const l of leaves)height=Math.max(height,l.pivot.y+l.length);
  // Near leaves are two rows, not four: ten thousand of them make the crown.
  return {species:p.species??'Elaeagnus angustifolia',form:'tree',settings:p,branches,leaves,height,lean:lee.clone().multiplyScalar(leanRun),leafDetail:{rows:2,cols:1,midEvery:p.midEvery},branchDetail:{thinRadius:.006,midSkipsThin:p.midSkipsThin},barkColor:p.barkColor,barkTile:p.barkTile};
}
