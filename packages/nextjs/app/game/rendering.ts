// =============================================
// RENDERING UTILITIES
// =============================================
import { getTotalHealth } from "./car";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_SPEED,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  WALL_THICKNESS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./constants";
import type { Camera, Car, DamagePopup } from "./types";

// Draw a single car on the canvas
export const drawCar = (ctx: CanvasRenderingContext2D, car: Car): void => {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(-car.width / 2 + 3, -car.height / 2 + 3, car.width, car.height);

  // Car body with health-based darkening
  const healthPercent = getTotalHealth(car) / 100;
  const r = parseInt(car.color.slice(1, 3), 16);
  const g = parseInt(car.color.slice(3, 5), 16);
  const b = parseInt(car.color.slice(5, 7), 16);

  const darkenFactor = 0.3 + healthPercent * 0.7;
  ctx.fillStyle = `rgb(${Math.round(r * darkenFactor)}, ${Math.round(g * darkenFactor)}, ${Math.round(b * darkenFactor)})`;
  ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);

  // Draw damage zones
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

  // Car outline
  ctx.strokeStyle = "#2c3e50";
  ctx.lineWidth = 2;
  ctx.strokeRect(-car.width / 2, -car.height / 2, car.width, car.height);

  // Windshield
  ctx.fillStyle = car.health.front > 30 ? "#3498db" : "#e74c3c";
  ctx.fillRect(car.width / 2 - 10, -car.height / 2 + 4, 8, car.height - 8);

  // Wheels
  ctx.fillStyle = "#2c3e50";
  const wheelWidth = 8;
  const wheelHeight = 5;
  ctx.fillRect(car.width / 4 - wheelWidth / 2, -car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
  ctx.fillRect(car.width / 4 - wheelWidth / 2, car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
  ctx.fillRect(-car.width / 4 - wheelWidth / 2, -car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);
  ctx.fillRect(-car.width / 4 - wheelWidth / 2, car.height / 2 - wheelHeight / 2, wheelWidth, wheelHeight);

  ctx.restore();
};

// Draw the world (background, walls, etc.)
export const drawWorld = (ctx: CanvasRenderingContext2D): void => {
  // Draw the world background (dirt arena)
  ctx.fillStyle = "#8B7355";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Draw dirt texture spots across the entire world
  ctx.fillStyle = "#9C8565";
  for (let i = 0; i < 150; i++) {
    const x = (Math.sin(i * 123.456) * 0.5 + 0.5) * WORLD_WIDTH;
    const y = (Math.cos(i * 789.012) * 0.5 + 0.5) * WORLD_HEIGHT;
    ctx.beginPath();
    ctx.arc(x, y, 20 + Math.sin(i) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw world boundary walls
  ctx.fillStyle = "#5D4E37";
  ctx.fillRect(0, 0, WORLD_WIDTH, WALL_THICKNESS); // Top
  ctx.fillRect(0, WORLD_HEIGHT - WALL_THICKNESS, WORLD_WIDTH, WALL_THICKNESS); // Bottom
  ctx.fillRect(0, 0, WALL_THICKNESS, WORLD_HEIGHT); // Left
  ctx.fillRect(WORLD_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, WORLD_HEIGHT); // Right

  // Draw inner wall border
  ctx.strokeStyle = "#3D2E17";
  ctx.lineWidth = 3;
  ctx.strokeRect(WALL_THICKNESS, WALL_THICKNESS, WORLD_WIDTH - WALL_THICKNESS * 2, WORLD_HEIGHT - WALL_THICKNESS * 2);
};

// Draw damage popups
export const drawDamagePopups = (ctx: CanvasRenderingContext2D, popups: DamagePopup[]): void => {
  popups.forEach(popup => {
    const alpha = 1 - popup.age / 60;
    ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
    ctx.font = "bold 18px monospace";
    ctx.fillText(`-${popup.damage}`, popup.x - 15, popup.y);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.font = "10px monospace";
    ctx.fillText(popup.zone.toUpperCase(), popup.x - 10, popup.y + 12);
  });
};

// Draw speed bar UI
export const drawSpeedBar = (ctx: CanvasRenderingContext2D, playerCar: Car): void => {
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
};

// Draw mini-map
export const drawMiniMap = (ctx: CanvasRenderingContext2D, playerCar: Car, targetCar: Car, camera: Camera): void => {
  // Clear mini-map
  ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

  // Mini-map arena (walls)
  ctx.fillStyle = "#5D4E37";
  ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

  // Mini-map inner area (drivable zone)
  const innerMargin = (WALL_THICKNESS / WORLD_WIDTH) * MINIMAP_WIDTH;
  ctx.fillStyle = "#8B7355";
  ctx.fillRect(innerMargin, innerMargin, MINIMAP_WIDTH - innerMargin * 2, MINIMAP_HEIGHT - innerMargin * 2);

  // Mini-map border
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

  // Draw viewport rectangle on mini-map
  const viewportMinimapX = (camera.x / WORLD_WIDTH) * MINIMAP_WIDTH;
  const viewportMinimapY = (camera.y / WORLD_HEIGHT) * MINIMAP_HEIGHT;
  const viewportMinimapW = (CANVAS_WIDTH / WORLD_WIDTH) * MINIMAP_WIDTH;
  const viewportMinimapH = (CANVAS_HEIGHT / WORLD_HEIGHT) * MINIMAP_HEIGHT;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(viewportMinimapX, viewportMinimapY, viewportMinimapW, viewportMinimapH);

  // Player dot on mini-map
  const playerMinimapX = (playerCar.x / WORLD_WIDTH) * MINIMAP_WIDTH;
  const playerMinimapY = (playerCar.y / WORLD_HEIGHT) * MINIMAP_HEIGHT;

  ctx.fillStyle = "#e74c3c";
  ctx.beginPath();
  ctx.arc(playerMinimapX, playerMinimapY, 4, 0, Math.PI * 2);
  ctx.fill();

  // Target dot on mini-map
  const targetMinimapX = (targetCar.x / WORLD_WIDTH) * MINIMAP_WIDTH;
  const targetMinimapY = (targetCar.y / WORLD_HEIGHT) * MINIMAP_HEIGHT;

  ctx.fillStyle = "#3498db";
  ctx.beginPath();
  ctx.arc(targetMinimapX, targetMinimapY, 3, 0, Math.PI * 2);
  ctx.fill();
};
