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
  displayTiles,
  initialState,
  interactActors,
  isWalkable,
  moveActors,
  slimeTypes,
  stationHitboxes,
  wallHitboxes,
  taskTiles,
  startTile,
  spawnTilesFrom,
  canPlaceSquad,
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
  recruitSlime,
  squadActorIds,
  pixelToTile,
  incineratorConfig,
  stationInstances,
  stationInstancesByType,
  type GameState,
  type Order,
  type Stage,
  type KitchenMapData,
} from "../game/core.js";

test("스테이지 정보는 실제 맵·레시피와 검증된 설정만 사용한다", () => {
  assert.deepEqual(validateStageInfoUiConfig(stageInfoUiConfig), []);
  assert.equal(stageInfoUiConfig["1-1"]!.nextStep, "PLAY");
  assert.equal(stageInfoUiConfig["1-2"]!.nextStep, "RECRUIT");
  assert.equal(stageInfoUiConfig["1-3"]!.nextStep, "RECRUIT");
  assert.deepEqual(availableStageFoods(stageInfoUiConfig["1-1"]!), [
    "roasted-potato",
  ]);
  assert.deepEqual(recipes["roasted-potato"], {
    foodId: "roasted-potato",
    ingredient: { itemId: "potato", count: 1 },
    station: "stove",
    choppedBy: "earth",
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

const ingredientBoxId = stationInstancesByType["ingredient-box"][0].id;
const farIngredientBoxId = stationInstancesByType["ingredient-box"][1].id;
const stoveId = stationInstancesByType.stove[0].id;
const dishRackId = stationInstancesByType["dish-rack"][0].id;
const washerId = stationInstancesByType.washer[0].id;
const tableId = stationInstancesByType.table[0].id;
const secondTableId = stationInstancesByType.table[1].id;
const incineratorId = stationInstancesByType.trash[0].id;

// 스폰 칸을 맵에 하나씩 찍는 방식은 5마리째부터 자리가 없었다. 이제 시작
// 지점에서 빈 바닥으로 퍼진다.
test("슬라임은 시작 지점 주변 빈 바닥으로 퍼져 선다", () => {
  const squad = ["water", "fire", "lightning", "earth", "water", "fire"] as const;
  const state = initialState(1, [...squad]);
  const spots = squadActorIds([...squad]).map((id) => {
    const actor = state.actors[id]!;
    return pixelToTile(actor.x, actor.y);
  });

  assert.equal(spots.length, squad.length);
  // 첫 마리는 시작 지점에 선다.
  assert.deepEqual(spots[0], startTile);
  // 벽과 설비 칸은 바닥이 아니라 후보에 오르지 않는다.
  for (const tile of spots) assert.ok(isWalkable(tile));
  // 서로 겹치지 않는다.
  assert.equal(new Set(spots.map((t) => `${t.col},${t.row}`)).size, squad.length);
  // 같은 맵이면 항상 같은 자리다.
  assert.deepEqual(spawnTilesFrom(startTile, squad.length), spots);
});

test("빈 바닥보다 많은 인원은 세우지 않는다", () => {
  const floors = KITCHEN_ROWS.join("").split("").filter((tile) => tile === ".").length;
  assert.ok(canPlaceSquad(floors));
  assert.ok(!canPlaceSquad(floors + 1));
  assert.throws(() => initialState(1, Array<"water">(floors + 1).fill("water")));
});

test("주방 설비는 인접한 작업 타일을 가진다", () => {
  assert.equal(KITCHEN_ROWS.length, MAP_HEIGHT);
  assert.ok(KITCHEN_ROWS.every((row) => row.length === MAP_WIDTH));
  assert.deepEqual(validateKitchenMap({
    rows: KITCHEN_ROWS,
    taskTiles,
    startTile,
  }), []);
  for (const { id } of stationInstances) {
    const task = taskTiles[id];
    const display = displayTiles[id];
    assert.equal(
      Math.abs(task.col - display.col) + Math.abs(task.row - display.row),
      1,
    );
    assert.ok(isWalkable(task));
  }
  assert.deepEqual(taskTiles[secondTableId], { col: 3, row: 2 });
});

test("여러 설비가 같은 작업 위치를 사용할 수 있다", () => {
  const cornerTableId = stationInstancesByType.table.find(
    ({ displayTile }) => displayTile.col === 1 && displayTile.row === 2,
  )!.id;
  assert.deepEqual(validateKitchenMap({
    rows: KITCHEN_ROWS,
    taskTiles: {
      ...taskTiles,
      [tableId]: { col: 2, row: 2 },
      [cornerTableId]: { col: 2, row: 2 },
    },
    startTile,
  }), []);
});

test("같은 종류 설비는 좌표 ID별로 내용물을 따로 보관한다", () => {
  let state = initialState(1, ["lightning"]);
  state = untilIdle(interactActors(state, ["lightning-1"], dishRackId));
  state = untilIdle(interactActors(state, ["lightning-1"], tableId));
  assert.equal(state.tables[tableId]!.length, 1);
  assert.equal(state.tables[secondTableId]!.length, 0);

  state = untilIdle(interactActors(state, ["lightning-1"], ingredientBoxId));
  state = untilIdle(interactActors(state, ["lightning-1"], secondTableId));
  assert.equal(state.tables[tableId]!.length, 1);
  assert.deepEqual(state.tables[secondTableId], ["potato"]);
});

test("테이블의 감자와 빈 접시는 가져오는 순서와 무관하게 합쳐진다", () => {
  let foodFirst = initialState(1, ["lightning"]);
  foodFirst = untilIdle(interactActors(foodFirst, ["lightning-1"], ingredientBoxId));
  foodFirst = untilIdle(interactActors(foodFirst, ["lightning-1"], tableId));
  foodFirst = untilIdle(interactActors(foodFirst, ["lightning-1"], dishRackId));
  foodFirst = untilIdle(interactActors(foodFirst, ["lightning-1"], tableId));
  assert.equal(foodFirst.tables[tableId]!.length, 0);
  assert.ok(foodFirst.actors["lightning-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.status === "filled" && carried.content === "potato",
  ));

  let dishFirst = initialState(1, ["lightning"]);
  dishFirst = untilIdle(interactActors(dishFirst, ["lightning-1"], dishRackId));
  dishFirst = untilIdle(interactActors(dishFirst, ["lightning-1"], tableId));
  dishFirst = untilIdle(interactActors(dishFirst, ["lightning-1"], ingredientBoxId));
  dishFirst = untilIdle(interactActors(dishFirst, ["lightning-1"], tableId));
  assert.deepEqual(dishFirst.actors["lightning-1"]!.carrying, []);
  assert.ok(isDish(dishFirst.tables[tableId]![0]) &&
    dishFirst.tables[tableId]![0].status === "filled" &&
    dishFirst.tables[tableId]![0].content === "potato");
});

test("맵 편집 데이터는 누락 설비와 잘못된 작업·스폰 칸을 거부한다", () => {
  const rows = KITCHEN_ROWS.map((row) => row.replaceAll("I", "."));
  const broken: KitchenMapData = {
    rows,
    taskTiles: { ...taskTiles, [stoveId]: displayTiles[stoveId] },
    startTile: { col: 0, row: 0 },
  };
  const errors = validateKitchenMap(broken);
  assert.ok(errors.some((error) => error.includes("재료 상자")));
  assert.ok(errors.some((error) => error.includes(stoveId)));
  assert.ok(errors.some((error) => error.includes("시작 지점")));
});

test("재료 상자는 감자를 최대치까지 채운다", () => {
  let state = initialState(1, ["water"]);
  for (let elapsed = 0; elapsed < INGREDIENT_INTERVAL_MS * 5; elapsed += 50) {
    state = tick(state, 50);
  }
  assert.equal(state.ingredients[ingredientBoxId]!.stock, INGREDIENT_MAX);
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

test("슬라임 이동 경로는 맵의 벽 타일을 관통하지 않는다", () => {
  const destination = tileCenter({ col: 8, row: 5 });
  let state = moveActors(initialState(1, ["water"]), ["water-1"], destination);
  assert.ok((state.actors["water-1"]!.intent?.route.length ?? 0) >= 1);
  for (let count = 0; count < 20_000 && state.actors["water-1"]!.intent; count += 1) {
    state = tick(state, 50);
    const actor = state.actors["water-1"]!;
    assert.ok(wallHitboxes.every((box) =>
      Math.abs(actor.x - box.centerX) >= box.halfWidth ||
      Math.abs(actor.y - box.centerY) >= box.halfHeight,
    ));
  }
  assert.deepEqual(
    { x: state.actors["water-1"]!.x, y: state.actors["water-1"]!.y },
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
      workstations: {
        ...state.workstations,
        [stoveId]: { ...state.workstations[stoveId]!, status: "WORKING" },
      },
    }),
    ["chop"],
  );
  assert.deepEqual(
    gameSoundCues(state, {
      ...state,
      washers: {
        ...state.washers,
        [washerId]: { ...state.washers[washerId]!, workerId: "water-1" },
      },
    }),
    ["wash"],
  );
  assert.equal(
    gameSoundCues(state, {
      ...state,
      workstations: {
        ...state.workstations,
        [stoveId]: { ...state.workstations[stoveId]!, status: "COMPLETE" },
      },
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
    fires: { ...state.fires, [stoveId]: { ...state.fires[stoveId]!, onFire: true } },
  };
  assert.ok(gameSoundCues(state, burning).includes("fire-start"));
  assert.ok(gameSoundCues(burning, state).includes("fire-extinguish"));
});

test("감자를 조리해 제출하면 주문 수가 오른다", () => {
  let state = initialState(1, ["lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  assert.deepEqual(state.actors["lightning-1"]!.carrying, ["potato"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  assert.deepEqual(state.stoves[stoveId], ["potato"]);
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  assert.deepEqual(state.stoves[stoveId], ["roasted-potato"]);
  assert.equal(state.workstations[stoveId]!.status, "COMPLETE");
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
  let state = initialState(1, ["earth", "lightning"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = interactActors(state, ["earth-1"], "stove");
  state = until(
    state,
    (current) =>
      current.workstations[stoveId]!.status === "MISSING_MATERIAL" &&
      current.actors["earth-1"]!.status === "WAITING",
  );
  state = interactActors(state, ["lightning-1"], "stove");
  state = until(state, (current) => current.workstations[stoveId]!.status === "WORKING");
  assert.equal(state.workstations[stoveId]!.workerId, "earth-1");
  const before = state.workstations[stoveId]!.progressMs;
  state = tick(state, 500);
  assert.ok(state.workstations[stoveId]!.progressMs > before);
  assert.ok(state.workstations[stoveId]!.progressMs < state.workstations[stoveId]!.totalMs);
});

// 도마는 땅만 썰 수 있고, 여럿을 보내도 한 마리만 작업한다.
test("복수 명령에도 도마는 한 마리만 쓴다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = interactActors(
    state,
    ["water-1", "fire-1", "lightning-1", "earth-1"],
    "stove",
  );
  state = until(state, (current) => current.workstations[stoveId]!.status === "WORKING");
  assert.ok(state.workstations[stoveId]!.workerId);
  assert.equal(
    Object.values(state.actors).filter((actor) => actor?.status === "WORKING")
      .length,
    1,
  );
  assert.equal(state.workstations[stoveId]!.workerId, "earth-1");
});

// 도마 썰기는 땅만 한다. 재료를 올리고 완성품을 가져가는 것은 누구나 한다.
test("도마 썰기는 땅 슬라임만 할 수 있다", () => {
  let state = initialState(1, ["water", "earth"]);
  state = untilIdle(interactActors(state, ["water-1"], "ingredient-box"));
  // 재료를 올리는 것은 물도 된다.
  state = untilIdle(interactActors(state, ["water-1"], "stove"));
  assert.deepEqual(state.stoves[stoveId], ["potato"]);

  // 물이 빈손으로 썰려 하면 거절하고 이유를 알려 준다.
  const refused = untilIdle(interactActors(state, ["water-1"], "stove"));
  assert.deepEqual(refused.stoves[stoveId], ["potato"]);
  assert.match(refused.lastEvent, /땅 슬라임만 도마를 쓸 수 있습니다/);

  // 땅이 오면 썰린다.
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  assert.deepEqual(state.stoves[stoveId], ["roasted-potato"]);
});

test("빈 접시 없이 음식은 꺼내도 제출은 접시에 담아야 한다", () => {
  let state = initialState(1, ["earth"]);
  state = untilIdle(interactActors(state, ["earth-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  assert.deepEqual(state.actors["earth-1"]!.carrying, ["roasted-potato"]);
  state = untilIdle(interactActors(state, ["earth-1"], "submission"));
  assert.deepEqual(state.actors["earth-1"]!.carrying, ["roasted-potato"]);
  assert.equal(state.orders[0].submittedCount, 0);
  state = untilIdle(interactActors(state, ["earth-1"], tableId));
  state = untilIdle(interactActors(state, ["earth-1"], dishRackId));
  state = untilIdle(interactActors(state, ["earth-1"], tableId));
  state = untilIdle(interactActors(state, ["earth-1"], "submission"));
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.status === "dirty" && carried.content === null,
  ));
  assert.equal(state.orders[0].submittedCount, 1);
});

// 소각기가 왜 안 되는지 알려 줘야 한다. 경로 판정이 같은 조건을 중복
// 검사하면 슬라임이 가지도 않아 안내가 통째로 죽는다.
// 손이 차 있으면 예전에는 지시가 거절됐다. 이제 테이블에 내려놓고 이어서 한다.
test("물건을 들고 있으면 테이블에 내려놓고 원래 작업을 이어서 한다", () => {
  let state = initialState(1, ["water"]);
  state = untilIdle(interactActors(state, ["water-1"], ingredientBoxId));
  assert.deepEqual(state.actors["water-1"]!.carrying, ["potato"]);

  // 손이 찬 상태로 재료 상자를 다시 지시한다. 예전에는 거절됐다.
  const before = Object.values(state.tables).flat().length;
  state = untilIdle(interactActors(state, ["water-1"], ingredientBoxId));

  // 들고 있던 감자는 테이블에 내려두고, 새 감자를 들고 있어야 한다.
  assert.equal(Object.values(state.tables).flat().length, before + 1);
  assert.deepEqual(state.actors["water-1"]!.carrying, ["potato"]);
});

// 음식을 들고 그릇 생성대에 가면 빈 접시를 꺼내 그 자리에서 담는다.
test("음식을 들고 그릇 생성대에 가면 접시에 담는다", () => {
  let state = initialState(1, ["water"]);
  state = untilIdle(interactActors(state, ["water-1"], ingredientBoxId));
  state = untilIdle(interactActors(state, ["water-1"], dishRackId));
  const carrying = state.actors["water-1"]!.carrying;
  assert.equal(carrying.length, 1);
  assert.ok(
    isDish(carrying[0]!) &&
      carrying[0].status === "filled" &&
      carrying[0].content === "potato",
  );
});

test("소각기는 거절 이유를 구체적으로 알려 준다", () => {
  let state = initialState(1, ["fire", "lightning"]);
  for (let count = 0; count < incineratorConfig.capacity; count += 1) {
    state = untilIdle(interactActors(state, ["lightning-1"], ingredientBoxId));
    state = untilIdle(interactActors(state, ["lightning-1"], incineratorId));
  }
  assert.equal(state.incinerators[incineratorId]!.count, incineratorConfig.capacity);

  // 가득 찬 소각기
  let full = untilIdle(interactActors(state, ["lightning-1"], ingredientBoxId));
  full = untilIdle(interactActors(full, ["lightning-1"], incineratorId));
  assert.match(full.lastEvent, /가득 찼습니다/);

  // 가득 찬 소각기 앞에서는 물건을 든 불 슬라임도 소각부터 한다.
  let busy = untilIdle(interactActors(state, ["fire-1"], ingredientBoxId));
  assert.deepEqual(busy.actors["fire-1"]!.carrying, ["potato"]);
  busy = untilIdle(interactActors(busy, ["fire-1"], incineratorId));
  assert.equal(busy.incinerators[incineratorId]!.count, 0);
  // 손에 든 물건은 그대로 남고, 비워진 뒤에는 다시 넣을 수 있다.
  assert.deepEqual(busy.actors["fire-1"]!.carrying, ["potato"]);
  busy = untilIdle(interactActors(busy, ["fire-1"], incineratorId));
  assert.equal(busy.incinerators[incineratorId]!.count, 1);

  // 가득 차지 않았으면 소각이 아니라 평소대로 넣는다.
  let spare = initialState(1, ["fire"]);
  spare = untilIdle(interactActors(spare, ["fire-1"], ingredientBoxId));
  spare = untilIdle(interactActors(spare, ["fire-1"], incineratorId));
  assert.equal(spare.incinerators[incineratorId]!.count, 1);

  // 비운 뒤 다시 비우려 할 때
  let emptied = untilIdle(interactActors(state, ["fire-1"], incineratorId));
  assert.equal(emptied.incinerators[incineratorId]!.count, 0);
  emptied = untilIdle(interactActors(emptied, ["fire-1"], incineratorId));
  assert.match(emptied.lastEvent, /소각할 쓰레기가 없습니다/);
});

test("소각기는 쓰레기 5개를 모으고 불 슬라임 작업으로 비운다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  for (let count = 0; count < incineratorConfig.capacity; count += 1) {
    state = untilIdle(interactActors(state, ["lightning-1"], ingredientBoxId));
    state = untilIdle(interactActors(state, ["lightning-1"], incineratorId));
  }
  assert.equal(state.incinerators[incineratorId]!.count, incineratorConfig.capacity);
  state = untilIdle(interactActors(state, ["lightning-1"], ingredientBoxId));
  state = untilIdle(interactActors(state, ["lightning-1"], incineratorId));
  assert.deepEqual(state.actors["lightning-1"]!.carrying, ["potato"]);
  assert.equal(state.incinerators[incineratorId]!.count, incineratorConfig.capacity);
  state = untilIdle(interactActors(state, ["fire-1"], incineratorId));
  assert.equal(state.incinerators[incineratorId]!.count, 0);
  assert.ok(state.history.some((entry) => entry.includes("소각기를 비웠습니다")));
});

test("새 이동 명령은 조리 작업을 취소하고 조리 도구 잠금을 푼다", () => {
  let state = initialState(1, ["lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = until(
    interactActors(state, ["earth-1"], "stove"),
    (current) => current.workstations[stoveId]!.status === "WORKING",
  );
  state = moveActors(state, ["earth-1"], tileCenter({ col: 2, row: 2 }));
  assert.equal(state.workstations[stoveId]!.workerId, null);
  assert.equal(state.workstations[stoveId]!.status, "IDLE");
  assert.equal(state.actors["earth-1"]!.intent?.kind, "MOVE");
});

test("속성 슬라임은 새 ID와 식당 역할별 스탯을 사용한다", () => {
  assert.deepEqual(Object.keys(slimeTypes), ["water", "fire", "lightning", "earth"]);
  assert.equal(slimeTypes.fire.role.includes("조리"), true);
  assert.equal(
    initialState(1, ["lightning"]).actors["lightning-1"]!.moveSpeed,
    3.2 * TILE_SIZE,
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
    "--slimes=lightning,earth",
    "lightning:ingredient-box",
    "lightning:stove",
    "earth:stove",
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
  assert.deepEqual(authoredFaceLayout("down"), {
    eyeOffsetX: 31,
    eyeY: 18,
    eyeRadius: 10,
    blinkY: 16,
    blinkWidth: 20,
    blinkHeight: 5,
    mouthY: 30,
    mouthRadius: 14,
    x: -1,
    y: 0,
    blink: false,
  });
  assert.equal(authoredFaceLayout("left")!.x, -30);
  assert.equal(authoredFaceLayout("right")!.x, 29);
  assert.equal(authoredFaceLayout("down", true)!.blink, true);
  assert.equal(authoredFaceLayout("up"), null);
});

test("그릇은 고유 ID로 생성되고 땅 슬라임만 두 개를 나른다", () => {
  let state = initialState(1, ["earth", "water"]);
  assert.equal(state.dishRacks[dishRackId]!.length, dishConfig.initialCount);
  assert.equal(new Set(state.dishRacks[dishRackId]!.map((dish) => dish.id)).size, state.dishRacks[dishRackId]!.length);
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
  assert.equal((state.tables[tableId]![0] as { id: string }).id, id);
  state = untilIdle(interactActors(state, ["lightning-1"], "table"));
  assert.equal((state.actors["lightning-1"]!.carrying[0] as { id: string }).id, id);
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  assert.equal(
    state.actors["lightning-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.content === "potato",
    ),
    true,
  );
  // 감자를 도마에 올리고, 손이 빈 땅 슬라임이 썬다. 접시는 번개가 계속 든다.
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["lightning-1"], "submission"));
  assert.equal(state.filled, 1);
  assert.equal(
    state.actors["lightning-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.id === id && carried.status === "dirty",
    ),
    true,
  );
  state = untilIdle(interactActors(state, ["lightning-1"], "table"));
  state = untilIdle(interactActors(state, ["water-1"], "table"));
  state = untilIdle(interactActors(state, ["water-1"], "washer"));
  assert.equal(state.washers[washerId]!.dish?.id, id);
  assert.equal(state.washers[washerId]!.dish?.status, "clean");
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
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
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
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  return until(state, (current) => current.fires[stoveId]?.onFire === true);
}

const oneStage = (orders: Order[], timeLimitMs = 180_000): Stage[] => [
  { id: "1-1", name: "테스트", orders, timeLimitMs },
];

test("라운드 주문 목록을 주입하고 제출마다 진행도가 오른다", () => {
  const orders: Order[] = [
    { id: "a", foodId: "roasted-potato", targetCount: 2, submittedCount: 0 },
    { id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
  ];
  let state = initialState(1, ["water", "lightning", "earth"], oneStage(orders));
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
  let state = initialState(1, ["lightning", "earth"], stages);
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
  assert.deepEqual(second.squad, ["lightning", "earth"]);
  assert.deepEqual(Object.keys(second.actors), ["lightning-1", "earth-1"]);
  assert.equal(second.filled, 0);
  assert.equal(second.timeLeftMs, 120_000);
  assert.deepEqual(second.stoves[stoveId], []);

  const recruited = recruitSlime(second, "water");
  assert.deepEqual(recruited.squad, ["lightning", "earth", "water"]);
  assert.deepEqual(Object.keys(recruited.actors), ["lightning-1", "earth-1", "water-1"]);
  assert.equal(recruited.gold, 100);

  const cleared = cookAndSubmit(second);
  assert.equal(cleared.phase, "won");
  assert.equal(cleared.gold, 200);
  // 마지막 스테이지에서는 더 넘어가지 않는다.
  assert.equal(nextStage(cleared), cleared);
});

test("주문에 없는 음식 제출은 실수로 세고 골드는 깎지 않는다", () => {
  let state = initialState(1, ["water", "lightning", "earth"]);
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
  let state = burnStove(initialState(1, ["water", "earth", "lightning"]));
  assert.equal(state.fires[stoveId]!.onFire, true);
  assert.ok(state.history.some((entry) => entry.includes("불이 났습니다")));
  // 물 속성이 아닌 슬라임은 작업 불가 처리한다.
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  assert.deepEqual(state.actors["lightning-1"]!.carrying, []);
  assert.ok(state.history.some((entry) => entry.includes("물 슬라임만")));
  assert.equal(state.fires[stoveId]!.onFire, true);
});

test("물 슬라임이 5초 상호작용하면 불을 끄고 설비를 되돌린다", () => {
  let state = burnStove(initialState(1, ["water", "earth", "lightning"]));
  state = until(
    interactActors(state, ["water-1"], "stove"),
    (current) => current.fires[stoveId]!.workerId === "water-1",
  );
  const partial = tick(state, 2_000);
  assert.ok(partial.fires[stoveId]!.extinguishMs >= 2_000);
  assert.equal(partial.fires[stoveId]!.onFire, true);
  state = untilIdle(partial);
  assert.equal(state.fires[stoveId]!.onFire, false);
  assert.equal(state.fires[stoveId]!.extinguishMs, 0);
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
      Math.abs(displayTiles[stoveId].col - displayTiles[farIngredientBoxId].col) +
      Math.abs(displayTiles[stoveId].row - displayTiles[farIngredientBoxId].row);
    let state = burnStove(initialState(1, ["water", "earth", "lightning"]));
    assert.equal(state.fires[farIngredientBoxId]!.onFire, false);
    state = until(
      state,
      (current) => current.fires[farIngredientBoxId]?.onFire === true,
    );
    assert.ok(state.history.some((entry) => entry.includes("옮겨붙었습니다")));
    // 인접 범위를 좁히면 바닥을 건너 번지지 않는다.
    fireConfig.spreadRange = 1;
    let far = burnStove(initialState(1, ["water", "earth", "lightning"]));
    for (let elapsed = 0; elapsed < 20_000; elapsed += 50) far = tick(far, 50);
    assert.equal(far.fires[stoveId]!.onFire, true);
    assert.equal(far.fires[farIngredientBoxId]!.onFire, false);
    // 제출대와 쓰레기 처리 공간은 화재 대상이 아니라 상태 자체가 없다.
    assert.equal(Object.keys(far.fires).some((id) => id.startsWith("submission@")), false);
    assert.equal(Object.keys(far.fires).some((id) => id.startsWith("trash@")), false);
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
  // 소각기를 비롯한 기본 상호작용 비용이 100이고, 기준 속도 20/초에서 5초다.
  assert.equal(workCost.interact, 100);
  const baseSpeed = statTables.workSpeedPerSecond[1]!;
  assert.equal(baseSpeed, 20);
  assert.equal((workCost.interact / baseSpeed) * 1000, 5_000);

  for (const typeId of ["water", "fire", "lightning", "earth"] as const) {
    const actor = initialState(1, [typeId]).actors[`${typeId}-1`]!;
    const speed = statTables.workSpeedPerSecond[actor.statLevels.workSpeed]!;
    // 걸리는 시간 = 비용 ÷ 초당 작업량
    assert.equal(
      workDurationFor(actor, workCost.interact),
      (workCost.interact / speed) * 1000,
    );
    // 비용이 커지면 그만큼 비례해 오래 걸린다. (부동소수점이라 오차 허용)
    const scaled =
      workDurationFor(actor, workCost.interact) * (workCost.cook / workCost.interact);
    assert.ok(Math.abs(workDurationFor(actor, workCost.cook) - scaled) < 1e-6);
  }

  // 작업 속도가 빠른 슬라임이 같은 일을 더 빨리 끝낸다.
  const fire = initialState(1, ["fire"]).actors["fire-1"]!;
  const lightning = initialState(1, ["lightning"]).actors["lightning-1"]!;
  assert.ok(
    workDurationFor(fire, workCost.interact) <
      workDurationFor(lightning, workCost.interact),
  );
});

// 세척도 같은 규칙을 탄다. 예전에는 고정 4초였다.
test("세척도 작업 속도를 탄다", () => {
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  state = untilIdle(interactActors(state, ["lightning-1"], "dish-rack"));
  state = untilIdle(interactActors(state, ["lightning-1"], "ingredient-box"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["earth-1"], "stove"));
  state = untilIdle(interactActors(state, ["lightning-1"], "stove"));
  state = untilIdle(interactActors(state, ["lightning-1"], "submission"));
  state = untilIdle(interactActors(state, ["lightning-1"], "table"));
  state = untilIdle(interactActors(state, ["water-1"], "table"));
  state = interactActors(state, ["water-1"], "washer");
  state = until(state, (current) => current.washers[washerId]!.workerId === "water-1");
  // 고정 시간이 아니라 물 슬라임의 작업 속도로 계산한 값이어야 한다.
  assert.equal(
    state.washers[washerId]!.totalMs,
    workDurationFor(state.actors["water-1"]!, workCost.wash),
  );
});
