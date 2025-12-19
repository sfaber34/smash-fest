// =============================================
// CAR UTILITIES
// =============================================
import { CAR_HEIGHT, CAR_WIDTH } from "./constants";
import type { Car, HitZone } from "./types";

// Create a new car at the specified position
export const createCar = (x: number, y: number, color: string, angle = 0, isStatic = false): Car => ({
  x,
  y,
  vx: 0,
  vy: 0,
  angle,
  angularVel: 0,
  width: CAR_WIDTH,
  height: CAR_HEIGHT,
  color,
  health: { front: 100, rear: 100, left: 100, right: 100 },
  isStatic,
});

// Get the car's corner points for collision detection
export const getCarCorners = (car: Car): { x: number; y: number }[] => {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const hw = car.width / 2;
  const hh = car.height / 2;

  return [
    { x: car.x + cos * hw - sin * hh, y: car.y + sin * hw + cos * hh },
    { x: car.x + cos * hw + sin * hh, y: car.y + sin * hw - cos * hh },
    { x: car.x - cos * hw + sin * hh, y: car.y - sin * hw - cos * hh },
    { x: car.x - cos * hw - sin * hh, y: car.y - sin * hw + cos * hh },
  ];
};

// Get which zone of the car was hit based on collision angle
export const getHitZone = (car: Car, collisionAngle: number): HitZone => {
  let relativeAngle = collisionAngle - car.angle;

  while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
  while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

  if (relativeAngle >= -Math.PI / 4 && relativeAngle < Math.PI / 4) {
    return "front";
  } else if (relativeAngle >= Math.PI / 4 && relativeAngle < (3 * Math.PI) / 4) {
    return "right";
  } else if (relativeAngle >= (-3 * Math.PI) / 4 && relativeAngle < -Math.PI / 4) {
    return "left";
  } else {
    return "rear";
  }
};

// Simple circle collision check between two cars
export const checkCarCollision = (car1: Car, car2: Car): boolean => {
  const dx = car2.x - car1.x;
  const dy = car2.y - car1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDistance = ((car1.width + car2.width) / 2) * 0.85;
  return distance < minDistance;
};

// Calculate total health percentage
export const getTotalHealth = (car: Car): number => {
  const { front, rear, left, right } = car.health;
  return (front + rear + left + right) / 4;
};
