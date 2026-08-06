import { RUSH_TURNS_LEFT } from "../game/core.js";

export const gameMusicSource = (
  turnsLeft: number,
  phase: "playing" | "won" | "lost",
) =>
  phase === "lost"
    ? "/music/game-over.mp3"
    : turnsLeft <= RUSH_TURNS_LEFT
      ? "/music/rush.mp3"
      : "/music/main.mp3";
