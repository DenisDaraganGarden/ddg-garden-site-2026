import React from 'react';
import { DEFAULT_ASSET_COLLECTION, getAssetCollection } from './assetRegistry';

export default function AssetLab() {
  const requestedCollection = new URLSearchParams(window.location.search).get('collection');
  const collection = getAssetCollection(requestedCollection ?? DEFAULT_ASSET_COLLECTION);
  const Collection = collection.component;

  return <Collection />;
}
