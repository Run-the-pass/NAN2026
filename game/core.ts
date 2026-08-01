export type SlimeElement = "water" | "fire" | "lightning" | "earth";
export type SlimeTypeId = SlimeElement;
// 슬라임 한 마리의 인스턴스 ID(`water-1`, `water-2`). 같은 속성을 여러
// 마리 데려올 수 있으므로 속성 자체를 키로 쓰지 않는다. 속성은
// ActorState.typeId에서 읽는다.
export type ActorId = string;
export type ItemId = "mushroom" | "grilled-mushroom";
export type DishStatus = "clean" | "filled" | "dirty";
export type Dish = { id: string; status: DishStatus; content: ItemId | null };
export type Carried = ItemId | Dish;
export type StationId =
  | "ingredient-box"
  | "stove"
  | "submission"
  | "trash"
  | "dish-rack"
  | "washer"
  | "table";
export type ActorStatus = "IDLE" | "MOVING" | "WORKING" | "WAITING";
export type WorkstationStatus =
  | "IDLE"
  | "MISSING_MATERIAL"
  | "WORKING"
  | "COMPLETE";
export type TilePosition = { col: number; row: number };
export type Position = { x: number; y: number };

export const itemLabel = (item: ItemId) =>
  item === "mushroom" ? "버섯" : "버섯 구이";

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
  "ingredient-box": "재료 상자",
  stove: "조리 도구",
  submission: "음식 제출대",
  trash: "쓰레기 처리 공간",
  "dish-rack": "그릇 생성대",
  washer: "세척기",
  table: "테이블",
};

export const allItems: ItemId[] = ["mushroom", "grilled-mushroom"];
export const allStations: StationId[] = [
  "ingredient-box",
  "stove",
  "submission",
  "trash",
  "dish-rack",
  "washer",
  "table",
];

export type StatLevels = { workSpeed: number; moveSpeed: number };

export const slimeTypes: Record<
  SlimeTypeId,
  {
    name: string;
    trait: string;
    role: string;
    element: SlimeElement;
    elementLabel: string;
    statLevels: StatLevels;
  }
> = {
  water: {
    name: "물",
    trait: "물을 공급하고 설거지와 화재 진화를 담당합니다.",
    role: "물 공급 · 설거지 · 소화",
    element: "water",
    elementLabel: "물",
    statLevels: { workSpeed: 2, moveSpeed: 1 },
  },
  fire: {
    name: "불",
    trait: "열을 다뤄 음식을 조리하고 쓰레기를 소각합니다.",
    role: "가열 · 조리 · 소각",
    element: "fire",
    elementLabel: "불",
    statLevels: { workSpeed: 3, moveSpeed: 1 },
  },
  lightning: {
    name: "번개",
    trait: "빠르게 재료와 음식을 운반하고 전자 기구를 작동합니다.",
    role: "운반 · 발전 · 전자 기구",
    element: "lightning",
    elementLabel: "번개",
    statLevels: { workSpeed: 1, moveSpeed: 3 },
  },
  earth: {
    name: "땅",
    trait: "재료를 손질하고 여러 그릇을 안정적으로 나릅니다.",
    role: "손질 · 썰기 · 다중 운반",
    element: "earth",
    elementLabel: "땅",
    statLevels: { workSpeed: 2, moveSpeed: 1 },
  },
};

export const statTables = {
  workSpeedMultiplier: [0.7, 0.85, 1, 1.2, 1.45, 1.75],
  moveTilesPerSecond: [1.6, 1.9, 2.2, 2.5, 2.8, 3.1],
} as const;

// 아직 확정되지 않은 주문·화재 규칙은 여기서만 바꾼다. 기본값은 현재
// 게임 동작을 그대로 유지한다.
export const orderConfig = {
  // 동시에 노출하는 주문 수.
  activeOrderCount: 1,
  // 주문에 없는 음식 처리. reject는 거부하고 음식을 그대로 들려 둔다.
  invalidSubmission: "reject" as "reject" | "discard",
  // 목표를 일찍 채웠을 때 라운드를 바로 끝낼지.
  endRoundWhenOrdersDone: true,
};

export const fireConfig = {
  // 화재가 발생할 수 있는 설비. 여기 없는 설비에는 화재 상태를 만들지 않는다.
  flammableStations: ["stove"] as StationId[],
  // 방치 판정을 시작하는 조리 도구 상태.
  neglectStatus: "COMPLETE" as WorkstationStatus,
  igniteAfterMs: 12_000,
  spreadIntervalMs: 6_000,
  // 설비 배치 타일 거리 기준 인접 판정. 바닥 타일은 대상이 아니다.
  spreadRange: 1,
  spreadDiagonal: false,
  // 명세가 확정한 값.
  extinguishMs: 5_000,
  extinguishElement: "water" as SlimeElement,
  keepExtinguishProgress: false,
};

// 원문에서 수치가 미정인 항목은 플레이 검증값으로 한곳에 둔다.
export const dishConfig = {
  initialCount: 3,
  rackCapacity: 3,
  washerCapacity: 1,
  washMs: 4_000,
  earthDishCarry: 2,
  tableCapacity: 1,
  dragThresholdPx: 8,
};

export type Order = {
  id: string;
  foodId: ItemId;
  targetCount: number;
  submittedCount: number;
};

// 스테이지 한 판. 스테이지를 늘릴 때 코드가 아니라 이 목록만 바꾼다.
// TIP과 나올 수 있는 음식 목록은 소개 화면을 만들 때 함께 추가한다.
export type Stage = {
  id: string;
  name: string;
  orders: Order[];
  timeLimitMs: number;
};

export type FireState = {
  neglectMs: number;
  onFire: boolean;
  workerId: ActorId | null;
  extinguishMs: number;
  spreadMs: number;
};

export type ActorIntent =
  | { kind: "MOVE"; destination: Position; route: Position[] }
  | { kind: "INTERACT"; station: StationId; leader: ActorId | null; route: Position[] };

export type ActorState = {
  typeId: SlimeTypeId;
  name: string;
  x: number;
  y: number;
  moveSpeed: number;
  status: ActorStatus;
  carrying: Carried[];
  intent: ActorIntent | null;
  workLeftMs: number;
  statLevels: StatLevels;
  buffs: string[];
  alert: string | null;
  alertMs: number;
};

export type GameState = {
  seed: number;
  phase: "playing" | "won" | "lost";
  timeLeft: number;
  timeLeftMs: number;
  filled: number;
  goal: number;
  gold: number;
  actors: Partial<Record<ActorId, ActorState>>;
  ingredients: { stock: number; timerMs: number };
  stove: ItemId[];
  dishRack: Dish[];
  table: Carried[];
  washer: {
    dish: Dish | null;
    workerId: ActorId | null;
    progressMs: number;
    totalMs: number;
  };
  workstation: {
    status: WorkstationStatus;
    workerId: ActorId | null;
    progressMs: number;
    totalMs: number;
  };
  orders: Order[];
  fires: Partial<Record<StationId, FireState>>;
  // 이번 판의 스테이지 목록과 지금 진행 중인 위치.
  stages: Stage[];
  stageIndex: number;
  squad: SlimeTypeId[];
  // 주문에 없는 음식을 제출한 횟수. 표시용이며 골드에는 영향이 없다.
  misses: number;
  lastEvent: string;
  history: string[];
};

export const TILE_SIZE = 60;
export const GOLD_PER_ORDER = 100;
export const INGREDIENT_MAX = 4;
export const INGREDIENT_INTERVAL_MS = 6_000;
export const STORAGE_MAX = 1;

// I 재료 상자, C 조리 도구, S 제출대, X 쓰레기, D 그릇, W 세척기, T 테이블.
export const KITCHEN_ROWS = [
  "################",
  "#..............#",
  "#..............#",
  "#...I...T..D...#",
  "#..............#",
  "#..C........W..#",
  "#..............#",
  "#.....S..X.....#",
  "#..............#",
  "################",
] as const;

export const displayTiles: Record<StationId, TilePosition> = {
  "ingredient-box": { col: 4, row: 3 },
  stove: { col: 3, row: 5 },
  submission: { col: 6, row: 7 },
  trash: { col: 9, row: 7 },
  "dish-rack": { col: 11, row: 3 },
  washer: { col: 12, row: 5 },
  table: { col: 8, row: 3 },
};

export const taskTiles: Record<StationId, TilePosition> = {
  "ingredient-box": { col: 4, row: 4 },
  stove: { col: 3, row: 6 },
  submission: { col: 6, row: 6 },
  trash: { col: 9, row: 6 },
  "dish-rack": { col: 11, row: 4 },
  washer: { col: 12, row: 6 },
  table: { col: 8, row: 4 },
};

export const spawnTiles: TilePosition[] = [
  { col: 7, row: 5 },
  { col: 5, row: 8 },
  { col: 10, row: 8 },
  { col: 8, row: 8 },
];

const workDuration = { interact: 700, cook: 4_000 };

export const tileCenter = ({ col, row }: TilePosition) => ({
  x: col * TILE_SIZE + TILE_SIZE / 2,
  y: row * TILE_SIZE + TILE_SIZE / 2,
});

const hitboxHalfSize = { x: 46, y: 42 };
export const stationHitboxes = allStations.map((id) => {
  const center = tileCenter(displayTiles[id]);
  return {
    centerX: center.x,
    centerY: center.y,
    halfWidth: hitboxHalfSize.x,
    halfHeight: hitboxHalfSize.y,
  };
});

function segmentCrossesHitbox(from: Position, to: Position) {
  return stationHitboxes.some((box) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let near = 0;
    let far = 1;
    for (const [direction, distance] of [
      [-dx, from.x - (box.centerX - box.halfWidth)],
      [dx, box.centerX + box.halfWidth - from.x],
      [-dy, from.y - (box.centerY - box.halfHeight)],
      [dy, box.centerY + box.halfHeight - from.y],
    ]) {
      if (direction === 0) {
        if (distance < 0) return false;
        continue;
      }
      const ratio = distance / direction;
      if (direction < 0) near = Math.max(near, ratio);
      else far = Math.min(far, ratio);
      if (near > far) return false;
    }
    return near < 1 && far > 0;
  });
}

function routeBetween(from: Position, to: Position) {
  const nodes = [
    from,
    to,
    ...stationHitboxes.flatMap((box) => [
      { x: box.centerX - box.halfWidth - 2, y: box.centerY - box.halfHeight - 2 },
      { x: box.centerX + box.halfWidth + 2, y: box.centerY - box.halfHeight - 2 },
      { x: box.centerX - box.halfWidth - 2, y: box.centerY + box.halfHeight + 2 },
      { x: box.centerX + box.halfWidth + 2, y: box.centerY + box.halfHeight + 2 },
    ]),
  ];
  const costs = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = nodes.map(() => false);
  costs[0] = 0;
  for (let count = 0; count < nodes.length; count += 1) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!visited[index] && (current < 0 || costs[index] < costs[current])) current = index;
    }
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited[current] = true;
    for (let index = 1; index < nodes.length; index += 1) {
      if (visited[index] || segmentCrossesHitbox(nodes[current], nodes[index])) continue;
      const cost = costs[current] + Math.hypot(
        nodes[index].x - nodes[current].x,
        nodes[index].y - nodes[current].y,
      );
      if (cost < costs[index]) {
        costs[index] = cost;
        previous[index] = current;
      }
    }
  }
  if (!Number.isFinite(costs[1])) return [];
  const route: Position[] = [];
  for (let index = 1; index > 0; index = previous[index]) route.unshift(nodes[index]);
  return route;
}

function routeLength(from: Position, route: Position[]) {
  let total = 0;
  for (const point of route) {
    total += Math.hypot(point.x - from.x, point.y - from.y);
    from = point;
  }
  return total;
}

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
  const kind = slimeTypes[typeId];
  return {
    typeId,
    name,
    ...tileCenter(spawn),
    moveSpeed:
      statTables.moveTilesPerSecond[kind.statLevels.moveSpeed] * TILE_SIZE,
    status: "IDLE",
    carrying: [],
    intent: null,
    workLeftMs: 0,
    statLevels: { ...kind.statLevels },
    buffs: [],
    alert: null,
    alertMs: 0,
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

export const activeOrders = (state: GameState) =>
  state.orders
    .filter((order) => !orderComplete(order))
    .slice(0, orderConfig.activeOrderCount);

// 라운드 종료 판정. 필수 주문을 모두 채웠는지만 본다.
export const roundResult = (state: GameState): "won" | "lost" =>
  state.orders.every(orderComplete) ? "won" : "lost";

const newFires = (): Partial<Record<StationId, FireState>> =>
  Object.fromEntries(
    fireConfig.flammableStations.map((station) => [
      station,
      { neglectMs: 0, onFire: false, workerId: null, extinguishMs: 0, spreadMs: 0 },
    ]),
  );

// 기본 스테이지 목록. 이름과 주문 수는 임시값이며 기획이 정해지면
// 이 배열만 바꾸면 된다.
export const defaultStages = (): Stage[] => [
  { id: "1-1", name: "첫 영업", orders: mushroomOrders(3), timeLimitMs: 180_000 },
  { id: "1-2", name: "점심 러시", orders: mushroomOrders(5), timeLimitMs: 180_000 },
  { id: "1-3", name: "저녁 마감", orders: mushroomOrders(7), timeLimitMs: 180_000 },
];

function mushroomOrders(count: number): Order[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `order-${index + 1}`,
    foodId: "grilled-mushroom" as ItemId,
    targetCount: 1,
    submittedCount: 0,
  }));
}

// 스테이지 목록도 외부에서 들어올 수 있으므로 코어에 들이기 전에 검증한다.
function checkStages(stages: Stage[], stageIndex: number): Stage[] {
  if (
    stages.length < 1 ||
    new Set(stages.map((stage) => stage.id)).size !== stages.length ||
    stages.some(
      (stage) =>
        !stage.id ||
        !stage.name ||
        !Number.isSafeInteger(stage.timeLimitMs) ||
        stage.timeLimitMs < 1_000,
    ) ||
    !Number.isSafeInteger(stageIndex) ||
    stageIndex < 0 ||
    stageIndex >= stages.length
  ) {
    throw new Error("스테이지 목록이 올바르지 않습니다.");
  }
  return stages.map((stage) => ({
    ...stage,
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
): GameState {
  // 같은 속성을 여러 마리 데려올 수 있다. 스폰 자리 수만 제한한다.
  if (
    squad.length < 1 ||
    squad.length > spawnTiles.length ||
    squad.some((typeId) => !(typeId in slimeTypes))
  ) {
    throw new Error(`스쿼드는 속성 슬라임 1~${spawnTiles.length}마리여야 합니다.`);
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
    const label = `${slimeTypes[typeId].name} 슬라임`;
    actors[ids[index]] = makeActor(
      typeId,
      spawnTiles[index],
      total[typeId]! > 1 ? `${label} ${ids[index].split("-")[1]}호` : label,
    );
  });
  return {
    seed: seed >>> 0,
    phase: "playing",
    timeLeft: Math.ceil(stage.timeLimitMs / 1000),
    timeLeftMs: stage.timeLimitMs,
    filled: 0,
    goal: roundOrders.length,
    gold: 0,
    actors,
    ingredients: { stock: 1, timerMs: INGREDIENT_INTERVAL_MS },
    stove: [],
    dishRack: Array.from(
      { length: Math.min(dishConfig.initialCount, dishConfig.rackCapacity) },
      (_, index) => ({
        id: `dish-${index + 1}`,
        status: "clean" as const,
        content: null,
      }),
    ),
    table: [],
    washer: {
      dish: null,
      workerId: null,
      progressMs: 0,
      totalMs: dishConfig.washMs,
    },
    workstation: {
      status: "MISSING_MATERIAL",
      workerId: null,
      progressMs: 0,
      totalMs: workDuration.cook,
    },
    orders: roundOrders,
    fires: newFires(),
    stages: roundStages,
    stageIndex,
    squad: [...squad],
    misses: 0,
    lastEvent: `${stage.id} ${stage.name} — 음식 주문 ${roundOrders.length}건을 완료하세요.`,
    history: [`${stage.id} 영업 시작`],
  };
}

// 스테이지를 깬 뒤 다음 스테이지 상태를 만든다. 골드와 스쿼드는 잇고
// 설비·소지품·화재는 새로 시작한다.
export function nextStage(state: GameState): GameState {
  if (state.phase !== "won" || isLastStage(state)) return state;
  return {
    ...initialState(state.seed, state.squad, state.stages, state.stageIndex + 1),
    gold: state.gold,
  };
}

function advanceSeed(seed: number) {
  let next = seed || 1;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function event(state: GameState, message: string, patch: Partial<GameState>) {
  return {
    ...state,
    ...patch,
    seed: advanceSeed(state.seed),
    lastEvent: message,
    history: [...state.history.slice(-7), message],
  };
}

function patchActor(
  state: GameState,
  actorId: ActorId,
  next: ActorState,
): Partial<Record<ActorId, ActorState>> {
  return { ...state.actors, [actorId]: next };
}

function carryCapacity(actor: ActorState, carried: Carried) {
  return actor.typeId === "earth" && isDish(carried)
    ? dishConfig.earthDishCarry
    : 1;
}

function canCarry(actor: ActorState, carried: Carried) {
  if (actor.carrying.length >= carryCapacity(actor, carried)) return false;
  return (
    actor.carrying.length === 0 ||
    (isDish(carried) && actor.carrying.every(isDish))
  );
}

const dishIndex = (
  actor: ActorState,
  test: (dish: Dish) => boolean,
) => actor.carrying.findIndex((carried) => isDish(carried) && test(carried));

function releaseWork(state: GameState, actorIds: ActorId[]): GameState {
  let next = state;
  if (
    next.workstation.workerId &&
    actorIds.includes(next.workstation.workerId)
  ) {
    next = {
      ...next,
      workstation: {
        ...next.workstation,
        status: next.stove.includes("mushroom") ? "IDLE" : "MISSING_MATERIAL",
        workerId: null,
        progressMs: 0,
      },
    };
  }
  if (next.washer.workerId && actorIds.includes(next.washer.workerId)) {
    next = {
      ...next,
      washer: { ...next.washer, workerId: null, progressMs: 0 },
    };
  }
  // 진화하던 슬라임이 새 지시를 받으면 설정에 따라 진행도를 버린다.
  const fires = { ...next.fires };
  let dropped = false;
  for (const station of Object.keys(fires) as StationId[]) {
    const fire = fires[station]!;
    if (!fire.workerId || !actorIds.includes(fire.workerId)) continue;
    fires[station] = {
      ...fire,
      workerId: null,
      extinguishMs: fireConfig.keepExtinguishProgress ? fire.extinguishMs : 0,
    };
    dropped = true;
  }
  return dropped ? { ...next, fires } : next;
}

const isBurning = (state: GameState, station: StationId) =>
  state.fires[station]?.onFire === true;

// 설비끼리의 배치 거리로만 인접을 본다. 바닥 타일은 전파 경로가 아니다.
function isAdjacentStation(one: StationId, two: StationId) {
  const from = displayTiles[one];
  const to = displayTiles[two];
  const cols = Math.abs(from.col - to.col);
  const rows = Math.abs(from.row - to.row);
  return fireConfig.spreadDiagonal
    ? Math.max(cols, rows) <= fireConfig.spreadRange
    : cols + rows <= fireConfig.spreadRange;
}

export function moveActors(
  state: GameState,
  actorIds: ActorId[],
  destination: Position,
): GameState {
  if (
    state.phase !== "playing" ||
    !Number.isFinite(destination.x) ||
    !Number.isFinite(destination.y) ||
    !isWalkable(pixelToTile(destination.x, destination.y))
  ) return state;
  const ids = [...new Set(actorIds)];
  const base = releaseWork(state, ids);
  let actors = base.actors;
  let moved = 0;
  for (const actorId of ids) {
    const actor = actors[actorId];
    if (!actor) continue;
    const route = routeBetween(actor, destination);
    if (!route.length) continue;
    actors = patchActor({ ...base, actors }, actorId, {
      ...actor,
      intent: { kind: "MOVE", destination, route },
      status: "MOVING",
      workLeftMs: 0,
      alert: null,
      alertMs: 0,
    });
    moved += 1;
  }
  return moved
    ? event(base, `${moved}마리에게 이동을 지시했습니다.`, { actors })
    : state;
}

function canUseStation(
  state: GameState,
  actor: ActorState,
  station: StationId,
) {
  // 불이 난 설비는 진화 외의 어떤 작업도 시작할 수 없다.
  if (isBurning(state, station)) {
    return actor.typeId === fireConfig.extinguishElement;
  }
  if (station === "table") {
    return actor.carrying.length > 0
      ? state.table.length < dishConfig.tableCapacity
      : Boolean(state.table[0] && canCarry(actor, state.table[0]));
  }
  if (station === "dish-rack") {
    const nextDish = state.dishRack[0];
    return nextDish && canCarry(actor, nextDish)
      ? true
      : dishIndex(actor, (dish) => dish.status === "clean") >= 0 &&
          state.dishRack.length < dishConfig.rackCapacity;
  }
  if (station === "washer") {
    const dirty = dishIndex(actor, (dish) => dish.status === "dirty") >= 0;
    if (!state.washer.dish) return dirty;
    if (state.washer.dish.status === "dirty") {
      return actor.typeId === "water" && !state.washer.workerId;
    }
    return canCarry(actor, state.washer.dish);
  }
  if (station === "submission" || station === "trash") {
    return actor.carrying.length > 0;
  }
  if (station === "ingredient-box") {
    const clean = dishIndex(actor, (dish) => dish.status === "clean") >= 0;
    return clean || canCarry(actor, "mushroom");
  }
  if (station === "stove") {
    return (
      actor.carrying.includes("mushroom") ||
      dishIndex(actor, (dish) => dish.content === "mushroom") >= 0 ||
      (state.stove.includes("grilled-mushroom") &&
        dishIndex(actor, (dish) => dish.status === "clean") >= 0) ||
      state.stove.includes("grilled-mushroom") ||
      actor.typeId === "fire"
    );
  }
  return false;
}

export function interactActors(
  state: GameState,
  actorIds: ActorId[],
  station: StationId,
): GameState {
  if (state.phase !== "playing") return state;
  const ids = [...new Set(actorIds)];
  const base = releaseWork(state, ids);
  const orders = ids
    .map((actorId) => {
      const actor = base.actors[actorId];
      return actor ? { actorId, actor } : null;
    })
    .filter((order): order is NonNullable<typeof order> => Boolean(order));
  const leader =
    orders
      .filter(({ actor }) => canUseStation(base, actor, station))
      .sort((a, b) => {
        const destination = tileCenter(taskTiles[station]);
        return (
          routeLength(a.actor, routeBetween(a.actor, destination)) / a.actor.moveSpeed -
          routeLength(b.actor, routeBetween(b.actor, destination)) / b.actor.moveSpeed
        );
      })[0]?.actorId ?? null;
  let actors = base.actors;
  for (const { actorId, actor } of orders) {
    const route = routeBetween(actor, tileCenter(taskTiles[station]));
    if (!route.length) continue;
    actors = patchActor({ ...base, actors }, actorId, {
      ...actor,
      intent: { kind: "INTERACT", station, leader, route },
      status: "MOVING",
      workLeftMs: 0,
      alert: null,
      alertMs: 0,
    });
  }
  return orders.length
    ? event(
        base,
        `${orders.length}마리에게 ${stationLabels[station]} 상호작용을 지시했습니다.`,
        { actors },
      )
    : state;
}

function workDurationFor(actor: ActorState, base: number) {
  return base / statTables.workSpeedMultiplier[actor.statLevels.workSpeed];
}

function waitAtStation(actor: ActorState, keepIntent = false): ActorState {
  return {
    ...actor,
    intent: keepIntent ? actor.intent : null,
    status: "WAITING",
    workLeftMs: 0,
    alert: "WAITING",
    alertMs: 1_800,
  };
}

function refuse(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  message: string,
  alert = "INVALID_ROUTE",
) {
  const nextActor: ActorState = {
    ...actor,
    intent: null,
    status: "IDLE",
    workLeftMs: 0,
    alert,
    alertMs: 1_800,
  };
  return event(state, `${actor.name}: ${message}`, {
    actors: patchActor(state, actorId, nextActor),
  });
}

function submitFood(
  state: GameState,
  actorId: ActorId,
  actor: ActorState,
  carriedIndex: number,
  food: ItemId,
) {
  // 음식 이름이 아니라 ID로 현재 주문과 대조한다.
  const target = activeOrders(state).find((order) => order.foodId === food);
  const label = itemLabel(food);
  if (!target) {
    // 실수는 횟수만 센다. 골드는 깎지 않는다.
    const missed = { ...state, misses: state.misses + 1 };
    if (orderConfig.invalidSubmission === "reject") {
      return refuse(
        missed,
        actorId,
        actor,
        `현재 주문에 없는 ${withParticle(label)} 제출할 수 없습니다.`,
      );
    }
    return event(
      missed,
      `${actor.name}이(가) 주문에 없는 ${withParticle(label)} 처분했습니다.`,
      {
        actors: patchActor(missed, actorId, {
          ...actor,
          carrying: actor.carrying.map((carried, index) =>
            index === carriedIndex && isDish(carried)
              ? { ...carried, status: "dirty", content: null }
              : carried,
          ),
          intent: null,
          status: "IDLE",
        }),
      },
    );
  }
  const orders = state.orders.map((order) =>
    order.id === target.id
      ? { ...order, submittedCount: order.submittedCount + 1 }
      : order,
  );
  const filled = orders.filter(orderComplete).length;
  const cleared = filled > state.filled;
  const allDone = orders.every(orderComplete);
  const nextActor = {
    ...actor,
    carrying: actor.carrying.map((carried, index) =>
      index === carriedIndex && isDish(carried)
        ? { ...carried, status: "dirty" as const, content: null }
        : carried,
    ),
    intent: null,
    status: "IDLE" as const,
  };
  const submitted = orders.find((order) => order.id === target.id)!;
  return event(
    state,
    cleared
      ? `음식 주문 완료 — ${filled}/${orders.length} (+${GOLD_PER_ORDER}G)`
      : `${label} 제출 — ${submitted.submittedCount}/${submitted.targetCount}`,
    {
      actors: patchActor(state, actorId, nextActor),
      orders,
      filled,
      gold: cleared ? state.gold + GOLD_PER_ORDER : state.gold,
      phase: allDone && orderConfig.endRoundWhenOrdersDone ? "won" : "playing",
    },
  );
}

function moveActor(state: GameState, actorId: ActorId, deltaMs: number) {
  let next = state;
  let remaining = deltaMs;
  let actor = next.actors[actorId]!;
  while (remaining > 0 && next.phase === "playing" && actor.intent) {
    // actor를 재할당하면 intent 좁히기가 풀리므로 먼저 붙잡아 둔다.
    const intent = actor.intent;
    if (actor.status === "MOVING") {
      const destination = intent.route[0];
      if (destination) {
        const dx = destination.x - actor.x;
        const dy = destination.y - actor.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.001) {
          const travelMs = (distance / actor.moveSpeed) * 1000;
          if (travelMs > remaining) {
            const ratio = remaining / travelMs;
            actor = {
              ...actor,
              x: actor.x + dx * ratio,
              y: actor.y + dy * ratio,
            };
            remaining = 0;
            break;
          }
          actor = { ...actor, x: destination.x, y: destination.y };
          remaining -= travelMs;
        }
        actor = {
          ...actor,
          intent: { ...intent, route: intent.route.slice(1) },
        };
        continue;
      }

      if (actor.intent.kind === "MOVE") {
        actor = { ...actor, intent: null, status: "IDLE" };
        break;
      }
      if (actor.intent.leader !== actorId) {
        // 불난 설비에서는 진화 속성만 남고 나머지는 작업 불가다.
        const burning = isBurning(next, actor.intent.station);
        const wrongElement = burning
          ? actor.typeId !== fireConfig.extinguishElement
          : actor.intent.station === "stove" &&
            actor.carrying.length === 0 &&
            !next.stove.includes("grilled-mushroom") &&
            actor.typeId !== "fire";
        if (wrongElement) {
          next = refuse(
            next,
            actorId,
            actor,
            burning
              ? "물 슬라임만 불을 끌 수 있습니다."
              : "불 슬라임만 가열 조리를 할 수 있습니다.",
            "WRONG_ELEMENT",
          );
          actor = next.actors[actorId]!;
        } else if (!actor.intent.leader) {
          next = refuse(
            next,
            actorId,
            actor,
            `${withParticle(stationLabels[actor.intent.station])} 지금 사용할 수 없습니다.`,
          );
          actor = next.actors[actorId]!;
        } else {
          actor = waitAtStation(actor);
          next = event(
            next,
            `${actor.name}이(가) 다른 슬라임의 작업을 기다립니다.`,
            { actors: patchActor(next, actorId, actor) },
          );
        }
        remaining = 0;
        break;
      }
      actor = {
        ...actor,
        status: "WORKING",
        workLeftMs: workDurationFor(actor, workDuration.interact),
      };
      continue;
    }

    // 진화는 조리와 같은 방식으로 진행도를 쌓는다. 작업자를 잡아 둔
    // 뒤에만 여기로 들어오므로 접근 동작이 진행도로 새지 않는다.
    const extinguishing =
      actor.intent.kind === "INTERACT" &&
      next.fires[actor.intent.station]?.workerId === actorId;
    if (extinguishing && actor.intent.kind === "INTERACT") {
      const station = actor.intent.station;
      const fire = next.fires[station]!;
      const spent = Math.min(actor.workLeftMs, remaining);
      const extinguishMs = Math.min(
        fireConfig.extinguishMs,
        fire.extinguishMs + spent,
      );
      if (actor.workLeftMs > remaining) {
        actor = { ...actor, workLeftMs: actor.workLeftMs - remaining };
        next = {
          ...next,
          fires: { ...next.fires, [station]: { ...fire, extinguishMs } },
        };
        remaining = 0;
        break;
      }
      remaining -= actor.workLeftMs;
      actor = {
        ...actor,
        intent: null,
        status: "IDLE",
        workLeftMs: 0,
        alert: null,
        alertMs: 0,
      };
      next = event(
        next,
        `${actor.name}이(가) ${withParticle(stationLabels[station])} 진화했습니다.`,
        {
          actors: patchActor(next, actorId, actor),
          fires: {
            ...next.fires,
            [station]: {
              neglectMs: 0,
              onFire: false,
              workerId: null,
              extinguishMs: 0,
              spreadMs: 0,
            },
          },
        },
      );
      continue;
    }

    const washing =
      actor.intent.kind === "INTERACT" &&
      actor.intent.station === "washer" &&
      next.washer.workerId === actorId;
    if (washing) {
      const spent = Math.min(actor.workLeftMs, remaining);
      const progressMs = Math.min(next.washer.totalMs, next.washer.progressMs + spent);
      if (actor.workLeftMs > remaining) {
        actor = { ...actor, workLeftMs: actor.workLeftMs - remaining };
        next = { ...next, washer: { ...next.washer, progressMs } };
        remaining = 0;
        break;
      }
      remaining -= actor.workLeftMs;
      actor = {
        ...actor,
        intent: null,
        status: "IDLE",
        workLeftMs: 0,
        alert: null,
        alertMs: 0,
      };
      next = event(next, `${actor.name}이(가) 그릇을 깨끗이 씻었습니다.`, {
        actors: patchActor(next, actorId, actor),
        washer: {
          ...next.washer,
          dish: next.washer.dish
            ? { ...next.washer.dish, status: "clean", content: null }
            : null,
          workerId: null,
          progressMs: next.washer.totalMs,
        },
      });
      continue;
    }

    const cooking =
      actor.intent.kind === "INTERACT" &&
      actor.intent.station === "stove" &&
      next.workstation.status === "WORKING" &&
      next.workstation.workerId === actorId;
    if (cooking) {
      const spent = Math.min(actor.workLeftMs, remaining);
      const progressMs = Math.min(
        next.workstation.totalMs,
        next.workstation.progressMs + spent,
      );
      if (actor.workLeftMs > remaining) {
        actor = { ...actor, workLeftMs: actor.workLeftMs - remaining };
        next = {
          ...next,
          workstation: { ...next.workstation, progressMs },
        };
        remaining = 0;
        break;
      }
      remaining -= actor.workLeftMs;
      actor = {
        ...actor,
        intent: null,
        status: "IDLE",
        workLeftMs: 0,
        alert: null,
        alertMs: 0,
      };
      next = event(next, `${actor.name}이(가) 버섯 구이를 완성했습니다.`, {
        actors: patchActor(next, actorId, actor),
        stove: ["grilled-mushroom"],
        workstation: {
          ...next.workstation,
          status: "COMPLETE",
          workerId: null,
          progressMs: next.workstation.totalMs,
        },
      });
      continue;
    }

    if (actor.workLeftMs > remaining) {
      actor = { ...actor, workLeftMs: actor.workLeftMs - remaining };
      remaining = 0;
      break;
    }
    remaining -= actor.workLeftMs;
    if (actor.intent.kind !== "INTERACT") {
      actor = { ...actor, intent: null, status: "IDLE", workLeftMs: 0 };
      continue;
    }
    const station = actor.intent.station;

    // 불이 났으면 다른 작업은 시작하지 않고 진화만 건다.
    const fire = next.fires[station];
    if (fire?.onFire) {
      if (actor.typeId !== fireConfig.extinguishElement) {
        next = refuse(
          next,
          actorId,
          actor,
          "물 슬라임만 불을 끌 수 있습니다.",
          "WRONG_ELEMENT",
        );
        actor = next.actors[actorId]!;
        continue;
      }
      const from = fireConfig.keepExtinguishProgress ? fire.extinguishMs : 0;
      actor = {
        ...actor,
        status: "WORKING",
        workLeftMs: fireConfig.extinguishMs - from,
        alert: null,
        alertMs: 0,
      };
      next = event(
        next,
        `${actor.name}이(가) ${withParticle(stationLabels[station])} 진화하기 시작했습니다.`,
        {
          actors: patchActor(next, actorId, actor),
          fires: {
            ...next.fires,
            [station]: { ...fire, workerId: actorId, extinguishMs: from },
          },
        },
      );
      continue;
    }

    if (
      station === "stove" &&
      next.workstation.status === "WORKING" &&
      next.workstation.workerId !== actorId
    ) {
      actor = waitAtStation(actor);
      remaining = 0;
      break;
    }

    if (station === "table") {
      if (actor.carrying.length > 0) {
        if (next.table.length >= dishConfig.tableCapacity) {
          next = refuse(next, actorId, actor, "테이블에 빈 자리가 없습니다.", "TARGET_FULL");
          actor = next.actors[actorId]!;
          continue;
        }
        const carried = actor.carrying[0];
        actor = { ...actor, carrying: actor.carrying.slice(1), intent: null, status: "IDLE" };
        next = event(next, `${actor.name}이(가) ${withParticle(carriedLabel(carried))} 테이블에 놓았습니다.`, {
          actors: patchActor(next, actorId, actor),
          table: [...next.table, carried],
        });
        continue;
      }
      const carried = next.table[0];
      if (!carried || !canCarry(actor, carried)) {
        next = refuse(next, actorId, actor, "테이블에서 집을 수 있는 물건이 없습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      actor = { ...actor, carrying: [carried], intent: null, status: "IDLE" };
      next = event(next, `${actor.name}이(가) 테이블에서 ${withParticle(carriedLabel(carried))} 들었습니다.`, {
        actors: patchActor(next, actorId, actor),
        table: next.table.slice(1),
      });
      continue;
    }

    if (station === "dish-rack") {
      const ready = next.dishRack[0];
      if (ready && canCarry(actor, ready)) {
        actor = {
          ...actor,
          carrying: [...actor.carrying, ready],
          intent: null,
          status: "IDLE",
        };
        next = event(next, `${actor.name}이(가) 깨끗한 그릇을 들었습니다.`, {
          actors: patchActor(next, actorId, actor),
          dishRack: next.dishRack.slice(1),
        });
        continue;
      }
      const clean = dishIndex(actor, (dish) => dish.status === "clean");
      if (clean < 0 || next.dishRack.length >= dishConfig.rackCapacity) {
        next = refuse(next, actorId, actor, "그릇을 가져가거나 반납할 수 없습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      const dish = actor.carrying[clean] as Dish;
      actor = {
        ...actor,
        carrying: actor.carrying.filter((_, index) => index !== clean),
        intent: null,
        status: "IDLE",
      };
      next = event(next, `${actor.name}이(가) 깨끗한 그릇을 반납했습니다.`, {
        actors: patchActor(next, actorId, actor),
        dishRack: [...next.dishRack, dish],
      });
      continue;
    }

    if (station === "washer") {
      if (!next.washer.dish) {
        const dirty = dishIndex(actor, (dish) => dish.status === "dirty");
        if (dirty < 0) {
          next = refuse(next, actorId, actor, "세척할 더러운 그릇이 없습니다.");
          actor = next.actors[actorId]!;
          continue;
        }
        const dish = actor.carrying[dirty] as Dish;
        const starts = actor.typeId === "water";
        actor = {
          ...actor,
          carrying: actor.carrying.filter((_, index) => index !== dirty),
          intent: starts ? actor.intent : null,
          status: starts ? "WORKING" : "IDLE",
          workLeftMs: starts ? dishConfig.washMs : 0,
        };
        next = event(next, starts ? `${actor.name}이(가) 그릇을 씻기 시작했습니다.` : `${actor.name}이(가) 더러운 그릇을 세척기에 놓았습니다.`, {
          actors: patchActor(next, actorId, actor),
          washer: {
            dish,
            workerId: starts ? actorId : null,
            progressMs: 0,
            totalMs: dishConfig.washMs,
          },
        });
        continue;
      }
      if (next.washer.dish.status === "dirty") {
        if (actor.typeId !== "water" || next.washer.workerId) {
          next = refuse(next, actorId, actor, "물 슬라임만 그릇을 씻을 수 있습니다.", "WRONG_ELEMENT");
          actor = next.actors[actorId]!;
          continue;
        }
        actor = { ...actor, status: "WORKING", workLeftMs: dishConfig.washMs };
        next = event(next, `${actor.name}이(가) 그릇을 씻기 시작했습니다.`, {
          actors: patchActor(next, actorId, actor),
          washer: { ...next.washer, workerId: actorId, progressMs: 0 },
        });
        continue;
      }
      if (!canCarry(actor, next.washer.dish)) {
        next = refuse(next, actorId, actor, "씻은 그릇을 들 수 없습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      actor = {
        ...actor,
        carrying: [...actor.carrying, next.washer.dish],
        intent: null,
        status: "IDLE",
      };
      next = event(next, `${actor.name}이(가) 씻은 그릇을 꺼냈습니다.`, {
        actors: patchActor(next, actorId, actor),
        washer: { ...next.washer, dish: null, workerId: null, progressMs: 0 },
      });
      continue;
    }

    if (station === "ingredient-box") {
      if (next.ingredients.stock < 1) {
        actor = waitAtStation(actor, true);
        remaining = 0;
        break;
      }
      const clean = dishIndex(actor, (dish) => dish.status === "clean");
      if (clean >= 0) {
        const carrying = actor.carrying.map((carried, index) =>
          index === clean && isDish(carried)
            ? { ...carried, status: "filled" as const, content: "mushroom" as const }
            : carried,
        );
        actor = {
          ...actor,
          carrying,
          intent: null,
          status: "IDLE",
          alert: null,
          alertMs: 0,
        };
        next = event(next, `${actor.name}이(가) 그릇에 버섯을 담았습니다.`, {
          actors: patchActor(next, actorId, actor),
          ingredients: { ...next.ingredients, stock: next.ingredients.stock - 1 },
        });
        continue;
      }
      if (!canCarry(actor, "mushroom")) {
        next = refuse(next, actorId, actor, "이미 음식이나 그릇을 들고 있습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      actor = {
        ...actor,
        carrying: [...actor.carrying, "mushroom"],
        intent: null,
        status: "IDLE",
        alert: null,
        alertMs: 0,
      };
      next = event(next, `${actor.name}이(가) 버섯을 들었습니다.`, {
        actors: patchActor(next, actorId, actor),
        ingredients: {
          ...next.ingredients,
          stock: next.ingredients.stock - 1,
        },
      });
      continue;
    }

    if (station === "stove") {
      const looseMushroom = actor.carrying.indexOf("mushroom");
      const mushroomDish = dishIndex(actor, (dish) => dish.content === "mushroom");
      if (looseMushroom >= 0 || mushroomDish >= 0) {
        if (next.stove.length >= STORAGE_MAX) {
          next = refuse(next, actorId, actor, "조리 도구가 사용 중입니다.", "TARGET_FULL");
          actor = next.actors[actorId]!;
          continue;
        }
        const carrying = actor.carrying
          .filter((_, index) => index !== looseMushroom)
          .map((carried, index) => {
            const originalIndex = looseMushroom >= 0 ? index + 1 : index;
            return originalIndex === mushroomDish && isDish(carried)
              ? { ...carried, status: "clean" as const, content: null }
              : carried;
          });
        actor = {
          ...actor,
          carrying,
          intent: null,
          status: "IDLE",
        };
        next = event(next, `${actor.name}이(가) 조리 도구에 버섯을 넣었습니다.`, {
          actors: patchActor(next, actorId, actor),
          stove: ["mushroom"],
          workstation: {
            ...next.workstation,
            status: "IDLE",
            workerId: null,
            progressMs: 0,
          },
        });
        continue;
      }
      if (next.stove.includes("grilled-mushroom")) {
        const clean = dishIndex(actor, (dish) => dish.status === "clean");
        if (clean < 0) {
          next = refuse(next, actorId, actor, "완성 음식을 담을 깨끗한 그릇이 필요합니다.");
          actor = next.actors[actorId]!;
          continue;
        }
        actor = {
          ...actor,
          carrying: actor.carrying.map((carried, index) =>
            index === clean && isDish(carried)
              ? {
                  ...carried,
                  status: "filled" as const,
                  content: "grilled-mushroom" as const,
                }
              : carried,
          ),
          intent: null,
          status: "IDLE",
        };
        next = event(next, `${actor.name}이(가) 그릇에 버섯 구이를 담았습니다.`, {
          actors: patchActor(next, actorId, actor),
          stove: [],
          workstation: {
            ...next.workstation,
            status: "MISSING_MATERIAL",
            workerId: null,
            progressMs: 0,
          },
        });
        continue;
      }
      if (actor.carrying.length > 0) {
        next = refuse(next, actorId, actor, "들고 있는 물건을 먼저 내려놓아야 합니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      if (actor.typeId !== "fire") {
        next = refuse(
          next,
          actorId,
          actor,
          "불 슬라임만 가열 조리를 할 수 있습니다.",
          "WRONG_ELEMENT",
        );
        actor = next.actors[actorId]!;
        continue;
      }
      if (!next.stove.includes("mushroom")) {
        actor = waitAtStation(actor, true);
        next = {
          ...next,
          actors: patchActor(next, actorId, actor),
          workstation: {
            ...next.workstation,
            status: "MISSING_MATERIAL",
            workerId: actorId,
            progressMs: 0,
          },
        };
        remaining = 0;
        break;
      }
      const totalMs = workDurationFor(actor, workDuration.cook);
      actor = {
        ...actor,
        status: "WORKING",
        workLeftMs: totalMs,
        alert: null,
        alertMs: 0,
      };
      next = event(next, `${actor.name}이(가) 버섯을 굽기 시작했습니다.`, {
        actors: patchActor(next, actorId, actor),
        workstation: {
          status: "WORKING",
          workerId: actorId,
          progressMs: 0,
          totalMs,
        },
      });
      continue;
    }

    if (station === "submission") {
      const filledDish = dishIndex(
        actor,
        (dish) => dish.status === "filled" && dish.content !== null,
      );
      const dish = actor.carrying[filledDish];
      if (filledDish < 0 || !dish || !isDish(dish) || !dish.content) {
        next = refuse(next, actorId, actor, "그릇에 담긴 완성 음식만 제출할 수 있습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      next = submitFood(next, actorId, actor, filledDish, dish.content);
      actor = next.actors[actorId]!;
      continue;
    }

    const carried = actor.carrying[0];
    if (!carried) {
      next = refuse(next, actorId, actor, "버릴 재료나 음식이 없습니다.");
      actor = next.actors[actorId]!;
      continue;
    }
    if (isDish(carried) && !carried.content) {
      next = refuse(next, actorId, actor, "빈 그릇은 버릴 수 없습니다.");
      actor = next.actors[actorId]!;
      continue;
    }
    const discarded = isDish(carried) ? itemLabel(carried.content!) : itemLabel(carried);
    actor = {
      ...actor,
      carrying: isDish(carried)
        ? [{ ...carried, status: "dirty", content: null }, ...actor.carrying.slice(1)]
        : actor.carrying.slice(1),
      intent: null,
      status: "IDLE",
    };
    next = event(next, `${actor.name}이(가) ${withParticle(discarded)} 버렸습니다.`, {
      actors: patchActor(next, actorId, actor),
    });
  }
  return { ...next, actors: patchActor(next, actorId, actor) };
}

function decayAlerts(state: GameState, deltaMs: number) {
  let changed = false;
  const actors = { ...state.actors };
  for (const id of Object.keys(actors) as ActorId[]) {
    const actor = actors[id]!;
    if (!actor.alert) continue;
    const alertMs = Math.max(0, actor.alertMs - deltaMs);
    actors[id] = {
      ...actor,
      status:
        alertMs === 0 && actor.status === "WAITING" && !actor.intent
          ? "IDLE"
          : actor.status,
      alertMs,
      alert: alertMs > 0 ? actor.alert : null,
    };
    changed = true;
  }
  return changed ? { ...state, actors } : state;
}

function advanceIngredients(state: GameState, deltaMs: number) {
  if (state.ingredients.stock >= INGREDIENT_MAX) {
    return {
      ...state,
      ingredients: {
        ...state.ingredients,
        timerMs: INGREDIENT_INTERVAL_MS,
      },
    };
  }
  const timerMs = state.ingredients.timerMs - deltaMs;
  if (timerMs > 0) {
    return { ...state, ingredients: { ...state.ingredients, timerMs } };
  }
  return event(state, "재료 상자에 버섯이 채워졌습니다.", {
    ingredients: {
      stock: state.ingredients.stock + 1,
      timerMs: INGREDIENT_INTERVAL_MS,
    },
  });
}

function igniteStation(state: GameState, station: StationId, message: string) {
  const fire = state.fires[station];
  // 화재 대상이 아니거나 이미 불이 난 곳에는 중복 적용하지 않는다.
  if (!fire || fire.onFire) return state;
  return event(state, message, {
    fires: {
      ...state.fires,
      [station]: {
        neglectMs: 0,
        onFire: true,
        workerId: null,
        extinguishMs: 0,
        spreadMs: 0,
      },
    },
  });
}

// 방치 판정: 지금 상호작용 상태를 가진 설비는 조리 도구뿐이다. 다른
// 설비가 상태를 갖게 되면 여기에 분기를 추가한다.
function isNeglected(state: GameState, station: StationId) {
  return (
    station === "stove" && state.workstation.status === fireConfig.neglectStatus
  );
}

function advanceFires(state: GameState, deltaMs: number) {
  let next = state;
  for (const station of Object.keys(next.fires) as StationId[]) {
    const fire = next.fires[station]!;
    if (!fire.onFire) {
      const neglectMs = isNeglected(next, station) ? fire.neglectMs + deltaMs : 0;
      if (neglectMs < fireConfig.igniteAfterMs) {
        next = { ...next, fires: { ...next.fires, [station]: { ...fire, neglectMs } } };
        continue;
      }
      next = igniteStation(
        next,
        station,
        `${withParticle(stationLabels[station])} 방치해 불이 났습니다.`,
      );
      continue;
    }
    const spreadMs = fire.spreadMs + deltaMs;
    if (spreadMs < fireConfig.spreadIntervalMs) {
      next = { ...next, fires: { ...next.fires, [station]: { ...fire, spreadMs } } };
      continue;
    }
    next = {
      ...next,
      fires: { ...next.fires, [station]: { ...fire, spreadMs: 0 } },
    };
    // 이미 불이 났거나 화재 대상이 아닌 설비에는 옮겨붙지 않는다.
    const victim = (Object.keys(next.fires) as StationId[]).find(
      (id) =>
        id !== station &&
        !next.fires[id]!.onFire &&
        isAdjacentStation(station, id),
    );
    if (victim) {
      next = igniteStation(
        next,
        victim,
        `${stationLabels[station]}의 불이 ${withParticle(stationLabels[victim], ["으로", "로"])} 옮겨붙었습니다.`,
      );
    }
  }
  return next;
}

export function tick(state: GameState, deltaMs = 1000): GameState {
  if (state.phase !== "playing" || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return state;
  }
  const elapsed = Math.min(deltaMs, state.timeLeftMs);
  let next = state;
  for (const actorId of Object.keys(next.actors) as ActorId[]) {
    next = moveActor(next, actorId, elapsed);
    if (next.phase !== "playing") break;
  }
  next = decayAlerts(next, elapsed);
  next = advanceIngredients(next, elapsed);
  next = advanceFires(next, elapsed);
  if (next.phase === "won") return next;
  const timeLeftMs = next.timeLeftMs - elapsed;
  return timeLeftMs === 0
    ? event(next, `${currentStage(next).id} 영업 종료 — 주문 ${next.filled}/${next.goal}건 완료`, {
        phase: roundResult(next),
        timeLeft: 0,
        timeLeftMs: 0,
      })
    : { ...next, timeLeftMs, timeLeft: Math.ceil(timeLeftMs / 1000) };
}
