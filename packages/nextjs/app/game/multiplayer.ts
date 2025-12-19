// =============================================
// MULTIPLAYER UTILITIES
// =============================================
import type { Car } from "./types";

// Player state for network sync
export interface PlayerState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
  color: string;
  health: {
    front: number;
    rear: number;
    left: number;
    right: number;
  };
}

// Message types from server
export type ServerMessage =
  | { type: "players"; players: Record<string, PlayerState> }
  | { type: "player-joined"; player: PlayerState }
  | { type: "player-left"; id: string }
  | { type: "welcome"; id: string; players: Record<string, PlayerState> };

// Message types to server
export type ClientMessage =
  | { type: "update"; state: PlayerState }
  | { type: "join"; color: string }
  | { type: "leave" };

// Convert PlayerState to Car for rendering
export const playerStateToCar = (state: PlayerState): Car => ({
  x: state.x,
  y: state.y,
  vx: state.vx,
  vy: state.vy,
  angle: state.angle,
  angularVel: state.angularVel,
  width: 50, // CAR_WIDTH
  height: 30, // CAR_HEIGHT
  color: state.color,
  health: state.health,
  isStatic: false,
});

// Convert Car to PlayerState for network
export const carToPlayerState = (car: Car, id: string): PlayerState => ({
  id,
  x: car.x,
  y: car.y,
  vx: car.vx,
  vy: car.vy,
  angle: car.angle,
  angularVel: car.angularVel,
  color: car.color,
  health: car.health,
});

// Generate a random car color
export const generateRandomColor = (): string => {
  const colors = [
    "#e74c3c", // red
    "#3498db", // blue
    "#2ecc71", // green
    "#f39c12", // orange
    "#9b59b6", // purple
    "#1abc9c", // teal
    "#e91e63", // pink
    "#00bcd4", // cyan
    "#ff5722", // deep orange
    "#8bc34a", // light green
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// PartyKit connection URL (will be configured for production)
export const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";
export const ROOM_NAME = "arena"; // Single room for all players
