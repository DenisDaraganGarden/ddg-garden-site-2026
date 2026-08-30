import { createContext } from 'react';
import { projectRegistry } from '../../data/projectRegistry';

export const PortfolioContentContext = createContext({
  projects: projectRegistry,
  source: 'fallback',
});
