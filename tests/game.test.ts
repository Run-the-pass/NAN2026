import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "../game/cli.js";
import { parseSession } from "../game/session.js";
import { authoredFaceLayout, facingFromDelta, slimeSvg, type Facing } from "../app/slime-art.js";
import { gameMusicSource } from "../app/music-source.js";
import { gameSoundCues } from "../app/sound-events.js";
import {
  availableStageFoods,
  stageInfoUiConfig,
  validateStageInfoUiConfig,
  type StageInfoUiConfig,
} from "../app/stage-info.js";
import {
  INGREDIENT_INTERVAL_MS,
  INGREDIENT_MAX,
  KITCHEN_ROWS,
  MAP_HEIGHT,
  MAP_WIDTH,
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
  spawnTiles,
  tick,
  tileCenter,
  activeOrders,
  dishConfig,
  workCost,
  statTables,
  workDurationFor,
  fireConfig,
  isDish,
  orderConfig,
  recipes,
  validateKitchenMap,
  roundResult,
  currentStage,
  defaultStages,
  isLastStage,
  nextStage,
  type GameState,
  type Order,
  type Stage,
  type KitchenMapData,
} from "../game/core.js";

test("스테이지 정보는 실제 맵·레시피와 검증된 설정만 사용한다", () => {
  assert.deepEqual(validateStageInfoUiConfig(stageInfoUiConfig), []);
  assert.deepEqual(availableStageFoods(stageInfoUiConfig["1-1"]!), [
    "roasted-potato",
  ]);
  assert.deepEqual(recipes["roasted-potato"], {
    foodId: "roasted-potato",
    ingredient: { itemId: "potato", count: 1 },
    station: "stove",
    requiresCleanDish: true,
    submissionStation: "submission",
  });
});

test("스테이지 정보의 TIP·음식·맵 제한을 한 번에 검증한다", () => {
  const invalid: StageInfoUiConfig = {
    mapPreviewKey: "missing-map",
    tipLines: ["가".repeat(31), "둘", "셋"],
    availableFoodIds: [
      "roasted-potato",
      "roasted-potato",
      "missing-food",
      "four",
      "five",
      "six",
      "seven",
    ],
    nextStep: "PLAY",
  };
  const errors = validateStageInfoUiConfig({ broken: invalid });
  assert.equal(errors.length, 6);
  assert.deepEqual(availableStageFoods(invalid), [
    "roasted-potato",
    "roasted-potato",
  ]);
});

test("스테이지 제목은 정보 카드 한 줄 한도인 30자를 넘길 수 없다", () => {
  const stages = defaultStages();
  stages[0] = { ...stages[0]!, name: "가".repeat(31) };
  assert.throws(() => initialState(1, ["water"], stages));
});

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
    Object.values(current.actors).every((actor) => !actor?.intent),
  );

test("주방 설비는 인접한 작업 타일을 가진다", () => {
  assert.equal(KITCHEN_ROWS.length, MAP_HEIGHT);
  assert.ok(KITCHEN_ROWS.every((row) => row.length === MAP_WIDTH));
  assert.deepEqual(validateKitchenMap({
    rows: KITCHEN_ROWS,
    taskTiles,
    spawnTiles,
  }), []);
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

test("맵 편집 데이터는 누락 설비와 잘못된 작업·스폰 칸을 거부한다", () => {
  const rows = [...KITCHEN_ROWS];
  rows[1] = rows[1].replace("I", ".");
  const broken: KitchenMapData = {
    rows,
    taskTiles: { ...taskTiles, stove: displayTiles.stove },
    spawnTiles: [spawnTiles[0], spawnTiles[0], spawnTiles[2], spawnTiles[3]],
  };
  const errors = validateKitchenMap(broken);
  assert.ok(errors.some((error) => error.includes("재료 상자")));
  assert.ok(errors.some((error) => error.includes("조리 도구")));
  assert.ok(errors.some((error) => error.includes("스폰")));
});

test("재료 상자는 감자를 최대치까지 채운다", () => {
  let state = initialState(1, ["water"]);
  for (let elapsed = 0; elapsed < INGREDIENT_INTERVAL_MS * 5; elapsed += 50) {
    state = tick(state, 50);
  }
  assert.equal(state.ingredients.stock, INGREDIENT_MAX);
});

test("바닥 지시는 순간이동 없이 선택한 슬라임을 이동시킨다", () => {
  const destination = tileCenter({ col: 8, row: 4 });
  let state = moveActors(
    initialState(1, ["lightning", "fire"]),
    ["lightning-1", "fire-1"],
    destination,
  );
  const before = state.actors["lightning-1"]!;
  state = tick(state, 100);
  const during = state.actors["lightning-1"]!;
  assert.notDeepEqual({ x: during.x, y: during.y }, destination);
  assert.notEqual(during.x, before.x);
  assert.notEqual(during.y, before.y);
  for (let count = 0; count < 20_000 && state.actors["lightning-1"]!.intent; count += 1) {
    state = tick(state, 50);
    const actor = state.actors["lightning-1"]!;
    assert.ok(stationHitboxes.every((box) =>
      Math.abs(actor.x - box.centerX) >= box.halfWidth ||
      Math.abs(actor.y - box.centerY) >= box.halfHeight,
    ));
  }
  assert.deepEqual(
    { x: state.actors["lightning-1"]!.x, y: state.actors["lightning-1"]!.y },
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

test("감자를 조리해 제출하면 주문 수가 오른다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  assert.deepEqual(state.actors["lightning-1"]!.carrying, ["potato"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  assert.deepEqual(state.stove, ["potato"]);
  state = untilIdle(interactActors(state, ["fire-1"], "stove"));
  assert.deepEqual(state.stove, ["roasted-potato"]);
  assert.equal(state.workstation.status, "COMPLETE");
  state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["lightning-1"], "submission"));
  assert.equal(state.filled, 1);
  assert.equal(
    state.actors["lightning-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.status === "dirty",
    ),
    true,
  );
});

test("식재료가 들어오면 기다리던 슬라임이 자동으로 조리한다", () => {
  let state = initialState(1, ["fire", "lightning"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = interactActors(state, ["fire-1"], "stove");
  state = until(
    state,
    (current) =>
      current.workstation.status === "MISSING_MATERIAL" &&
      current.actors["fire-1"]!.status === "WAITING",
  );
  state = interactActors(state, ["lightning-1"], "stove");
  state = until(state, (current) => current.workstation.status === "WORKING");
  assert.equal(state.workstation.workerId, "fire-1");
  const before = state.workstation.progressMs;
  state = tick(state, 500);
  assert.ok(state.workstation.progressMs > before);
  assert.ok(state.workstation.progressMs < state.workstation.totalMs);
});

// 조리 도구는 속성을 가리지 않는다. 다만 한 번에 한 마리만 작업한다.
test("복수 명령에도 조리 도구는 속성과 무관하게 한 마리만 쓴다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = interactActors(
    state,
    ["water-1", "fire-1", "lightning-1", "earth-1"],
    "stove",
  );
  state = until(state, (current) => current.workstation.status === "WORKING");
  assert.ok(state.workstation.workerId);
  assert.equal(
    Object.values(state.actors).filter((actor) => actor?.status === "WORKING")
      .length,
    1,
  );
  assert.ok(!state.history.some((entry) => entry.includes("불 슬라임만")));
});

// 불 속성이 아니어도 조리가 끝까지 진행된다.
test("불이 아닌 슬라임도 조리해서 음식을 완성한다", () => {
  let state = initialState(1, ["water"]);
  state = untilIdle(interactActors(state, ["water-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["water-1"], "stove"));
  state = untilIdle(interactActors(state, ["water-1"], "stove"));
  assert.deepEqual(state.stove, ["roasted-potato"]);
});

test("새 이동 명령은 조리 작업을 취소하고 조리 도구 잠금을 푼다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = until(
    interactActors(state, ["fire-1"], "stove"),
    (current) => current.workstation.status === "WORKING",
  );
  state = moveActors(state, ["fire-1"], tileCenter({ col: 2, row: 2 }));
  assert.equal(state.workstation.workerId, null);
  assert.equal(state.workstation.status, "IDLE");
  assert.equal(state.actors["fire-1"]!.intent?.kind, "MOVE");
});

test("속성 슬라임은 새 ID와 식당 역할별 스탯을 사용한다", () => {
  assert.deepEqual(Object.keys(slimeTypes), ["water", "fire", "lightning", "earth"]);
  assert.equal(slimeTypes.fire.role.includes("조리"), true);
  assert.equal(
    initialState(1, ["lightning"]).actors["lightning-1"]!.moveSpeed,
    2.5 * TILE_SIZE,
  );
  assert.doesNotThrow(() =>
    initialState(1, ["water", "fire", "lightning", "earth"]),
  );
});

test("같은 속성 슬라임을 여러 마리 데려올 수 있다", () => {
  const state = initialState(1, ["water", "water", "fire"]);
  assert.deepEqual(Object.keys(state.actors), ["water-1", "water-2", "fire-1"]);
  // 같은 속성이라도 서로 다른 자리에서 시작한다.
  assert.notDeepEqual(
    { x: state.actors["water-1"]!.x, y: state.actors["water-1"]!.y },
    { x: state.actors["water-2"]!.x, y: state.actors["water-2"]!.y },
  );
  // 중복된 속성만 번호로 구분한다.
  assert.equal(state.actors["water-1"]!.name, "물 슬라임 1호");
  assert.equal(state.actors["water-2"]!.name, "물 슬라임 2호");
  assert.equal(state.actors["fire-1"]!.name, "불 슬라임");

  // 한 마리에게 내린 지시가 같은 속성의 다른 마리를 움직이지 않는다.
  const moved = untilIdle(
    interactActors(state, ["water-2"], "ingredient-box"),
  );
  assert.deepEqual(moved.actors["water-2"]!.carrying, ["potato"]);
  assert.deepEqual(moved.actors["water-1"]!.carrying, []);
  assert.deepEqual(
    { x: moved.actors["water-1"]!.x, y: moved.actors["water-1"]!.y },
    { x: state.actors["water-1"]!.x, y: state.actors["water-1"]!.y },
  );
});

test("CLI는 속성명으로 첫 마리를, ID로 특정 마리를 지목한다", () => {
  const run = simulate([
    "--slimes=water,water",
    "water:ingredient-box",
    "water-2:ingredient-box",
  ]);
  assert.deepEqual(run.final.actors["water-1"]!.carrying, ["potato"]);
  assert.deepEqual(run.final.actors["water-2"]!.carrying, ["potato"]);
  assert.throws(() => simulate(["--slimes=water", "earth:stove"]));
});

test("같은 seed와 입력은 같은 식당 상태를 만든다", () => {
  const play = () => {
    let state = initialState(91, ["lightning"]);
    state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
    return untilIdle(interactActors(state, ["lightning-1"], "trash"));
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
  assert.equal(authoredFaceLayout("left")!.x < 0, true);
  assert.equal(authoredFaceLayout("right")!.x > 0, true);
  assert.equal(authoredFaceLayout("down", true)!.blink, true);
  assert.equal(authoredFaceLayout("up"), null);
});

test("그릇은 고유 ID로 생성되고 땅 슬라임만 두 개를 나른다", () => {
  let state = initialState(1, ["earth", "water"]);
  assert.equal(state.dishRack.length, dishConfig.initialCount);
  assert.equal(new Set(state.dishRack.map((dish) => dish.id)).size, state.dishRack.length);
  state = untilIdle(interactActors(state, ["earth-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["earth-1"], "dish-rack"));
  assert.equal(state.actors["earth-1"]!.carrying.length, dishConfig.earthDishCarry);

  let ordinary = initialState(1, ["water"]);
  ordinary = untilIdle(interactActors(ordinary, ["water-1"], "dish-rack"));
  ordinary = untilIdle(interactActors(ordinary, ["water-1"], "dish-rack"));
  assert.ok(ordinary.actors["water-1"]!.carrying.length <= 1);
});

test("그릇과 테이블은 조리·제출·오염·세척 동안 ID와 내용을 보존한다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  const id = (state.actors["lightning-1"]!.carrying[0] as { id: string }).id;
  state = untilIdle(interactActors(state, ["lightning-1"], "table"));
  assert.equal((state.table[0] as { id: string }).id, id);
  state = untilIdle(interactActors(state, ["earth-1"], "table"));
  assert.equal((state.actors["earth-1"]!.carrying[0] as { id: string }).id, id);
  state = untilIdle(interactActors(state, ["earth-1"], "ingredient-box"));
  assert.equal(
    state.actors["earth-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.content === "potato",
    ),
    true,
  );
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["fire-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "submission"));
  assert.equal(state.filled, 1);
  assert.equal(
    state.actors["earth-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.id === id && carried.status === "dirty",
    ),
    true,
  );
  state = untilIdle(interactActors(state, ["earth-1"], "table"));
  state = untilIdle(interactActors(state, ["water-1"], "table"));
  state = untilIdle(interactActors(state, ["water-1"], "washer"));
  assert.equal(state.washer.dish?.id, id);
  assert.equal(state.washer.dish?.status, "clean");
  state = untilIdle(interactActors(state, ["water-1"], "washer"));
  assert.equal(
    state.actors["water-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.id === id && carried.status === "clean",
    ),
    true,
  );
});

// 재료 상자 → 조리 → 그릇 제출 → 필요하면 세척 한 바퀴.
function cookAndSubmit(start: GameState) {
  let state = start;
  if (state.actors["lightning-1"]!.carrying.some(isDish)) {
    state = untilIdle(interactActors(state, ["lightning-1"], "washer"));
    if (state.actors["water-1"]) {
      state = untilIdle(interactActors(state, ["water-1"], "washer"));
      state = untilIdle(interactActors(state, ["water-1"], "washer"));
      state = untilIdle(interactActors(state, ["water-1"], "table"));
      state = untilIdle(interactActors(state, ["lightning-1"], "table"));
    }
  }
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["fire-1"], "stove"));
  if (!state.actors["lightning-1"]!.carrying.some(isDish)) {
    state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  }
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  return untilIdle(interactActors(state, ["lightning-1"], "submission"));
}

// 조리를 끝낸 조리 도구를 방치해 불을 낸다.
function burnStove(start: GameState) {
  let state = untilIdle(interactActors(start, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["fire-1"], "stove"));
  return until(state, (current) => current.fires.stove?.onFire === true);
}

const oneStage = (orders: Order[], timeLimitMs = 180_000): Stage[] => [
  { id: "1-1", name: "테스트", orders, timeLimitMs },
];

test("라운드 주문 목록을 주입하고 제출마다 진행도가 오른다", () => {
  const orders: Order[] = [
    { id: "a", foodId: "roasted-potato", targetCount: 2, submittedCount: 0 },
    { id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
  ];
  let state = initialState(1, ["water", "lightning", "fire"], oneStage(orders));
  assert.equal(state.goal, 2);
  assert.deepEqual(
    activeOrders(state).map((order) => order.id),
    ["a", "b"],
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
  state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  const rejected = untilIdle(interactActors(state, ["lightning-1"], "submission"));
  assert.equal(
    rejected.actors["lightning-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.content === "potato",
    ),
    true,
  );
  assert.equal(rejected.orders[0].submittedCount, 0);
  assert.equal(rejected.filled, 0);

  const saved = orderConfig.invalidSubmission;
  try {
    orderConfig.invalidSubmission = "discard";
    const discarded = untilIdle(
      interactActors(state, ["lightning-1"], "submission"),
    );
    assert.equal(
      discarded.actors["lightning-1"]!.carrying.some(
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
    initialState(
      1,
      ["water"],
      oneStage([
        { id: "a", foodId: "roasted-potato", targetCount: 0, submittedCount: 0 },
      ]),
    ),
  );
  // 스테이지 자체의 신뢰 경계도 막는다.
  assert.throws(() => initialState(1, ["water"], oneStage([], 180_000)));
  assert.throws(() => initialState(1, ["water"], defaultStages(), 99));
});

test("스테이지를 깨면 골드와 스쿼드를 이어 다음 스테이지로 넘어간다", () => {
  const stages: Stage[] = [
    { id: "1-1", name: "첫 판", orders: [{ id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 }], timeLimitMs: 180_000 },
    { id: "1-2", name: "둘째 판", orders: [{ id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 }], timeLimitMs: 120_000 },
  ];
  let state = initialState(1, ["lightning", "fire"], stages);
  assert.equal(currentStage(state).id, "1-1");
  assert.equal(isLastStage(state), false);

  state = cookAndSubmit(state);
  assert.equal(state.phase, "won");
  assert.equal(state.gold, 100);

  const second = nextStage(state);
  assert.equal(currentStage(second).id, "1-2");
  assert.equal(second.phase, "playing");
  assert.equal(isLastStage(second), true);
  // 골드와 스쿼드는 잇고 주문·시간·설비는 새로 시작한다.
  assert.equal(second.gold, 100);
  assert.deepEqual(second.squad, ["lightning", "fire"]);
  assert.deepEqual(Object.keys(second.actors), ["lightning-1", "fire-1"]);
  assert.equal(second.filled, 0);
  assert.equal(second.timeLeftMs, 120_000);
  assert.deepEqual(second.stove, []);

  const cleared = cookAndSubmit(second);
  assert.equal(cleared.phase, "won");
  assert.equal(cleared.gold, 200);
  // 마지막 스테이지에서는 더 넘어가지 않는다.
  assert.equal(nextStage(cleared), cleared);
});

test("주문에 없는 음식 제출은 실수로 세고 골드는 깎지 않는다", () => {
  let state = initialState(1, ["water", "lightning", "fire"]);
  assert.equal(state.misses, 0);
  state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "submission"));
  assert.equal(state.misses, 1);
  assert.equal(state.gold, 0);
  assert.equal(state.filled, 0);
  // 정상 제출은 실수로 세지 않는다.
  const ok = cookAndSubmit(state);
  assert.equal(ok.misses, 1);
  assert.equal(ok.gold, 100);
});

test("조리를 끝낸 조리 도구를 방치하면 불이 나고 사용할 수 없다", () => {
  let state = burnStove(initialState(1, ["water", "fire", "lightning"]));
  assert.equal(state.fires.stove!.onFire, true);
  assert.ok(state.history.some((entry) => entry.includes("불이 났습니다")));
  // 물 속성이 아닌 슬라임은 작업 불가 처리한다.
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  assert.deepEqual(state.actors["lightning-1"]!.carrying, []);
  assert.ok(state.history.some((entry) => entry.includes("물 슬라임만")));
  assert.equal(state.fires.stove!.onFire, true);
});

test("물 슬라임이 5초 상호작용하면 불을 끄고 설비를 되돌린다", () => {
  let state = burnStove(initialState(1, ["water", "fire", "lightning"]));
  state = until(
    interactActors(state, ["water-1"], "stove"),
    (current) => current.fires.stove!.workerId === "water-1",
  );
  const partial = tick(state, 2_000);
  assert.ok(partial.fires.stove!.extinguishMs >= 2_000);
  assert.equal(partial.fires.stove!.onFire, true);
  state = untilIdle(partial);
  assert.equal(state.fires.stove!.onFire, false);
  assert.equal(state.fires.stove!.extinguishMs, 0);
  // 진화 뒤에는 깨끗한 그릇에 다시 구운 감자를 담을 수 있다.
  state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  assert.equal(
    state.actors["lightning-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.content === "roasted-potato",
    ),
    true,
  );
});

test("화재는 인접한 화재 대상 설비로만 전파된다", () => {
  const saved = { ...fireConfig };
  try {
    fireConfig.flammableStations = ["stove", "ingredient-box"];
    fireConfig.spreadIntervalMs = 1_000;
    // 맵 에디터에서 배치가 바뀌어도 현재 두 설비의 거리로 검증한다.
    fireConfig.spreadRange =
      Math.abs(displayTiles.stove.col - displayTiles["ingredient-box"].col) +
      Math.abs(displayTiles.stove.row - displayTiles["ingredient-box"].row);
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
  // 스테이지마다 주문 수와 제한 시간이 다르므로 5건·180초를 강요하지 않는다.
  assert.equal(
    parseSession({ ...valid, goal: 3, booksSubmitted: 3, result: "won", elapsedMs: 41_000 }).ok,
    true,
  );
  assert.equal(
    parseSession({ ...valid, goal: 7, booksSubmitted: 2, elapsedMs: 120_000 }).ok,
    true,
  );
  // 승패와 납품 수가 어긋나면 여전히 막는다.
  assert.equal(parseSession({ ...valid, goal: 7, booksSubmitted: 7 }).ok, false);
  assert.equal(
    parseSession({ ...valid, result: "won", goal: 7, booksSubmitted: 3 }).ok,
    false,
  );
});

// 작업량이 초당 작업 속도만큼 쌓여 비용에 닿으면 끝난다.
// 소각기를 비롯한 기본 상호작용 비용이 100, 보통 속도가 100/초라 1초다.
test("상호작용은 비용 ÷ 작업 속도만큼 걸린다", () => {
  // 소각기를 비롯한 기본 상호작용 비용이 100, 보통 속도가 100/초라 1초다.
  assert.equal(workCost.interact, 100);
  assert.equal(statTables.workSpeedPerSecond[2], 100);

  const actorOf = (typeId: "water" | "fire" | "lightning") =>
    initialState(1, [typeId]).actors[`${typeId}-1`]!;

  // 물·땅은 레벨 2(100/초), 불은 3(120/초), 번개는 1(85/초)
  assert.equal(workDurationFor(actorOf("water"), workCost.interact), 1_000);
  assert.equal(Math.round(workDurationFor(actorOf("fire"), workCost.interact)), 833);
  assert.equal(Math.round(workDurationFor(actorOf("lightning"), workCost.interact)), 1_176);

  // 비용이 커지면 그만큼 비례해 오래 걸린다.
  assert.equal(
    workDurationFor(actorOf("water"), workCost.cook),
    workDurationFor(actorOf("water"), workCost.interact) * (workCost.cook / workCost.interact),
  );
});

// 세척도 같은 규칙을 탄다. 예전에는 고정 4초였다.
test("세척도 작업 속도를 탄다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["earth-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["earth-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["fire-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "submission"));
  state = untilIdle(interactActors(state, ["earth-1"], "table"));
  state = untilIdle(interactActors(state, ["water-1"], "table"));
  state = interactActors(state, ["water-1"], "washer");
  state = until(state, (current) => current.washer.workerId === "water-1");
  // 물(100/초) × 세척 비용 400 = 4초
  assert.equal(state.washer.totalMs, (workCost.wash / 100) * 1000);
});
