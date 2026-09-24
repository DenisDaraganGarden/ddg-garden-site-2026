import { useFrame } from '@react-three/fiber';
import { updateGardenWind } from './wind.js';

// Ветер сада раз в кадр — в общие униформы (wind.js): все растения сада
// читают одно время, одну силу и одно направление.
export default function GardenWind({ terrain, sway = 1 }) {
    useFrame(({ clock }) => updateGardenWind(terrain, sway, clock.elapsedTime), -5);
    return null;
}
