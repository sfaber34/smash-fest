"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NextPage } from "next";
import { Joystick } from "react-joystick-component";
import type { IJoystickUpdateEvent } from "react-joystick-component/build/lib/Joystick";

// Haptic queue for iOS (Safari requires user gesture to trigger haptics)
let pendingHaptic: "light" | "medium" | "heavy" | null = null;

// Direct iOS haptic implementation using checkbox switch trick
const triggerIOSHaptic = (count: number = 1) => {
  if (typeof document === "undefined") return;

  const fire = () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("switch", "");
    checkbox.style.position = "fixed";
    checkbox.style.opacity = "0";
    checkbox.style.pointerEvents = "none";
    document.body.appendChild(checkbox);
    checkbox.click();
    checkbox.remove();
  };

  for (let i = 0; i < count; i++) {
    setTimeout(fire, i * 50);
  }
};

// Cross-platform haptic trigger
const triggerHapticDirect = (intensity: "light" | "medium" | "heavy" = "medium") => {
  // Try navigator.vibrate first (Android)
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const duration = intensity === "light" ? 10 : intensity === "medium" ? 25 : 50;
    navigator.vibrate(duration);
  }

  // Also try iOS checkbox trick
  const count = intensity === "heavy" ? 3 : intensity === "medium" ? 2 : 1;
  triggerIOSHaptic(count);
};

// Queue a haptic to be triggered on next user touch (for iOS Safari compatibility)
const queueHaptic = (intensity: "light" | "medium" | "heavy" = "medium") => {
  // Keep the strongest pending haptic
  if (!pendingHaptic || intensity === "heavy" || (intensity === "medium" && pendingHaptic === "light")) {
    pendingHaptic = intensity;
  }
};

// Fire pending haptic - call this from user gesture handlers (touch/click)
const firePendingHaptic = () => {
  if (!pendingHaptic) return;

  triggerHapticDirect(pendingHaptic);
  pendingHaptic = null;
};

// Constants
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const CAR_WIDTH = 50;
const CAR_HEIGHT = 30;
const WALL_THICKNESS = 20;

// Physics constants
const ACCELERATION = 0.15;
const BRAKE_DECEL = 0.1;
const MAX_SPEED = 8;
const TURN_RATE = 0.025;
const FORWARD_FRICTION = 0.98;
const SIDEWAYS_FRICTION = 0.85;
const ANGULAR_FRICTION = 0.85;
const BOUNCE_FACTOR = 0.5;
const COLLISION_DAMPING = 0.7;
const MIN_SPEED_TO_TURN = 0.5;

// Damage constants
const DAMAGE_MULTIPLIER = 3;
const MIN_IMPACT_FOR_DAMAGE = 2;
const ATTACKER_DAMAGE_RATIO = 0.15; // Attacker takes only 15% of the damage they deal

interface Car {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
  width: number;
  height: number;
  color: string;
  health: {
    front: number;
    rear: number;
    left: number;
    right: number;
  };
  isStatic: boolean;
}

// Analog input values (0 to 1 for intensity)
interface AnalogInput {
  forward: number; // 0 to 1
  reverse: number; // 0 to 1
  left: number; // 0 to 1
  right: number; // 0 to 1
}

interface DamagePopup {
  x: number;
  y: number;
  damage: number;
  zone: string;
  age: number;
}

const createCar = (x: number, y: number, color: string, angle = 0, isStatic = false): Car => ({
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
const getCarCorners = (car: Car): { x: number; y: number }[] => {
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
const getHitZone = (car: Car, collisionAngle: number): "front" | "rear" | "left" | "right" => {
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

// Simple circle collision check
const checkCarCollision = (car1: Car, car2: Car): boolean => {
  const dx = car2.x - car1.x;
  const dy = car2.y - car1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDistance = ((car1.width + car2.width) / 2) * 0.85;
  return distance < minDistance;
};

// Calculate total health percentage
const getTotalHealth = (car: Car): number => {
  const { front, rear, left, right } = car.health;
  return (front + rear + left + right) / 4;
};

const Home: NextPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerCarRef = useRef<Car>(createCar(200, CANVAS_HEIGHT / 2, "#e74c3c", 0));
  const targetCarRef = useRef<Car>(createCar(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, "#3498db", Math.PI / 4, false));
  const inputRef = useRef<AnalogInput>({ forward: 0, reverse: 0, left: 0, right: 0 });
  const animationFrameRef = useRef<number>(0);
  const damagePopupsRef = useRef<DamagePopup[]>([]);
  const [, setSpeed] = useState(0);
  const [, setPlayerHealth] = useState({ front: 100, rear: 100, left: 100, right: 100 });
  const [, setTargetHealth] = useState({ front: 100, rear: 100, left: 100, right: 100 });
  const lastCollisionRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(false);

  // Detect mobile/touch device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile("ontouchstart" in window || navigator.maxTouchPoints > 0);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle joystick input - analog values based on joystick position
  const handleJoystickMove = useCallback((event: IJoystickUpdateEvent) => {
    // Fire any pending haptics on user touch (iOS Safari requirement)
    firePendingHaptic();

    const deadzone = 0.15; // Small deadzone to prevent drift
    const x = event.x ?? 0;
    const y = event.y ?? 0;

    // Convert to analog values (0 to 1) with deadzone
    const applyDeadzone = (value: number) => {
      const absValue = Math.abs(value);
      if (absValue < deadzone) return 0;
      // Rescale from deadzone-1 to 0-1
      return (absValue - deadzone) / (1 - deadzone);
    };

    // Apply gentle curve for softer center sensitivity
    // Power of 1.5 makes small inputs slightly smaller while staying responsive
    const applySteringCurve = (value: number) => {
      return Math.pow(value, 1.5);
    };

    inputRef.current.forward = y > deadzone ? applyDeadzone(y) : 0;
    inputRef.current.reverse = y < -deadzone ? applyDeadzone(y) : 0;
    // Apply curve to steering for softer center feel
    inputRef.current.left = x < -deadzone ? applySteringCurve(applyDeadzone(x)) : 0;
    inputRef.current.right = x > deadzone ? applySteringCurve(applyDeadzone(x)) : 0;
  }, []);

  const handleJoystickStop = useCallback(() => {
    // Fire any pending haptics on user touch release
    firePendingHaptic();

    inputRef.current.forward = 0;
    inputRef.current.reverse = 0;
    inputRef.current.left = 0;
    inputRef.current.right = 0;
  }, []);

  // Handle car-to-car collision
  const handleCarCollision = useCallback((playerCar: Car, targetCar: Car) => {
    const dx = targetCar.x - playerCar.x;
    const dy = targetCar.y - playerCar.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDist = ((playerCar.width + targetCar.width) / 2) * 0.85;

    if (distance >= minDist || distance === 0) return;

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
    if (now - lastCollisionRef.current < 150) return;

    if (impactSpeed > MIN_IMPACT_FOR_DAMAGE) {
      const collisionAngle = Math.atan2(dy, dx);
      const playerHitZone = getHitZone(playerCar, collisionAngle); // Player's side facing target
      const targetHitZone = getHitZone(targetCar, collisionAngle + Math.PI); // Target's side facing player

      const damage = Math.round((impactSpeed - MIN_IMPACT_FOR_DAMAGE) * DAMAGE_MULTIPLIER);

      // Queue haptic feedback based on impact intensity (fired on next user touch)
      const hapticIntensity = damage > 15 ? "heavy" : damage > 8 ? "medium" : "light";
      queueHaptic(hapticIntensity);

      // Attacker takes much less damage
      playerCar.health[playerHitZone] = Math.max(0, playerCar.health[playerHitZone] - damage * ATTACKER_DAMAGE_RATIO);
      targetCar.health[targetHitZone] = Math.max(0, targetCar.health[targetHitZone] - damage);

      damagePopupsRef.current.push({
        x: (playerCar.x + targetCar.x) / 2,
        y: (playerCar.y + targetCar.y) / 2 - 20,
        damage,
        zone: targetHitZone,
        age: 0,
      });

      lastCollisionRef.current = now;
    }
  }, []);

  // Update car physics
  const updatePhysics = useCallback(() => {
    const car = playerCarRef.current;
    const targetCar = targetCarRef.current;
    const input = inputRef.current;

    const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);

    const steeringFactor =
      currentSpeed < MIN_SPEED_TO_TURN ? (currentSpeed / MIN_SPEED_TO_TURN) * 0.3 : Math.min(1, currentSpeed / 3);

    // Analog steering - intensity scales the turn rate
    if (input.left > 0) car.angularVel -= TURN_RATE * steeringFactor * input.left;
    if (input.right > 0) car.angularVel += TURN_RATE * steeringFactor * input.right;

    const MAX_ANGULAR_VEL = 0.08;
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

    // Target car physics
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

    if (checkCarCollision(car, targetCar)) {
      handleCarCollision(car, targetCar);
    }

    // Wall collisions for player
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
      if (corner.x > CANVAS_WIDTH - WALL_THICKNESS) {
        car.x -= corner.x - (CANVAS_WIDTH - WALL_THICKNESS);
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
      if (corner.y > CANVAS_HEIGHT - WALL_THICKNESS) {
        car.y -= corner.y - (CANVAS_HEIGHT - WALL_THICKNESS);
        car.vy = -Math.abs(car.vy) * BOUNCE_FACTOR;
        car.vx *= COLLISION_DAMPING;
        car.vy *= COLLISION_DAMPING;
        collided = true;
      }
    }

    if (collided) car.angularVel += (Math.random() - 0.5) * 0.1;

    // Wall collisions for target
    const targetCorners = getCarCorners(targetCar);
    let targetCollided = false;

    for (const corner of targetCorners) {
      if (corner.x < WALL_THICKNESS) {
        targetCar.x += WALL_THICKNESS - corner.x;
        targetCar.vx = Math.abs(targetCar.vx) * BOUNCE_FACTOR;
        targetCar.vx *= COLLISION_DAMPING;
        targetCar.vy *= COLLISION_DAMPING;
        targetCollided = true;
      }
      if (corner.x > CANVAS_WIDTH - WALL_THICKNESS) {
        targetCar.x -= corner.x - (CANVAS_WIDTH - WALL_THICKNESS);
        targetCar.vx = -Math.abs(targetCar.vx) * BOUNCE_FACTOR;
        targetCar.vx *= COLLISION_DAMPING;
        targetCar.vy *= COLLISION_DAMPING;
        targetCollided = true;
      }
      if (corner.y < WALL_THICKNESS) {
        targetCar.y += WALL_THICKNESS - corner.y;
        targetCar.vy = Math.abs(targetCar.vy) * BOUNCE_FACTOR;
        targetCar.vx *= COLLISION_DAMPING;
        targetCar.vy *= COLLISION_DAMPING;
        targetCollided = true;
      }
      if (corner.y > CANVAS_HEIGHT - WALL_THICKNESS) {
        targetCar.y -= corner.y - (CANVAS_HEIGHT - WALL_THICKNESS);
        targetCar.vy = -Math.abs(targetCar.vy) * BOUNCE_FACTOR;
        targetCar.vx *= COLLISION_DAMPING;
        targetCar.vy *= COLLISION_DAMPING;
        targetCollided = true;
      }
    }

    if (targetCollided) targetCar.angularVel += (Math.random() - 0.5) * 0.08;

    damagePopupsRef.current = damagePopupsRef.current
      .map(p => ({ ...p, age: p.age + 1, y: p.y - 1 }))
      .filter(p => p.age < 60);

    setSpeed(Math.round(newSpeed * 10) / 10);
    setPlayerHealth({ ...car.health });
    setTargetHealth({ ...targetCar.health });
  }, [handleCarCollision]);

  // Draw a single car
  const drawCar = useCallback((ctx: CanvasRenderingContext2D, car: Car) => {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(-car.width / 2 + 3, -car.height / 2 + 3, car.width, car.height);

    const healthPercent = getTotalHealth(car) / 100;
    const r = parseInt(car.color.slice(1, 3), 16);
    const g = parseInt(car.color.slice(3, 5), 16);
    const b = parseInt(car.color.slice(5, 7), 16);

    const darkenFactor = 0.3 + healthPercent * 0.7;
    ctx.fillStyle = `rgb(${Math.round(r * darkenFactor)}, ${Math.round(g * darkenFactor)}, ${Math.round(b * darkenFactor)})`;
    ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);

    const drawDamageZone = (x: number, y: number, w: number, h: number, health: number) => {
      if (health < 100) {
        const damageIntensity = 1 - health / 100;
        ctx.fillStyle = `rgba(0, 0, 0, ${damageIntensity * 0.5})`;
        ctx.fillRect(x, y, w, h);

        if (health < 70) {
          ctx.strokeStyle = `rgba(50, 50, 50, ${damageIntensity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.2, y + h * 0.3);
          ctx.lineTo(x + w * 0.8, y + h * 0.7);
          ctx.stroke();
        }
        if (health < 40) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.7, y + h * 0.2);
          ctx.lineTo(x + w * 0.3, y + h * 0.8);
          ctx.stroke();
        }
      }
    };

    const hw = car.width / 2;
    const hh = car.height / 2;
    drawDamageZone(hw - 12, -hh, 12, car.height, car.health.front);
    drawDamageZone(-hw, -hh, 12, car.height, car.health.rear);
    drawDamageZone(-hw, -hh, car.width, 8, car.health.left);
    drawDamageZone(-hw, hh - 8, car.width, 8, car.health.right);

    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.strokeRect(-car.width / 2, -car.height / 2, car.width, car.height);

    ctx.fillStyle = car.health.front > 30 ? "#3498db" : "#e74c3c";
    ctx.fillRect(car.width / 2 - 10, -car.height / 2 + 4, 8, car.height - 8);

    ctx.fillStyle = "#2c3e50";
    const wheelWidth = 8;
    const wheelHeight = 5;
    ctx.fillRect(car.width / 4 - wheelWidth / 2, -car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(car.width / 4 - wheelWidth / 2, car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(-car.width / 4 - wheelWidth / 2, -car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(-car.width / 4 - wheelWidth / 2, car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);

    ctx.restore();
  }, []);

  // Draw health bar
  const drawHealthBar = useCallback((ctx: CanvasRenderingContext2D, car: Car, label: string, yOffset: number) => {
    const barX = CANVAS_WIDTH - 180;
    const barY = yOffset;
    const barWidth = 160;
    const barHeight = 12;
    const zones = [
      { name: "F", health: car.health.front, color: "#e74c3c" },
      { name: "R", health: car.health.rear, color: "#f39c12" },
      { name: "L", health: car.health.left, color: "#9b59b6" },
      { name: "Rt", health: car.health.right, color: "#3498db" },
    ];

    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px monospace";
    ctx.fillText(label, barX, barY - 5);

    zones.forEach((zone, i) => {
      const zoneY = barY + i * (barHeight + 4);

      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(barX, zoneY, barWidth, barHeight);

      const healthPercent = zone.health / 100;
      ctx.fillStyle = zone.color;
      ctx.fillRect(barX, zoneY, barWidth * healthPercent, barHeight);

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, zoneY, barWidth, barHeight);

      ctx.fillStyle = "#fff";
      ctx.font = "10px monospace";
      ctx.fillText(zone.name, barX + 4, zoneY + 9);
      ctx.fillText(`${Math.round(zone.health)}%`, barX + barWidth - 30, zoneY + 9);
    });
  }, []);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const playerCar = playerCarRef.current;
    const targetCar = targetCarRef.current;

    ctx.fillStyle = "#8B7355";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "#9C8565";
    for (let i = 0; i < 50; i++) {
      const x = (Math.sin(i * 123.456) * 0.5 + 0.5) * CANVAS_WIDTH;
      const y = (Math.cos(i * 789.012) * 0.5 + 0.5) * CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 20 + Math.sin(i) * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#5D4E37";
    ctx.fillRect(0, 0, CANVAS_WIDTH, WALL_THICKNESS);
    ctx.fillRect(0, CANVAS_HEIGHT - WALL_THICKNESS, CANVAS_WIDTH, WALL_THICKNESS);
    ctx.fillRect(0, 0, WALL_THICKNESS, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, CANVAS_HEIGHT);

    ctx.strokeStyle = "#3D2E17";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      WALL_THICKNESS,
      WALL_THICKNESS,
      CANVAS_WIDTH - WALL_THICKNESS * 2,
      CANVAS_HEIGHT - WALL_THICKNESS * 2,
    );

    drawCar(ctx, targetCar);
    drawCar(ctx, playerCar);

    damagePopupsRef.current.forEach(popup => {
      const alpha = 1 - popup.age / 60;
      ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.font = "bold 18px monospace";
      ctx.fillText(`-${popup.damage}`, popup.x - 15, popup.y);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.font = "10px monospace";
      ctx.fillText(popup.zone.toUpperCase(), popup.x - 10, popup.y + 12);
    });

    const speedBarWidth = 150;
    const speedBarHeight = 15;
    const speedBarX = 20;
    const speedBarY = CANVAS_HEIGHT - 40;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(speedBarX - 2, speedBarY - 2, speedBarWidth + 4, speedBarHeight + 4);

    const speedPercent = Math.min(1, Math.sqrt(playerCar.vx * playerCar.vx + playerCar.vy * playerCar.vy) / MAX_SPEED);
    const speedGradient = ctx.createLinearGradient(speedBarX, 0, speedBarX + speedBarWidth, 0);
    speedGradient.addColorStop(0, "#2ecc71");
    speedGradient.addColorStop(0.5, "#f1c40f");
    speedGradient.addColorStop(1, "#e74c3c");

    ctx.fillStyle = "#333";
    ctx.fillRect(speedBarX, speedBarY, speedBarWidth, speedBarHeight);
    ctx.fillStyle = speedGradient;
    ctx.fillRect(speedBarX, speedBarY, speedBarWidth * speedPercent, speedBarHeight);

    ctx.fillStyle = "#fff";
    ctx.font = "12px monospace";
    ctx.fillText("SPEED", speedBarX, speedBarY - 5);

    drawHealthBar(ctx, playerCar, "YOUR CAR", 30);
    drawHealthBar(ctx, targetCar, "TARGET", 120);
  }, [drawCar, drawHealthBar]);

  // Game loop
  const gameLoop = useCallback(() => {
    updatePhysics();
    render();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [updatePhysics, render]);

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") inputRef.current.forward = 1;
      if (e.key === "ArrowDown" || e.key === "s") inputRef.current.reverse = 1;
      if (e.key === "ArrowLeft" || e.key === "a") inputRef.current.left = 1;
      if (e.key === "ArrowRight" || e.key === "d") inputRef.current.right = 1;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") inputRef.current.forward = 0;
      if (e.key === "ArrowDown" || e.key === "s") inputRef.current.reverse = 0;
      if (e.key === "ArrowLeft" || e.key === "a") inputRef.current.left = 0;
      if (e.key === "ArrowRight" || e.key === "d") inputRef.current.right = 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Start game loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [gameLoop]);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gray-900 flex items-center justify-start overflow-hidden">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
        style={{
          maxWidth: "100vw",
          maxHeight: "100vh",
          width: "auto",
          height: "auto",
          objectFit: "contain",
        }}
        tabIndex={0}
        onTouchStart={firePendingHaptic}
        onTouchMove={firePendingHaptic}
      />

      {/* Mobile joystick overlay */}
      {isMobile && (
        <div
          style={{
            position: "fixed",
            bottom: "32px",
            right: "8px",
            zIndex: 50,
          }}
        >
          <Joystick
            size={120}
            baseColor="rgba(255, 255, 255, 0.3)"
            stickColor="rgba(255, 255, 255, 0.8)"
            move={handleJoystickMove}
            stop={handleJoystickStop}
          />
        </div>
      )}

      {/* Enable Haptics button - user must tap once to unlock iOS haptics */}
      {isMobile && !hapticsEnabled && (
        <div
          style={{
            position: "fixed",
            top: "16px",
            right: "8px",
            zIndex: 50,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "8px 16px",
              borderRadius: "9999px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            <span>Enable Haptics</span>
            <input
              type="checkbox"
              // @ts-expect-error - switch is a valid Safari attribute
              switch=""
              onChange={e => {
                if (e.target.checked) {
                  setHapticsEnabled(true);
                }
              }}
              style={{ width: "40px", height: "24px" }}
            />
          </label>
        </div>
      )}

      {/* Haptics enabled indicator */}
      {isMobile && hapticsEnabled && (
        <div
          style={{
            position: "fixed",
            top: "16px",
            right: "8px",
            zIndex: 50,
            backgroundColor: "rgba(22, 163, 74, 0.8)",
            color: "white",
            padding: "8px 16px",
            borderRadius: "9999px",
            fontSize: "14px",
          }}
        >
          🎮 Haptics ON
        </div>
      )}
    </div>
  );
};

export default Home;
