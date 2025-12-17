"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NextPage } from "next";

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
const TURN_RATE = 0.025; // Reduced from 0.05 - much gentler turning
const FORWARD_FRICTION = 0.98; // Less friction forward (grip)
const SIDEWAYS_FRICTION = 0.85; // More friction sideways (drift resistance)
const ANGULAR_FRICTION = 0.85; // Increased drag on rotation (was 0.92)
const BOUNCE_FACTOR = 0.5;
const COLLISION_DAMPING = 0.7;
const MIN_SPEED_TO_TURN = 0.5; // Need some speed to turn effectively

interface Car {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // radians, 0 = facing right
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
}

interface Keys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const createCar = (x: number, y: number, color: string): Car => ({
  x,
  y,
  vx: 0,
  vy: 0,
  angle: 0,
  angularVel: 0,
  width: CAR_WIDTH,
  height: CAR_HEIGHT,
  color,
  health: { front: 100, rear: 100, left: 100, right: 100 },
});

// Get the car's corner points for collision detection
const getCarCorners = (car: Car): { x: number; y: number }[] => {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const hw = car.width / 2;
  const hh = car.height / 2;

  return [
    { x: car.x + cos * hw - sin * hh, y: car.y + sin * hw + cos * hh }, // front-right
    { x: car.x + cos * hw + sin * hh, y: car.y + sin * hw - cos * hh }, // front-left
    { x: car.x - cos * hw + sin * hh, y: car.y - sin * hw - cos * hh }, // rear-left
    { x: car.x - cos * hw - sin * hh, y: car.y - sin * hw + cos * hh }, // rear-right
  ];
};

const Game: NextPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carRef = useRef<Car>(createCar(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, "#e74c3c"));
  const keysRef = useRef<Keys>({ up: false, down: false, left: false, right: false });
  const animationFrameRef = useRef<number>(0);
  const [speed, setSpeed] = useState(0);
  const [debugInfo, setDebugInfo] = useState({ angle: 0, vx: 0, vy: 0 });

  // Update car physics
  const updatePhysics = useCallback(() => {
    const car = carRef.current;
    const keys = keysRef.current;

    // Calculate current speed
    const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);

    // Steering - requires forward movement, scales with speed but caps out
    // Can't really turn if you're not moving
    const steeringFactor =
      currentSpeed < MIN_SPEED_TO_TURN
        ? (currentSpeed / MIN_SPEED_TO_TURN) * 0.3 // Very weak steering when nearly stopped
        : Math.min(1, currentSpeed / 3); // Ramps up but caps at reasonable level

    if (keys.left) {
      car.angularVel -= TURN_RATE * steeringFactor;
    }
    if (keys.right) {
      car.angularVel += TURN_RATE * steeringFactor;
    }

    // Clamp angular velocity to prevent crazy spinning
    const MAX_ANGULAR_VEL = 0.08;
    car.angularVel = Math.max(-MAX_ANGULAR_VEL, Math.min(MAX_ANGULAR_VEL, car.angularVel));

    // Apply angular friction
    car.angularVel *= ANGULAR_FRICTION;
    car.angle += car.angularVel;

    // Forward/backward vector
    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);

    // Acceleration/braking
    if (keys.up) {
      car.vx += forwardX * ACCELERATION;
      car.vy += forwardY * ACCELERATION;
    }
    if (keys.down) {
      // Check if moving forward or backward relative to facing direction
      const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
      if (forwardSpeed > 0.5) {
        // Braking
        car.vx -= forwardX * BRAKE_DECEL;
        car.vy -= forwardY * BRAKE_DECEL;
      } else {
        // Reverse
        car.vx -= forwardX * ACCELERATION * 0.5;
        car.vy -= forwardY * ACCELERATION * 0.5;
      }
    }

    // Split velocity into forward and sideways components (this creates the drift feel)
    const rightX = -forwardY; // perpendicular to forward
    const rightY = forwardX;

    const forwardVel = car.vx * forwardX + car.vy * forwardY;
    const sidewaysVel = car.vx * rightX + car.vy * rightY;

    // Apply different friction to forward vs sideways (this is the key to "dirt" feel)
    const newForwardVel = forwardVel * FORWARD_FRICTION;
    const newSidewaysVel = sidewaysVel * SIDEWAYS_FRICTION;

    // Recombine velocity
    car.vx = forwardX * newForwardVel + rightX * newSidewaysVel;
    car.vy = forwardY * newForwardVel + rightY * newSidewaysVel;

    // Clamp to max speed
    const newSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    if (newSpeed > MAX_SPEED) {
      car.vx = (car.vx / newSpeed) * MAX_SPEED;
      car.vy = (car.vy / newSpeed) * MAX_SPEED;
    }

    // Update position
    car.x += car.vx;
    car.y += car.vy;

    // Wall collisions
    const corners = getCarCorners(car);
    let collided = false;

    for (const corner of corners) {
      // Left wall
      if (corner.x < WALL_THICKNESS) {
        car.x += WALL_THICKNESS - corner.x;
        car.vx = Math.abs(car.vx) * BOUNCE_FACTOR;
        car.vx *= COLLISION_DAMPING;
        car.vy *= COLLISION_DAMPING;
        collided = true;
      }
      // Right wall
      if (corner.x > CANVAS_WIDTH - WALL_THICKNESS) {
        car.x -= corner.x - (CANVAS_WIDTH - WALL_THICKNESS);
        car.vx = -Math.abs(car.vx) * BOUNCE_FACTOR;
        car.vx *= COLLISION_DAMPING;
        car.vy *= COLLISION_DAMPING;
        collided = true;
      }
      // Top wall
      if (corner.y < WALL_THICKNESS) {
        car.y += WALL_THICKNESS - corner.y;
        car.vy = Math.abs(car.vy) * BOUNCE_FACTOR;
        car.vx *= COLLISION_DAMPING;
        car.vy *= COLLISION_DAMPING;
        collided = true;
      }
      // Bottom wall
      if (corner.y > CANVAS_HEIGHT - WALL_THICKNESS) {
        car.y -= corner.y - (CANVAS_HEIGHT - WALL_THICKNESS);
        car.vy = -Math.abs(car.vy) * BOUNCE_FACTOR;
        car.vx *= COLLISION_DAMPING;
        car.vy *= COLLISION_DAMPING;
        collided = true;
      }
    }

    // Add some angular momentum on wall collision for more dramatic effect
    if (collided) {
      car.angularVel += (Math.random() - 0.5) * 0.1;
    }

    setSpeed(Math.round(newSpeed * 10) / 10);
    setDebugInfo({
      angle: Math.round((car.angle * 180) / Math.PI) % 360,
      vx: Math.round(car.vx * 100) / 100,
      vy: Math.round(car.vy * 100) / 100,
    });
  }, []);

  // Render the game
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const car = carRef.current;

    // Clear canvas
    ctx.fillStyle = "#8B7355"; // Dirt brown
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw arena floor with some texture
    ctx.fillStyle = "#9C8565";
    for (let i = 0; i < 50; i++) {
      const x = (Math.sin(i * 123.456) * 0.5 + 0.5) * CANVAS_WIDTH;
      const y = (Math.cos(i * 789.012) * 0.5 + 0.5) * CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(x, y, 20 + Math.sin(i) * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw walls
    ctx.fillStyle = "#5D4E37";
    ctx.fillRect(0, 0, CANVAS_WIDTH, WALL_THICKNESS); // Top
    ctx.fillRect(0, CANVAS_HEIGHT - WALL_THICKNESS, CANVAS_WIDTH, WALL_THICKNESS); // Bottom
    ctx.fillRect(0, 0, WALL_THICKNESS, CANVAS_HEIGHT); // Left
    ctx.fillRect(CANVAS_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, CANVAS_HEIGHT); // Right

    // Draw wall borders (inner edge)
    ctx.strokeStyle = "#3D2E17";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      WALL_THICKNESS,
      WALL_THICKNESS,
      CANVAS_WIDTH - WALL_THICKNESS * 2,
      CANVAS_HEIGHT - WALL_THICKNESS * 2,
    );

    // Draw tire tracks (simple effect)
    ctx.strokeStyle = "rgba(60, 40, 20, 0.3)";
    ctx.lineWidth = 2;

    // Draw car
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    // Car shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(-car.width / 2 + 3, -car.height / 2 + 3, car.width, car.height);

    // Car body
    ctx.fillStyle = car.color;
    ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);

    // Car border
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.strokeRect(-car.width / 2, -car.height / 2, car.width, car.height);

    // Front indicator (windshield)
    ctx.fillStyle = "#3498db";
    ctx.fillRect(car.width / 2 - 10, -car.height / 2 + 4, 8, car.height - 8);

    // Wheels
    ctx.fillStyle = "#2c3e50";
    const wheelWidth = 8;
    const wheelHeight = 5;
    // Front wheels
    ctx.fillRect(car.width / 4 - wheelWidth / 2, -car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(car.width / 4 - wheelWidth / 2, car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
    // Rear wheels
    ctx.fillRect(-car.width / 4 - wheelWidth / 2, -car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(-car.width / 4 - wheelWidth / 2, car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);

    ctx.restore();

    // Draw speed indicator
    const speedBarWidth = 150;
    const speedBarHeight = 15;
    const speedBarX = 20;
    const speedBarY = CANVAS_HEIGHT - 40;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(speedBarX - 2, speedBarY - 2, speedBarWidth + 4, speedBarHeight + 4);

    const speedPercent = Math.min(1, Math.sqrt(car.vx * car.vx + car.vy * car.vy) / MAX_SPEED);
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
  }, []);

  // Game loop
  const gameLoop = useCallback(() => {
    updatePhysics();
    render();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [updatePhysics, render]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") keysRef.current.up = true;
      if (e.key === "ArrowDown" || e.key === "s") keysRef.current.down = true;
      if (e.key === "ArrowLeft" || e.key === "a") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = true;
      // Prevent scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") keysRef.current.up = false;
      if (e.key === "ArrowDown" || e.key === "s") keysRef.current.down = false;
      if (e.key === "ArrowLeft" || e.key === "a") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = false;
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

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [gameLoop]);

  // Reset car position
  const resetCar = () => {
    carRef.current = createCar(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, "#e74c3c");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      <h1 className="text-4xl font-bold text-white mb-2 tracking-wider">🚗 SMASH FEST 💥</h1>
      <p className="text-gray-400 mb-4">Demolition Derby - Test Arena</p>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-4 border-gray-700 rounded-lg shadow-2xl"
          tabIndex={0}
        />
      </div>

      <div className="mt-4 flex gap-8 text-white">
        <div className="bg-gray-800 px-6 py-3 rounded-lg">
          <span className="text-gray-400">Speed:</span>{" "}
          <span className="font-mono text-xl text-green-400">{speed}</span>
        </div>
        <div className="bg-gray-800 px-6 py-3 rounded-lg">
          <span className="text-gray-400">Angle:</span>{" "}
          <span className="font-mono text-xl text-blue-400">{debugInfo.angle}°</span>
        </div>
        <button
          onClick={resetCar}
          className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-bold transition-colors"
        >
          Reset Position
        </button>
      </div>

      <div className="mt-6 text-gray-400 text-center">
        <p className="text-lg mb-2">Controls</p>
        <div className="flex gap-4 justify-center">
          <kbd className="px-3 py-2 bg-gray-700 rounded text-white">↑</kbd>
          <kbd className="px-3 py-2 bg-gray-700 rounded text-white">↓</kbd>
          <kbd className="px-3 py-2 bg-gray-700 rounded text-white">←</kbd>
          <kbd className="px-3 py-2 bg-gray-700 rounded text-white">→</kbd>
        </div>
        <p className="mt-2 text-sm">or WASD keys</p>
        <p className="mt-4 text-xs text-gray-500">
          Feel the drift! The car has different grip forward vs sideways for that dirt track feel.
        </p>
      </div>
    </div>
  );
};

export default Game;
