// =============================================
// GAME CONSTANTS
// =============================================

// Viewport (what we see) constants
export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 600;

// World (total drivable area) constants - 3x the viewport size
export const WORLD_WIDTH = 2700;
export const WORLD_HEIGHT = 1800;

// Car constants
export const CAR_WIDTH = 50;
export const CAR_HEIGHT = 30;
export const WALL_THICKNESS = 20;

// Camera scroll threshold - start scrolling when player is within this % of viewport edge
export const SCROLL_THRESHOLD = 0.35;

// Mini-map constants
export const MINIMAP_WIDTH = 150;
export const MINIMAP_HEIGHT = 100;

// Physics constants
export const ACCELERATION = 0.15;
export const BRAKE_DECEL = 0.1;
export const MAX_SPEED = 8;
export const TURN_RATE = 0.025;
export const FORWARD_FRICTION = 0.98;
export const SIDEWAYS_FRICTION = 0.85;
export const ANGULAR_FRICTION = 0.85;
export const BOUNCE_FACTOR = 0.5;
export const COLLISION_DAMPING = 0.7;
export const MIN_SPEED_TO_TURN = 0.5;
export const MAX_ANGULAR_VEL = 0.08;

// Damage constants
export const DAMAGE_MULTIPLIER = 3;
export const MIN_IMPACT_FOR_DAMAGE = 2;
export const ATTACKER_DAMAGE_RATIO = 0.15; // Attacker takes only 15% of the damage they deal
