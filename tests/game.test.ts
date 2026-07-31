import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "../game/cli.js";
import { parseSession } from "../game/session.js";
import { facingFromDelta, slimeSvg, type Facing } from "../app/slime-art.js";
import { gameMusicSource } from "../app/music-source.js";
import { gameSoundCues } from "../app/sound-events.js";
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
  activeOrders,
  dishConfig,
  fireConfig,
  isDish,
  orderConfig,
  roundResult,
  type GameState,
  type Order,
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
  for (let count = 0; count < 20_000 && state.actors.lightning!.intent; count += 1) {
    state = tick(state, 50);
    const actor = state.actors.lightning!;
    assert.ok(stationHitboxes.every((box) =>
      Math.abs(actor.x - box.centerX) >= box.halfWidth ||
      Math.abs(actor.y - box.centerY) >= box.halfHeight,
    ));
  }
  assert.deepEqual(
    { x: state.actors.lightning!.x, y: state.actors.lightning!.y },
    destination,
  );
});

test("남은 시간 30초부터 러쉬 음악을 사용한다", () => {
  assert.equal(gameMusicSource(31, "playing"), "/music/main.mp3");
  assert.equal(gameMusicSource(30, "playing"), "/music/rush.mp3");
  assert.equal(gameMusicSource(31, "won"), "/music/main.mp3");
  assert.equal(gameMusicSource(0, "lost"), "/music/game-over.mp3");
});

test("효과음은 조리 시작·음식 제출·화재 전환을 구분한다", () => {
  const state = initialState(1, ["water", "fire"]);
  assert.deepEqual(gameSoundCues(null, state), ["round-start"]);
  assert.deepEqual(
    gameSoundCues(state, {
      ...state,
      workstation: { ...state.workstation, status: "WORKING" },
    }),
    ["grill"],
  );
  assert.deepEqual(
    gameSoundCues(state, {
      ...state,
      washer: { ...state.washer, workerId: "water" },
    }),
    ["wash"],
  );
  assert.equal(
    gameSoundCues(state, {
      ...state,
      workstation: { ...state.workstation, status: "COMPLETE" },
    }).includes("food-submit"),
    false,
  );
  const submitted = {
    ...state,
    filled: 1,
    orders: state.orders.map((order, index) =>
      index === 0 ? { ...order, submittedCount: 1 } : order,
    ),
  };
  assert.ok(gameSoundCues(state, submitted).includes("food-submit"));
  const burning = {
    ...state,
    fires: { ...state.fires, stove: { ...state.fires.stove!, onFire: true } },
  };
  assert.ok(gameSoundCues(state, burning).includes("fire-start"));
  assert.ok(gameSoundCues(burning, state).includes("fire-extinguish"));
});

test("버섯을 불 슬라임이 조리하고 제출하면 주문 수가 오른다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  assert.deepEqual(state.actors.lightning!.carrying, ["mushroom"]);
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  assert.deepEqual(state.stove, ["mushroom"]);
  state = untilIdle(interactActors(state, ["fire"], "stove"));
  assert.deepEqual(state.stove, ["grilled-mushroom"]);
  assert.equal(state.workstation.status, "COMPLETE");
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = untilIdle(interactActors(state, ["lightning"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = untilIdle(interactActors(state, ["lightning"], "submission"));
  assert.equal(state.filled, 1);
  assert.equal(
    state.actors.lightning!.carrying.some(
      (carried) => isDish(carried) && carried.status === "dirty",
    ),
    true,
  );
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
    "lightning:dish-rack",
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

test("그릇은 고유 ID로 생성되고 땅 슬라임만 두 개를 나른다", () => {
  let state = initialState(1, ["earth", "water"]);
  assert.equal(state.dishRack.length, dishConfig.initialCount);
  assert.equal(new Set(state.dishRack.map((dish) => dish.id)).size, state.dishRack.length);
  state = untilIdle(interactActors(state, ["earth"], "dish-rack"));
  state = untilIdle(interactActors(state, ["earth"], "dish-rack"));
  assert.equal(state.actors.earth!.carrying.length, dishConfig.earthDishCarry);

  let ordinary = initialState(1, ["water"]);
  ordinary = untilIdle(interactActors(ordinary, ["water"], "dish-rack"));
  ordinary = untilIdle(interactActors(ordinary, ["water"], "dish-rack"));
  assert.ok(ordinary.actors.water!.carrying.length <= 1);
});

test("그릇과 테이블은 조리·제출·오염·세척 동안 ID와 내용을 보존한다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning"], "dish-rack"));
  const id = (state.actors.lightning!.carrying[0] as { id: string }).id;
  state = untilIdle(interactActors(state, ["lightning"], "table"));
  assert.equal((state.table[0] as { id: string }).id, id);
  state = untilIdle(interactActors(state, ["earth"], "table"));
  assert.equal((state.actors.earth!.carrying[0] as { id: string }).id, id);
  state = untilIdle(interactActors(state, ["earth"], "ingredient-box"));
  assert.equal(
    state.actors.earth!.carrying.some(
      (carried) => isDish(carried) && carried.content === "mushroom",
    ),
    true,
  );
  state = untilIdle(interactActors(state, ["earth"], "stove"));
  state = untilIdle(interactActors(state, ["fire"], "stove"));
  state = untilIdle(interactActors(state, ["earth"], "stove"));
  state = untilIdle(interactActors(state, ["earth"], "submission"));
  assert.equal(state.filled, 1);
  assert.equal(
    state.actors.earth!.carrying.some(
      (carried) => isDish(carried) && carried.id === id && carried.status === "dirty",
    ),
    true,
  );
  state = untilIdle(interactActors(state, ["earth"], "table"));
  state = untilIdle(interactActors(state, ["water"], "table"));
  state = untilIdle(interactActors(state, ["water"], "washer"));
  assert.equal(state.washer.dish?.id, id);
  assert.equal(state.washer.dish?.status, "clean");
  state = untilIdle(interactActors(state, ["water"], "washer"));
  assert.equal(
    state.actors.water!.carrying.some(
      (carried) => isDish(carried) && carried.id === id && carried.status === "clean",
    ),
    true,
  );
});

// 재료 상자 → 조리 → 그릇 제출 → 필요하면 세척 한 바퀴.
function cookAndSubmit(start: GameState) {
  let state = start;
  if (state.actors.lightning!.carrying.some(isDish)) {
    state = untilIdle(interactActors(state, ["lightning"], "washer"));
    if (state.actors.water) {
      state = untilIdle(interactActors(state, ["water"], "washer"));
      state = untilIdle(interactActors(state, ["water"], "washer"));
      state = untilIdle(interactActors(state, ["water"], "table"));
      state = untilIdle(interactActors(state, ["lightning"], "table"));
    }
  }
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = untilIdle(interactActors(state, ["fire"], "stove"));
  if (!state.actors.lightning!.carrying.some(isDish)) {
    state = untilIdle(interactActors(state, ["lightning"], "dish-rack"));
  }
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  return untilIdle(interactActors(state, ["lightning"], "submission"));
}

// 조리를 끝낸 조리 도구를 방치해 불을 낸다.
function burnStove(start: GameState) {
  let state = untilIdle(interactActors(start, ["lightning"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  state = untilIdle(interactActors(state, ["fire"], "stove"));
  return until(state, (current) => current.fires.stove?.onFire === true);
}

test("라운드 주문 목록을 주입하고 제출마다 진행도가 오른다", () => {
  const orders: Order[] = [
    { id: "a", foodId: "grilled-mushroom", targetCount: 2, submittedCount: 0 },
    { id: "b", foodId: "grilled-mushroom", targetCount: 1, submittedCount: 0 },
  ];
  let state = initialState(1, ["water", "lightning", "fire"], orders);
  assert.equal(state.goal, 2);
  assert.deepEqual(
    activeOrders(state).map((order) => order.id),
    ["a"],
  );
  state = cookAndSubmit(state);
  assert.equal(state.orders[0].submittedCount, 1);
  assert.equal(state.filled, 0);
  assert.equal(state.phase, "playing");
  state = cookAndSubmit(state);
  assert.equal(state.filled, 1);
  // 완료된 주문은 활성에서 빠지고 다음 주문이 올라온다.
  assert.deepEqual(
    activeOrders(state).map((order) => order.id),
    ["b"],
  );
  state = cookAndSubmit(state);
  assert.equal(state.filled, 2);
  assert.equal(state.phase, "won");
});

test("주문에 없는 음식은 설정대로 처리하고 진행도를 올리지 않는다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning"], "ingredient-box"));
  const rejected = untilIdle(interactActors(state, ["lightning"], "submission"));
  assert.equal(
    rejected.actors.lightning!.carrying.some(
      (carried) => isDish(carried) && carried.content === "mushroom",
    ),
    true,
  );
  assert.equal(rejected.orders[0].submittedCount, 0);
  assert.equal(rejected.filled, 0);

  const saved = orderConfig.invalidSubmission;
  try {
    orderConfig.invalidSubmission = "discard";
    const discarded = untilIdle(
      interactActors(state, ["lightning"], "submission"),
    );
    assert.equal(
      discarded.actors.lightning!.carrying.some(
        (carried) => isDish(carried) && carried.status === "dirty",
      ),
      true,
    );
    assert.equal(discarded.orders[0].submittedCount, 0);
    assert.equal(discarded.filled, 0);
  } finally {
    orderConfig.invalidSubmission = saved;
  }
});

test("라운드는 주문을 다 채우면 성공, 남으면 실패로 판정한다", () => {
  const state = initialState(1, ["lightning"]);
  assert.equal(roundResult(state), "lost");
  assert.equal(tick(state, 180_000).phase, "lost");
  assert.equal(
    roundResult({
      ...state,
      orders: state.orders.map((order) => ({ ...order, submittedCount: 1 })),
    }),
    "won",
  );
  assert.throws(() => initialState(1, ["water"], []));
  assert.throws(() =>
    initialState(1, ["water"], [
      { id: "a", foodId: "grilled-mushroom", targetCount: 0, submittedCount: 0 },
    ]),
  );
});

test("조리를 끝낸 조리 도구를 방치하면 불이 나고 사용할 수 없다", () => {
  let state = burnStove(initialState(1, ["water", "fire", "lightning"]));
  assert.equal(state.fires.stove!.onFire, true);
  assert.ok(state.history.some((entry) => entry.includes("불이 났습니다")));
  // 물 속성이 아닌 슬라임은 작업 불가 처리한다.
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  assert.deepEqual(state.actors.lightning!.carrying, []);
  assert.ok(state.history.some((entry) => entry.includes("물 슬라임만")));
  assert.equal(state.fires.stove!.onFire, true);
});

test("물 슬라임이 5초 상호작용하면 불을 끄고 설비를 되돌린다", () => {
  let state = burnStove(initialState(1, ["water", "fire", "lightning"]));
  state = until(
    interactActors(state, ["water"], "stove"),
    (current) => current.fires.stove!.workerId === "water",
  );
  const partial = tick(state, 2_000);
  assert.ok(partial.fires.stove!.extinguishMs >= 2_000);
  assert.equal(partial.fires.stove!.onFire, true);
  state = untilIdle(partial);
  assert.equal(state.fires.stove!.onFire, false);
  assert.equal(state.fires.stove!.extinguishMs, 0);
  // 진화 뒤에는 깨끗한 그릇에 버섯 구이를 담을 수 있다.
  state = untilIdle(interactActors(state, ["lightning"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning"], "stove"));
  assert.equal(
    state.actors.lightning!.carrying.some(
      (carried) => isDish(carried) && carried.content === "grilled-mushroom",
    ),
    true,
  );
});

test("화재는 인접한 화재 대상 설비로만 전파된다", () => {
  const saved = { ...fireConfig };
  try {
    fireConfig.flammableStations = ["stove", "ingredient-box"];
    fireConfig.spreadIntervalMs = 1_000;
    // 조리 도구와 재료 상자는 타일 거리 3이다.
    fireConfig.spreadRange = 3;
    let state = burnStove(initialState(1, ["water", "fire", "lightning"]));
    assert.equal(state.fires["ingredient-box"]!.onFire, false);
    state = until(
      state,
      (current) => current.fires["ingredient-box"]?.onFire === true,
    );
    assert.ok(state.history.some((entry) => entry.includes("옮겨붙었습니다")));
    // 인접 범위를 좁히면 바닥을 건너 번지지 않는다.
    fireConfig.spreadRange = 1;
    let far = burnStove(initialState(1, ["water", "fire", "lightning"]));
    for (let elapsed = 0; elapsed < 20_000; elapsed += 50) far = tick(far, 50);
    assert.equal(far.fires.stove!.onFire, true);
    assert.equal(far.fires["ingredient-box"]!.onFire, false);
    // 제출대와 쓰레기 처리 공간은 화재 대상이 아니라 상태 자체가 없다.
    assert.equal(far.fires.submission, undefined);
    assert.equal(far.fires.trash, undefined);
  } finally {
    Object.assign(fireConfig, saved);
  }
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
