import { useContext } from 'react';
import { PortfolioContentContext } from './portfolioContentContext';

export const usePortfolioContent = () => useContext(PortfolioContentContext);
