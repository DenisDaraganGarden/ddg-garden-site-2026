import React from 'react';
import { createRoot } from 'react-dom/client';
import AssetLab from './AssetLab';
import '../fish-lab/fishLab.css';
import '../black-stone-lab/blackStoneLab.css';
import './labNav.css';

createRoot(document.getElementById('asset-lab-root')).render(
  <React.StrictMode>
    <AssetLab />
  </React.StrictMode>,
);
