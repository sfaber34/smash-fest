"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnalogInput,
  CANVAS_HEIGHT, // Constants
  CANVAS_WIDTH,
  type Camera, // Types
  type Car,
  type DamagePopup,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH, // Car utilities
  createCar, // Rendering
  drawCar,
  drawDamagePopups,
  drawMiniMap,
  drawSpeedBar,
  drawWorld,
  handleCarCollision,
  handleWallCollisions,
  updateCamera,
  updateDamagePopups, // Physics
  updatePlayerCarPhysics,
  updateTargetCarPhysics,
} from "./game";
import type { NextPage } from "next";
import { Joystick } from "react-joystick-component";
import type { IJoystickUpdateEvent } from "react-joystick-component/build/lib/Joystick";

const Home: NextPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Game state refs
  const playerCarRef = useRef<Car>(createCar(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "#e74c3c", 0));
  const targetCarRef = useRef<Car>(createCar(WORLD_WIDTH / 2 + 200, WORLD_HEIGHT / 2, "#3498db", Math.PI / 4, false));
  const inputRef = useRef<AnalogInput>({ forward: 0, reverse: 0, left: 0, right: 0 });
  const animationFrameRef = useRef<number>(0);
  const damagePopupsRef = useRef<DamagePopup[]>([]);
  const cameraRef = useRef<Camera>({ x: WORLD_WIDTH / 2 - CANVAS_WIDTH / 2, y: WORLD_HEIGHT / 2 - CANVAS_HEIGHT / 2 });
  const lastCollisionRef = useRef(0);

  // React state
  const [, setSpeed] = useState(0);
  const [, setPlayerHealth] = useState({ front: 100, rear: 100, left: 100, right: 100 });
  const [, setTargetHealth] = useState({ front: 100, rear: 100, left: 100, right: 100 });
  const [isMobile, setIsMobile] = useState(false);

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
    const targetCar = targetCarRef.current;
    const input = inputRef.current;
    const camera = cameraRef.current;

    // Update player physics
    const newSpeed = updatePlayerCarPhysics(playerCar, input);

    // Update target physics
    updateTargetCarPhysics(targetCar);

    // Handle car-to-car collision
    lastCollisionRef.current = handleCarCollision(
      playerCar,
      targetCar,
      lastCollisionRef.current,
      damagePopupsRef.current,
    );

    // Handle wall collisions
    handleWallCollisions(playerCar);
    handleWallCollisions(targetCar);

    // Update camera
    updateCamera(camera, playerCar);

    // Update damage popups
    damagePopupsRef.current = updateDamagePopups(damagePopupsRef.current);

    // Update React state for UI
    setSpeed(Math.round(newSpeed * 10) / 10);
    setPlayerHealth({ ...playerCar.health });
    setTargetHealth({ ...targetCar.health });
  }, []);

  // Render main canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const playerCar = playerCarRef.current;
    const targetCar = targetCarRef.current;
    const camera = cameraRef.current;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Apply camera transform
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw world
    drawWorld(ctx);

    // Draw cars
    drawCar(ctx, targetCar);
    drawCar(ctx, playerCar);

    // Draw damage popups
    drawDamagePopups(ctx, damagePopupsRef.current);

    // Restore context
    ctx.restore();

    // Draw UI elements (in screen space)
    drawSpeedBar(ctx, playerCar);
  }, []);

  // Render mini-map
  const renderMiniMap = useCallback(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawMiniMap(ctx, playerCarRef.current, targetCarRef.current, cameraRef.current);
  }, []);

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
