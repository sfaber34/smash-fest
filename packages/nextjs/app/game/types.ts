// =============================================
// GAME TYPES
// =============================================

export interface Car {
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
export interface AnalogInput {
  forward: number; // 0 to 1
  reverse: number; // 0 to 1
  left: number; // 0 to 1
  right: number; // 0 to 1
}

export interface DamagePopup {
  x: number;
  y: number;
  damage: number;
  zone: string;
  age: number;
}

export interface Camera {
  x: number;
  y: number;
}

export type HitZone = "front" | "rear" | "left" | "right";
