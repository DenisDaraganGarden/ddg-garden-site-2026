import * as THREE from 'three';

const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(0, 0, 1);
const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3(0, -1, 0);
const surfaceNormal = new THREE.Vector3();
const surfaceForward = new THREE.Vector3();
const surfaceRight = new THREE.Vector3();
const stableUp = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const basis = new THREE.Matrix4();
const headingQuaternion = new THREE.Quaternion();
const FIT_MODEL_SCALE = 0.97;
const FIT_SOLE_HEIGHT = 0.12425;
const FIT_FOOT_CONTACTS = Object.freeze([
  new THREE.Vector3(0.0007433961, -0.1240529154, 0.0436204033),
  new THREE.Vector3(-0.0026201547, -0.1242197602, -0.0452382560),
]);

export const BOAT_LANDING_SPECS = Object.freeze([
  { id: 'boat-bow', surface: 'boat', probe: [0.44, 1.06], rotationY: 3.142 },
  { id: 'boat-stern', surface: 'boat', probe: [0.12, -1.34], rotationY: 3.665 },
  { id: 'boat-port-seat', surface: 'boat', probe: [-0.52, 0.18], rotationY: 6.021 },
  { id: 'boat-starboard-seat', surface: 'boat', probe: [0.48, 0.18], rotationY: 0.262 },
]);

export const SCULPTURE_LANDING_SPECS = Object.freeze([
  { id: 'sculpture-crown', surface: 'sculpture', probe: [0.82, -0.23], rotationY: 3.927 },
]);

export function createNormalizedSurfaceClone(source, scale, rotationY) {
  const clone = source.clone(true);
  clone.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(clone);
  const center = bounds.getCenter(new THREE.Vector3());
  clone.position.set(-center.x, -bounds.min.y, -center.z);

  const wrapper = new THREE.Group();
  wrapper.add(clone);
  wrapper.scale.setScalar(scale);
  wrapper.rotation.y = rotationY;
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function readWorldNormal(hit) {
  return surfaceNormal
    .copy(hit.face.normal)
    .applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
    .normalize();
}

function makeSiteQuaternion(rotationY, normal) {
  headingQuaternion.setFromAxisAngle(UP, rotationY);
  surfaceForward.copy(FORWARD).applyQuaternion(headingQuaternion);
  surfaceForward.addScaledVector(normal, -surfaceForward.dot(normal));
  if (surfaceForward.lengthSq() < 1e-6) {
    surfaceForward.copy(RIGHT).addScaledVector(normal, -RIGHT.dot(normal));
  }
  surfaceForward.normalize();
  surfaceRight.crossVectors(surfaceForward, normal).normalize();
  stableUp.crossVectors(surfaceRight, surfaceForward).normalize();
  basis.makeBasis(surfaceForward, stableUp, surfaceRight);
  return new THREE.Quaternion().setFromRotationMatrix(basis).normalize();
}

function fitLandingPlane(surfaceObject, point, normal, initialQuaternion) {
  const root = point.clone().addScaledVector(normal, FIT_SOLE_HEIGHT * FIT_MODEL_SCALE);
  const supportPoints = [];
  const supportNormals = [];

  for (const localFoot of FIT_FOOT_CONTACTS) {
    const nominalFoot = localFoot
      .clone()
      .multiplyScalar(FIT_MODEL_SCALE)
      .applyQuaternion(initialQuaternion)
      .add(root);
    raycaster.set(nominalFoot.clone().addScaledVector(normal, 0.06), normal.clone().negate());
    const footHit = raycaster.intersectObject(surfaceObject, true).find((candidate) => {
      const candidateNormal = readWorldNormal(candidate).clone();
      return candidate.distance <= 0.12 && candidateNormal.dot(normal) >= 0.8;
    });
    if (!footHit) return null;
    supportPoints.push(footHit.point.clone());
    supportNormals.push(readWorldNormal(footHit).clone());
  }

  const fittedRight = supportPoints[0].clone().sub(supportPoints[1]).normalize();
  const fittedUp = normal.clone().add(supportNormals[0]).add(supportNormals[1]);
  fittedUp.addScaledVector(fittedRight, -fittedUp.dot(fittedRight)).normalize();
  const fittedForward = new THREE.Vector3().crossVectors(fittedUp, fittedRight).normalize();
  const initialForward = FORWARD.clone().applyQuaternion(initialQuaternion);
  if (fittedForward.dot(initialForward) < 0) {
    fittedForward.negate();
    fittedRight.negate();
    supportPoints.reverse();
  }
  const stableFittedUp = new THREE.Vector3().crossVectors(fittedRight, fittedForward).normalize();
  const quaternion = new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      fittedForward,
      stableFittedUp,
      fittedRight,
    ))
    .normalize();

  const anchorCandidates = FIT_FOOT_CONTACTS.map((localFoot, index) => {
    const rootToFoot = localFoot.clone();
    rootToFoot.y += FIT_SOLE_HEIGHT;
    rootToFoot.multiplyScalar(FIT_MODEL_SCALE).applyQuaternion(quaternion);
    return supportPoints[index].clone().sub(rootToFoot);
  });
  const position = anchorCandidates[0].clone().add(anchorCandidates[1]).multiplyScalar(0.5);
  const fitError = Math.max(...anchorCandidates.map((candidate) => candidate.distanceTo(position)));

  return {
    position,
    normal: stableFittedUp,
    quaternion,
    fitError,
  };
}

export function projectLandingSites(surfaceObject, specs, minUp = 0.82) {
  surfaceObject.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(surfaceObject);
  const probeHeight = bounds.max.y + Math.max(0.5, bounds.max.y - bounds.min.y);

  return specs.map((spec) => {
    const [x, z] = spec.probe;
    raycaster.set(new THREE.Vector3(x, probeHeight, z), rayDirection);
    const intersections = raycaster.intersectObject(surfaceObject, true);
    let hit = null;
    let normal = null;
    for (const candidate of intersections) {
      const candidateNormal = readWorldNormal(candidate).clone();
      if (candidateNormal.dot(UP) < minUp) continue;
      hit = candidate;
      normal = candidateNormal;
      break;
    }
    if (!hit || !normal) {
      throw new Error(`No stable top-facing surface below seagull landing site ${spec.id}`);
    }

    const initialQuaternion = makeSiteQuaternion(spec.rotationY, normal);
    const fitted = fitLandingPlane(
      surfaceObject,
      hit.point,
      normal,
      initialQuaternion,
    );
    if (!fitted) {
      throw new Error(`Both seagull feet do not fit landing site ${spec.id}`);
    }

    return {
      ...spec,
      position: fitted.position.toArray(),
      surfaceNormal: fitted.normal.toArray(),
      quaternion: fitted.quaternion,
      footFitError: fitted.fitError,
      markerPosition: hit.point.toArray(),
      markerQuaternion: initialQuaternion,
      geometryObject: hit.object.name,
    };
  });
}
