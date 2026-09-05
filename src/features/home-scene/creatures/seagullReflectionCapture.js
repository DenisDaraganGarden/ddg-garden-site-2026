export function readSeagullReflectionActivity(root) {
  const result = {
    participants: 0,
    dynamic: false,
  };
  if (!root?.traverse) return result;

  root.traverse((object) => {
    if (!object.visible || !object.userData?.ddgSeagullRoot) return;
    if (object.userData.ddgReflectInWater === true) result.participants += 1;
    if (object.userData.ddgReflectionDynamic === true) result.dynamic = true;
  });
  return result;
}

export function hideExcludedSeagullReflections(root) {
  const hiddenObjects = [];
  if (!root?.traverse) return () => {};

  root.traverse((object) => {
    if (!object.visible) return;
    const excludedBird = object.userData?.ddgSeagullRoot
      && object.userData.ddgReflectInWater !== true;
    if (!excludedBird && !object.userData?.ddgNoWaterReflection) return;
    hiddenObjects.push(object);
    object.visible = false;
  });

  return () => {
    for (const object of hiddenObjects) object.visible = true;
  };
}

export function hideExcludedSeagullRefractions(root) {
  const hiddenObjects = [];
  if (!root?.traverse) return () => {};

  root.traverse((object) => {
    if (!object.visible) return;
    const excludedBird = object.userData?.ddgSeagullRoot
      && object.userData.ddgRefractInWater !== true;
    if (!excludedBird && !object.userData?.ddgNoWaterReflection) return;
    hiddenObjects.push(object);
    object.visible = false;
  });

  return () => {
    for (const object of hiddenObjects) object.visible = true;
  };
}
