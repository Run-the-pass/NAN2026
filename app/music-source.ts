export const gameMusicSource = (timeLeft: number) =>
  timeLeft <= 30 ? "/music/rush.mp3" : "/music/main.mp3";
