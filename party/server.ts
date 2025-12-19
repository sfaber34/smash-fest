import type * as Party from "partykit/server";

// Player state that gets broadcast
interface PlayerState {
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

// Message types
type ClientMessage =
  | { type: "update"; state: PlayerState }
  | { type: "join"; color: string }
  | { type: "leave" };

type ServerMessage =
  | { type: "players"; players: Record<string, PlayerState> }
  | { type: "player-joined"; player: PlayerState }
  | { type: "player-left"; id: string }
  | { type: "welcome"; id: string; players: Record<string, PlayerState> };

export default class SmashFestServer implements Party.Server {
  // Store all connected players
  players: Record<string, PlayerState> = {};

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send welcome message with current players
    const welcome: ServerMessage = {
      type: "welcome",
      id: conn.id,
      players: this.players,
    };
    conn.send(JSON.stringify(welcome));
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message) as ClientMessage;

      switch (data.type) {
        case "join": {
          // Player joining with their color
          const newPlayer: PlayerState = {
            id: sender.id,
            x: 1350 + Math.random() * 200 - 100, // Random spawn near center
            y: 900 + Math.random() * 200 - 100,
            vx: 0,
            vy: 0,
            angle: Math.random() * Math.PI * 2,
            angularVel: 0,
            color: data.color,
            health: { front: 100, rear: 100, left: 100, right: 100 },
          };
          this.players[sender.id] = newPlayer;

          // Broadcast to all other players
          this.room.broadcast(
            JSON.stringify({ type: "player-joined", player: newPlayer } as ServerMessage),
            [sender.id],
          );
          break;
        }

        case "update": {
          // Update player state
          if (this.players[sender.id]) {
            this.players[sender.id] = { ...data.state, id: sender.id };
          }
          // Broadcast all players to everyone (simple approach)
          this.room.broadcast(JSON.stringify({ type: "players", players: this.players } as ServerMessage));
          break;
        }

        case "leave": {
          delete this.players[sender.id];
          this.room.broadcast(JSON.stringify({ type: "player-left", id: sender.id } as ServerMessage));
          break;
        }
      }
    } catch (e) {
      console.error("Failed to parse message:", e);
    }
  }

  onClose(conn: Party.Connection) {
    // Remove player when they disconnect
    delete this.players[conn.id];
    this.room.broadcast(JSON.stringify({ type: "player-left", id: conn.id } as ServerMessage));
  }
}

SmashFestServer satisfies Party.Worker;
