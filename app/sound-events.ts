import { activeOrders, type GameState } from "../game/core.js";

export type GameSoundCue =
  | "round-start"
  | "game-over"
  | "round-clear"
  | "low-time"
  | "new-item"
  | "chop"
  | "wash"
  | "pick-item"
  | "food-submit"
  | "order-success"
  | "new-order"
  | "trash"
  | "incinerate"
  | "fire-start"
  | "fire-extinguish"
  | "move";

const submitted = (state: GameState) =>
  state.orders.reduce((total, order) => total + order.submittedCount, 0);

const burning = (state: GameState) =>
  Object.values(state.fires).some((fire) => fire?.onFire);

export function gameSoundCues(
  previous: GameState | null,
  next: GameState,
): GameSoundCue[] {
  if (!previous || (previous.phase !== "playing" && next.phase === "playing")) {
    return ["round-start"];
  }
  if (previous.phase === "playing" && next.phase === "lost") {
    return ["game-over"];
  }

  const cues: GameSoundCue[] = [];
  const foodSubmitted = submitted(next) > submitted(previous);
  if (foodSubmitted) cues.push("food-submit");
  if (previous.phase === "playing" && next.phase === "won") {
    cues.push("round-clear");
    return cues;
  }
  if (previous.timeLeft > 30 && next.timeLeft <= 30) cues.push("low-time");
  if (Object.entries(next.ingredients).some(([id, box]) =>
    box!.stock > (previous.ingredients[id as keyof GameState["ingredients"]]?.stock ?? 0)
  )) cues.push("new-item");
  if (Object.entries(next.workstations).some(([id, workstation]) =>
    previous.workstations[id as keyof GameState["workstations"]]?.status !== "WORKING" &&
    workstation?.status === "WORKING"
  )) cues.push("chop");
  if (Object.entries(next.washers).some(([id, washer]) =>
    !previous.washers[id as keyof GameState["washers"]]?.workerId && washer?.workerId
  )) cues.push("wash");
  if (
    Object.keys(next.actors).some((id) => {
      const actorId = id as keyof GameState["actors"];
      return (
        (previous.actors[actorId]?.carrying.length ?? 0) <
        (next.actors[actorId]?.carrying.length ?? 0)
      );
    })
  ) cues.push("pick-item");
  if (next.filled > previous.filled) cues.push("order-success");
  const previousOrder = activeOrders(previous)[0]?.id;
  const nextOrder = activeOrders(next)[0]?.id;
  if (previousOrder && nextOrder && previousOrder !== nextOrder) cues.push("new-order");
  if (next.lastEvent !== previous.lastEvent && next.lastEvent.includes("버렸습니다")) {
    cues.push("trash");
  }
  if (Object.entries(next.incinerators).some(([id, incinerator]) =>
    !previous.incinerators[id as keyof GameState["incinerators"]]?.workerId && incinerator?.workerId
  )) cues.push("incinerate");
  if (!burning(previous) && burning(next)) cues.push("fire-start");
  if (burning(previous) && !burning(next)) cues.push("fire-extinguish");
  if (
    Object.keys(next.actors).some((id) => {
      const actorId = id as keyof GameState["actors"];
      return (
        previous.actors[actorId]?.intent?.kind !== "MOVE" &&
        next.actors[actorId]?.intent?.kind === "MOVE"
      );
    })
  ) cues.push("move");
  return cues;
}
