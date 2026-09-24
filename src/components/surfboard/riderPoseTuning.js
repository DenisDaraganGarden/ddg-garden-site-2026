// Denis's rider poses, saved from the surfboard lab («Править позу»).
// Written by the dev server (POST /__rider-pose); read by riderPose.js.
// Not edited by hand: the lab's manipulators are how it changes.
export default {
  prone: {
    pelvis: [0,0,0],
    chest: 0,
    head: [0,0],
    handL: [0,0,0],
    handR: [0,0,0],
    elbowL: null,
    elbowR: null,
    kneeL: null,
    kneeR: null,
    footL: [0,0,0],
    footR: [0,0,0],
  },
  paddle: {
    strokeL: [[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    strokeR: [[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    elbowL: null,
    elbowR: null,
  },
  swim: {
    pelvis: [0,0,0],
    chest: 0,
    head: [0,0],
    strokeL: [[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    strokeR: [[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
    elbowL: null,
    elbowR: null,
    footL: [0,0,0],
    footR: [0,0,0],
    kneeL: null,
    kneeR: null,
  },
};
