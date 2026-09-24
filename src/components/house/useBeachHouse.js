import { useDeferredValue, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildBeachHouse, buildBeachShed, disposeBuilding } from './beachHouse';
import { houseShapeOf } from './settings';
import { houseCamp, shedCamp } from './surfCamp';

// The shed stands off the foot of the stairs, its steps a metre and a bit
// from theirs, turned a little.
export const SHED_TURN = 0.12;
const turn = new THREE.Euler(0, SHED_TURN, 0);

// The buildings and where things go, rebuilt when the shape changes (a step
// behind a fast drag), shared by the scene and the lab.
export function useBeachHouse(settings) {
  const shapeKey = useDeferredValue(JSON.stringify({ ...houseShapeOf(settings), camp: settings.houseCampSeed }));
  const built = useMemo(() => {
    const { camp: campSeed, ...shape } = JSON.parse(shapeKey);
    const house = buildBeachHouse(shape), shed = buildBeachShed(shape);
    const [footX, , footZ] = house.plan.stairs.foot;
    const shedAt = [footX - 3.6, 0, footZ + 1.4];
    const post = new THREE.Vector3(...shed.plan.yardAnchor).applyEuler(turn).add(new THREE.Vector3(...shedAt));
    return {
      house, shed, shedAt,
      camp: houseCamp(house, campSeed), shedThings: shedCamp(shed, campSeed),
      yardSpan: { a: house.plan.yardAnchor, b: post.toArray(), sag: 0.35 },
    };
  }, [shapeKey]);
  useEffect(() => () => {
    disposeBuilding(built.house);
    disposeBuilding(built.shed);
  }, [built]);
  return built;
}

