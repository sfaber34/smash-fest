"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnalogInput,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type Camera,
  type Car,
  type DamagePopup,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  WALL_THICKNESS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createCar,
  drawCar,
  drawDamagePopups,
  drawSpeedBar,
  drawWorld,
  handleCarCollision,
  handleWallCollisions,
  updateCamera,
  updateDamagePopups,
  updatePlayerCarPhysics,
} from "./game";
import type { NextPage } from "next";
import { Joystick } from "react-joystick-component";
import type { IJoystickUpdateEvent } from "react-joystick-component/build/lib/Joystick";
import { useMultiplayer } from "~~/hooks/useMultiplayer";

// Generate random spawn position within playable area
const getRandomSpawnPosition = () => {
  const padding = WALL_THICKNESS + 100; // Stay away from walls
  const x = padding + Math.random() * (WORLD_WIDTH - padding * 2);
  const y = padding + Math.random() * (WORLD_HEIGHT - padding * 2);
  const angle = Math.random() * Math.PI * 2; // Random starting angle
  return { x, y, angle };
};

const Home: NextPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Game state refs - spawn at random location
  const spawnRef = useRef(getRandomSpawnPosition());
  const playerCarRef = useRef<Car>(
    createCar(spawnRef.current.x, spawnRef.current.y, "#e74c3c", spawnRef.current.angle),
  );
  const inputRef = useRef<AnalogInput>({ forward: 0, reverse: 0, left: 0, right: 0 });
  const animationFrameRef = useRef<number>(0);
  const damagePopupsRef = useRef<DamagePopup[]>([]);
  const cameraRef = useRef<Camera>({
    x: spawnRef.current.x - CANVAS_WIDTH / 2,
    y: spawnRef.current.y - CANVAS_HEIGHT / 2,
  });
  const lastCollisionTimeRef = useRef<Map<string, number>>(new Map());

  // React state
  const [, setSpeed] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Multiplayer hook
  const { otherPlayersRef, isConnected, playerCount, interpolateOtherPlayers } = useMultiplayer({
    playerCar: playerCarRef,
  });

  // Detect mobile/touch device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile("ontouchstart" in window || navigator.maxTouchPoints > 0);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle joystick input
  const handleJoystickMove = useCallback((event: IJoystickUpdateEvent) => {
    const deadzone = 0.15;
    const x = event.x ?? 0;
    const y = event.y ?? 0;

    const applyDeadzone = (value: number) => {
      const absValue = Math.abs(value);
      if (absValue < deadzone) return 0;
      return (absValue - deadzone) / (1 - deadzone);
    };

    const applySteeringCurve = (value: number) => Math.pow(value, 1.5);

    inputRef.current.forward = y > deadzone ? applyDeadzone(y) : 0;
    inputRef.current.reverse = y < -deadzone ? applyDeadzone(y) : 0;
    inputRef.current.left = x < -deadzone ? applySteeringCurve(applyDeadzone(x)) : 0;
    inputRef.current.right = x > deadzone ? applySteeringCurve(applyDeadzone(x)) : 0;
  }, []);

  const handleJoystickStop = useCallback(() => {
    inputRef.current.forward = 0;
    inputRef.current.reverse = 0;
    inputRef.current.left = 0;
    inputRef.current.right = 0;
  }, []);

  // Update physics
  const updatePhysics = useCallback(() => {
    const playerCar = playerCarRef.current;
    const input = inputRef.current;
    const camera = cameraRef.current;

    // Interpolate other players towards their network positions (smooth movement)
    interpolateOtherPlayers();

    // Update player physics
    const newSpeed = updatePlayerCarPhysics(playerCar, input);

    // Handle collisions with other players
    otherPlayersRef.current.forEach((interpolatedCar, odId) => {
      const otherCar = interpolatedCar.current;
      const lastTime = lastCollisionTimeRef.current.get(odId) || 0;
      const newTime = handleCarCollision(playerCar, otherCar, lastTime, damagePopupsRef.current);
      if (newTime !== lastTime) {
        lastCollisionTimeRef.current.set(odId, newTime);
      }
    });

    // Handle wall collisions for player
    handleWallCollisions(playerCar);

    // Update camera
    updateCamera(camera, playerCar);

    // Update damage popups
    damagePopupsRef.current = updateDamagePopups(damagePopupsRef.current);

    // Update React state for UI
    setSpeed(Math.round(newSpeed * 10) / 10);
  }, [interpolateOtherPlayers, otherPlayersRef]);

  // Render main canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const playerCar = playerCarRef.current;
    const camera = cameraRef.current;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Apply camera transform
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw world
    drawWorld(ctx);

    // Draw other players (use interpolated current positions)
    otherPlayersRef.current.forEach(interpolatedCar => {
      drawCar(ctx, interpolatedCar.current);
    });

    // Draw player car (on top)
    drawCar(ctx, playerCar);

    // Draw damage popups
    drawDamagePopups(ctx, damagePopupsRef.current);

    // Restore context
    ctx.restore();

    // Draw UI elements (in screen space)
    drawSpeedBar(ctx, playerCar);
  }, [otherPlayersRef]);

  // Render mini-map
  const renderMiniMap = useCallback(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const playerCar = playerCarRef.current;
    const camera = cameraRef.current;

    // Clear mini-map
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Mini-map arena (walls)
    ctx.fillStyle = "#5D4E37";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Mini-map inner area (drivable zone)
    const wallRatio = 20 / WORLD_WIDTH;
    const innerMargin = wallRatio * MINIMAP_WIDTH;
    ctx.fillStyle = "#8B7355";
    ctx.fillRect(innerMargin, innerMargin, MINIMAP_WIDTH - innerMargin * 2, MINIMAP_HEIGHT - innerMargin * 2);

    // Mini-map border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw viewport rectangle
    const viewportX = (camera.x / WORLD_WIDTH) * MINIMAP_WIDTH;
    const viewportY = (camera.y / WORLD_HEIGHT) * MINIMAP_HEIGHT;
    const viewportW = (CANVAS_WIDTH / WORLD_WIDTH) * MINIMAP_WIDTH;
    const viewportH = (CANVAS_HEIGHT / WORLD_HEIGHT) * MINIMAP_HEIGHT;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.strokeRect(viewportX, viewportY, viewportW, viewportH);

    // Draw other players on mini-map (use interpolated positions)
    otherPlayersRef.current.forEach(interpolatedCar => {
      const car = interpolatedCar.current;
      const carX = (car.x / WORLD_WIDTH) * MINIMAP_WIDTH;
      const carY = (car.y / WORLD_HEIGHT) * MINIMAP_HEIGHT;
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.arc(carX, carY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw player dot (on top, slightly larger)
    const playerX = (playerCar.x / WORLD_WIDTH) * MINIMAP_WIDTH;
    const playerY = (playerCar.y / WORLD_HEIGHT) * MINIMAP_HEIGHT;
    ctx.fillStyle = playerCar.color;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 4, 0, Math.PI * 2);
    ctx.fill();
    // White border around player dot
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [otherPlayersRef]);

  // Game loop
  const gameLoop = useCallback(() => {
    updatePhysics();
    render();
    renderMiniMap();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [updatePhysics, render, renderMiniMap]);

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
      />

      {/* Connection status & player count */}
      <div
        style={{
          position: "fixed",
          top: "16px",
          left: "16px",
          zIndex: 50,
          backgroundColor: isConnected ? "rgba(22, 163, 74, 0.9)" : "rgba(220, 38, 38, 0.9)",
          color: "white",
          padding: "8px 16px",
          borderRadius: "8px",
          fontSize: "14px",
          fontFamily: "monospace",
        }}
      >
        {isConnected ? `🟢 ${playerCount} player${playerCount !== 1 ? "s" : ""} online` : "🔴 Connecting..."}
      </div>

      {/* Mini-map */}
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 40,
          borderRadius: "4px",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
        }}
      >
        <canvas ref={minimapCanvasRef} width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} style={{ display: "block" }} />
      </div>

      {/* Mobile joystick */}
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
            baseShape={"square" as unknown as undefined}
            controlPlaneShape={"square" as unknown as undefined}
            baseColor="rgba(255, 255, 255, 0.3)"
            stickColor="rgba(255, 255, 255, 0.8)"
            move={handleJoystickMove}
            stop={handleJoystickStop}
          />
        </div>
      )}
    </div>
  );
};

export default Home;
