import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "../game/cli.js";
import { parseSession } from "../game/session.js";
import { facingFromDelta, slimeSvg, type Facing } from "../app/slime-art.js";
import { gameMusicSource } from "../app/music-source.js";
import {
  INGREDIENT_INTERVAL_MS,
  INGREDIENT_MAX,
  KITCHEN_ROWS,
  TILE_SIZE,
  allStations,
  displayTiles,
  initialState,
  interactActors,
  isWalkable,
  moveActors,
  slimeTypes,
  stationHitboxes,
  taskTiles,
  tick,
  tileCenter,
  type GameState,
} from "../game/core.js";

function until(state: GameState, done: (state: GameState) => boolean) {
  let next = state;
  for (let count = 0; count < 20_000; count += 1) {
    if (done(next)) return next;
    next = tick(next, 50);
  }
  throw new Error("기다리던 상태에 도달하지 못했습니다.");
}

const untilIdle = (state: GameState) =>
  until(state, (current) =>
    Object.values(current.actors).every((actor) => !actor.intent),
  );

test("주방 설비는 인접한 작업 타일을 가진다", () => {
  assert.equal(KITCHEN_ROWS.length, 10);
  assert.ok(KITCHEN_ROWS.every((row) => row.length === 16));
  for (const id of allStations) {
    const task = taskTiles[id];
    const display = displayTiles[id];
    assert.equal(
      Math.abs(task.col - display.col) + Math.abs(task.row - display.row),
      1,
    );
    assert.ok(isWalkable(task));
  }
});

test("재료 상자는 버섯을 최대치까지 채운다", () => {
  let state = initialState(1, ["water"]);
  for (let elapsed = 0; elapsed < INGREDIENT_INTERVAL_MS * 5; elapsed += 50) {
    state = tick(state, 50);
  }
  assert.equal(state.ingredients.stock, INGREDIENT_MAX);
});

test("바닥 지시는 순간이동 없이 선택한 슬라임을 이동시킨다", () => {
  const destination = { x: 156, y: 148 };
  let state = moveActors(
    initialState(1, ["lightning", "fire"]),
    ["lightning", "fire"],
    destination,
  );
  const before = state.actors.lightning!;
  state = tick(state, 100);
  const during = state.actors.lightning!;
  assert.notDeepEqual({ x: during.x, y: during.y }, destination);
  assert.notEqual(during.x, before.x);
  assert.notEqual(during.y, before.y);
  state = untilIdle(state);
  assert.deepEqual(
    { x: state.actors.lightning!.x, y: state.actors.lightning!.y },
    destination,
  );
});

test("남은 시간 30초부터 러쉬 음악을 사용한다", () => {
  assert.equal(gameMusicSource(31), "/music/main.mp3");
  assert.equal(gameMusicSource(30), "/music/rush.mp3");
});

test("버섯을 불 슬라임이 조리하고 제출하면 주문 수가 오른다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  assert.equal(state.actors.lightning!.carrying, "mushroom");
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  assert.deepEqual(state.stove, ["mushroom"]);
  state = untilIdle(interactActors(state, ["fire"], "stove"));
  assert.deepEqual(state.stove, ["grilled-mushroom"]);
  assert.equal(state.workstation.status, "COMPLETE");
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = untilIdle(interactActors(state, ["lightning"], "submission"));
  assert.equal(state.filled, 1);
  assert.equal(state.actors.lightning!.carrying, null);
});

test("식재료가 들어오면 기다리던 불 슬라임이 자동으로 조리한다", () => {
  let state = initialState(1, ["fire", "lightning"]);
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  state = interactActors(state, ["fire"], "stove");
  state = until(
    state,
    (current) =>
      current.workstation.status === "MISSING_MATERIAL" &&
      current.actors.fire!.status === "WAITING",
  );
  state = interactActors(state, ["lightning"], "stove");
  state = until(state, (current) => current.workstation.status === "WORKING");
  assert.equal(state.workstation.workerId, "fire");
  const before = state.workstation.progressMs;
  state = tick(state, 500);
  assert.ok(state.workstation.progressMs > before);
  assert.ok(state.workstation.progressMs < state.workstation.totalMs);
});

test("복수 명령에서는 불 슬라임만 한 마리 조리한다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = interactActors(
    state,
    ["water", "fire", "lightning", "earth"],
    "stove",
  );
  state = until(state, (current) => current.workstation.status === "WORKING");
  assert.equal(state.workstation.workerId, "fire");
  assert.equal(
    Object.values(state.actors).filter((actor) => actor.status === "WORKING")
      .length,
    1,
  );
  assert.ok(state.history.some((entry) => entry.includes("불 슬라임만")));
});

test("새 이동 명령은 조리 작업을 취소하고 조리 도구 잠금을 푼다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = until(
    interactActors(state, ["fire"], "stove"),
    (current) => current.workstation.status === "WORKING",
  );
  state = moveActors(state, ["fire"], tileCenter({ col: 2, row: 2 }));
  assert.equal(state.workstation.workerId, null);
  assert.equal(state.workstation.status, "IDLE");
  assert.equal(state.actors.fire!.intent?.kind, "MOVE");
});

test("속성 슬라임은 새 ID와 식당 역할별 스탯을 사용한다", () => {
  assert.deepEqual(Object.keys(slimeTypes), ["water", "fire", "lightning", "earth"]);
  assert.equal(slimeTypes.fire.role.includes("조리"), true);
  assert.equal(
    initialState(1, ["lightning"]).actors.lightning!.moveSpeed,
    2.5 * TILE_SIZE,
  );
  assert.doesNotThrow(() =>
    initialState(1, ["water", "fire", "lightning", "earth"]),
  );
  assert.ok(state.history.some((entry) => entry.includes("불 슬라임만")));
});

test("새 이동 명령은 조리 작업을 취소하고 조리 도구 잠금을 푼다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = until(
    interactActors(state, ["fire"], "stove"),
    (current) => current.workstation.status === "WORKING",
  );
  state = moveActors(state, ["fire"], tileCenter({ col: 2, row: 2 }));
  assert.equal(state.workstation.workerId, null);
  assert.equal(state.workstation.status, "IDLE");
  assert.equal(state.actors.fire!.intent?.kind, "MOVE");
});

test("속성 슬라임은 새 ID와 식당 역할별 스탯을 사용한다", () => {
  assert.deepEqual(Object.keys(slimeTypes), ["water", "fire", "lightning", "earth"]);
  assert.equal(slimeTypes.fire.role.includes("조리"), true);
  assert.equal(
    initialState(1, ["lightning"]).actors.lightning!.moveSpeed,
    2.5 * TILE_SIZE,
  );
  assert.doesNotThrow(() =>
    initialState(1, ["water", "fire", "lightning", "earth"]),
  );
});

test("같은 seed와 입력은 같은 식당 상태를 만든다", () => {
  const play = () => {
    let state = initialState(91, ["lightning"]);
    state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
    return untilIdle(interactActors(state, ["lightning"], "trash"));
  };
  assert.deepEqual(play(), play());
});

test("CLI는 식당 상호작용을 결정론적으로 재현한다", () => {
  const args = [
    "--seed=7",
    "--slimes=lightning,fire",
    "lightning:ingredient-box",
    "lightning:stove",
    "fire:stove",
    "lightning:stove",
    "lightning:submission",
  ];
  const first = simulate(args);
  assert.deepEqual(first, simulate(args));
  assert.equal(first.final.filled, 1);
});

test("슬라임 아트는 네 속성색과 방향별 얼굴을 만든다", () => {
  const colors = new Set(
    (["water", "fire", "lightning", "earth"] as const).map(
      (id) => slimeSvg(id, "down").match(/stop-color="(#[0-9a-f]{6})"/)![1],
    ),
  );
  assert.equal(colors.size, 4);
  const face = (type: "water" | "lightning", facing: Facing) =>
    slimeSvg(type, facing).match(/translate\((-?\d+) /)?.[1] ?? null;
  assert.equal(Number(face("lightning", "left")) < 0, true);
  assert.equal(Number(face("lightning", "right")) > 0, true);
  assert.equal(Number(face("water", "left")) < 0, true);
  assert.equal(Number(face("water", "right")) > 0, true);
  assert.equal(facingFromDelta(9, -2, "down"), "right");
});

test("플레이테스트 세션은 위조된 요약을 저장 전에 거부한다", () => {
  const valid = {
    seed: 2026,
    result: "lost",
    booksSubmitted: 3,
    goal: 5,
    elapsedMs: 180_000,
    voiceCommands: 0,
    buttonCommands: 7,
    voiceFailures: 0,
    avgConfidence: null,
  };
  assert.equal(parseSession(valid).ok, true);
  assert.equal(parseSession({ ...valid, booksSubmitted: 99 }).ok, false);
});
