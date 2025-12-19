"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import {
  type Car,
  PARTYKIT_HOST,
  ROOM_NAME,
  type ServerMessage,
  carToPlayerState,
  generateRandomColor,
  playerStateToCar,
} from "~~/app/game";

// Interpolation factor - higher = snappier but choppier, lower = smoother but more latency
const INTERPOLATION_FACTOR = 0.3;

// Store both current (rendered) state and target (network) state
interface InterpolatedCar {
  current: Car;
  target: Car;
}

interface UseMultiplayerOptions {
  playerCar: React.MutableRefObject<Car>;
}

interface UseMultiplayerReturn {
  playerId: string | null;
  otherPlayersRef: React.MutableRefObject<Map<string, InterpolatedCar>>;
  isConnected: boolean;
  playerCount: number;
  interpolateOtherPlayers: () => void;
}

export function useMultiplayer({ playerCar }: UseMultiplayerOptions): UseMultiplayerReturn {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [playerCount, setPlayerCount] = useState(1);
  const socketRef = useRef<PartySocket | null>(null);
  const playerColorRef = useRef<string>(generateRandomColor());
  const playerIdRef = useRef<string | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use a ref for other players to avoid re-renders on every network update
  const otherPlayersRef = useRef<Map<string, InterpolatedCar>>(new Map());

  // Keep playerIdRef in sync with playerId state
  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  // Interpolate other players towards their target positions (call every frame)
  const interpolateOtherPlayers = useCallback(() => {
    otherPlayersRef.current.forEach(player => {
      const { current, target } = player;

      // Interpolate position
      current.x += (target.x - current.x) * INTERPOLATION_FACTOR;
      current.y += (target.y - current.y) * INTERPOLATION_FACTOR;

      // Interpolate velocity (for collision physics)
      current.vx += (target.vx - current.vx) * INTERPOLATION_FACTOR;
      current.vy += (target.vy - current.vy) * INTERPOLATION_FACTOR;

      // Interpolate angle (handle wraparound)
      let angleDiff = target.angle - current.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      current.angle += angleDiff * INTERPOLATION_FACTOR;

      // Interpolate angular velocity
      current.angularVel += (target.angularVel - current.angularVel) * INTERPOLATION_FACTOR;

      // Copy health directly (no need to interpolate)
      current.health = { ...target.health };
    });
  }, []);

  // Connect to PartyKit - only runs once on mount
  useEffect(() => {
    // Set player car color
    playerCar.current.color = playerColorRef.current;

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: ROOM_NAME,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      // Send join message
      socket.send(JSON.stringify({ type: "join", color: playerColorRef.current }));
    };

    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;

        switch (message.type) {
          case "welcome": {
            setPlayerId(message.id);
            playerIdRef.current = message.id;
            // Convert existing players to InterpolatedCars
            const players = new Map<string, InterpolatedCar>();
            Object.values(message.players).forEach(p => {
              if (p.id !== message.id) {
                const car = playerStateToCar(p);
                players.set(p.id, {
                  current: { ...car },
                  target: car,
                });
              }
            });
            otherPlayersRef.current = players;
            setPlayerCount(players.size + 1);
            break;
          }

          case "players": {
            // Update target positions for all other players
            const currentPlayers = otherPlayersRef.current;
            const newPlayers = new Map<string, InterpolatedCar>();

            Object.values(message.players).forEach(p => {
              if (p.id !== playerIdRef.current) {
                const targetCar = playerStateToCar(p);
                const existing = currentPlayers.get(p.id);

                if (existing) {
                  // Update target, keep current for interpolation
                  existing.target = targetCar;
                  newPlayers.set(p.id, existing);
                } else {
                  // New player - start at target position
                  newPlayers.set(p.id, {
                    current: { ...targetCar },
                    target: targetCar,
                  });
                }
              }
            });

            otherPlayersRef.current = newPlayers;
            setPlayerCount(newPlayers.size + 1);
            break;
          }

          case "player-joined": {
            if (message.player.id !== playerIdRef.current) {
              const car = playerStateToCar(message.player);
              otherPlayersRef.current.set(message.player.id, {
                current: { ...car },
                target: car,
              });
              setPlayerCount(otherPlayersRef.current.size + 1);
            }
            break;
          }

          case "player-left": {
            otherPlayersRef.current.delete(message.id);
            setPlayerCount(otherPlayersRef.current.size + 1);
            break;
          }
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
    };

    socket.onerror = error => {
      console.error("WebSocket error:", error);
    };

    // Send updates at ~30fps (every ~33ms) for smoother networking
    updateIntervalRef.current = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN && playerIdRef.current) {
        const state = carToPlayerState(playerCar.current, playerIdRef.current);
        state.color = playerColorRef.current;
        socket.send(JSON.stringify({ type: "update", state }));
      }
    }, 33);

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "leave" }));
      }
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount

  return {
    playerId,
    otherPlayersRef,
    isConnected,
    playerCount,
    interpolateOtherPlayers,
  };
}
