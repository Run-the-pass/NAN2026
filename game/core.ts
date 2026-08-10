import kitchenMap from "./map-data.js";
import balanceData from "./balance.json" with { type: "json" };
import recipeData from "./recipes.json" with { type: "json" };
import stageData from "./stages.json" with { type: "json" };

export type SlimeElement = "water" | "fire" | "lightning" | "earth";
export type SlimeTypeId = SlimeElement;
// 슬라임 한 마리의 인스턴스 ID(`water-1`, `water-2`). 같은 속성을 여러
// 마리 데려올 수 있으므로 속성 자체를 키로 쓰지 않는다. 속성은
// ActorState.typeId에서 읽는다.
export type ActorId = string;
export type ItemId =
  | "potato"
  | "shredded-potato"
  | "carrot"
  | "shredded-carrot"
  | "cabbage"
  | "shredded-cabbage"
  | "banana"
  | "strawberry"
  | "mushroom"
  | "banana-smoothie"
  | "strawberry-smoothie"
  | "fried-potato"
  | "fried-mushroom"
  | "grilled-mushroom"
  | "roasted-potato"
  | "salad";
export type DishStatus = "clean" | "filled" | "dirty";
export type Dish = { id: string; status: DishStatus; content: ItemId | null };
export type Carried = ItemId | Dish;
export type StationId =
  | "potato-box"
  | "carrot-box"
  | "cabbage-box"
  | "banana-box"
  | "strawberry-box"
  | "mushroom-box"
  | "stove"
  | "oven"
  | "fryer"
  | "blender"
  | "submission"
  | "trash"
  | "dish-rack"
  | "dish-return"
  | "washer"
  | "table";
export type StationInstanceId = `${StationId}@${number},${number}`;
export type StationInstance = {
  id: StationInstanceId;
  type: StationId;
  // 이 기구가 차지한 칸. 위→아래, 왼쪽→오른쪽 순서다.
  tiles: TilePosition[];
};
// 마지막 행동. 화면이 어떤 모션을 재생할지 고르는 데만 쓴다.
export type ActorStatus = "IDLE" | "MOVING" | "WORKING" | "CARRYING";
export type WorkstationStatus =
  | "IDLE"
  | "MISSING_MATERIAL"
  | "WORKING"
  | "COMPLETE";
export type TilePosition = { col: number; row: number };
export type Position = { x: number; y: number };

export const itemLabels: Record<ItemId, string> = {
  potato: "감자",
  "shredded-potato": "채썬 감자",
  carrot: "당근",
  "shredded-carrot": "채썬 당근",
  cabbage: "양배추",
  "shredded-cabbage": "채썬 양배추",
  banana: "바나나",
  strawberry: "딸기",
  mushroom: "버섯",
  "banana-smoothie": "바나나 스무디",
  "strawberry-smoothie": "딸기 스무디",
  "fried-potato": "감자 튀김",
  "fried-mushroom": "버섯 튀김",
  "grilled-mushroom": "버섯 구이",
  "roasted-potato": "구운 감자",
  salad: "샐러드",
};

export const itemLabel = (item: ItemId) => itemLabels[item];

export const isDish = (carried: Carried): carried is Dish =>
  typeof carried !== "string";

export const carriedLabel = (carried: Carried) => {
  if (!isDish(carried)) return itemLabel(carried);
  if (carried.status === "dirty") return "더러운 그릇";
  if (carried.content) return `${itemLabel(carried.content)} 그릇`;
  return "빈 그릇";
};

export function withParticle(word: string, pair: [string, string] = ["을", "를"]) {
  const code = word.charCodeAt(word.length - 1);
  const hasFinal =
    code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${word}${hasFinal ? pair[0] : pair[1]}`;
}

export const stationLabels: Record<StationId, string> = {
  "potato-box": "감자 상자",
  "carrot-box": "당근 상자",
  "cabbage-box": "양배추 상자",
  "banana-box": "바나나 상자",
  "strawberry-box": "딸기 상자",
  "mushroom-box": "버섯 상자",
  stove: "도마",
  oven: "화로",
  fryer: "튀김기",
  blender: "믹서기",
  submission: "음식 제출대",
  trash: "소각기",
  "dish-rack": "그릇 상자",
  "dish-return": "그릇 반납대",
  washer: "세척대",
  table: "테이블",
};

export const allItems: ItemId[] = [
  "potato",
  "shredded-potato",
  "carrot",
  "shredded-carrot",
  "cabbage",
  "shredded-cabbage",
  "banana",
  "strawberry",
  "mushroom",
  "banana-smoothie",
  "strawberry-smoothie",
  "fried-potato",
  "fried-mushroom",
  "grilled-mushroom",
  "roasted-potato",
  "salad",
];
export const allElements: SlimeElement[] = ["water", "fire", "lightning", "earth"];
export const allStations: StationId[] = [
  "potato-box",
  "carrot-box",
  "cabbage-box",
  "banana-box",
  "strawberry-box",
  "mushroom-box",
  "stove",
  "oven",
  "fryer",
  "blender",
  "submission",
  "trash",
  "dish-rack",
  "dish-return",
  "washer",
  "table",
];

// 재료 상자마다 꺼내는 재료. 여기 없는 설비는 재료를 주지 않는다.
export const boxItems = {
  "potato-box": "potato",
  "carrot-box": "carrot",
  "cabbage-box": "cabbage",
  "banana-box": "banana",
  "strawberry-box": "strawberry",
  "mushroom-box": "mushroom",
} as const satisfies Partial<Record<StationId, ItemId>>;

export const isBoxStation = (type: StationId): type is keyof typeof boxItems =>
  type in boxItems;

// 한 기구가 차지하는 타일 수. 여기 없는 기구는 한 칸이다.
export const stationTileCount: Partial<Record<StationId, number>> = {
  washer: 2,
  submission: 2,
};

export const tilesFor = (type: StationId) => stationTileCount[type] ?? 1;

// 재료를 하나 올려 두고 조리하는 기구. 도마·화로·튀김기가 같은 규칙으로
// 돈다. 레시피가 무엇을 어디서 만드는지 정한다.
export const cooktopStations: StationId[] = ["stove", "oven", "fryer"];

export const isCooktop = (type: StationId) => cooktopStations.includes(type);

export type Recipe = {
  foodId: ItemId;
  ingredients: { itemId: ItemId; count: number }[];
  station: StationId;
  // 조리를 시작할 수 있는 속성. 여럿일 수 있고, 그중 아무나 돌리면 된다.
  // 재료를 올리고 완성품을 가져가는 것은 누구나 할 수 있다.
  workers: SlimeElement[];
  requiresCleanDish: boolean;
  submissionStation: StationId;
};

// 밸런스 원본은 game/balance.json이다. 손으로 고치는 파일이라 코어에
// 들이기 전에 한 번 검증한다. 어긋난 값으로 조용히 도는 것보다 시작할 때
// 멈추는 편이 낫다.
function checkBalance() {
  const whole = (value: unknown, min = 0) =>
    Number.isSafeInteger(value) && (value as number) >= min;
  const problems: string[] = [];
  for (const element of allElements) {
    if (!whole(balanceData.actionPointsPerTurn[element], 1)) {
      problems.push(`${element} 행동력은 1 이상 정수여야 합니다.`);
    }
  }
  for (const [name, cost] of Object.entries(balanceData.actionCost)) {
    if (!whole(cost, 1)) problems.push(`${name} 비용은 1 이상 정수여야 합니다.`);
  }
  for (const [job, list] of Object.entries(balanceData.stationElements)) {
    if (
      !Array.isArray(list) ||
      list.length < 1 ||
      list.some((one) => !allElements.includes(one as SlimeElement))
    ) {
      problems.push(`${job}을(를) 맡을 속성이 올바르지 않습니다.`);
    }
  }
  if (!whole(balanceData.ingredients.max, 1) || !whole(balanceData.ingredients.perTurn, 1)) {
    problems.push("재료 상자 수치는 1 이상 정수여야 합니다.");
  }
  const dish = balanceData.dish;
  if (
    !whole(dish.rackCapacity, 1) ||
    !whole(dish.initialCount, 0) ||
    dish.initialCount > dish.rackCapacity ||
    !whole(dish.washerCapacity, 1) ||
    !whole(dish.returnCapacity, 1) ||
        !whole(dish.tableCapacity, 1)
  ) {
    problems.push("그릇 수치가 올바르지 않습니다. 초기 개수는 보관함 용량 이하여야 합니다.");
  }
  if (!whole(balanceData.incinerator.capacity, 1)) {
    problems.push("소각기 용량은 1 이상 정수여야 합니다.");
  }
  const orders = balanceData.orders;
  if (
    !whole(orders.activeOrderCount, 1) ||
    !["reject", "discard"].includes(orders.invalidSubmission) ||
    typeof orders.endRoundWhenOrdersDone !== "boolean"
  ) {
    problems.push("주문 설정이 올바르지 않습니다.");
  }
  if (!whole(balanceData.rushTurnsLeft, 0)) {
    problems.push("마감 임박 턴은 0 이상 정수여야 합니다.");
  }
  if (problems.length) throw new Error(`balance.json: ${problems.join(" ")}`);
}

checkBalance();

// 레시피 원본은 game/recipes.json이다. 밸런스는 코드가 아니라 그 파일에서
// 만진다. 손으로 고치는 파일이라 코어에 들이기 전에 한 번 검증한다.
function readRecipes(): Partial<Record<ItemId, Recipe>> {
  const table: Partial<Record<ItemId, Recipe>> = {};
  // 한 기구 안에서 같은 재료가 두 결과를 내면 어느 쪽인지 정할 수 없다.
  const perStation = new Set<string>();
  for (const row of recipeData.recipes) {
    const { foodId, ingredient, station, workers, servedInDish } = row as {
      foodId: ItemId;
      ingredient: ItemId | ItemId[];
      station: StationId;
      workers: SlimeElement[];
      servedInDish?: boolean;
    };
    const ingredients = (Array.isArray(ingredient) ? ingredient : [ingredient]) as ItemId[];
    if (
      !allItems.includes(foodId) ||
      ingredients.length < 1 ||
      ingredients.some((item) => !allItems.includes(item)) ||
      !allStations.includes(station) ||
      !Array.isArray(workers) ||
      workers.length < 1 ||
      workers.some((one) => !allElements.includes(one)) ||
      table[foodId] ||
      perStation.has(`${station}/${ingredients.join("+")}`)
    ) {
      throw new Error(`recipes.json의 레시피가 올바르지 않습니다: ${row.foodId}`);
    }
    perStation.add(`${station}/${ingredients.join("+")}`);
    table[foodId] = {
      foodId,
      ingredients: ingredients.map((itemId) => ({ itemId, count: 1 })),
      station,
      workers: [...workers],
      // 적지 않으면 그릇에 담아 낸다. 스무디처럼 컵째 나가는 것만 false다.
      requiresCleanDish: servedInDish !== false,
      submissionStation: "submission",
    };
  }
  if (Object.keys(table).length < 1) throw new Error("recipes.json에 레시피가 없습니다.");
  return table;
}

export const recipes = readRecipes();

export const allRecipes = Object.values(recipes) as Recipe[];

// 이 재료로 이 기구에서 만들 수 있는 레시피. 도마에 과일을 올릴 수 없고
// 믹서기에 감자를 넣을 수 없는 것이 여기서 갈린다.
export const recipeAt = (station: StationId, item: ItemId) =>
  allRecipes.find(
    (recipe) => recipe.station === station &&
      recipe.ingredients.length === 1 &&
      recipe.ingredients[0]!.itemId === item,
  ) ?? null;

// 그릇 없이 그대로 내는 음식인지. 스무디는 컵째 나간다.
export const servedBare = (item: ItemId) =>
  allRecipes.some((recipe) => recipe.foodId === item && !recipe.requiresCleanDish);

// 완성 음식인지. 도마에서 회수할 수 있는 것은 이것뿐이다.
export const isCookedFood = (item: ItemId) =>
  allRecipes.some((recipe) => recipe.foodId === item);

export const slimeTypes: Record<
  SlimeTypeId,
  {
    name: string;
    trait: string;
    // 정보 패널의 "특징". 이름과, 마우스를 올렸을 때 보여 줄 설명이다.
    traits: { id: string; name: string; detail: string }[];
    element: SlimeElement;
    elementLabel: string;
  }
> = {
  water: {
    name: "퐁당이",
    trait: "물을 공급하고 설거지를 담당합니다.",
    traits: [
      { id: "water-supply", name: "물 공급", detail: "믹서기에 물을 채웁니다. 과일을 넣은 뒤에만 채울 수 있습니다." },
      { id: "wash", name: "설거지", detail: "세척대에 든 더러운 그릇을 한 번에 씻습니다." },
    ],
    element: "water",
    elementLabel: "물",
  },
  fire: {
    name: "이글이",
    trait: "열을 다뤄 굽고 튀기고 태웁니다.",
    traits: [
      { id: "cook-heat", name: "가열 조리", detail: "화로와 튀김기를 돌려 굽거나 튀깁니다." },
      { id: "burn", name: "소각", detail: "가득 찬 소각기를 한 번에 비웁니다." },
    ],
    element: "fire",
    elementLabel: "불",
  },
  lightning: {
    name: "번쩍이",
    trait: "턴마다 두 번 움직여 재료와 음식을 빠르게 나릅니다.",
    traits: [
      { id: "double-move", name: "두 번 행동", detail: "턴마다 행동력이 2입니다. 다른 슬라임은 1입니다." },
      { id: "power", name: "발전", detail: "믹서기를 돌려 스무디를 만듭니다." },
    ],
    element: "lightning",
    elementLabel: "번개",
  },
  earth: {
    name: "푸름이",
    trait: "재료를 도마에서 손질합니다.",
    traits: [
      { id: "chop", name: "손질", detail: "도마에서 감자·당근·양배추를 채썹니다." },
    ],
    element: "earth",
    elementLabel: "땅",
  },
};

// 턴당 행동력. 전기(번개)만 2고 나머지는 1이다.
export const actionPointsPerTurn: Record<SlimeTypeId, number> =
  balanceData.actionPointsPerTurn;

export const maxActionPoints = (typeId: SlimeTypeId) =>
  actionPointsPerTurn[typeId];

// 행동별 행동력. 값은 balance.json에서 조절한다.
export const actionCost = balanceData.actionCost;

// 레시피와 무관하게 설비가 고정으로 요구하는 속성. 썰기는 레시피마다
// 다를 수 있어 `Recipe.worker`가 정한다. 여기 없는 기구는 모든
// 슬라임이 쓰고, 물건을 집고 놓는 것은 "물건" 분류라 제한을 받지 않는다.
export const stationElements = balanceData.stationElements as {
  wash: SlimeElement[];
  burn: SlimeElement[];
};

// 작업할 수 있는 슬라임 이름을 "퐁당이·번쩍이"처럼 붙인다.
export const elementNames = (list: SlimeElement[]) =>
  list.map((one) => slimeTypes[one].name).join("·");

// 아직 확정되지 않은 주문 규칙은 여기서만 바꾼다.
export const orderConfig = balanceData.orders as {
  // 동시에 노출하는 주문 수.
  activeOrderCount: number;
  // 주문에 없는 음식 처리. reject는 거부하고 음식을 그대로 들려 둔다.
  invalidSubmission: "reject" | "discard";
  // 레시피 목록을 다 처리했을 때 스테이지를 바로 끝낼지.
  endRoundWhenOrdersDone: boolean;
};

// 현재 주문 뒤에 미리 보여 주는 다음 레시피 수. 밸런스 값이 아니라 카드
// 자리가 정해진 화면 규칙이라 고정이다.
export const PREVIEW_COUNT = 1;

// 통과 기준 대비 추가 처리 수별 별 개수. 0개 추가면 별 1개다.

// 화재는 후순위다. 상태와 설정만 남기고 발화·전파는 넣지 않는다.
// ponytail: 턴 기반 발화 규칙이 정해지면 여기 값을 턴 단위로 바꾸고
// endTurn에 진행 단계를 붙인다. 지금은 어떤 설비에도 불이 붙지 않는다.
export const fireConfig = {
  flammableStations: ["stove"] as StationId[],
  extinguishElement: "water" as SlimeElement,
};

// 원문에서 수치가 미정인 항목은 플레이 검증값으로 한곳에 둔다.
export const dishConfig = balanceData.dish;

export const incineratorConfig = balanceData.incinerator;

export type Order = {
  id: string;
  foodId: ItemId;
  targetCount: number;
  submittedCount: number;
};

// 스테이지 한 판. 스테이지를 늘릴 때 코드가 아니라 stages.json만 바꾼다.
// orders는 적힌 순서대로 나오는 주문이고, stars는 [통과·별2·별3] 기준으로
// 처리한 주문 수다. 오름차순이며 첫 값이 통과 기준이다.
export type Stage = {
  id: string;
  orders: Order[];
  turnLimit: number;
  stars: number[];
};

// 통과에 필요한 주문 수. 별 하나를 받는 지점과 같다.
export const passMark = (stage: Stage) => stage.stars[0];

export type FireState = { onFire: boolean };

// 믹서기 한 대. fruit → water → food 순서로만 진행하고 되돌릴 수 없다.
export type BlenderState = {
  fruit: ItemId | null;
  water: boolean;
  food: ItemId | null;
};

// 화면이 믹서기 그림과 안내 아이콘을 고르는 데 쓴다.
export type BlenderStage = "empty" | "needs-water" | "ready" | "done";

export const blenderStage = (blender: BlenderState): BlenderStage =>
  blender.food ? "done" : !blender.fruit ? "empty" : blender.water ? "ready" : "needs-water";

export type ActorState = {
  typeId: SlimeTypeId;
  name: string;
  col: number;
  row: number;
  facing: "down" | "up" | "left" | "right";
  actionPoints: number;
  status: ActorStatus;
  // 이 슬라임이 지금까지 한 행동 수. 화면이 모션을 한 번씩 재생하는 데 쓴다.
  acts: number;
  carrying: Carried[];
};

// 행동력을 쓰지 않고 거절된 이유. 화면은 seq가 바뀔 때 토스트를 띄운다.
export type Refusal = { seq: number; message: string };

export type GameState = {
  seed: number;
  mode: "shift" | "endless";
  phase: "playing" | "won" | "lost";
  turn: number;
  turnsLeft: number;
  filled: number;
  goal: number;
  actors: Partial<Record<ActorId, ActorState>>;
  ingredients: Partial<Record<StationInstanceId, { stock: number }>>;
  stoves: Partial<Record<StationInstanceId, ItemId[]>>;
  // 믹서기. 과일을 넣고(뺄 수 없다) 물을 채운 뒤 번개가 돌린다.
  blenders: Partial<Record<StationInstanceId, BlenderState>>;
  dishRacks: Partial<Record<StationInstanceId, Dish[]>>;
  // 반납대에 놓인 더러운 그릇과, 이번 턴에 제출돼 다음 턴에 나올 그릇.
  dishReturns: Partial<Record<StationInstanceId, Dish[]>>;
  pendingReturns: Dish[];
  tables: Partial<Record<StationInstanceId, Carried[]>>;
  incinerators: Partial<Record<StationInstanceId, { count: number; progress: number }>>;
  // 세척대. dishConfig.washerCapacity만큼 그릇이 들어가고, progress는 맨 앞
  // 더러운 그릇 하나에만 붙는다.
  washers: Partial<Record<StationInstanceId, { dishes: Dish[]; progress: number }>>;
  workstations: Partial<Record<StationInstanceId, {
    status: WorkstationStatus;
    progress: number;
  }>>;
  orders: Order[];
  fires: Partial<Record<StationInstanceId, FireState>>;
  // 이번 판의 스테이지 목록과 지금 진행 중인 위치.
  stages: Stage[];
  stageIndex: number;
  squad: SlimeTypeId[];
  refusal: Refusal | null;
  lastEvent: string;
};

export const TILE_SIZE = 60;
export const MAP_WIDTH = 14;
export const MAP_HEIGHT = 8;
export const INGREDIENT_MAX = balanceData.ingredients.max;
// 남은 턴이 이 이하면 마감이 임박한 것으로 본다. 음악·배너가 함께 쓴다.
export const RUSH_TURNS_LEFT = balanceData.rushTurnsLeft;
export const ENDLESS_TURN_LIMIT = 80;
export const ENDLESS_ORDER_TURN_BONUS = 5;
// 턴이 끝날 때 재료 상자마다 채우는 개수.
export const INGREDIENT_PER_TURN = balanceData.ingredients.perTurn;
export const STORAGE_MAX = 1;

// I 재료 상자, C 조리 도구, S 제출대, X 쓰레기, D 그릇, W 세척기, T 테이블.
export const stationTileCodes: Record<StationId, string> = {
  "potato-box": "P",
  "carrot-box": "R",
  "cabbage-box": "A",
  "banana-box": "B",
  "strawberry-box": "Y",
  "mushroom-box": "U",
  stove: "C",
  oven: "O",
  fryer: "F",
  blender: "M",
  submission: "S",
  trash: "X",
  "dish-rack": "D",
  "dish-return": "N",
  washer: "W",
  table: "T",
};

export type KitchenMapData = {
  rows: readonly string[];
  // 슬라임이 설 자리를 속성별로 하나씩 찍는다.
  spawnTiles: Record<SlimeElement, TilePosition>;
};

// 여러 칸짜리 기구도 ID는 가장 위·왼쪽 칸 좌표로 만든다.
export const stationInstanceId = (
  type: StationId,
  { col, row }: TilePosition,
): StationInstanceId => `${type}@${col},${row}`;

export const stationType = (id: StationInstanceId): StationId =>
  id.slice(0, id.indexOf("@")) as StationId;

// 인접 칸을 보는 고정 순서. 위·왼쪽·오른쪽·아래라 같은 맵이면 늘 같은 결과다.
const neighboursOf = ({ col, row }: TilePosition): TilePosition[] => [
  { col, row: row - 1 },
  { col: col - 1, row },
  { col: col + 1, row },
  { col, row: row + 1 },
];

const sameTile = (one: TilePosition, two: TilePosition) =>
  one.col === two.col && one.row === two.row;

const tileKeyOf = ({ col, row }: TilePosition) => `${col},${row}`;

const codeToStation = new Map(
  allStations.map((type) => [stationTileCodes[type], type]),
);

// 맞닿은 같은 종류 타일은 한 대로 묶는다. 세척대·제출대가 2×1인 이유다.
export function stationInstancesForMap(data: KitchenMapData): StationInstance[] {
  const seen = new Set<string>();
  const instances: StationInstance[] = [];
  for (let row = 0; row < data.rows.length; row += 1) {
    for (let col = 0; col < (data.rows[row]?.length ?? 0); col += 1) {
      const type = codeToStation.get(data.rows[row][col]);
      const key = tileKeyOf({ col, row });
      if (!type || seen.has(key)) continue;
      // 한 칸짜리는 붙어 있어도 각각 다른 대다. 테이블 두 대를 나란히
      // 놓는 배치가 흔해서, 여러 칸 기구만 덩어리로 묶는다.
      if (tilesFor(type) === 1) {
        seen.add(key);
        instances.push({
          id: stationInstanceId(type, { col, row }),
          type,
          tiles: [{ col, row }],
        });
        continue;
      }
      // 같은 글자로 이어진 덩어리를 통째로 모은다.
      const tiles: TilePosition[] = [];
      const queue = [{ col, row }];
      seen.add(key);
      while (queue.length > 0) {
        const tile = queue.shift()!;
        tiles.push(tile);
        for (const next of neighboursOf(tile)) {
          const nextKey = tileKeyOf(next);
          if (seen.has(nextKey) || data.rows[next.row]?.[next.col] !== data.rows[row][col]) continue;
          seen.add(nextKey);
          queue.push(next);
        }
      }
      tiles.sort((one, two) => one.row - two.row || one.col - two.col);
      instances.push({ id: stationInstanceId(type, tiles[0]), type, tiles });
    }
  }
  return instances;
}

const inMap = ({ col, row }: TilePosition) =>
  Number.isInteger(col) &&
  Number.isInteger(row) &&
  col >= 0 &&
  col < MAP_WIDTH &&
  row >= 0 &&
  row < MAP_HEIGHT;

export function validateKitchenMap(data: KitchenMapData) {
  const errors: string[] = [];
  const allowed = new Set(["#", ".", ...Object.values(stationTileCodes)]);
  if (
    data.rows.length !== MAP_HEIGHT ||
    data.rows.some((row) => row.length !== MAP_WIDTH)
  ) {
    errors.push(`맵은 ${MAP_WIDTH}×${MAP_HEIGHT}여야 합니다.`);
    return errors;
  }
  if (data.rows.some((row) => [...row].some((tile) => !allowed.has(tile)))) {
    errors.push("알 수 없는 맵 타일이 있습니다.");
  }
  if (
    [...data.rows[0], ...data.rows[MAP_HEIGHT - 1]].includes(".") ||
    data.rows.slice(1, -1).some((row) => row[0] === "." || row.at(-1) === ".")
  ) {
    errors.push("맵 바깥 테두리는 조리대나 설비로 막아야 합니다.");
  }
  const instances = stationInstancesForMap(data);
  for (const type of allStations) {
    if (!instances.some((station) => station.type === type)) {
      errors.push(`${stationLabels[type]}: 한 대 이상 있어야 합니다.`);
    }
  }
  for (const station of instances) {
    const need = tilesFor(station.type);
    if (station.tiles.length !== need) {
      errors.push(
        `${stationLabels[station.type]}: ${need}칸이어야 하는데 ${station.tiles.length}칸입니다.`,
      );
      continue;
    }
    // 여러 칸짜리는 가로나 세로로 한 줄이어야 한다.
    const sameRow = station.tiles.every((tile) => tile.row === station.tiles[0].row);
    const sameCol = station.tiles.every((tile) => tile.col === station.tiles[0].col);
    if (need > 1 && !sameRow && !sameCol) {
      errors.push(`${stationLabels[station.type]}: 가로나 세로로 이어 놓아야 합니다.`);
    }
    // 어느 방향에서든 쓸 수 있어야 하므로 붙은 바닥이 하나는 있어야 한다.
    const reachable = station.tiles.some((tile) =>
      neighboursOf(tile).some((side) => data.rows[side.row]?.[side.col] === "."),
    );
    if (!reachable) {
      errors.push(`${stationLabels[station.type]}: 붙어 설 수 있는 바닥이 없습니다.`);
    }
  }
  const spawns = data.spawnTiles;
  if (!spawns || typeof spawns !== "object") {
    errors.push("슬라임 위치 정보가 없습니다.");
    return errors;
  }
  const used = new Set<string>();
  for (const element of allElements) {
    const tile = spawns[element];
    if (!tile || !inMap(tile) || data.rows[tile.row]?.[tile.col] !== ".") {
      errors.push(`${slimeTypes[element].name} 위치는 빈 바닥이어야 합니다.`);
      continue;
    }
    if (used.has(tileKeyOf(tile))) {
      errors.push(`${slimeTypes[element].name} 위치가 다른 슬라임과 겹칩니다.`);
    }
    used.add(tileKeyOf(tile));
  }
  return errors;
}

const mapData = kitchenMap as unknown as KitchenMapData;
const mapErrors = validateKitchenMap(mapData);
if (mapErrors.length) throw new Error(mapErrors.join(" "));

export const KITCHEN_ROWS = mapData.rows;
export const stationInstances = stationInstancesForMap(mapData);
export const stationsById = Object.fromEntries(
  stationInstances.map((station) => [station.id, station]),
) as Record<StationInstanceId, StationInstance>;
export const stationInstancesByType = Object.fromEntries(
  allStations.map((type) => [type, stationInstances.filter((station) => station.type === type)]),
) as Record<StationId, StationInstance[]>;
export const stationTiles = Object.fromEntries(
  stationInstances.map((station) => [station.id, station.tiles]),
) as Record<StationInstanceId, TilePosition[]>;
export const spawnTiles = { ...mapData.spawnTiles };

// 슬라임 자리는 맵에서 속성별로 직접 찍는다. 같은 속성을 여러 마리
// 데려오면 2호부터는 그 자리에서 가까운 빈 바닥으로 밀려난다.
export function spawnTilesFor(squad: SlimeTypeId[]): TilePosition[] {
  const taken = new Set<string>();
  const tiles: TilePosition[] = [];
  for (const typeId of squad) {
    const home = spawnTiles[typeId];
    const spot = nearestFreeFloor(home, taken);
    if (!spot) break;
    taken.add(tileKeyOf(spot));
    tiles.push(spot);
  }
  return tiles;
}

// 시작 칸이 이미 찼으면 위·왼쪽·오른쪽·아래 고정 순서로 퍼져 빈 바닥을 찾는다.
function nearestFreeFloor(from: TilePosition, taken: Set<string>) {
  const seen = new Set([tileKeyOf(from)]);
  const queue = [from];
  while (queue.length > 0) {
    const tile = queue.shift()!;
    if (!isWalkable(tile)) continue;
    if (!taken.has(tileKeyOf(tile))) return tile;
    for (const next of neighboursOf(tile)) {
      const key = tileKeyOf(next);
      if (seen.has(key) || !inMap(next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return null;
}

// 지금 맵에서 이 인원을 세울 수 있는지.
export const canPlaceSquad = (squad: SlimeTypeId[]) =>
  spawnTilesFor(squad).length >= squad.length;

export const tileCenter = ({ col, row }: TilePosition) => ({
  x: col * TILE_SIZE + TILE_SIZE / 2,
  y: row * TILE_SIZE + TILE_SIZE / 2,
});

export const pixelToTile = (x: number, y: number): TilePosition => ({
  col: Math.floor(x / TILE_SIZE),
  row: Math.floor(y / TILE_SIZE),
});

export function isWalkable({ col, row }: TilePosition) {
  return KITCHEN_ROWS[row]?.[col] === ".";
}

// 스쿼드 순서대로 인스턴스 ID를 만든다. 같은 속성은 1호부터 번호가
// 붙으므로 중복 영입해도 키가 겹치지 않는다.
export function squadActorIds(squad: SlimeTypeId[]): ActorId[] {
  const seen: Partial<Record<SlimeTypeId, number>> = {};
  return squad.map((typeId) => {
    const ordinal = (seen[typeId] = (seen[typeId] ?? 0) + 1);
    return `${typeId}-${ordinal}`;
  });
}

function makeActor(
  typeId: SlimeTypeId,
  spawn: TilePosition,
  name: string,
): ActorState {
  return {
    typeId,
    name,
    col: spawn.col,
    row: spawn.row,
    facing: "down",
    actionPoints: maxActionPoints(typeId),
    status: "IDLE",
    acts: 0,
    carrying: [],
  };
}

// 주문 목록은 외부에서 들어올 수 있으므로 코어에 들이기 전에 검증한다.
function checkOrders(orders: Order[]): Order[] {
  if (
    orders.length < 1 ||
    new Set(orders.map((order) => order.id)).size !== orders.length ||
    orders.some(
      (order) =>
        !order.id ||
        !allItems.includes(order.foodId) ||
        !Number.isSafeInteger(order.targetCount) ||
        order.targetCount < 1 ||
        !Number.isSafeInteger(order.submittedCount) ||
        order.submittedCount < 0,
    )
  ) {
    throw new Error("주문 목록이 올바르지 않습니다.");
  }
  return orders.map((order) => ({ ...order }));
}

export const orderComplete = (order: Order) =>
  order.submittedCount >= order.targetCount;

const pendingOrders = (state: GameState) =>
  state.orders.filter((order) => !orderComplete(order));

export const activeOrders = (state: GameState) =>
  pendingOrders(state).slice(0, orderConfig.activeOrderCount);

// 현재 주문 뒤에 이어서 나올 레시피. 주문 카드 옆에 작게 보여 준다.
export const upcomingOrders = (state: GameState) =>
  pendingOrders(state).slice(
    orderConfig.activeOrderCount,
    orderConfig.activeOrderCount + PREVIEW_COUNT,
  );

// 스테이지 통과 판정. 최소 주문 수를 채웠는지만 본다.
export const roundResult = (state: GameState): "won" | "lost" =>
  state.mode === "endless" || state.filled >= passMark(currentStage(state))
    ? "won"
    : "lost";

// 처리한 주문 수가 스테이지의 별 기준을 몇 개나 넘겼는지. 못 넘겼으면 0이다.
export function stageRank(state: GameState) {
  return currentStage(state).stars.filter((need) => state.filled >= need).length;
}

const newFires = (): Partial<Record<StationInstanceId, FireState>> =>
  Object.fromEntries(
    stationInstances
      .filter(({ type }) => fireConfig.flammableStations.includes(type))
      .map(({ id }) => [id, { onFire: false }]),
  );

// 맵에 놓인 모든 조리 기구. 도마·화로·튀김기가 같은 상태를 쓴다.
export const cooktopInstances = stationInstances.filter((station) =>
  isCooktop(station.type),
);

// 맵에 놓인 모든 재료 상자. 감자·당근·양배추 상자를 한데 본다.
export const boxInstances = stationInstances.filter((station) =>
  isBoxStation(station.type),
);

const initialStationState = () => ({
  ingredients: Object.fromEntries(
    boxInstances.map(({ id }) => [id, { stock: 1 }]),
  ),
  stoves: Object.fromEntries(cooktopInstances.map(({ id }) => [id, [] as ItemId[]])),
  blenders: Object.fromEntries(
    stationInstancesByType.blender.map(({ id }) => [
      id,
      { fruit: null, water: false, food: null } as BlenderState,
    ]),
  ),
  dishRacks: Object.fromEntries(
    stationInstancesByType["dish-rack"].map(({ id }) => [
      id,
      Array.from(
        { length: Math.min(dishConfig.initialCount, dishConfig.rackCapacity) },
        (_, index) => ({
          id: `${id}/dish-${index + 1}`,
          status: "clean" as const,
          content: null,
        }),
      ),
    ]),
  ),
  dishReturns: Object.fromEntries(
    stationInstancesByType["dish-return"].map(({ id }) => [id, [] as Dish[]]),
  ),
  pendingReturns: [] as Dish[],
  tables: Object.fromEntries(stationInstancesByType.table.map(({ id }) => [id, [] as Carried[]])),
  incinerators: Object.fromEntries(
    stationInstancesByType.trash.map(({ id }) => [id, { count: 0, progress: 0 }]),
  ),
  washers: Object.fromEntries(
    stationInstancesByType.washer.map(({ id }) => [id, { dishes: [] as Dish[], progress: 0 }]),
  ),
  workstations: Object.fromEntries(
    cooktopInstances.map(({ id }) => [
      id,
      { status: "MISSING_MATERIAL" as WorkstationStatus, progress: 0 },
    ]),
  ),
});

// 기본 스테이지 목록의 원본은 game/stages.json이다. 제한 턴·통과 기준·
// 나오는 레시피는 코드가 아니라 그 파일에서 조절한다.
export const defaultStages = (): Stage[] =>
  stageData.stages.map((stage) => {
    const list = stage.orders as ItemId[];
    const stars = stage.stars as number[];
    if (
      !Array.isArray(list) ||
      list.length < 1 ||
      list.some((foodId) => !recipes[foodId]) ||
      !Array.isArray(stars) ||
      stars.length !== 3 ||
      stars.some(
        (need, index) =>
          !Number.isSafeInteger(need) ||
          need < 1 ||
          (index > 0 && need <= stars[index - 1]),
      ) ||
      stars[2] > list.length
    ) {
      throw new Error(`stages.json의 ${stage.id} 스테이지가 올바르지 않습니다.`);
    }
    return {
      id: stage.id,
      turnLimit: stage.turnLimit,
      stars: [...stars],
      // 적힌 순서 그대로 주문이 된다.
      orders: list.map((foodId, index) => ({
        id: `order-${index + 1}`,
        foodId,
        targetCount: 1,
        submittedCount: 0,
      })),
    };
  });

// 첫 화면에서 고르는 두 가지. 아르바이트는 스테이지를 처음부터 끝까지
// 이어서 도는 한 판이고, 무한은 그것을 끝내야 열린다.
export type GameMode = {
  id: "shift" | "endless";
  name: string;
  detail: string;
  ready: boolean;
};

export const gameModes: GameMode[] = [
  {
    id: "shift",
    name: "아르바이트 모드",
    detail: "튜토리얼부터 마지막 영업까지 이어서 돕니다.",
    ready: true,
  },
  {
    id: "endless",
    name: "무한 모드",
    detail: "80턴 동안 주문을 최대한 완료합니다.",
    ready: true,
  },
];

// 아르바이트를 끝까지 깼는지. 마지막 스테이지에서 별을 하나라도 받으면 된다.
export const shiftCleared = (progress: Record<string, number>) => {
  const last = defaultStages().at(-1);
  return Boolean(last && (progress[last.id] ?? 0) > 0);
};

export const stageIndexOf = (id: string) =>
  defaultStages().findIndex((stage) => stage.id === id);

// 스테이지 목록도 외부에서 들어올 수 있으므로 코어에 들이기 전에 검증한다.
function checkStages(stages: Stage[], stageIndex: number): Stage[] {
  if (
    stages.length < 1 ||
    new Set(stages.map((stage) => stage.id)).size !== stages.length ||
    stages.some(
      (stage) =>
        !stage.id ||
        !Number.isSafeInteger(stage.turnLimit) ||
        stage.turnLimit < 1 ||
        !Array.isArray(stage.stars) ||
        stage.stars.length !== 3 ||
        stage.stars.some(
          (need, index) =>
            !Number.isSafeInteger(need) ||
            need < 1 ||
            (index > 0 && need <= stage.stars[index - 1]),
        ) ||
        // 통과 자체는 할 수 있어야 한다. 별 2·3이 주문 수를 넘는 것은
        // 기획 실수지만 판을 못 돌 정도는 아니라 stages.json 쪽에서만 막는다.
        stage.stars[0] > stage.orders.length,
    ) ||
    !Number.isSafeInteger(stageIndex) ||
    stageIndex < 0 ||
    stageIndex >= stages.length
  ) {
    throw new Error("스테이지 목록이 올바르지 않습니다.");
  }
  return stages.map((stage) => ({
    ...stage,
    stars: [...stage.stars],
    orders: checkOrders(stage.orders),
  }));
}

export const isLastStage = (state: GameState) =>
  state.stageIndex >= state.stages.length - 1;

export const currentStage = (state: GameState) => state.stages[state.stageIndex];

export function initialState(
  seed = 2026,
  squad: SlimeTypeId[] = ["water"],
  stages: Stage[] = defaultStages(),
  stageIndex = 0,
  mode: GameState["mode"] = "shift",
): GameState {
  // 같은 속성을 여러 마리 데려올 수 있다. 인원 상한은 맵의 빈 바닥이 정한다.
  if (squad.length < 1 || squad.some((typeId) => !(typeId in slimeTypes))) {
    throw new Error("스쿼드는 속성 슬라임 1마리 이상이어야 합니다.");
  }
  const placements = spawnTilesFor(squad);
  if (placements.length < squad.length) {
    throw new Error(
      `슬라임 ${squad.length}마리를 세울 빈 바닥이 모자랍니다.`,
    );
  }
  const roundStages = checkStages(stages, stageIndex);
  const stage = roundStages[stageIndex];
  const roundOrders = stage.orders.map((order) => ({ ...order }));
  const ids = squadActorIds(squad);
  // 같은 속성이 둘 이상이면 로그와 UI에서 구분되도록 번호를 붙인다.
  const total = squad.reduce<Partial<Record<SlimeTypeId, number>>>(
    (acc, typeId) => ({ ...acc, [typeId]: (acc[typeId] ?? 0) + 1 }),
    {},
  );
  const actors: Partial<Record<ActorId, ActorState>> = {};
  squad.forEach((typeId, index) => {
    const label = slimeTypes[typeId].name;
    actors[ids[index]] = makeActor(
      typeId,
      placements[index],
      total[typeId]! > 1 ? `${label} ${ids[index].split("-")[1]}호` : label,
    );
  });
  const stationState = initialStationState();
  return {
    seed: seed >>> 0,
    mode,
    phase: "playing",
    turn: 1,
    turnsLeft: stage.turnLimit,
    filled: 0,
    goal: passMark(stage),
    actors,
    ...stationState,
    orders: roundOrders,
    fires: newFires(),
    stages: roundStages,
    stageIndex,
    squad: [...squad],
    refusal: null,
    lastEvent: `${stage.id} — ${stage.turnLimit}턴 안에 음식 주문 ${passMark(stage)}건을 완료하세요.`,
  };
}

// 스테이지를 깬 뒤 다음 스테이지 상태를 만든다. 스쿼드는 잇고 설비·
// 소지품은 새로 시작한다.
export function nextStage(state: GameState): GameState {
  if (state.phase !== "won" || isLastStage(state)) return state;
  return initialState(state.seed, state.squad, state.stages, state.stageIndex + 1, state.mode);
}

function advanceSeed(seed: number) {
  let next = seed || 1;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function endlessOrders(seed: number, offset = 0): Order[] {
  const foods = allRecipes.map(({ foodId }) => foodId);
  let random = seed;
  for (let index = foods.length - 1; index > 0; index -= 1) {
    random = advanceSeed(random);
    const swap = random % (index + 1);
    [foods[index], foods[swap]] = [foods[swap]!, foods[index]!];
  }
  return foods.map((foodId, index) => ({
    id: `endless-order-${offset + index + 1}`,
    foodId,
    targetCount: 1,
    submittedCount: 0,
  }));
}

export function initialEndlessState(
  seed = 2026,
  squad: SlimeTypeId[] = [...allElements],
): GameState {
  const orders = endlessOrders(seed);
  return initialState(seed, squad, [{
    id: "endless",
    turnLimit: ENDLESS_TURN_LIMIT,
    stars: [1, 2, 3],
    orders,
  }], 0, "endless");
}

function event(state: GameState, message: string, patch: Partial<GameState>) {
  return {
    ...state,
    ...patch,
    seed: advanceSeed(state.seed),
    refusal: null,
    lastEvent: message,
  };
}

// 유효하지 않은 상호작용. 행동력을 쓰지 않고 이유만 남긴다.
function refuse(state: GameState, actor: ActorState, message: string): GameState {
  return {
    ...state,
    refusal: {
      seq: (state.refusal?.seq ?? 0) + 1,
      message: `${actor.name}: ${message}`,
    },
  };
}

function patchActor(
  state: GameState,
  actorId: ActorId,
  next: ActorState,
): Partial<Record<ActorId, ActorState>> {
  return { ...state.actors, [actorId]: next };
}

// 행동력을 쓰고 모션용 카운터를 올린 슬라임.
function spend(actor: ActorState, cost: number, status: ActorStatus): ActorState {
  return {
    ...actor,
    actionPoints: actor.actionPoints - cost,
    status,
    acts: actor.acts + 1,
  };
}

// 누구나 한 번에 하나만 든다. 땅 슬라임의 그릇 다중 운반은 없앴다.
function canCarry(actor: ActorState) {
  return actor.carrying.length === 0;
}

const dishIndex = (
  actor: ActorState,
  test: (dish: Dish) => boolean,
) => actor.carrying.findIndex((carried) => isDish(carried) && test(carried));

export const isBurning = (state: GameState, station: StationInstanceId) =>
  state.fires[station]?.onFire === true;

export const occupantOf = (
  state: GameState,
  tile: TilePosition,
): ActorId | null =>
  (Object.keys(state.actors) as ActorId[]).find((id) =>
    sameTile(state.actors[id]!, tile),
  ) ?? null;

// 선택한 슬라임이 이번에 갈 수 있는 칸과 그 비용. 남은 행동력만큼 한 칸씩
// 상하좌우로 뻗어 나간다. 번개 슬라임은 행동력이 2라 두 칸까지 닿는다.
// 벽·설비 칸과 다른 슬라임이 선 칸은 지나갈 수도 설 수도 없으므로 명세
// 7절 충돌 규칙이 여기서 끝난다. 퍼지는 순서가 고정이라 같은 판이면 늘
// 같은 결과가 나온다.
export function moveOptions(
  state: GameState,
  actorId: ActorId,
): (TilePosition & { cost: number })[] {
  const actor = state.actors[actorId];
  if (state.phase !== "playing" || !actor) return [];
  const steps = Math.floor(actor.actionPoints / actionCost.move);
  const seen = new Set([tileKeyOf(actor)]);
  const found: (TilePosition & { cost: number })[] = [];
  let edge: TilePosition[] = [actor];
  for (let step = 1; step <= steps; step += 1) {
    const next: TilePosition[] = [];
    for (const tile of edge) {
      for (const side of neighboursOf(tile)) {
        const key = tileKeyOf(side);
        if (seen.has(key) || !isWalkable(side) || occupantOf(state, side)) continue;
        seen.add(key);
        next.push(side);
        found.push({ ...side, cost: step * actionCost.move });
      }
    }
    edge = next;
  }
  return found;
}

export const moveTargets = (state: GameState, actorId: ActorId): TilePosition[] =>
  moveOptions(state, actorId).map(({ col, row }) => ({ col, row }));

// 한 마리가 행동력을 다 쓰면 다음으로 넘길 슬라임. 지금 마리 다음부터
// 한 바퀴 돌아 행동력이 남은 첫 마리를 고른다. 아무도 없으면 null이다.
export function nextReadyActor(
  state: GameState,
  roster: ActorId[],
  from: ActorId,
): ActorId | null {
  const at = roster.indexOf(from);
  if (at < 0) return null;
  const order = [...roster.slice(at + 1), ...roster.slice(0, at)];
  return order.find((id) => (state.actors[id]?.actionPoints ?? 0) > 0) ?? null;
}

export function moveActor(
  state: GameState,
  actorId: ActorId,
  to: TilePosition,
): GameState {
  const actor = state.actors[actorId];
  if (state.phase !== "playing" || !actor) return state;
  if (actor.actionPoints < actionCost.move) {
    return refuse(state, actor, "남은 행동력이 없습니다.");
  }
  if (!inMap(to) || !isWalkable(to)) {
    return refuse(state, actor, "갈 수 없는 칸입니다.");
  }
  if (occupantOf(state, to)) {
    return refuse(state, actor, "다른 슬라임이 있는 칸입니다.");
  }
  // 여러 칸을 한 번에 갈 때는 지나온 칸 수만큼 행동력을 쓴다.
  const option = moveOptions(state, actorId).find((tile) => sameTile(tile, to));
  if (!option) {
    return refuse(state, actor, "남은 행동력으로 닿지 않는 칸입니다.");
  }
  return {
    ...state,
    refusal: null,
    actors: patchActor(state, actorId, {
      ...spend(actor, option.cost, "MOVING"),
      col: to.col,
      row: to.row,
      facing:
        to.col === actor.col
          ? to.row > actor.row ? "down" : "up"
          : to.col > actor.col ? "right" : "left",
    }),
  };
}

// 조리·세척·소각처럼 여러 턴에 걸칠 수 있는 작업. 남은 행동력만큼만
// 진척도를 올리고, 모자라면 다음 턴에 이어서 한다.
function progressStep(actor: ActorState, cost: number, progress: number) {
  const spent = Math.min(actor.actionPoints, cost - progress);
  return { spent, progress: progress + spent, done: progress + spent >= cost };
}

export function resolveStationTarget(target: StationInstanceId | StationId) {
  return stationsById[target as StationInstanceId] ?? stationInstancesByType[target as StationId]?.[0];
}

// 슬라임이 이 설비를 쓸 수 있는 자리에 서 있는지. 설비 칸에 상하좌우로
// 붙어 있으면 된다.
export const isBesideStation = (
  actor: ActorState,
  station: StationInstance,
) =>
  station.tiles.some((tile) =>
    neighboursOf(tile).some((side) => sameTile(side, actor)),
  );

export function interactActor(
  state: GameState,
  actorId: ActorId,
  target: StationInstanceId | StationId,
): GameState {
  const actor = state.actors[actorId];
  const station = resolveStationTarget(target);
  if (state.phase !== "playing" || !actor || !station) return state;
  if (!isBesideStation(actor, station)) {
    return refuse(
      state,
      actor,
      `${withParticle(stationLabels[station.type])} 쓰려면 옆 칸에 서야 합니다.`,
    );
  }
  if (isBurning(state, station.id)) {
    return refuse(state, actor, "불이 난 설비는 사용할 수 없습니다.");
  }
  if (actor.actionPoints < 1) {
    return refuse(state, actor, "남은 행동력이 없습니다.");
  }
  const id = station.id;
  if (isBoxStation(station.type)) {
    return atIngredientBox(state, actorId, actor, id, boxItems[station.type]);
  }
  if (isCooktop(station.type)) {
    return atCooktop(state, actorId, actor, id, station.type);
  }
  switch (station.type) {
    case "blender":
      return atBlender(state, actorId, actor, id);
    case "washer":
      return atWasher(state, actorId, actor, id);
    case "trash":
      return atIncinerator(state, actorId, actor, id);
    case "dish-rack":
      return atDishRack(state, actorId, actor, id);
    case "dish-return":
      return atDishReturn(state, actorId, actor, id);
    case "table":
      return atTable(state, actorId, actor, id);
    case "submission":
      return atSubmission(state, actorId, actor);
    default:
      return refuse(state, actor, "지금은 쓸 수 없는 설비입니다.");
  }
}

function atIngredientBox(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
  item: ItemId,
): GameState {
  const ingredients = state.ingredients[station]!;
  if (ingredients.stock < 1) {
    return refuse(state, actor, `${stationLabels[stationType(station)]}가 비어 있습니다.`);
  }
  const clean = dishIndex(actor, (dish) => dish.status === "clean");
  if (clean < 0 && !canCarry(actor)) {
    return refuse(state, actor, "이미 음식이나 그릇을 들고 있습니다.");
  }
  const next = spend(actor, actionCost.carry, "CARRYING");
  const carrying =
    clean >= 0
      ? actor.carrying.map((carried, index) =>
          index === clean && isDish(carried)
            ? { ...carried, status: "filled" as const, content: item }
            : carried,
        )
      : [...actor.carrying, item];
  return event(
    state,
    clean >= 0
      ? `${actor.name}이(가) 그릇에 ${withParticle(itemLabel(item))} 담았습니다.`
      : `${actor.name}이(가) ${withParticle(itemLabel(item))} 들었습니다.`,
    {
      actors: patchActor(state, actorId, { ...next, carrying }),
      ingredients: {
        ...state.ingredients,
        [station]: { stock: ingredients.stock - 1 },
      },
    },
  );
}

// 도마·화로·튀김기가 함께 쓴다. 무엇을 넣어 무엇이 나오는지는 레시피가
// 정하고, 여기서는 올리기 → 조리 → 회수 순서만 다룬다.
// 손이 차 있다는 말만 하면 "내려놓으면 되겠구나"로 읽힌다. 대개는 이
// 기구에서 쓸 수 없는 재료를 들고 온 것이라, 그 사정을 먼저 알려 준다.
function cannotUseHere(actor: ActorState, type: StationId, label: string) {
  const held = actor.carrying[0]!;
  const item = isDish(held) ? held.content : held;
  if (item && !recipeAt(type, item)) {
    const elsewhere = allRecipes.find((one) =>
      one.ingredients.some((ingredient) => ingredient.itemId === item)
    );
    return elsewhere
      ? `${itemLabel(item)}(으)로 ${withParticle(label)} 쓰는 요리는 없습니다. ${stationLabels[elsewhere.station]}에서 씁니다.`
      : `${itemLabel(item)}(으)로 만들 수 있는 요리가 아직 없습니다.`;
  }
  return `${withParticle(carriedLabel(held))} 먼저 내려놓아야 합니다.`;
}

function atCooktop(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
  type: StationId,
): GameState {
  const label = stationLabels[type];
  const stove = state.stoves[station]!;
  const workstation = state.workstations[station]!;
  const onBoard = stove[0] ?? null;

  // 재료 올리기. 물건 분류라 속성 제한이 없다. 손에 든 것 중 이 기구에서
  // 쓸 수 있는 재료를 찾는다.
  const looseIndex = actor.carrying.findIndex(
    (carried) => !isDish(carried) && recipeAt(type, carried),
  );
  const dishIdx = dishIndex(
    actor,
    (dish) => dish.content !== null && Boolean(recipeAt(type, dish.content)),
  );
  if (looseIndex >= 0 || dishIdx >= 0) {
    if (stove.length >= STORAGE_MAX) {
      return refuse(state, actor, `${label}가 사용 중입니다.`);
    }
    const held = actor.carrying[looseIndex >= 0 ? looseIndex : dishIdx];
    const ingredient = (looseIndex >= 0 ? held : (held as Dish).content) as ItemId;
    const carrying =
      looseIndex >= 0
        ? actor.carrying.filter((_, index) => index !== looseIndex)
        : actor.carrying.map((carried, index) =>
            index === dishIdx && isDish(carried)
              ? { ...carried, status: "clean" as const, content: null }
              : carried,
          );
    return event(
      state,
      `${actor.name}이(가) ${label}에 ${withParticle(itemLabel(ingredient))} 올렸습니다.`,
      {
        actors: patchActor(state, actorId, {
          ...spend(actor, actionCost.carry, "CARRYING"),
          carrying,
        }),
        stoves: { ...state.stoves, [station]: [ingredient] },
        workstations: {
          ...state.workstations,
          [station]: { status: "IDLE", progress: 0 },
        },
      },
    );
  }

  // 완성 음식 회수. 이것도 물건 분류라 누구나 할 수 있다.
  if (onBoard && isCookedFood(onBoard)) {
    // 그릇 없이 내는 음식은 그릇에 담지 않고 그대로 든다.
    const clean = servedBare(onBoard)
      ? -1
      : dishIndex(actor, (dish) => dish.status === "clean");
    if (clean < 0 && !canCarry(actor)) {
      return refuse(state, actor, "완성 음식을 들 자리가 없습니다.");
    }
    const carrying =
      clean >= 0
        ? actor.carrying.map((carried, index) =>
            index === clean && isDish(carried)
              ? { ...carried, status: "filled" as const, content: onBoard }
              : carried,
          )
        : [...actor.carrying, onBoard];
    return event(
      state,
      clean >= 0
        ? `${actor.name}이(가) 그릇에 ${withParticle(itemLabel(onBoard))} 담았습니다.`
        : `${actor.name}이(가) ${label}에서 ${withParticle(itemLabel(onBoard))} 들었습니다.`,
      {
        actors: patchActor(state, actorId, {
          ...spend(actor, actionCost.carry, "CARRYING"),
          carrying,
        }),
        stoves: { ...state.stoves, [station]: [] },
        workstations: {
          ...state.workstations,
          [station]: { status: "MISSING_MATERIAL", progress: 0 },
        },
      },
    );
  }

  // 여기부터는 조리. 레시피가 정한 속성만 돌릴 수 있다.
  if (actor.carrying.length > 0) {
    return refuse(state, actor, cannotUseHere(actor, type, label));
  }
  const recipe = onBoard ? recipeAt(type, onBoard) : null;
  if (!recipe) {
    return refuse(state, actor, `${label}에 조리할 재료가 없습니다.`);
  }
  if (!recipe.workers.includes(actor.typeId)) {
    return refuse(
      state,
      actor,
      `${elementNames(recipe.workers)}만 ${withParticle(label)} 쓸 수 있습니다.`,
    );
  }
  const step = progressStep(actor, actionCost.chop, workstation.progress);
  const next = spend(actor, step.spent, "WORKING");
  if (!step.done) {
    return event(
      state,
      `${actor.name}이(가) ${withParticle(itemLabel(onBoard!))} 손질하고 있습니다. (${step.progress}/${actionCost.chop})`,
      {
        actors: patchActor(state, actorId, next),
        workstations: {
          ...state.workstations,
          [station]: { status: "WORKING", progress: step.progress },
        },
      },
    );
  }
  return event(
    state,
    `${actor.name}이(가) ${itemLabel(recipe.foodId)}를 완성했습니다.`,
    {
      actors: patchActor(state, actorId, next),
      stoves: { ...state.stoves, [station]: [recipe.foodId] },
      workstations: {
        ...state.workstations,
        [station]: { status: "COMPLETE", progress: 0 },
      },
    },
  );
}

// 믹서기. 과일 → 물 → 가동 순서로만 진행하고 넣은 과일은 뺄 수 없다.
// 각 단계는 상호작용 한 번씩이다.
function atBlender(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
): GameState {
  const blender = state.blenders[station]!;
  const patch = (next: Partial<BlenderState>) => ({
    ...state.blenders,
    [station]: { ...blender, ...next },
  });

  // 완성한 스무디 회수. 물건 분류라 누구나 할 수 있다.
  if (blender.food) {
    // 스무디는 컵째 나가므로 그릇에 담지 않는다.
    const clean = servedBare(blender.food)
      ? -1
      : dishIndex(actor, (dish) => dish.status === "clean");
    if (clean < 0 && !canCarry(actor)) {
      return refuse(state, actor, "완성 음식을 들 자리가 없습니다.");
    }
    const food = blender.food;
    const carrying =
      clean >= 0
        ? actor.carrying.map((carried, index) =>
            index === clean && isDish(carried)
              ? { ...carried, status: "filled" as const, content: food }
              : carried,
          )
        : [...actor.carrying, food];
    return event(
      state,
      `${actor.name}이(가) ${withParticle(itemLabel(food))} 들었습니다.`,
      {
        actors: patchActor(state, actorId, {
          ...spend(actor, actionCost.carry, "CARRYING"),
          carrying,
        }),
        blenders: patch({ fruit: null, water: false, food: null }),
      },
    );
  }

  // 과일 넣기. 물보다 먼저여야 하고, 넣은 뒤에는 되돌릴 수 없다.
  const looseIndex = actor.carrying.findIndex(
    (carried) => !isDish(carried) && recipeAt("blender", carried),
  );
  const dishIdx = dishIndex(
    actor,
    (dish) => dish.content !== null && Boolean(recipeAt("blender", dish.content)),
  );
  if (!blender.fruit && (looseIndex >= 0 || dishIdx >= 0)) {
    const held = actor.carrying[looseIndex >= 0 ? looseIndex : dishIdx];
    const fruit = (looseIndex >= 0 ? held : (held as Dish).content) as ItemId;
    const carrying =
      looseIndex >= 0
        ? actor.carrying.filter((_, index) => index !== looseIndex)
        : actor.carrying.map((carried, index) =>
            index === dishIdx && isDish(carried)
              ? { ...carried, status: "clean" as const, content: null }
              : carried,
          );
    return event(
      state,
      `${actor.name}이(가) 믹서기에 ${withParticle(itemLabel(fruit))} 넣었습니다.`,
      {
        actors: patchActor(state, actorId, {
          ...spend(actor, actionCost.carry, "CARRYING"),
          carrying,
        }),
        blenders: patch({ fruit }),
      },
    );
  }
  if (!blender.fruit) {
    return refuse(state, actor, "믹서기에 넣을 과일이 없습니다.");
  }
  if (looseIndex >= 0 || dishIdx >= 0) {
    return refuse(state, actor, "믹서기에 이미 과일이 들어 있습니다.");
  }

  // 물 채우기. 물 슬라임만 한다.
  if (!blender.water) {
    if (!stationElements.wash.includes(actor.typeId)) {
      return refuse(
        state,
        actor,
        `${elementNames(stationElements.wash)}가 믹서기에 물을 채워야 합니다.`,
      );
    }
    return event(state, `${actor.name}이(가) 믹서기에 물을 채웠습니다.`, {
      actors: patchActor(state, actorId, spend(actor, actionCost.carry, "WORKING")),
      blenders: patch({ water: true }),
    });
  }

  // 가동. 레시피가 정한 속성만 돌릴 수 있다.
  const recipe = recipeAt("blender", blender.fruit)!;
  if (!recipe.workers.includes(actor.typeId)) {
    return refuse(
      state,
      actor,
      `${elementNames(recipe.workers)}만 믹서기를 돌릴 수 있습니다.`,
    );
  }
  if (actor.carrying.length > 0) {
    return refuse(state, actor, cannotUseHere(actor, "blender", stationLabels.blender));
  }
  return event(
    state,
    `${actor.name}이(가) ${itemLabel(recipe.foodId)}를 완성했습니다.`,
    {
      actors: patchActor(state, actorId, spend(actor, actionCost.chop, "WORKING")),
      blenders: patch({ food: recipe.foodId }),
    },
  );
}

function atWasher(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
): GameState {
  const washer = state.washers[station]!;
  const put = (dishes: Dish[], progress: number) => ({
    ...state.washers,
    [station]: { dishes, progress },
  });
  // 맨 앞 더러운 그릇 하나만 씻는다. 나머지는 줄을 서서 기다린다.
  const washing = washer.dishes.findIndex((dish) => dish.status === "dirty");
  const washed = washer.dishes.findIndex((dish) => dish.status === "clean");

  // 세척. 물 슬라임만 할 수 있고, 씻을 것이 있으면 다른 일보다 먼저 한다.
  if (washing >= 0 && stationElements.wash.includes(actor.typeId)) {
    const step = progressStep(actor, actionCost.wash, washer.progress);
    const next = spend(actor, step.spent, "WORKING");
    if (!step.done) {
      return event(
        state,
        `${actor.name}이(가) 그릇을 씻고 있습니다. (${step.progress}/${actionCost.wash})`,
        {
          actors: patchActor(state, actorId, next),
          washers: put(washer.dishes, step.progress),
        },
      );
    }
    return event(state, `${actor.name}이(가) 그릇을 깨끗이 씻었습니다.`, {
      actors: patchActor(state, actorId, next),
      washers: put(
        washer.dishes.map((dish, index) =>
          index === washing ? { ...dish, status: "clean" as DishStatus, content: null } : dish,
        ),
        0,
      ),
    });
  }

  // 더러운 그릇 넣기. 모든 슬라임이 할 수 있다.
  const dirty = dishIndex(actor, (dish) => dish.status === "dirty");
  if (dirty >= 0 && washer.dishes.length < dishConfig.washerCapacity) {
    return event(state, `${actor.name}이(가) 더러운 그릇을 세척기에 놓았습니다.`, {
      actors: patchActor(state, actorId, {
        ...spend(actor, actionCost.carry, "CARRYING"),
        carrying: actor.carrying.filter((_, index) => index !== dirty),
      }),
      washers: put([...washer.dishes, actor.carrying[dirty] as Dish], washer.progress),
    });
  }

  // 씻은 그릇 꺼내기.
  if (washed >= 0 && canCarry(actor)) {
    return event(state, `${actor.name}이(가) 씻은 그릇을 꺼냈습니다.`, {
      actors: patchActor(state, actorId, {
        ...spend(actor, actionCost.carry, "CARRYING"),
        carrying: [...actor.carrying, washer.dishes[washed]],
      }),
      washers: put(washer.dishes.filter((_, index) => index !== washed), washer.progress),
    });
  }

  // 손에 든 그릇을 넣으러 온 쪽이 먼저다. 자리가 없다는 말이 더 쓸모 있다.
  if (dirty >= 0) return refuse(state, actor, "세척대가 가득 찼습니다.");
  if (washing >= 0) {
    return refuse(
      state,
      actor,
      `${elementNames(stationElements.wash)}만 그릇을 씻을 수 있습니다.`,
    );
  }
  if (washed >= 0) return refuse(state, actor, "씻은 그릇을 들 수 없습니다.");
  return refuse(state, actor, "세척할 더러운 그릇이 없습니다.");
}

function atIncinerator(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
): GameState {
  const incinerator = state.incinerators[station]!;
  const carried = actor.carrying[0];
  const full = incinerator.count >= incineratorConfig.capacity;
  // 가득 찬 소각기 앞에서는 물건을 든 불 슬라임도 넣기 대신 소각부터 한다.
  const burnsInstead = full && stationElements.burn.includes(actor.typeId);
  if (carried && !burnsInstead) {
    if (full) return refuse(state, actor, "소각기가 가득 찼습니다.");
    if (isDish(carried) && !carried.content) {
      return refuse(state, actor, "빈 그릇은 소각기에 버릴 수 없습니다.");
    }
    const discarded = isDish(carried) ? itemLabel(carried.content!) : itemLabel(carried);
    return event(state, `${actor.name}이(가) 소각기에 ${withParticle(discarded)} 버렸습니다.`, {
      actors: patchActor(state, actorId, {
        ...spend(actor, actionCost.carry, "CARRYING"),
        carrying: isDish(carried)
          ? [{ ...carried, status: "dirty" as const, content: null }, ...actor.carrying.slice(1)]
          : actor.carrying.slice(1),
      }),
      incinerators: {
        ...state.incinerators,
        [station]: { ...incinerator, count: incinerator.count + 1 },
      },
    });
  }
  if (!stationElements.burn.includes(actor.typeId)) {
    return refuse(
      state,
      actor,
      `${elementNames(stationElements.burn)}만 소각기를 비울 수 있습니다.`,
    );
  }
  if (incinerator.count < 1) {
    return refuse(state, actor, "소각할 쓰레기가 없습니다.");
  }
  const step = progressStep(actor, actionCost.burn, incinerator.progress);
  const next = spend(actor, step.spent, "WORKING");
  if (!step.done) {
    return event(
      state,
      `${actor.name}이(가) 소각하고 있습니다. (${step.progress}/${actionCost.burn})`,
      {
        actors: patchActor(state, actorId, next),
        incinerators: {
          ...state.incinerators,
          [station]: { ...incinerator, progress: step.progress },
        },
      },
    );
  }
  return event(state, `${actor.name}이(가) 소각기를 비웠습니다.`, {
    actors: patchActor(state, actorId, next),
    incinerators: { ...state.incinerators, [station]: { count: 0, progress: 0 } },
  });
}

// 제출한 그릇이 쌓이는 곳. 집어서 세척대로 옮기면 된다.
function atDishReturn(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
): GameState {
  const waiting = state.dishReturns[station]!;
  const dish = waiting[0];
  if (!dish) return refuse(state, actor, "반납대가 비어 있습니다.");
  if (!canCarry(actor)) {
    return refuse(state, actor, "더러운 그릇을 들 자리가 없습니다.");
  }
  return event(state, `${actor.name}이(가) 반납대에서 더러운 그릇을 들었습니다.`, {
    actors: patchActor(state, actorId, {
      ...spend(actor, actionCost.carry, "CARRYING"),
      carrying: [...actor.carrying, dish],
    }),
    dishReturns: { ...state.dishReturns, [station]: waiting.slice(1) },
  });
}

function atDishRack(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
): GameState {
  const dishRack = state.dishRacks[station]!;
  const ready = dishRack[0];
  // 낱개 음식을 들고 오면 빈 접시를 꺼내 그 자리에서 담는다. 손에 든
  // 개수가 그대로라 용량이 꽉 차 있어도 된다.
  const looseFood = actor.carrying.findIndex((carried) => !isDish(carried));
  if (ready?.status === "clean" && looseFood >= 0) {
    const food = actor.carrying[looseFood] as ItemId;
    return event(
      state,
      `${actor.name}이(가) 빈 접시에 ${withParticle(itemLabel(food))} 담았습니다.`,
      {
        actors: patchActor(state, actorId, {
          ...spend(actor, actionCost.carry, "CARRYING"),
          carrying: actor.carrying.map((carried, index) =>
            index === looseFood
              ? { ...ready, status: "filled" as const, content: food }
              : carried,
          ),
        }),
        dishRacks: { ...state.dishRacks, [station]: dishRack.slice(1) },
      },
    );
  }
  if (ready && canCarry(actor)) {
    return event(state, `${actor.name}이(가) 깨끗한 그릇을 들었습니다.`, {
      actors: patchActor(state, actorId, {
        ...spend(actor, actionCost.carry, "CARRYING"),
        carrying: [...actor.carrying, ready],
      }),
      dishRacks: { ...state.dishRacks, [station]: dishRack.slice(1) },
    });
  }
  const clean = dishIndex(actor, (dish) => dish.status === "clean");
  if (clean < 0 || dishRack.length >= dishConfig.rackCapacity) {
    return refuse(state, actor, "그릇을 가져가거나 반납할 수 없습니다.");
  }
  const dish = actor.carrying[clean] as Dish;
  return event(state, `${actor.name}이(가) 깨끗한 그릇을 반납했습니다.`, {
    actors: patchActor(state, actorId, {
      ...spend(actor, actionCost.carry, "CARRYING"),
      carrying: actor.carrying.filter((_, index) => index !== clean),
    }),
    dishRacks: { ...state.dishRacks, [station]: [...dishRack, dish] },
  });
}

// 명세 11절. 두 물건이 함께 있을 수 있으면 테이블에 내려놓는 방향으로
// 처리하고, 조합이 성립하지 않으면 아무 동작도 하지 않는다.
function atTable(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  station: StationInstanceId,
): GameState {
  const table = state.tables[station]!;
  const tableItem = table[0];
  const put = (
    message: string,
    carrying: Carried[],
    contents: Carried[],
  ): GameState =>
    event(state, message, {
      actors: patchActor(state, actorId, {
        ...spend(actor, actionCost.carry, "CARRYING"),
        carrying,
      }),
      tables: { ...state.tables, [station]: contents },
    });

  const saladPair = (first: ItemId | null, second: ItemId | null) =>
    new Set([first, second]).size === 2 &&
    [first, second].every((item) =>
      item === "shredded-carrot" || item === "shredded-cabbage"
    );

  const looseItem = actor.carrying.findIndex((carried) => !isDish(carried));
  // 접시는 제출할 때만 필요하다. 썬 재료 둘은 테이블에서 먼저 샐러드로 합친다.
  if (
    tableItem && !isDish(tableItem) && looseItem >= 0 &&
    saladPair(tableItem, actor.carrying[looseItem] as ItemId)
  ) {
    return put(
      `${actor.name}이(가) 샐러드를 완성했습니다.`,
      actor.carrying.filter((_, index) => index !== looseItem),
      ["salad"],
    );
  }
  // 한 재료가 이미 담긴 접시와 나머지 재료를 합쳐도 샐러드가 된다.
  if (
    tableItem && isDish(tableItem) && tableItem.status === "filled" &&
    looseItem >= 0 && saladPair(tableItem.content, actor.carrying[looseItem] as ItemId)
  ) {
    return put(
      `${actor.name}이(가) 샐러드를 완성했습니다.`,
      actor.carrying.filter((_, index) => index !== looseItem),
      [{ ...tableItem, content: "salad" }],
    );
  }
  const filledDish = dishIndex(actor, (dish) => dish.status === "filled");
  const carriedDish = actor.carrying[filledDish];
  if (
    tableItem && !isDish(tableItem) && filledDish >= 0 &&
    carriedDish && isDish(carriedDish) && saladPair(carriedDish.content, tableItem)
  ) {
    return put(
      `${actor.name}이(가) 샐러드를 완성했습니다.`,
      actor.carrying.filter((_, index) => index !== filledDish),
      [{ ...carriedDish, content: "salad" }],
    );
  }

  // 그릇을 들고 음식이 있는 테이블: 그릇을 내려놓고 음식을 담는다.
  // 음식이 담긴 그릇은 테이블 위에 남는다.
  const cleanDish = dishIndex(actor, (dish) => dish.status === "clean");
  if (tableItem && !isDish(tableItem) && cleanDish >= 0) {
    const dish = actor.carrying[cleanDish] as Dish;
    return put(
      `${actor.name}이(가) 테이블의 ${withParticle(itemLabel(tableItem))} 접시에 담았습니다.`,
      actor.carrying.filter((_, index) => index !== cleanDish),
      [{ ...dish, status: "filled", content: tableItem }],
    );
  }

  // 음식을 들고 빈 그릇이 있는 테이블: 음식을 그릇에 담는다.
  if (tableItem && isDish(tableItem) && tableItem.status === "clean" && looseItem >= 0) {
    const food = actor.carrying[looseItem] as ItemId;
    return put(
      `${actor.name}이(가) 테이블의 빈 접시에 ${withParticle(itemLabel(food))} 담았습니다.`,
      actor.carrying.filter((_, index) => index !== looseItem),
      [{ ...tableItem, status: "filled", content: food }],
    );
  }

  // 물건을 들고 있으면 내려놓는다. 자리가 없으면 조합이 성립하지 않는다.
  if (actor.carrying.length > 0) {
    if (table.length >= dishConfig.tableCapacity) {
      return refuse(state, actor, "테이블에 놓을 자리가 없습니다.");
    }
    const carried = actor.carrying[0];
    return put(
      `${actor.name}이(가) ${withParticle(carriedLabel(carried))} 테이블에 놓았습니다.`,
      actor.carrying.slice(1),
      [...table, carried],
    );
  }

  // 빈손이면 집어 든다. 빈 테이블이면 아무 동작도 하지 않는다.
  if (!tableItem) return refuse(state, actor, "테이블이 비어 있습니다.");
  if (!canCarry(actor)) {
    return refuse(state, actor, "테이블의 물건을 들 수 없습니다.");
  }
  return put(
    `${actor.name}이(가) 테이블에서 ${withParticle(carriedLabel(tableItem))} 들었습니다.`,
    [tableItem],
    table.slice(1),
  );
}

function atSubmission(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
): GameState {
  const filledDish = dishIndex(
    actor,
    (dish) => dish.status === "filled" && dish.content !== null,
  );
  const dish = actor.carrying[filledDish];
  if (filledDish >= 0 && dish && isDish(dish) && dish.content) {
    return submitFood(state, actorId, actor, filledDish, dish.content);
  }
  // 그릇 없이 내는 음식(스무디처럼 컵째 나가는 것)은 손에 든 채로 받는다.
  const bare = actor.carrying.findIndex(
    (carried) => !isDish(carried) && servedBare(carried),
  );
  if (bare >= 0) {
    return submitFood(state, actorId, actor, bare, actor.carrying[bare] as ItemId);
  }
  return refuse(state, actor, "접시에 담긴 완성 음식만 제출할 수 있습니다.");
}

function submitFood(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  carriedIndex: number,
  food: ItemId,
): GameState {
  // 음식 이름이 아니라 ID로 현재 주문과 대조한다.
  const target = activeOrders(state).find((order) => order.foodId === food);
  const label = itemLabel(food);
  // 제출한 접시는 손을 떠난다. 한 턴 뒤 반납대에 더러운 그릇으로 나온다.
  const handed = actor.carrying[carriedIndex];
  const returned: Dish[] = isDish(handed)
    ? [{ ...handed, status: "dirty", content: null }]
    : [];
  const emptied = (base: ActorState) => ({
    ...base,
    carrying: base.carrying.filter((_, index) => index !== carriedIndex),
  });
  if (!target) {
    if (orderConfig.invalidSubmission === "reject") {
      // 거절이라 행동력을 쓰지 않는다.
      return refuse(state, actor, `현재 주문에 없는 ${withParticle(label)} 제출할 수 없습니다.`);
    }
    return event(
      state,
      `${actor.name}이(가) 주문에 없는 ${withParticle(label)} 처분했습니다.`,
      {
        actors: patchActor(
          state,
          actorId,
          emptied(spend(actor, actionCost.carry, "CARRYING")),
        ),
        pendingReturns: [...state.pendingReturns, ...returned],
      },
    );
  }
  const orders = state.orders.map((order) =>
    order.id === target.id
      ? { ...order, submittedCount: order.submittedCount + 1 }
      : order,
  );
  const completed = orderComplete(orders.find((order) => order.id === target.id)!) &&
    !orderComplete(target);
  const filled = state.mode === "endless"
    ? state.filled + (completed ? 1 : 0)
    : orders.filter(orderComplete).length;
  const cleared = filled > state.filled;
  const allDone = orders.every(orderComplete);
  const submitted = orders.find((order) => order.id === target.id)!;
  const nextOrders = state.mode === "endless" && allDone
    ? endlessOrders(state.seed, filled)
    : orders;
  return event(
    state,
    state.mode === "endless" && cleared
      ? `음식 주문 완료 — ${filled}점 (+${ENDLESS_ORDER_TURN_BONUS}턴)`
      : cleared
      ? `음식 주문 완료 — ${filled}/${passMark(currentStage(state))}`
      : `${label} 제출 — ${submitted.submittedCount}/${submitted.targetCount}`,
    {
      actors: patchActor(
        state,
        actorId,
        emptied(spend(actor, actionCost.carry, "CARRYING")),
      ),
      orders: nextOrders,
      filled,
      turnsLeft: state.turnsLeft +
        (state.mode === "endless" && completed ? ENDLESS_ORDER_TURN_BONUS : 0),
      pendingReturns: [...state.pendingReturns, ...returned],
      // 레시피 목록을 다 처리하면 남은 턴과 무관하게 끝난다.
      phase:
        state.mode !== "endless" && allDone && orderConfig.endRoundWhenOrdersDone
          ? filled >= passMark(currentStage(state))
            ? "won"
            : "lost"
          : "playing",
    },
  );
}

// 턴 종료. 남은 행동력은 소멸하고, 재료가 차고, 스테이지 남은 턴이 준다.
export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const actors: Partial<Record<ActorId, ActorState>> = {};
  for (const id of Object.keys(state.actors) as ActorId[]) {
    const actor = state.actors[id]!;
    actors[id] = {
      ...actor,
      actionPoints: maxActionPoints(actor.typeId),
      status: "IDLE",
    };
  }
  const ingredients = { ...state.ingredients };
  for (const { id } of boxInstances) {
    ingredients[id] = {
      stock: Math.min(INGREDIENT_MAX, ingredients[id]!.stock + INGREDIENT_PER_TURN),
    };
  }
  // 제출한 그릇은 한 턴 뒤 첫 반납대에 더러운 채로 나온다.
  const returnStation = stationInstancesByType["dish-return"][0];
  const dishReturns = { ...state.dishReturns };
  if (returnStation && state.pendingReturns.length > 0) {
    dishReturns[returnStation.id] = [
      ...(dishReturns[returnStation.id] ?? []),
      ...state.pendingReturns,
    ];
  }
  const turnsLeft = state.turnsLeft - 1;
  const played = {
    ...state,
    actors,
    ingredients,
    dishReturns,
    pendingReturns: [],
    turnsLeft,
    turn: state.turn + 1,
  };
  if (turnsLeft > 0) {
    return { ...played, refusal: null };
  }
  const stage = currentStage(played);
  return event(
    played,
    played.mode === "endless"
      ? `무한 모드 종료 — 최종 점수 ${played.filled}점`
      : `${stage.id} 영업 종료 — 주문 ${played.filled}/${passMark(stage)}건 완료`,
    { phase: roundResult(played), turnsLeft: 0 },
  );
}
