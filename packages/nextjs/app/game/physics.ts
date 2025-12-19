// =============================================
// PHYSICS UTILITIES
// =============================================
import { checkCarCollision, getCarCorners, getHitZone } from "./car";
import {
  ACCELERATION,
  ANGULAR_FRICTION,
  ATTACKER_DAMAGE_RATIO,
  BOUNCE_FACTOR,
  BRAKE_DECEL,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLLISION_DAMPING,
  DAMAGE_MULTIPLIER,
  FORWARD_FRICTION,
  MAX_ANGULAR_VEL,
  MAX_SPEED,
  MIN_IMPACT_FOR_DAMAGE,
  MIN_SPEED_TO_TURN,
  SCROLL_THRESHOLD,
  SIDEWAYS_FRICTION,
  TURN_RATE,
  WALL_THICKNESS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { AnalogInput, Camera, Car, DamagePopup } from "./types";

// Update player car physics based on input
export const updatePlayerCarPhysics = (car: Car, input: AnalogInput): number => {
  const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);

  const steeringFactor =
    currentSpeed < MIN_SPEED_TO_TURN ? (currentSpeed / MIN_SPEED_TO_TURN) * 0.3 : Math.min(1, currentSpeed / 3);

  // Analog steering - intensity scales the turn rate
  if (input.left > 0) car.angularVel -= TURN_RATE * steeringFactor * input.left;
  if (input.right > 0) car.angularVel += TURN_RATE * steeringFactor * input.right;

  car.angularVel = Math.max(-MAX_ANGULAR_VEL, Math.min(MAX_ANGULAR_VEL, car.angularVel));

  car.angularVel *= ANGULAR_FRICTION;
  car.angle += car.angularVel;

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);

  // Analog acceleration - intensity scales the acceleration
  if (input.forward > 0) {
    car.vx += forwardX * ACCELERATION * input.forward;
    car.vy += forwardY * ACCELERATION * input.forward;
  }
  if (input.reverse > 0) {
    const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
    if (forwardSpeed > 0.5) {
      car.vx -= forwardX * BRAKE_DECEL * input.reverse;
      car.vy -= forwardY * BRAKE_DECEL * input.reverse;
    } else {
      car.vx -= forwardX * ACCELERATION * 0.5 * input.reverse;
      car.vy -= forwardY * ACCELERATION * 0.5 * input.reverse;
    }
  }

  const rightX = -forwardY;
  const rightY = forwardX;

  const forwardVel = car.vx * forwardX + car.vy * forwardY;
  const sidewaysVel = car.vx * rightX + car.vy * rightY;

  const newForwardVel = forwardVel * FORWARD_FRICTION;
  const newSidewaysVel = sidewaysVel * SIDEWAYS_FRICTION;

  car.vx = forwardX * newForwardVel + rightX * newSidewaysVel;
  car.vy = forwardY * newForwardVel + rightY * newSidewaysVel;

  const newSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
  if (newSpeed > MAX_SPEED) {
    car.vx = (car.vx / newSpeed) * MAX_SPEED;
    car.vy = (car.vy / newSpeed) * MAX_SPEED;
  }

  car.x += car.vx;
  car.y += car.vy;

  return newSpeed;
};

// Update target car physics (friction only, no input)
export const updateTargetCarPhysics = (targetCar: Car): void => {
  const targetForwardX = Math.cos(targetCar.angle);
  const targetForwardY = Math.sin(targetCar.angle);
  const targetRightX = -targetForwardY;
  const targetRightY = targetForwardX;

  const targetForwardVel = targetCar.vx * targetForwardX + targetCar.vy * targetForwardY;
  const targetSidewaysVel = targetCar.vx * targetRightX + targetCar.vy * targetRightY;

  const targetNewForwardVel = targetForwardVel * 0.96;
  const targetNewSidewaysVel = targetSidewaysVel * 0.9;

  targetCar.vx = targetForwardX * targetNewForwardVel + targetRightX * targetNewSidewaysVel;
  targetCar.vy = targetForwardY * targetNewForwardVel + targetRightY * targetNewSidewaysVel;

  targetCar.angularVel *= 0.92;
  targetCar.angle += targetCar.angularVel;

  targetCar.x += targetCar.vx;
  targetCar.y += targetCar.vy;
};

// Handle car-to-car collision
export const handleCarCollision = (
  playerCar: Car,
  targetCar: Car,
  lastCollisionTime: number,
  damagePopups: DamagePopup[],
): number => {
  if (!checkCarCollision(playerCar, targetCar)) {
    return lastCollisionTime;
  }

  const dx = targetCar.x - playerCar.x;
  const dy = targetCar.y - playerCar.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDist = ((playerCar.width + targetCar.width) / 2) * 0.85;

  if (distance >= minDist || distance === 0) return lastCollisionTime;

  const nx = dx / distance;
  const ny = dy / distance;

  // Separate cars
  const overlap = minDist - distance;
  const separationForce = overlap + 2;

  playerCar.x -= nx * separationForce * 0.6;
  playerCar.y -= ny * separationForce * 0.6;
  targetCar.x += nx * separationForce * 0.4;
  targetCar.y += ny * separationForce * 0.4;

  const relVx = playerCar.vx - targetCar.vx;
  const relVy = playerCar.vy - targetCar.vy;
  const impactSpeed = Math.abs(relVx * nx + relVy * ny);

  const bounce = 0.7;
  const impactComponent = relVx * nx + relVy * ny;

  if (impactComponent > 0) {
    playerCar.vx -= nx * impactComponent * bounce;
    playerCar.vy -= ny * impactComponent * bounce;
    targetCar.vx += nx * impactComponent * bounce * 0.8;
    targetCar.vy += ny * impactComponent * bounce * 0.8;
  } else {
    playerCar.vx -= nx * impactComponent * bounce * 0.8;
    playerCar.vy -= ny * impactComponent * bounce * 0.8;
    targetCar.vx += nx * impactComponent * bounce;
    targetCar.vy += ny * impactComponent * bounce;
  }

  playerCar.angularVel += (Math.random() - 0.5) * 0.1;
  targetCar.angularVel += (Math.random() - 0.5) * 0.12;

  const now = Date.now();
  if (now - lastCollisionTime < 150) return lastCollisionTime;

  if (impactSpeed > MIN_IMPACT_FOR_DAMAGE) {
    const collisionAngle = Math.atan2(dy, dx);
    const playerHitZone = getHitZone(playerCar, collisionAngle);
    const targetHitZone = getHitZone(targetCar, collisionAngle + Math.PI);

    const damage = Math.round((impactSpeed - MIN_IMPACT_FOR_DAMAGE) * DAMAGE_MULTIPLIER);

    // Attacker takes much less damage
    playerCar.health[playerHitZone] = Math.max(0, playerCar.health[playerHitZone] - damage * ATTACKER_DAMAGE_RATIO);
    targetCar.health[targetHitZone] = Math.max(0, targetCar.health[targetHitZone] - damage);

    damagePopups.push({
      x: (playerCar.x + targetCar.x) / 2,
      y: (playerCar.y + targetCar.y) / 2 - 20,
      damage,
      zone: targetHitZone,
      age: 0,
    });

    return now;
  }

  return lastCollisionTime;
};

// Handle wall collisions for a car
export const handleWallCollisions = (car: Car): boolean => {
  const corners = getCarCorners(car);
  let collided = false;

  for (const corner of corners) {
    if (corner.x < WALL_THICKNESS) {
      car.x += WALL_THICKNESS - corner.x;
      car.vx = Math.abs(car.vx) * BOUNCE_FACTOR;
      car.vx *= COLLISION_DAMPING;
      car.vy *= COLLISION_DAMPING;
      collided = true;
    }
    if (corner.x > WORLD_WIDTH - WALL_THICKNESS) {
      car.x -= corner.x - (WORLD_WIDTH - WALL_THICKNESS);
      car.vx = -Math.abs(car.vx) * BOUNCE_FACTOR;
      car.vx *= COLLISION_DAMPING;
      car.vy *= COLLISION_DAMPING;
      collided = true;
    }
    if (corner.y < WALL_THICKNESS) {
      car.y += WALL_THICKNESS - corner.y;
      car.vy = Math.abs(car.vy) * BOUNCE_FACTOR;
      car.vx *= COLLISION_DAMPING;
      car.vy *= COLLISION_DAMPING;
      collided = true;
    }
    if (corner.y > WORLD_HEIGHT - WALL_THICKNESS) {
      car.y -= corner.y - (WORLD_HEIGHT - WALL_THICKNESS);
      car.vy = -Math.abs(car.vy) * BOUNCE_FACTOR;
      car.vx *= COLLISION_DAMPING;
      car.vy *= COLLISION_DAMPING;
      collided = true;
    }
  }

  if (collided) {
    car.angularVel += (Math.random() - 0.5) * 0.1;
  }

  return collided;
};

// Update camera to follow player with smooth scrolling
export const updateCamera = (camera: Camera, playerCar: Car): void => {
  const playerScreenX = playerCar.x - camera.x;
  const playerScreenY = playerCar.y - camera.y;

  const scrollMarginX = CANVAS_WIDTH * SCROLL_THRESHOLD;
  const scrollMarginY = CANVAS_HEIGHT * SCROLL_THRESHOLD;

  // Scroll camera when player approaches edges
  if (playerScreenX < scrollMarginX) {
    camera.x = playerCar.x - scrollMarginX;
  } else if (playerScreenX > CANVAS_WIDTH - scrollMarginX) {
    camera.x = playerCar.x - (CANVAS_WIDTH - scrollMarginX);
  }

  if (playerScreenY < scrollMarginY) {
    camera.y = playerCar.y - scrollMarginY;
  } else if (playerScreenY > CANVAS_HEIGHT - scrollMarginY) {
    camera.y = playerCar.y - (CANVAS_HEIGHT - scrollMarginY);
  }

  // Clamp camera to world bounds
  camera.x = Math.max(0, Math.min(WORLD_WIDTH - CANVAS_WIDTH, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - CANVAS_HEIGHT, camera.y));
};

// Update damage popups (age and filter expired)
export const updateDamagePopups = (popups: DamagePopup[]): DamagePopup[] => {
  return popups.map(p => ({ ...p, age: p.age + 1, y: p.y - 1 })).filter(p => p.age < 60);
};
