import assert from "node:assert/strict";
import test from "node:test";
import { simulate, actAt } from "../game/cli.js";
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
  INGREDIENT_MAX,
  INGREDIENT_PER_TURN,
  KITCHEN_ROWS,
  MAP_HEIGHT,
  MAP_WIDTH,
  RUSH_TURNS_LEFT,
  SPAWN_SPACING,
  actionCost,
  actionPointsPerTurn,
  displayTiles,
  endTurn,
  initialState,
  interactActor,
  isWalkable,
  maxActionPoints,
  moveActor,
  moveTargets,
  occupantOf,
  slimeTypes,
  taskTiles,
  startTile,
  spawnTilesFrom,
  canPlaceSquad,
  activeOrders,
  upcomingOrders,
  dishConfig,
  isDish,
  orderConfig,
  recipes,
  stageRank,
  validateKitchenMap,
  roundResult,
  currentStage,
  defaultStages,
  isLastStage,
  nextStage,
  squadActorIds,
  incineratorConfig,
  stationInstances,
  stationInstancesByType,
  type ActorId,
  type GameState,
  type Order,
  type Stage,
  type KitchenMapData,
} from "../game/core.js";

const ingredientBoxId = stationInstancesByType["ingredient-box"][0].id;
const stoveId = stationInstancesByType.stove[0].id;
const dishRackId = stationInstancesByType["dish-rack"][0].id;
const washerId = stationInstancesByType.washer[0].id;
const tableId = stationInstancesByType.table[0].id;
const secondTableId = stationInstancesByType.table[1].id;
const incineratorId = stationInstancesByType.trash[0].id;

// 테스트용 스테이지. 턴 제한은 넉넉히 둬서 조작 규칙만 보게 한다.
const oneStage = (
  orders: Order[],
  turnLimit = 400,
  requiredOrders = orders.length,
): Stage[] => [{ id: "1-1", name: "테스트", orders, turnLimit, requiredOrders }];

// 한 마리가 감자 하나를 굽고 제출하는 한 바퀴. 손에 그릇이 남아 있으면
// 빈 테이블에 먼저 내려놓는다.
function cookAndSubmit(start: GameState, actorId: ActorId = "earth-1") {
  let state = start;
  if (state.actors[actorId]!.carrying.length) {
    const free = stationInstancesByType.table.find(
      (table) => (state.tables[table.id]?.length ?? 0) === 0,
    );
    if (free) state = actAt(state, actorId, free.id);
  }
  state = actAt(state, actorId, "ingredient-box");
  state = actAt(state, actorId, "stove");
  // 도마는 행동력 2라 1 행동력 슬라임은 두 턴에 나눠 쓴다.
  for (
    let guard = 0;
    guard < 8 &&
    state.phase === "playing" &&
    state.workstations[stoveId]!.status !== "COMPLETE";
    guard += 1
  ) {
    state = actAt(state, actorId, "stove");
  }
  state = actAt(state, actorId, "stove");
  state = actAt(state, actorId, "dish-rack");
  return actAt(state, actorId, "submission");
}

test("스테이지 정보는 실제 맵·레시피와 검증된 설정만 사용한다", () => {
  assert.deepEqual(validateStageInfoUiConfig(stageInfoUiConfig), []);
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

// 턴제는 슬라임끼리 지나갈 수 없어서 붙여 세우면 안쪽이 갇힌다.
test("슬라임은 시작 지점에서 서로 떨어져 선다", () => {
  const squad = ["water", "fire", "lightning", "earth"] as const;
  const state = initialState(1, [...squad]);
  const spots = squadActorIds([...squad]).map((id) => {
    const actor = state.actors[id]!;
    return { col: actor.col, row: actor.row };
  });

  assert.equal(spots.length, squad.length);
  assert.deepEqual(spots[0], startTile);
  for (const tile of spots) assert.ok(isWalkable(tile));
  // 서로 SPAWN_SPACING칸 이상 떨어져 있다.
  for (const [index, one] of spots.entries()) {
    for (const two of spots.slice(index + 1)) {
      assert.ok(
        Math.abs(one.col - two.col) + Math.abs(one.row - two.row) >= SPAWN_SPACING,
      );
    }
  }
  // 아무도 첫 턴부터 갇히지 않는다.
  for (const id of squadActorIds([...squad])) {
    assert.ok(moveTargets(state, id).length > 0);
  }
  // 같은 맵이면 항상 같은 자리다.
  assert.deepEqual(spawnTilesFrom(startTile, squad.length), spots);
});

test("빈 바닥보다 많은 인원은 세우지 않는다", () => {
  const most = spawnTilesFrom(startTile, 999).length;
  assert.ok(canPlaceSquad(most));
  assert.ok(!canPlaceSquad(most + 1));
  assert.throws(() => initialState(1, Array<"water">(most + 1).fill("water")));
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

test("턴이 끝나면 행동력이 초기화되고 전기만 두 번 움직인다", () => {
  assert.deepEqual(actionPointsPerTurn, {
    water: 1,
    fire: 1,
    lightning: 2,
    earth: 1,
  });
  let state = initialState(1, ["lightning", "water"]);
  assert.equal(state.actors["lightning-1"]!.actionPoints, 2);
  assert.equal(state.actors["water-1"]!.actionPoints, 1);
  assert.equal(state.turn, 1);

  // 전기는 한 턴에 두 칸을 간다.
  state = moveActor(state, "lightning-1", moveTargets(state, "lightning-1")[0]);
  assert.equal(state.actors["lightning-1"]!.actionPoints, 1);
  state = moveActor(state, "lightning-1", moveTargets(state, "lightning-1")[0]);
  assert.equal(state.actors["lightning-1"]!.actionPoints, 0);
  // 다 쓰면 갈 수 있는 칸이 사라진다.
  assert.deepEqual(moveTargets(state, "lightning-1"), []);

  // 쓰지 않은 행동력은 턴이 끝나면 사라지고 다시 가득 찬다.
  const turned = endTurn(state);
  assert.equal(turned.turn, 2);
  assert.equal(turned.turnsLeft, state.turnsLeft - 1);
  assert.equal(turned.actors["lightning-1"]!.actionPoints, 2);
  assert.equal(turned.actors["water-1"]!.actionPoints, 1);
});

test("이동은 상하좌우 한 칸이고 벽·설비 칸은 후보에 없다", () => {
  const state = initialState(1, ["water"]);
  const actor = state.actors["water-1"]!;
  const targets = moveTargets(state, "water-1");
  assert.ok(targets.length > 0);
  for (const tile of targets) {
    assert.equal(
      Math.abs(tile.col - actor.col) + Math.abs(tile.row - actor.row),
      1,
    );
    assert.ok(isWalkable(tile));
  }

  const moved = moveActor(state, "water-1", targets[0]);
  assert.equal(moved.actors["water-1"]!.col, targets[0].col);
  assert.equal(moved.actors["water-1"]!.row, targets[0].row);
  assert.equal(moved.actors["water-1"]!.actionPoints, 1 - actionCost.move);

  // 두 칸 떨어진 칸이나 설비 칸은 거절하고 행동력을 쓰지 않는다.
  const far = { col: actor.col + 2, row: actor.row };
  const refused = moveActor(state, "water-1", far);
  assert.equal(refused.actors["water-1"]!.actionPoints, 1);
  assert.ok(refused.refusal?.message.includes("한 칸"));
});

test("다른 슬라임이 선 칸으로는 갈 수 없고 행동력도 줄지 않는다", () => {
  const base = initialState(1, ["water", "fire"]);
  const water = base.actors["water-1"]!;
  const target = moveTargets(base, "water-1")[0];
  // 물 슬라임이 가려던 칸에 불 슬라임을 세워 둔다.
  const blocked: GameState = {
    ...base,
    actors: {
      ...base.actors,
      "fire-1": { ...base.actors["fire-1"]!, col: target.col, row: target.row },
    },
  };
  assert.equal(occupantOf(blocked, target), "fire-1");
  // 점유된 칸은 이동 가능 표시에서 아예 빠진다.
  assert.ok(
    !moveTargets(blocked, "water-1").some(
      (tile) => tile.col === target.col && tile.row === target.row,
    ),
  );
  const refused = moveActor(blocked, "water-1", target);
  assert.equal(refused.actors["water-1"]!.actionPoints, 1);
  assert.equal(refused.actors["water-1"]!.col, water.col);
  assert.equal(refused.actors["water-1"]!.row, water.row);
  assert.ok(refused.refusal?.message.includes("다른 슬라임"));
});

test("도마는 땅 슬라임만 쓰고 진척도는 턴을 넘겨 이어진다", () => {
  let state = initialState(1, ["earth", "water"], oneStage([
    { id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
  ]));
  state = actAt(state, "earth-1", "ingredient-box");
  state = actAt(state, "earth-1", stoveId);
  assert.deepEqual(state.stoves[stoveId], ["potato"]);

  // 물 슬라임은 도마를 쓸 수 없다. 행동력도 줄지 않는다.
  const wrong = actAt(state, "water-1", stoveId);
  assert.equal(wrong.workstations[stoveId]!.progress, 0);
  assert.ok(wrong.refusal?.message.includes("땅 슬라임만"));

  // 땅 슬라임은 행동력이 1뿐이라 한 턴에 절반만 진행한다.
  state = actAt(state, "earth-1", stoveId);
  assert.equal(state.workstations[stoveId]!.progress, 1);
  assert.equal(state.workstations[stoveId]!.status, "WORKING");
  assert.deepEqual(state.stoves[stoveId], ["potato"]);

  // 턴을 넘겨도 진척도가 남아 이어서 끝난다.
  state = endTurn(state);
  assert.equal(state.workstations[stoveId]!.progress, 1);
  state = actAt(state, "earth-1", stoveId);
  assert.equal(state.workstations[stoveId]!.status, "COMPLETE");
  assert.deepEqual(state.stoves[stoveId], ["roasted-potato"]);
});

test("유효하지 않은 상호작용은 행동력을 쓰지 않고 이유를 남긴다", () => {
  const state = initialState(1, ["water"]);
  // 옆 칸에 서지 않고 설비를 쓰려 할 때.
  const far = interactActor(state, "water-1", "submission");
  assert.equal(far.actors["water-1"]!.actionPoints, 1);
  assert.ok(far.refusal?.message.includes("옆 칸"));

  // 빈손으로 빈 테이블을 쓸 때.
  const emptyTable = actAt(state, "water-1", tableId);
  assert.equal(emptyTable.actors["water-1"]!.actionPoints, 1);
  assert.ok(emptyTable.refusal?.message.includes("비어 있습니다"));

  // 성공한 행동은 거절 표시를 지운다.
  const ok = actAt(emptyTable, "water-1", "ingredient-box");
  assert.equal(ok.refusal, null);
  assert.deepEqual(ok.actors["water-1"]!.carrying, ["potato"]);
});

test("재료 상자는 턴마다 한 개씩 최대치까지 채운다", () => {
  let state = initialState(1, ["water"]);
  const start = state.ingredients[ingredientBoxId]!.stock;
  state = endTurn(state);
  assert.equal(
    state.ingredients[ingredientBoxId]!.stock,
    start + INGREDIENT_PER_TURN,
  );
  for (let count = 0; count < 10; count += 1) state = endTurn(state);
  assert.equal(state.ingredients[ingredientBoxId]!.stock, INGREDIENT_MAX);
});

test("같은 종류 설비는 좌표 ID별로 내용물을 따로 보관한다", () => {
  let state = initialState(1, ["lightning"]);
  state = actAt(state, "lightning-1", dishRackId);
  state = actAt(state, "lightning-1", tableId);
  assert.equal(state.tables[tableId]!.length, 1);
  assert.equal(state.tables[secondTableId]!.length, 0);

  state = actAt(state, "lightning-1", ingredientBoxId);
  state = actAt(state, "lightning-1", secondTableId);
  assert.equal(state.tables[tableId]!.length, 1);
  assert.deepEqual(state.tables[secondTableId], ["potato"]);
});

// 명세 11.3: 어느 쪽을 먼저 놓든 음식이 담긴 그릇이 테이블 위에 남는다.
test("테이블의 감자와 빈 접시는 순서와 무관하게 테이블 위에서 합쳐진다", () => {
  let foodFirst = initialState(1, ["lightning"]);
  foodFirst = actAt(foodFirst, "lightning-1", ingredientBoxId);
  foodFirst = actAt(foodFirst, "lightning-1", tableId);
  foodFirst = actAt(foodFirst, "lightning-1", dishRackId);
  foodFirst = actAt(foodFirst, "lightning-1", tableId);
  assert.deepEqual(foodFirst.actors["lightning-1"]!.carrying, []);
  const left = foodFirst.tables[tableId]![0];
  assert.ok(isDish(left) && left.status === "filled" && left.content === "potato");

  let dishFirst = initialState(1, ["lightning"]);
  dishFirst = actAt(dishFirst, "lightning-1", dishRackId);
  dishFirst = actAt(dishFirst, "lightning-1", tableId);
  dishFirst = actAt(dishFirst, "lightning-1", ingredientBoxId);
  dishFirst = actAt(dishFirst, "lightning-1", tableId);
  assert.deepEqual(dishFirst.actors["lightning-1"]!.carrying, []);
  const stayed = dishFirst.tables[tableId]![0];
  assert.ok(isDish(stayed) && stayed.status === "filled" && stayed.content === "potato");
});

test("남은 턴이 얼마 없으면 러쉬 음악을 사용한다", () => {
  assert.equal(gameMusicSource(RUSH_TURNS_LEFT + 1, "playing"), "/music/main.mp3");
  assert.equal(gameMusicSource(RUSH_TURNS_LEFT, "playing"), "/music/rush.mp3");
  assert.equal(gameMusicSource(RUSH_TURNS_LEFT + 1, "won"), "/music/main.mp3");
  assert.equal(gameMusicSource(0, "lost"), "/music/game-over.mp3");
});

test("효과음은 조리·세척·음식 제출을 구분한다", () => {
  const state = initialState(1, ["water", "fire"]);
  assert.deepEqual(gameSoundCues(null, state), ["round-start"]);
  assert.deepEqual(
    gameSoundCues(state, {
      ...state,
      workstations: {
        ...state.workstations,
        [stoveId]: { status: "WORKING", progress: 1 },
      },
    }),
    ["chop"],
  );
  assert.deepEqual(
    gameSoundCues(state, {
      ...state,
      washers: {
        ...state.washers,
        [washerId]: { ...state.washers[washerId]!, progress: 1 },
      },
    }),
    ["wash"],
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
    fires: { ...state.fires, [stoveId]: { onFire: true } },
  };
  assert.ok(gameSoundCues(state, burning).includes("fire-start"));
  assert.ok(gameSoundCues(burning, state).includes("fire-extinguish"));
});

test("감자를 썰어 제출하면 주문 수가 오른다", () => {
  const state = cookAndSubmit(
    initialState(1, ["earth"], oneStage([
      { id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
    ])),
  );
  assert.equal(state.filled, 1);
  assert.equal(state.gold, 100);
  assert.ok(
    state.actors["earth-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.status === "dirty",
    ),
  );
});

test("빈 접시 없이 음식은 꺼내도 제출은 접시에 담아야 한다", () => {
  let state = initialState(1, ["earth"]);
  state = actAt(state, "earth-1", "ingredient-box");
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  assert.deepEqual(state.actors["earth-1"]!.carrying, ["roasted-potato"]);

  // 낱개 음식은 제출대에서 거절한다.
  const bare = actAt(state, "earth-1", "submission");
  assert.deepEqual(bare.actors["earth-1"]!.carrying, ["roasted-potato"]);
  assert.equal(bare.orders[0].submittedCount, 0);
  assert.ok(bare.refusal?.message.includes("접시에 담긴"));

  // 그릇 생성대에서 담으면 제출할 수 있다.
  state = actAt(state, "earth-1", dishRackId);
  state = actAt(state, "earth-1", "submission");
  assert.equal(state.orders[0].submittedCount, 1);
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.status === "dirty" && carried.content === null,
  ));
});

test("음식을 들고 그릇 생성대에 가면 접시에 담는다", () => {
  let state = initialState(1, ["water"]);
  state = actAt(state, "water-1", ingredientBoxId);
  state = actAt(state, "water-1", dishRackId);
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
    state = actAt(state, "lightning-1", ingredientBoxId);
    state = actAt(state, "lightning-1", incineratorId);
  }
  assert.equal(state.incinerators[incineratorId]!.count, incineratorConfig.capacity);

  // 가득 찬 소각기
  let full = actAt(state, "lightning-1", ingredientBoxId);
  full = actAt(full, "lightning-1", incineratorId);
  assert.ok(full.refusal?.message.includes("가득 찼습니다"));

  // 가득 찬 소각기 앞에서는 물건을 든 불 슬라임도 소각부터 한다.
  let busy = actAt(state, "fire-1", ingredientBoxId);
  assert.deepEqual(busy.actors["fire-1"]!.carrying, ["potato"]);
  busy = actAt(busy, "fire-1", incineratorId);
  busy = actAt(busy, "fire-1", incineratorId);
  assert.equal(busy.incinerators[incineratorId]!.count, 0);
  // 손에 든 물건은 그대로 남고, 비워진 뒤에는 다시 넣을 수 있다.
  assert.deepEqual(busy.actors["fire-1"]!.carrying, ["potato"]);
  busy = actAt(busy, "fire-1", incineratorId);
  assert.equal(busy.incinerators[incineratorId]!.count, 1);

  // 비운 뒤 다시 비우려 할 때
  let emptied = actAt(state, "fire-1", incineratorId);
  emptied = actAt(emptied, "fire-1", incineratorId);
  assert.equal(emptied.incinerators[incineratorId]!.count, 0);
  emptied = actAt(emptied, "fire-1", incineratorId);
  assert.ok(emptied.refusal?.message.includes("소각할 쓰레기가 없습니다"));
});

test("소각은 행동력 2를 나눠 쓰고 불 슬라임만 할 수 있다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = actAt(state, "lightning-1", ingredientBoxId);
  state = actAt(state, "lightning-1", incineratorId);
  assert.equal(state.incinerators[incineratorId]!.count, 1);

  // 전기는 소각을 못 한다.
  const wrong = actAt(state, "lightning-1", incineratorId);
  assert.ok(wrong.refusal?.message.includes("불 슬라임만"));

  // 불 슬라임은 행동력 1을 넣고 다음 턴에 이어서 끝낸다.
  state = actAt(state, "fire-1", incineratorId);
  assert.equal(state.incinerators[incineratorId]!.progress, 1);
  assert.equal(state.incinerators[incineratorId]!.count, 1);
  state = actAt(state, "fire-1", incineratorId);
  assert.equal(state.incinerators[incineratorId]!.count, 0);
});

test("세척은 물 슬라임만 하고 넣기는 누구나 한다", () => {
  let state = cookAndSubmit(
    initialState(1, ["earth", "water"], oneStage([
      { id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
      { id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
    ], 400, 2)),
  );
  // 더러운 그릇 넣기는 땅 슬라임도 할 수 있다.
  state = actAt(state, "earth-1", washerId);
  assert.equal(state.washers[washerId]!.dish?.status, "dirty");
  assert.deepEqual(state.actors["earth-1"]!.carrying, []);

  // 땅 슬라임은 세척을 못 한다.
  const wrong = actAt(state, "earth-1", washerId);
  assert.ok(wrong.refusal?.message.includes("물 슬라임만"));

  // 물 슬라임이 두 턴에 걸쳐 씻는다.
  state = actAt(state, "water-1", washerId);
  assert.equal(state.washers[washerId]!.progress, 1);
  state = actAt(state, "water-1", washerId);
  assert.equal(state.washers[washerId]!.dish?.status, "clean");
  state = actAt(state, "water-1", washerId);
  assert.ok(state.actors["water-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.status === "clean",
  ));
});

test("속성 슬라임은 새 ID와 턴당 행동력을 사용한다", () => {
  assert.deepEqual(Object.keys(slimeTypes), ["water", "fire", "lightning", "earth"]);
  assert.equal(slimeTypes.earth.role.includes("썰기"), true);
  assert.equal(maxActionPoints("lightning"), 2);
  assert.equal(maxActionPoints("earth"), 1);
  assert.doesNotThrow(() =>
    initialState(1, ["water", "fire", "lightning", "earth"]),
  );
});

test("같은 속성 슬라임을 여러 마리 데려올 수 있다", () => {
  const state = initialState(1, ["water", "water", "fire"]);
  assert.deepEqual(Object.keys(state.actors), ["water-1", "water-2", "fire-1"]);
  assert.notDeepEqual(
    { col: state.actors["water-1"]!.col, row: state.actors["water-1"]!.row },
    { col: state.actors["water-2"]!.col, row: state.actors["water-2"]!.row },
  );
  assert.equal(state.actors["water-1"]!.name, "물 슬라임 1호");
  assert.equal(state.actors["water-2"]!.name, "물 슬라임 2호");
  assert.equal(state.actors["fire-1"]!.name, "불 슬라임");

  // 한 마리에게 내린 지시가 같은 속성의 다른 마리를 움직이지 않는다.
  const moved = actAt(state, "water-2", "ingredient-box");
  assert.deepEqual(moved.actors["water-2"]!.carrying, ["potato"]);
  assert.deepEqual(moved.actors["water-1"]!.carrying, []);
  assert.deepEqual(
    { col: moved.actors["water-1"]!.col, row: moved.actors["water-1"]!.row },
    { col: state.actors["water-1"]!.col, row: state.actors["water-1"]!.row },
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
  assert.throws(() => simulate(["--slimes=water", "TURN:0"]));
});

test("같은 seed와 입력은 같은 식당 상태를 만든다", () => {
  const play = () => {
    let state = initialState(91, ["lightning"]);
    state = actAt(state, "lightning-1", "ingredient-box");
    return actAt(state, "lightning-1", "trash");
  };
  assert.deepEqual(play(), play());
});

test("CLI는 식당 상호작용을 결정론적으로 재현한다", () => {
  const args = [
    "--seed=7",
    "--slimes=earth",
    "earth:ingredient-box",
    "earth:stove",
    "earth:stove",
    "earth:stove",
    "earth:stove",
    "earth:dish-rack",
    "earth:submission",
  ];
  const first = simulate(args);
  assert.deepEqual(first, simulate(args));
  assert.equal(first.final.filled, 1);
  // 턴제라 판이 턴 단위로 흐른다.
  assert.ok(first.turn > 1);
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
  assert.equal(
    new Set(state.dishRacks[dishRackId]!.map((dish) => dish.id)).size,
    state.dishRacks[dishRackId]!.length,
  );
  state = actAt(state, "earth-1", dishRackId);
  state = actAt(state, "earth-1", dishRackId);
  assert.equal(state.actors["earth-1"]!.carrying.length, dishConfig.earthDishCarry);

  let ordinary = initialState(1, ["water"]);
  ordinary = actAt(ordinary, "water-1", dishRackId);
  ordinary = actAt(ordinary, "water-1", dishRackId);
  assert.ok(ordinary.actors["water-1"]!.carrying.length <= 1);
});

test("그릇은 조리·제출·오염·세척 동안 ID를 보존한다", () => {
  let state = initialState(1, ["earth", "water"], oneStage([
    { id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
    { id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
  ], 400, 2));
  state = actAt(state, "earth-1", dishRackId);
  const id = (state.actors["earth-1"]!.carrying[0] as { id: string }).id;
  state = actAt(state, "earth-1", ingredientBoxId);
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.content === "potato",
  ));
  state = actAt(state, "earth-1", stoveId);
  // 재료를 올리면 그릇은 다시 깨끗해져 손에 남는다.
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.id === id && carried.status === "clean",
  ));
  // 손이 차 있으면 도마를 쓸 수 없다. 빈 테이블에 내려놓고 썬다.
  state = actAt(state, "earth-1", tableId);
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  assert.equal(state.workstations[stoveId]!.status, "COMPLETE");
  state = actAt(state, "earth-1", tableId);
  state = actAt(state, "earth-1", stoveId);
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.id === id && carried.content === "roasted-potato",
  ));
  state = actAt(state, "earth-1", "submission");
  assert.equal(state.filled, 1);
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.id === id && carried.status === "dirty",
  ));
  state = actAt(state, "earth-1", washerId);
  state = actAt(state, "water-1", washerId);
  state = actAt(state, "water-1", washerId);
  assert.equal(state.washers[washerId]!.dish?.id, id);
  assert.equal(state.washers[washerId]!.dish?.status, "clean");
});

test("라운드 주문 목록을 주입하고 제출마다 진행도가 오른다", () => {
  const orders: Order[] = [
    { id: "a", foodId: "roasted-potato", targetCount: 2, submittedCount: 0 },
    { id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
  ];
  let state = initialState(1, ["earth"], oneStage(orders));
  assert.equal(state.goal, 2);
  assert.deepEqual(activeOrders(state).map((order) => order.id), ["a", "b"]);
  state = cookAndSubmit(state);
  assert.equal(state.orders[0].submittedCount, 1);
  assert.equal(state.filled, 0);
  assert.equal(state.phase, "playing");
  state = cookAndSubmit(state);
  assert.equal(state.filled, 1);
  // 완료된 주문은 활성에서 빠지고 다음 주문이 올라온다.
  assert.deepEqual(activeOrders(state).map((order) => order.id), ["b"]);
  state = cookAndSubmit(state);
  assert.equal(state.filled, 2);
  assert.equal(state.phase, "won");
});

test("주문은 두 개만 노출하고 다음 레시피 두 개를 미리 보여 준다", () => {
  const orders: Order[] = ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    foodId: "roasted-potato" as const,
    targetCount: 1,
    submittedCount: 0,
  }));
  const state = initialState(1, ["earth"], oneStage(orders, 400, 3));
  assert.equal(orderConfig.activeOrderCount, 2);
  assert.deepEqual(activeOrders(state).map((order) => order.id), ["a", "b"]);
  assert.deepEqual(upcomingOrders(state).map((order) => order.id), ["c", "d"]);

  // 하나를 처리하면 다음이 올라오고 미리보기도 밀린다.
  const done: GameState = {
    ...state,
    filled: 1,
    orders: state.orders.map((order) =>
      order.id === "a" ? { ...order, submittedCount: 1 } : order,
    ),
  };
  assert.deepEqual(activeOrders(done).map((order) => order.id), ["b", "c"]);
  assert.deepEqual(upcomingOrders(done).map((order) => order.id), ["d", "e"]);
});

test("주문에 없는 음식은 설정대로 처리하고 진행도를 올리지 않는다", () => {
  let state = initialState(1, ["lightning"]);
  state = actAt(state, "lightning-1", dishRackId);
  state = actAt(state, "lightning-1", ingredientBoxId);
  const rejected = actAt(state, "lightning-1", "submission");
  assert.ok(rejected.actors["lightning-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.content === "potato",
  ));
  assert.equal(rejected.orders[0].submittedCount, 0);
  assert.equal(rejected.filled, 0);
  assert.equal(rejected.misses, 1);

  const saved = orderConfig.invalidSubmission;
  try {
    orderConfig.invalidSubmission = "discard";
    const discarded = actAt(state, "lightning-1", "submission");
    assert.ok(discarded.actors["lightning-1"]!.carrying.some(
      (carried) => isDish(carried) && carried.status === "dirty",
    ));
    assert.equal(discarded.orders[0].submittedCount, 0);
    assert.equal(discarded.filled, 0);
  } finally {
    orderConfig.invalidSubmission = saved;
  }
});

test("최소 주문 수를 채우면 통과하고 초과분이 랭크가 된다", () => {
  const orders: Order[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id,
    foodId: "roasted-potato" as const,
    targetCount: 1,
    submittedCount: 0,
  }));
  const base = initialState(1, ["earth"], oneStage(orders, 400, 2));
  assert.equal(base.goal, 2);
  const at = (filled: number): GameState => ({ ...base, filled });

  assert.equal(roundResult(at(1)), "lost");
  assert.equal(stageRank(at(1)), 0);
  // 기준만 달성하면 별 1개.
  assert.equal(roundResult(at(2)), "won");
  assert.equal(stageRank(at(2)), 1);
  assert.equal(stageRank(at(3)), 1);
  // 기준보다 2건 더 처리하면 별 2개, 3건이면 별 3개.
  assert.equal(stageRank(at(4)), 2);
  assert.equal(stageRank(at(5)), 3);
  assert.equal(stageRank(at(6)), 3);

  // 통과 기준은 레시피 목록보다 많을 수 없다.
  assert.throws(() => initialState(1, ["water"], oneStage(orders, 400, 7)));
  assert.throws(() => initialState(1, ["water"], oneStage(orders, 0, 2)));
});

test("턴을 다 쓰면 스테이지가 판정으로 끝난다", () => {
  let state = initialState(1, ["water"], oneStage(
    [{ id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 }],
    3,
  ));
  assert.equal(state.turnsLeft, 3);
  state = endTurn(state);
  state = endTurn(state);
  assert.equal(state.phase, "playing");
  state = endTurn(state);
  assert.equal(state.turnsLeft, 0);
  assert.equal(state.phase, "lost");
  assert.ok(state.lastEvent.includes("영업 종료"));
  // 끝난 판에서는 아무 행동도 받지 않는다.
  assert.equal(endTurn(state), state);
  assert.equal(moveActor(state, "water-1", moveTargets(state, "water-1")[0] ?? startTile), state);
});

test("스테이지를 깨면 골드와 스쿼드를 이어 다음 스테이지로 넘어간다", () => {
  const stages: Stage[] = [
    {
      id: "1-1",
      name: "첫 판",
      orders: [{ id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 }],
      turnLimit: 400,
      requiredOrders: 1,
    },
    {
      id: "1-2",
      name: "둘째 판",
      orders: [{ id: "b", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 }],
      turnLimit: 120,
      requiredOrders: 1,
    },
  ];
  let state = initialState(1, ["earth"], stages);
  assert.equal(currentStage(state).id, "1-1");
  assert.equal(isLastStage(state), false);

  state = cookAndSubmit(state);
  assert.equal(state.phase, "won");
  assert.equal(state.gold, 100);

  const second = nextStage(state);
  assert.equal(currentStage(second).id, "1-2");
  assert.equal(second.phase, "playing");
  assert.equal(isLastStage(second), true);
  // 골드와 스쿼드는 잇고 주문·턴·설비는 새로 시작한다.
  assert.equal(second.gold, 100);
  assert.deepEqual(second.squad, ["earth"]);
  assert.equal(second.filled, 0);
  assert.equal(second.turnsLeft, 120);
  assert.equal(second.turn, 1);
  assert.deepEqual(second.stoves[stoveId], []);

  const cleared = cookAndSubmit(second);
  assert.equal(cleared.phase, "won");
  assert.equal(cleared.gold, 200);
  // 마지막 스테이지에서는 더 넘어가지 않는다.
  assert.equal(nextStage(cleared), cleared);
});

test("주문에 없는 음식 제출은 실수로 세고 골드는 깎지 않는다", () => {
  let state = initialState(1, ["earth"], oneStage([
    { id: "a", foodId: "roasted-potato", targetCount: 1, submittedCount: 0 },
  ]));
  assert.equal(state.misses, 0);
  state = actAt(state, "earth-1", dishRackId);
  state = actAt(state, "earth-1", ingredientBoxId);
  state = actAt(state, "earth-1", "submission");
  assert.equal(state.misses, 1);
  assert.equal(state.gold, 0);
  assert.equal(state.filled, 0);
  // 정상 제출은 실수로 세지 않는다.
  const ok = cookAndSubmit(state);
  assert.equal(ok.misses, 1);
  assert.equal(ok.gold, 100);
});

test("플레이테스트 세션은 위조된 요약을 저장 전에 거부한다", () => {
  const valid = {
    seed: 7,
    result: "won" as const,
    booksSubmitted: 3,
    goal: 2,
    elapsedMs: 40,
    voiceCommands: 0,
    buttonCommands: 12,
    voiceFailures: 0,
    avgConfidence: null,
  };
  const parsed = parseSession(valid);
  assert.equal(parsed.ok, true);
  // 통과 기준을 넘긴 판도 받아들인다. 초과분이 랭크가 된다.
  assert.equal(parseSession({ ...valid, booksSubmitted: 2 }).ok, true);
  assert.equal(parseSession({ ...valid, result: "lost" }).ok, false);
  assert.equal(parseSession({ ...valid, booksSubmitted: 1 }).ok, false);
  assert.equal(parseSession({ ...valid, elapsedMs: 10_000 }).ok, false);
  assert.equal(parseSession({ ...valid, seed: -1 }).ok, false);
  assert.equal(parseSession("nope").ok, false);
});
