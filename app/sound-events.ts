import { RUSH_TURNS_LEFT, activeOrders, type GameState } from "../game/core.js";

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

// 진행도가 오른 설비가 있는지. 턴제는 작업자를 잡아 두지 않으므로 작업이
// 일어났는지를 작업자가 아니라 진행도 변화로 본다.
const progressed = (
  before: Partial<Record<string, { progress: number }>>,
  after: Partial<Record<string, { progress: number }>>,
) =>
  Object.entries(after).some(
    ([id, station]) => (station?.progress ?? 0) > (before[id]?.progress ?? 0),
  );

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
  if (previous.turnsLeft > RUSH_TURNS_LEFT && next.turnsLeft <= RUSH_TURNS_LEFT) {
    cues.push("low-time");
  }
  if (Object.entries(next.ingredients).some(([id, box]) =>
    box!.stock > (previous.ingredients[id as keyof GameState["ingredients"]]?.stock ?? 0)
  )) cues.push("new-item");
  // 한 번에 끝나는 작업은 진행도가 0에서 0으로 보이므로 완료 상태도 함께 본다.
  if (
    progressed(previous.workstations, next.workstations) ||
    Object.entries(next.workstations).some(([id, workstation]) =>
      previous.workstations[id as keyof GameState["workstations"]]?.status !== "COMPLETE" &&
      workstation?.status === "COMPLETE"
    )
  ) cues.push("chop");
  if (
    progressed(previous.washers, next.washers) ||
    Object.entries(next.washers).some(([id, washer]) =>
      previous.washers[id as keyof GameState["washers"]]?.dish?.status === "dirty" &&
      washer?.dish?.status === "clean"
    )
  ) cues.push("wash");
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
  if (
    progressed(previous.incinerators, next.incinerators) ||
    Object.entries(next.incinerators).some(([id, incinerator]) =>
      (previous.incinerators[id as keyof GameState["incinerators"]]?.count ?? 0) > 0 &&
      incinerator?.count === 0
    )
  ) cues.push("incinerate");
  if (!burning(previous) && burning(next)) cues.push("fire-start");
  if (burning(previous) && !burning(next)) cues.push("fire-extinguish");
  if (
    Object.keys(next.actors).some((id) => {
      const actorId = id as keyof GameState["actors"];
      const after = next.actors[actorId];
      return after?.status === "MOVING" && after.acts !== previous.actors[actorId]?.acts;
    })
  ) cues.push("move");
  return cues;
}
