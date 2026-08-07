import assert from "node:assert/strict";
import test from "node:test";
import { simulate, actAt } from "../game/cli.js";
import { parseSession } from "../game/session.js";
import recipeData from "../game/recipes.json" with { type: "json" };
import stageData from "../game/stages.json" with { type: "json" };
import { authoredFaceLayout, facingFromDelta, slimeSvg, type Facing } from "../app/slime-art.js";
import { gameMusicSource } from "../app/music-source.js";
import { gameSoundCues } from "../app/sound-events.js";
import {
  INGREDIENT_MAX,
  INGREDIENT_PER_TURN,
  KITCHEN_ROWS,
  MAP_HEIGHT,
  MAP_WIDTH,
  RUSH_TURNS_LEFT,
  actionCost,
  actionPointsPerTurn,
  endTurn,
  initialState,
  interactActor,
  isWalkable,
  maxActionPoints,
  moveActor,
  moveTargets,
  nextReadyActor,
  occupantOf,
  slimeTypes,
  stationTiles,
  spawnTiles,
  spawnTilesFor,
  canPlaceSquad,
  allElements,
  boxItems,
  tilesFor,
  activeOrders,
  upcomingOrders,
  dishConfig,
  isDish,
  orderConfig,
  recipes,
  allRecipes,
  stageRank,
  validateKitchenMap,
  roundResult,
  currentStage,
  passMark,
  defaultStages,
  isLastStage,
  nextStage,
  incineratorConfig,
  blenderStage,
  stationElements,
  stationInstances,
  stationInstancesByType,
  type ActorId,
  type GameState,
  type Order,
  type Stage,
} from "../game/core.js";

const potatoBoxId = stationInstancesByType["potato-box"][0].id;
const carrotBoxId = stationInstancesByType["carrot-box"][0].id;
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
  pass = orders.length,
): Stage[] => [
  // 별 기준은 오름차순 셋이어야 하므로 통과 기준 뒤로 한 칸씩 벌려 둔다.
  { id: "1-1", name: "테스트", orders, turnLimit, stars: [pass, pass + 1, pass + 2] },
];

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
  state = actAt(state, actorId, "potato-box");
  state = actAt(state, actorId, "stove");   // 재료 올리기
  state = actAt(state, actorId, "stove");   // 썰기 (한 턴)
  state = actAt(state, actorId, "stove");   // 완성품 회수
  state = actAt(state, actorId, "dish-rack");
  return actAt(state, actorId, "submission");
}

test("레시피는 recipes.json을 그대로 읽어 온다", () => {
  assert.deepEqual(recipes["shredded-potato"], {
    foodId: "shredded-potato",
    ingredient: { itemId: "potato", count: 1 },
    station: "stove",
    workers: ["earth"],
    requiresCleanDish: true,
    submissionStation: "submission",
  });
  assert.deepEqual(recipes["banana-smoothie"], {
    foodId: "banana-smoothie",
    ingredient: { itemId: "banana", count: 1 },
    station: "blender",
    workers: ["lightning"],
    requiresCleanDish: true,
    submissionStation: "submission",
  });
  assert.equal(allRecipes.length, recipeData.recipes.length);
  // 한 기구 안에서 같은 재료가 두 결과를 내지 않는다. recipeAt이 이걸 믿는다.
  // 기구가 다르면 같은 재료를 써도 된다(감자는 도마와 튀김기 둘 다).
  assert.equal(
    new Set(allRecipes.map((recipe) => `${recipe.station}/${recipe.ingredient.itemId}`)).size,
    allRecipes.length,
  );
  assert.ok(allRecipes.filter((recipe) => recipe.ingredient.itemId === "potato").length > 1);
});

test("스테이지는 stages.json에 적힌 순서 그대로 주문을 낸다", () => {
  const stages = defaultStages();
  assert.equal(stages.length, stageData.stages.length);
  stages.forEach((stage, index) => {
    const source = stageData.stages[index];
    assert.equal(stage.id, source.id);
    assert.equal(stage.turnLimit, source.turnLimit);
    // 적힌 목록이 그대로 주문 순서가 된다. 같은 것을 여러 번 적어도 된다.
    assert.deepEqual(stage.orders.map((order) => order.foodId), source.orders);
    assert.deepEqual(stage.stars, source.stars);
    // 통과·별2·별3은 오름차순이고 마지막은 주문 수를 넘지 않는다.
    assert.deepEqual(stage.stars, [...stage.stars].sort((a, b) => a - b));
    assert.equal(new Set(stage.stars).size, 3);
    assert.ok(stage.stars[2] <= stage.orders.length);
    assert.equal(passMark(stage), stage.stars[0]);
  });
});

test("스테이지 제목은 30자를 넘길 수 없다", () => {
  const stages = defaultStages();
  stages[0] = { ...stages[0]!, name: "가".repeat(31) };
  assert.throws(() => initialState(1, ["water"], stages));
});

// 슬라임 자리는 맵에서 속성별로 직접 찍는다.
test("슬라임은 맵에 지정한 속성별 자리에 선다", () => {
  const squad = ["water", "fire", "lightning", "earth"] as const;
  const state = initialState(1, [...squad]);
  for (const element of allElements) {
    const actor = state.actors[`${element}-1`]!;
    assert.deepEqual({ col: actor.col, row: actor.row }, spawnTiles[element]);
    assert.ok(isWalkable({ col: actor.col, row: actor.row }));
    // 아무도 첫 턴부터 갇히지 않는다.
    assert.ok(moveTargets(state, `${element}-1`).length > 0);
  }
  assert.deepEqual(spawnTilesFor([...squad]), allElements.map((e) => spawnTiles[e]));
});

test("같은 속성을 여러 마리 데려오면 옆 빈 바닥으로 밀려난다", () => {
  const state = initialState(1, ["water", "water"]);
  const first = state.actors["water-1"]!;
  const second = state.actors["water-2"]!;
  assert.deepEqual({ col: first.col, row: first.row }, spawnTiles.water);
  assert.notDeepEqual({ col: second.col, row: second.row }, spawnTiles.water);
  assert.ok(isWalkable({ col: second.col, row: second.row }));
  assert.ok(canPlaceSquad(["water", "water"]));
});

test("모든 기구는 붙어 설 수 있는 바닥을 가진다", () => {
  assert.equal(KITCHEN_ROWS.length, MAP_HEIGHT);
  assert.ok(KITCHEN_ROWS.every((row) => row.length === MAP_WIDTH));
  assert.deepEqual(validateKitchenMap({ rows: KITCHEN_ROWS, spawnTiles }), []);
  for (const station of stationInstances) {
    // 차지한 칸 수가 종류별 규격과 같다.
    assert.equal(station.tiles.length, tilesFor(station.type));
    // 어느 방향에서든 쓸 수 있으므로 붙은 바닥이 하나는 있어야 한다.
    const beside = station.tiles.some((tile) =>
      [
        { col: tile.col, row: tile.row - 1 },
        { col: tile.col - 1, row: tile.row },
        { col: tile.col + 1, row: tile.row },
        { col: tile.col, row: tile.row + 1 },
      ].some(isWalkable),
    );
    assert.ok(beside, `${station.id}: 붙어 설 바닥이 없다`);
  }
});

test("제출대와 세척대는 두 칸을 한 대로 묶는다", () => {
  for (const type of ["submission", "washer"] as const) {
    assert.equal(tilesFor(type), 2);
    for (const station of stationInstancesByType[type]) {
      assert.equal(station.tiles.length, 2);
      // 가로나 세로로 이어져 있다.
      const [one, two] = station.tiles;
      assert.equal(Math.abs(one.col - two.col) + Math.abs(one.row - two.row), 1);
      assert.deepEqual(stationTiles[station.id], station.tiles);
    }
  }
  // 한 칸짜리는 붙어 있어도 각각 다른 대다.
  assert.ok(stationInstancesByType.table.length > 1);
  assert.ok(stationInstancesByType.table.every((table) => table.tiles.length === 1));
});

test("맵 편집 데이터는 누락 설비와 잘못된 칸 수·슬라임 자리를 거부한다", () => {
  // 감자 상자를 지우고, 세척대를 한 칸으로 줄이고, 슬라임 자리를 벽으로 옮긴다.
  const rows = KITCHEN_ROWS.map((row) =>
    row.replaceAll("P", ".").replace("WW", "W."),
  );
  const errors = validateKitchenMap({
    rows,
    spawnTiles: { ...spawnTiles, water: { col: 0, row: 0 } },
  });
  assert.ok(errors.some((error) => error.includes("감자 상자")));
  assert.ok(errors.some((error) => error.includes("세척대")));
  assert.ok(errors.some((error) => error.includes("물 슬라임 위치")));
});

test("재료 상자마다 다른 재료를 꺼낸다", () => {
  assert.deepEqual(boxItems, {
    "potato-box": "potato",
    "carrot-box": "carrot",
    "cabbage-box": "cabbage",
    "banana-box": "banana",
    "strawberry-box": "strawberry",
    "mushroom-box": "mushroom",
  });
  let state = initialState(1, ["water"]);
  state = actAt(state, "water-1", potatoBoxId);
  assert.deepEqual(state.actors["water-1"]!.carrying, ["potato"]);
  let other = initialState(1, ["water"]);
  other = actAt(other, "water-1", carrotBoxId);
  assert.deepEqual(other.actors["water-1"]!.carrying, ["carrot"]);
});

test("튀김기와 화로는 도마와 같은 규칙으로 돈다", () => {
  const fryerId = stationInstancesByType.fryer[0].id;
  const ovenId = stationInstancesByType.oven[0].id;
  const mushroomBoxId = stationInstancesByType["mushroom-box"][0].id;

  // 버섯을 튀김기에 올리고 불 슬라임이 튀긴다.
  let state = initialState(1, ["fire"], oneStage([
    { id: "a", foodId: "fried-mushroom", targetCount: 1, submittedCount: 0 },
  ]));
  state = actAt(state, "fire-1", mushroomBoxId);
  state = actAt(state, "fire-1", fryerId);
  assert.deepEqual(state.stoves[fryerId], ["mushroom"]);
  state = actAt(state, "fire-1", fryerId);
  assert.deepEqual(state.stoves[fryerId], ["fried-mushroom"]);

  // 같은 버섯이 화로에서는 구이가 된다.
  let oven = initialState(1, ["fire"], oneStage([
    { id: "a", foodId: "grilled-mushroom", targetCount: 1, submittedCount: 0 },
  ]));
  oven = actAt(oven, "fire-1", mushroomBoxId);
  oven = actAt(oven, "fire-1", ovenId);
  oven = actAt(oven, "fire-1", ovenId);
  assert.deepEqual(oven.stoves[ovenId], ["grilled-mushroom"]);

  // 불이 아니면 돌릴 수 없다.
  let wrong = initialState(1, ["fire", "water"], oneStage([
    { id: "a", foodId: "fried-mushroom", targetCount: 1, submittedCount: 0 },
  ]));
  wrong = actAt(wrong, "fire-1", mushroomBoxId);
  wrong = actAt(wrong, "fire-1", fryerId);
  wrong = actAt(wrong, "water-1", fryerId);
  assert.ok(wrong.refusal?.message.includes("불 슬라임만"));
});

test("쓸 수 없는 재료를 들고 오면 그 사정을 알려 준다", () => {
  const mushroomBoxId = stationInstancesByType["mushroom-box"][0].id;
  let state = initialState(1, ["earth"]);
  state = actAt(state, "earth-1", mushroomBoxId);
  const refused = actAt(state, "earth-1", stoveId);
  // "내려놓으면 될 것"처럼 들리지 않게, 왜 안 되는지와 어디서 쓰는지를 말한다.
  assert.ok(refused.refusal?.message.includes("버섯"));
  assert.ok(!refused.refusal!.message.includes("내려놓아야"));
  assert.ok(refused.refusal!.message.includes("튀김기"));

  // 손에 그릇만 든 채 도마를 쓰려는 것은 그대로 "내려놓으라"가 맞다.
  let dish = initialState(1, ["earth"]);
  dish = actAt(dish, "earth-1", potatoBoxId);
  dish = actAt(dish, "earth-1", stoveId);
  dish = actAt(dish, "earth-1", dishRackId);
  const busy = actAt(dish, "earth-1", stoveId);
  assert.ok(busy.refusal?.message.includes("내려놓아야"));
});

test("믹서기는 과일 → 물 → 가동 순서로만 스무디를 만든다", () => {
  const bananaBoxId = stationInstancesByType["banana-box"][0].id;
  const blenderId = stationInstancesByType.blender[0].id;
  let state = initialState(1, ["water", "lightning"], oneStage([
    { id: "a", foodId: "banana-smoothie", targetCount: 1, submittedCount: 0 },
  ]));

  // 물을 먼저 채울 수는 없다.
  const early = actAt(state, "water-1", blenderId);
  assert.ok(early.refusal?.message.includes("넣을 과일이 없습니다"));
  assert.equal(early.blenders[blenderId]!.water, false);

  // 과일 넣기는 누구나 하고, 한 번에 끝난다.
  state = actAt(state, "lightning-1", bananaBoxId);
  state = actAt(state, "lightning-1", blenderId);
  assert.equal(state.blenders[blenderId]!.fruit, "banana");
  assert.equal(blenderStage(state.blenders[blenderId]!), "needs-water");
  assert.deepEqual(state.actors["lightning-1"]!.carrying, []);

  // 넣은 과일은 뺄 수 없고, 물이 없으면 돌아가지도 않는다.
  const dry = actAt(state, "lightning-1", blenderId);
  assert.ok(dry.refusal?.message.includes("물 슬라임"));
  assert.equal(dry.blenders[blenderId]!.fruit, "banana");

  // 물 슬라임이 물을 채운다.
  state = actAt(state, "water-1", blenderId);
  assert.equal(blenderStage(state.blenders[blenderId]!), "ready");
  // 물은 채웠어도 번개가 아니면 돌릴 수 없다.
  const wrong = actAt(state, "water-1", blenderId);
  assert.ok(wrong.refusal?.message.includes("번개 슬라임만"));

  state = actAt(state, "lightning-1", blenderId);
  assert.equal(state.blenders[blenderId]!.food, "banana-smoothie");
  assert.equal(blenderStage(state.blenders[blenderId]!), "done");

  // 회수하면 믹서기는 다시 빈다.
  state = actAt(state, "lightning-1", blenderId);
  assert.deepEqual(state.actors["lightning-1"]!.carrying, ["banana-smoothie"]);
  assert.deepEqual(state.blenders[blenderId], { fruit: null, water: false, food: null });
});

test("기구를 돌릴 수 있는 속성은 여럿일 수 있다", () => {
  // 목록에 든 속성이면 누구나 돌린다. 밸런스 파일에서 늘리고 줄인다.
  assert.ok(recipes["shredded-potato"]!.workers.length >= 1);
  assert.ok(Array.isArray(stationElements.wash) && stationElements.wash.length >= 1);
  assert.ok(Array.isArray(stationElements.burn) && stationElements.burn.length >= 1);

  const stoveWorkers = recipes["shredded-potato"]!.workers;
  for (const element of allElements) {
    let state = initialState(1, [element]);
    state = actAt(state, `${element}-1`, potatoBoxId);
    state = actAt(state, `${element}-1`, stoveId);
    const after = actAt(state, `${element}-1`, stoveId);
    if (stoveWorkers.includes(element)) {
      assert.deepEqual(after.stoves[stoveId], ["shredded-potato"], `${element}는 썰 수 있어야 한다`);
    } else {
      assert.ok(after.refusal?.message.includes("슬라임만"), `${element}는 거절당해야 한다`);
      // 거절 문구는 목록에 든 속성을 모두 알려 준다.
      for (const allowed of stoveWorkers) {
        assert.ok(after.refusal!.message.includes(slimeTypes[allowed].name));
      }
    }
  }
});

test("도마와 믹서기는 서로의 재료를 받지 않는다", () => {
  const bananaBoxId = stationInstancesByType["banana-box"][0].id;
  const blenderId = stationInstancesByType.blender[0].id;
  let state = initialState(1, ["lightning"]);

  // 도마에 바나나는 올라가지 않는다.
  state = actAt(state, "lightning-1", bananaBoxId);
  const onBoard = actAt(state, "lightning-1", stoveId);
  assert.deepEqual(onBoard.stoves[stoveId], []);
  assert.deepEqual(onBoard.actors["lightning-1"]!.carrying, ["banana"]);

  // 믹서기에 감자는 들어가지 않는다.
  let potato = initialState(1, ["lightning"]);
  potato = actAt(potato, "lightning-1", potatoBoxId);
  const inBlender = actAt(potato, "lightning-1", blenderId);
  assert.equal(inBlender.blenders[blenderId]!.fruit, null);
  assert.deepEqual(inBlender.actors["lightning-1"]!.carrying, ["potato"]);
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

test("도마는 땅 슬라임만 쓰고 한 턴에 끝난다", () => {
  assert.equal(actionCost.chop, 1);
  let state = initialState(1, ["earth", "water"], oneStage([
    { id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
  ]));
  state = actAt(state, "earth-1", "potato-box");
  state = actAt(state, "earth-1", stoveId);
  assert.deepEqual(state.stoves[stoveId], ["potato"]);

  // 물 슬라임은 도마를 쓸 수 없다. 행동력도 줄지 않는다.
  const wrong = actAt(state, "water-1", stoveId);
  assert.equal(wrong.workstations[stoveId]!.progress, 0);
  assert.ok(wrong.refusal?.message.includes("땅 슬라임만"));

  // 땅 슬라임은 행동력 1로 한 번에 끝낸다.
  state = actAt(state, "earth-1", stoveId);
  assert.equal(state.workstations[stoveId]!.status, "COMPLETE");
  assert.deepEqual(state.stoves[stoveId], ["shredded-potato"]);
});

test("행동력을 다 쓰면 다음으로 넘길 슬라임을 고른다", () => {
  const roster = ["water-1", "fire-1", "lightning-1", "earth-1"];
  let state = initialState(1, ["water", "fire", "lightning", "earth"]);
  // 바로 다음 마리로 넘어간다.
  assert.equal(nextReadyActor(state, roster, "water-1"), "fire-1");
  // 마지막 마리에서는 한 바퀴 돌아 처음으로 간다.
  assert.equal(nextReadyActor(state, roster, "earth-1"), "water-1");

  // 행동력이 없는 마리는 건너뛴다.
  const spent = (id: string): GameState => ({
    ...state,
    actors: { ...state.actors, [id]: { ...state.actors[id]!, actionPoints: 0 } },
  });
  state = spent("fire-1");
  assert.equal(nextReadyActor(state, roster, "water-1"), "lightning-1");

  // 아무도 안 남으면 null이라 선택이 풀린다.
  const empty: GameState = {
    ...state,
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [
        id,
        { ...actor!, actionPoints: 0 },
      ]),
    ),
  };
  assert.equal(nextReadyActor(empty, roster, "water-1"), null);
  // 명단에 없는 슬라임은 넘길 곳이 없다.
  assert.equal(nextReadyActor(state, roster, "water-9"), null);
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
  const ok = actAt(emptyTable, "water-1", "potato-box");
  assert.equal(ok.refusal, null);
  assert.deepEqual(ok.actors["water-1"]!.carrying, ["potato"]);
});

test("재료 상자는 턴마다 한 개씩 최대치까지 채운다", () => {
  let state = initialState(1, ["water"]);
  const start = state.ingredients[potatoBoxId]!.stock;
  state = endTurn(state);
  assert.equal(
    state.ingredients[potatoBoxId]!.stock,
    start + INGREDIENT_PER_TURN,
  );
  for (let count = 0; count < 10; count += 1) state = endTurn(state);
  assert.equal(state.ingredients[potatoBoxId]!.stock, INGREDIENT_MAX);
});

test("같은 종류 설비는 좌표 ID별로 내용물을 따로 보관한다", () => {
  let state = initialState(1, ["lightning"]);
  state = actAt(state, "lightning-1", dishRackId);
  state = actAt(state, "lightning-1", tableId);
  assert.equal(state.tables[tableId]!.length, 1);
  assert.equal(state.tables[secondTableId]!.length, 0);

  state = actAt(state, "lightning-1", potatoBoxId);
  state = actAt(state, "lightning-1", secondTableId);
  assert.equal(state.tables[tableId]!.length, 1);
  assert.deepEqual(state.tables[secondTableId], ["potato"]);
});

// 명세 11.3: 어느 쪽을 먼저 놓든 음식이 담긴 그릇이 테이블 위에 남는다.
test("테이블의 감자와 빈 접시는 순서와 무관하게 테이블 위에서 합쳐진다", () => {
  let foodFirst = initialState(1, ["lightning"]);
  foodFirst = actAt(foodFirst, "lightning-1", potatoBoxId);
  foodFirst = actAt(foodFirst, "lightning-1", tableId);
  foodFirst = actAt(foodFirst, "lightning-1", dishRackId);
  foodFirst = actAt(foodFirst, "lightning-1", tableId);
  assert.deepEqual(foodFirst.actors["lightning-1"]!.carrying, []);
  const left = foodFirst.tables[tableId]![0];
  assert.ok(isDish(left) && left.status === "filled" && left.content === "potato");

  let dishFirst = initialState(1, ["lightning"]);
  dishFirst = actAt(dishFirst, "lightning-1", dishRackId);
  dishFirst = actAt(dishFirst, "lightning-1", tableId);
  dishFirst = actAt(dishFirst, "lightning-1", potatoBoxId);
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
      { id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
      { id: "b", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
    ], 400, 2)),
  );
  assert.equal(state.filled, 1);
  assert.equal(state.gold, 100);
  // 제출한 그릇은 손을 떠나 다음 턴 반납대로 나온다.
  assert.deepEqual(state.actors["earth-1"]!.carrying, []);
  assert.equal(state.pendingReturns.length, 1);
  const returned = endTurn(state);
  const bin = stationInstancesByType["dish-return"][0].id;
  assert.equal(returned.dishReturns[bin]!.length, 1);
  assert.equal(returned.dishReturns[bin]![0].status, "dirty");
  assert.deepEqual(returned.pendingReturns, []);
});

test("빈 접시 없이 음식은 꺼내도 제출은 접시에 담아야 한다", () => {
  let state = initialState(1, ["earth"]);
  state = actAt(state, "earth-1", "potato-box");
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  state = actAt(state, "earth-1", stoveId);
  assert.deepEqual(state.actors["earth-1"]!.carrying, ["shredded-potato"]);

  // 낱개 음식은 제출대에서 거절한다.
  const bare = actAt(state, "earth-1", "submission");
  assert.deepEqual(bare.actors["earth-1"]!.carrying, ["shredded-potato"]);
  assert.equal(bare.orders[0].submittedCount, 0);
  assert.ok(bare.refusal?.message.includes("접시에 담긴"));

  // 그릇 생성대에서 담으면 제출할 수 있다.
  state = actAt(state, "earth-1", dishRackId);
  state = actAt(state, "earth-1", "submission");
  assert.equal(state.orders[0].submittedCount, 1);
  assert.deepEqual(state.actors["earth-1"]!.carrying, []);
});

test("음식을 들고 그릇 생성대에 가면 접시에 담는다", () => {
  let state = initialState(1, ["water"]);
  state = actAt(state, "water-1", potatoBoxId);
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
  // 상자는 턴마다 하나씩만 차므로 오가며 여러 턴을 쓴다. 제한 턴이 넉넉한
  // 테스트 스테이지로 채운다.
  let state = initialState(1, ["fire", "lightning"], oneStage([
    { id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
  ]));
  for (
    let guard = 0;
    guard < 40 && state.incinerators[incineratorId]!.count < incineratorConfig.capacity;
    guard += 1
  ) {
    state = actAt(state, "lightning-1", potatoBoxId);
    state = actAt(state, "lightning-1", incineratorId);
    state = endTurn(state);
  }
  assert.equal(state.incinerators[incineratorId]!.count, incineratorConfig.capacity);

  // 가득 찬 소각기
  let full = actAt(state, "lightning-1", potatoBoxId);
  full = actAt(full, "lightning-1", incineratorId);
  assert.ok(full.refusal?.message.includes("가득 찼습니다"));

  // 가득 찬 소각기 앞에서는 물건을 든 불 슬라임도 소각부터 한다.
  let busy = actAt(state, "fire-1", potatoBoxId);
  assert.deepEqual(busy.actors["fire-1"]!.carrying, ["potato"]);
  busy = actAt(busy, "fire-1", incineratorId);
  assert.equal(busy.incinerators[incineratorId]!.count, 0);
  // 손에 든 물건은 그대로 남고, 비워진 뒤에는 다시 넣을 수 있다.
  assert.deepEqual(busy.actors["fire-1"]!.carrying, ["potato"]);
  busy = actAt(busy, "fire-1", incineratorId);
  assert.equal(busy.incinerators[incineratorId]!.count, 1);

  // 비운 뒤 다시 비우려 할 때
  let emptied = actAt(state, "fire-1", incineratorId);
  assert.equal(emptied.incinerators[incineratorId]!.count, 0);
  emptied = actAt(emptied, "fire-1", incineratorId);
  assert.ok(emptied.refusal?.message.includes("소각할 쓰레기가 없습니다"));
});

test("소각은 한 턴에 끝나고 불 슬라임만 할 수 있다", () => {
  let state = initialState(1, ["lightning", "fire"]);
  state = actAt(state, "lightning-1", potatoBoxId);
  state = actAt(state, "lightning-1", incineratorId);
  assert.equal(state.incinerators[incineratorId]!.count, 1);

  // 전기는 소각을 못 한다.
  const wrong = actAt(state, "lightning-1", incineratorId);
  assert.ok(wrong.refusal?.message.includes("불 슬라임만"));

  // 불 슬라임은 한 번에 비운다.
  assert.equal(actionCost.burn, 1);
  state = actAt(state, "fire-1", incineratorId);
  assert.equal(state.incinerators[incineratorId]!.count, 0);
});

test("세척은 물 슬라임만 하고 넣기는 누구나 한다", () => {
  let state = cookAndSubmit(
    initialState(1, ["earth", "water"], oneStage([
      { id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
      { id: "b", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
    ], 400, 2)),
  );
  // 제출한 그릇은 반납대에서 집어 온다.
  state = endTurn(state);
  state = actAt(state, "earth-1", "dish-return");
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.status === "dirty",
  ));
  // 더러운 그릇 넣기는 땅 슬라임도 할 수 있다.
  state = actAt(state, "earth-1", washerId);
  assert.equal(state.washers[washerId]!.dish?.status, "dirty");
  assert.deepEqual(state.actors["earth-1"]!.carrying, []);

  // 땅 슬라임은 세척을 못 한다.
  const wrong = actAt(state, "earth-1", washerId);
  assert.ok(wrong.refusal?.message.includes("물 슬라임만"));

  // 물 슬라임이 한 턴에 씻는다.
  assert.equal(actionCost.wash, 1);
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
  const moved = actAt(state, "water-2", "potato-box");
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
    "water:potato-box",
    "water-2:carrot-box",
  ]);
  assert.deepEqual(run.final.actors["water-1"]!.carrying, ["potato"]);
  assert.deepEqual(run.final.actors["water-2"]!.carrying, ["carrot"]);
  assert.throws(() => simulate(["--slimes=water", "earth:stove"]));
  assert.throws(() => simulate(["--slimes=water", "TURN:0"]));
});

test("같은 seed와 입력은 같은 식당 상태를 만든다", () => {
  const play = () => {
    let state = initialState(91, ["lightning"]);
    state = actAt(state, "lightning-1", "potato-box");
    return actAt(state, "lightning-1", "trash");
  };
  assert.deepEqual(play(), play());
});

test("CLI는 식당 상호작용을 결정론적으로 재현한다", () => {
  const args = [
    "--seed=7",
    "--slimes=earth",
    "earth:potato-box",
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
    { id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
    { id: "b", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
  ], 400, 2));
  state = actAt(state, "earth-1", dishRackId);
  const id = (state.actors["earth-1"]!.carrying[0] as { id: string }).id;
  state = actAt(state, "earth-1", potatoBoxId);
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
  assert.equal(state.workstations[stoveId]!.status, "COMPLETE");
  state = actAt(state, "earth-1", tableId);
  state = actAt(state, "earth-1", stoveId);
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.id === id && carried.content === "shredded-potato",
  ));
  state = actAt(state, "earth-1", "submission");
  assert.equal(state.filled, 1);
  // 제출한 그릇은 손을 떠나 한 턴 뒤 반납대에 더러운 채로 나온다.
  assert.equal(state.actors["earth-1"]!.carrying.length, 0);
  assert.deepEqual(state.pendingReturns.map((dish) => dish.id), [id]);
  state = endTurn(state);
  state = actAt(state, "earth-1", "dish-return");
  assert.ok(state.actors["earth-1"]!.carrying.some(
    (carried) => isDish(carried) && carried.id === id && carried.status === "dirty",
  ));
  state = actAt(state, "earth-1", washerId);
  // 세척도 한 턴이라 물 슬라임이 한 번 쓰면 끝난다.
  state = actAt(state, "water-1", washerId);
  assert.equal(state.washers[washerId]!.dish?.id, id);
  assert.equal(state.washers[washerId]!.dish?.status, "clean");
});

test("라운드 주문 목록을 주입하고 제출마다 진행도가 오른다", () => {
  const orders: Order[] = [
    { id: "a", foodId: "shredded-potato", targetCount: 2, submittedCount: 0 },
    { id: "b", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
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
    foodId: "shredded-potato" as const,
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
  state = actAt(state, "lightning-1", potatoBoxId);
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
    // 처분한 그릇도 손을 떠나 다음 턴 반납대로 간다.
    assert.deepEqual(discarded.actors["lightning-1"]!.carrying, []);
    assert.equal(discarded.pendingReturns.length, 1);
    assert.equal(discarded.orders[0].submittedCount, 0);
    assert.equal(discarded.filled, 0);
  } finally {
    orderConfig.invalidSubmission = saved;
  }
});

test("스테이지가 정한 세 지점에서 별이 하나씩 오른다", () => {
  const orders: Order[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id,
    foodId: "shredded-potato" as const,
    targetCount: 1,
    submittedCount: 0,
  }));
  // 통과 2건, 별 2개는 4건, 별 3개는 5건인 스테이지.
  const stage: Stage[] = [
    { id: "s", name: "별", orders, turnLimit: 400, stars: [2, 4, 5] },
  ];
  const base = initialState(1, ["earth"], stage);
  assert.equal(base.goal, 2);
  const at = (filled: number): GameState => ({ ...base, filled });

  assert.equal(roundResult(at(1)), "lost");
  assert.equal(stageRank(at(1)), 0);
  // 통과 지점이 곧 별 1개다.
  assert.equal(roundResult(at(2)), "won");
  assert.equal(stageRank(at(2)), 1);
  assert.equal(stageRank(at(3)), 1);
  assert.equal(stageRank(at(4)), 2);
  assert.equal(stageRank(at(5)), 3);
  assert.equal(stageRank(at(6)), 3);

  // 통과 기준은 주문 수보다 많을 수 없고, 별 기준은 오름차순이어야 한다.
  assert.throws(() => initialState(1, ["water"], oneStage(orders, 400, 7)));
  assert.throws(() => initialState(1, ["water"], oneStage(orders, 0, 2)));
  assert.throws(() =>
    initialState(1, ["water"], [{ ...stage[0]!, stars: [3, 3, 4] }]),
  );
  assert.throws(() =>
    initialState(1, ["water"], [{ ...stage[0]!, stars: [2, 4] }]),
  );
});

test("턴을 다 쓰면 스테이지가 판정으로 끝난다", () => {
  let state = initialState(1, ["water"], oneStage(
    [{ id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 }],
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
  assert.equal(moveActor(state, "water-1", moveTargets(state, "water-1")[0] ?? spawnTiles.water), state);
});

test("스테이지를 깨면 골드와 스쿼드를 이어 다음 스테이지로 넘어간다", () => {
  const stages: Stage[] = [
    {
      id: "1-1",
      name: "첫 판",
      orders: [{ id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 }],
      turnLimit: 400,
      stars: [1, 2, 3],
    },
    {
      id: "1-2",
      name: "둘째 판",
      orders: [{ id: "b", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 }],
      turnLimit: 120,
      stars: [1, 2, 3],
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
    { id: "a", foodId: "shredded-potato", targetCount: 1, submittedCount: 0 },
  ]));
  assert.equal(state.misses, 0);
  state = actAt(state, "earth-1", dishRackId);
  state = actAt(state, "earth-1", potatoBoxId);
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
