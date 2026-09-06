import React from 'react';
import { createRoot } from 'react-dom/client';
import FishLab from './FishLab';
import './fishLab.css';

createRoot(document.getElementById('fish-lab-root')).render(
  <React.StrictMode>
    <FishLab />
  </React.StrictMode>,
);

