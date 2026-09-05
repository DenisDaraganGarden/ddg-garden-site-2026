import { createTerrainLandingSites } from '../../../terrain/terrainLanding.js';
import React, { useLayoutEffect, useMemo } from 'react';
import {
  BOAT_LANDING_SPECS,
  SCULPTURE_LANDING_SPECS,
} from './seagullLandingSurfaces';
import {
  createLandingHabitatSites,
  disposeLandingHabitatSites,
} from './seagullLandingHabitat';

function resolveRigcheck(requested) {
  if (typeof requested === 'boolean') return requested;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('rigcheck');
}

/**
 * Publishes dynamic landing sites without mounting birds itself. The future
 * flock receives `landingSitesRef.current`; all contact transforms remain
 * children of the actual scene object rather than a preview-only proxy.
 */
export default function SeagullLandingHabitat({
  boatSurface,
  sculptureSurface,
  terrainSurface,
  terrainQuery,
  landingSitesRef,
  rigcheck,
  onSitesChange,
}) {
  const showRigcheck = useMemo(() => resolveRigcheck(rigcheck), [rigcheck]);
  const boatRoot = boatSurface?.root;
  const boatCollisionObject = boatSurface?.collisionObject;
  const boatRevision = boatSurface?.revision;
  const sculptureRoot = sculptureSurface?.root;
  const sculptureCollisionObject = sculptureSurface?.collisionObject;
  const sculptureRevision = sculptureSurface?.revision;

  useLayoutEffect(() => {
    const sites = [
      ...createTerrainLandingSites(terrainSurface?.root,terrainQuery),
      ...createLandingHabitatSites({
        root: boatRoot,
        collisionObject: boatCollisionObject,
        specs: BOAT_LANDING_SPECS,
        rigcheck: showRigcheck,
      }),
      ...createLandingHabitatSites({
        root: sculptureRoot,
        collisionObject: sculptureCollisionObject,
        specs: SCULPTURE_LANDING_SPECS,
        rigcheck: showRigcheck,
      }),
    ];

    if (landingSitesRef) landingSitesRef.current = sites;
    onSitesChange?.(sites);

    return () => {
      if (landingSitesRef?.current === sites) landingSitesRef.current = [];
      disposeLandingHabitatSites(sites);
    };
  }, [
    boatCollisionObject,
    boatRevision,
    boatRoot,
    landingSitesRef,
    onSitesChange,
    sculptureCollisionObject,
    sculptureRevision,
    sculptureRoot,
    showRigcheck,
    terrainSurface,
    terrainQuery,
  ]);

  return null;
}
