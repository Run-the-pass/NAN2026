import {
  isBesideStation,
  isDish,
  stationInstancesByType,
  type ActorId,
  type GameState,
  type ItemId,
  type StationId,
} from "../game/core.js";

/**
 * 튜토리얼 조건 어휘.
 *
 * 대본(app/tutorial-script.ts)은 이 함수들만 조합해서 쓴다. 대본이 통째로
 * 바뀌어도 여기는 그대로 남고, 새 흐름이 필요하면 어휘를 하나 더 만들면 된다.
 * 조건은 게임 상태를 읽기만 하고 고치지 않는다.
 */

// 화면만 아는 것들. 게임 상태에 넣을 값이 아니라 따로 받는다.
export type TutorialView = {
  selected: ActorId | null;
  // 눌러서 넘긴 알림들. 한 번 넘긴 알림은 다시 뜨지 않는다.
  acked: ReadonlySet<string>;
  turnLimit: number;
};

export type Condition = (state: GameState, view: TutorialView) => boolean;

const held = (state: GameState, actorId: ActorId) =>
  (state.actors[actorId]?.carrying ?? []).map((carried) =>
    isDish(carried) ? carried.content : carried,
  );

const everyStation = (state: GameState) =>
  Object.entries(state.stoves).flatMap(([, items]) => items ?? []);

// ── 조합 ──────────────────────────────────────────────────────────────────
export const not = (one: Condition): Condition => (state, view) => !one(state, view);
export const every = (...list: Condition[]): Condition => (state, view) =>
  list.every((one) => one(state, view));
export const some = (...list: Condition[]): Condition => (state, view) =>
  list.some((one) => one(state, view));
export const always: Condition = () => true;

// ── 슬라임 ────────────────────────────────────────────────────────────────
export const selecting =
  (actorId: ActorId): Condition =>
  (_state, view) =>
    view.selected === actorId;

export const carrying =
  (actorId: ActorId, item: ItemId): Condition =>
  (state) =>
    held(state, actorId).includes(item);

export const carryingPlated =
  (actorId?: ActorId): Condition =>
  (state) =>
    Object.entries(state.actors).some(
      ([id, actor]) =>
        (!actorId || id === actorId) &&
        (actor?.carrying ?? []).some((carried) => isDish(carried) && carried.content),
    );

export const carryingDirtyDish: Condition = (state) =>
  Object.values(state.actors).some((actor) =>
    (actor?.carrying ?? []).some((carried) => isDish(carried) && carried.status === "dirty"),
  );

export const outOfPoints =
  (actorId: ActorId): Condition =>
  (state) =>
    (state.actors[actorId]?.actionPoints ?? 1) === 0;

// ── 자리 ──────────────────────────────────────────────────────────────────
export const besideStation =
  (actorId: ActorId, type: StationId): Condition =>
  (state) => {
    const actor = state.actors[actorId];
    return stationInstancesByType[type].some(
      (station) => actor !== undefined && isBesideStation(actor, station),
    );
  };

// ── 설비 ──────────────────────────────────────────────────────────────────
// 어느 조리대에든 이 음식이나 재료가 올라가 있다.
export const onCooktop =
  (item: ItemId): Condition =>
  (state) =>
    everyStation(state).includes(item);

export const tableHolds: Condition = (state) =>
  Object.values(state.tables).some((slot) => (slot?.length ?? 0) > 0);

export const dirtyDishWaiting: Condition = (state) =>
  Object.values(state.dishReturns).some((list) => (list?.length ?? 0) > 0);

// ── 판 ────────────────────────────────────────────────────────────────────
export const ordersFilled =
  (count: number): Condition =>
  (state) =>
    state.filled >= count;

// 첫 턴이 아직 끝나지 않았다. 행동력 설명은 이때만 쓴다.
export const onFirstTurn: Condition = (state, view) => state.turnsLeft === view.turnLimit;

// 이 음식이 어딘가에 존재한다(조리대·손·그릇 안). 제출까지 끝났어도 참이다.
export const foodExists =
  (item: ItemId): Condition =>
  (state) =>
    everyStation(state).includes(item) ||
    Object.keys(state.actors).some((id) => held(state, id as ActorId).includes(item)) ||
    state.filled > 0;

// ── 알림 ──────────────────────────────────────────────────────────────────
export const acked =
  (id: string): Condition =>
  (_state, view) =>
    view.acked.has(id);
