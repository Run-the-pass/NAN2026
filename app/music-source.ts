export const gameMusicSource = (
  timeLeft: number,
  phase: "playing" | "won" | "lost",
) =>
  phase === "lost"
    ? "/music/game-over.mp3"
    : timeLeft <= 30
      ? "/music/rush.mp3"
      : "/music/main.mp3";
