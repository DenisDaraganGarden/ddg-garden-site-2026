import { createContext, useContext } from 'react';

// One scene owns one moving density field. Receivers read its GPU products,
// rather than restarting the generator or keeping a second weather clock.
const EMPTY = Object.freeze({ current: null });
export const CloudSceneContext = createContext(EMPTY);
export const useCloudScene = () => useContext(CloudSceneContext);
