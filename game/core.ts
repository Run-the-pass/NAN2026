export type SlimeTypeId = "nerd" | "swift" | "keen" | "worker";
export type ActorId = SlimeTypeId;

// 색이 결과물의 색을, 가져간 장소가 결과물의 형태를 정한다.
export type ItemColor = "red" | "blue";
export type ItemKind = "herb" | "potion" | "scroll";
export type ItemId = `${ItemColor}-${ItemKind}`;

// 설비. 소환진에서 약초가 나오고 양조기·테이블이 가공한다.
export type StationId =
  | "summon-red"
  | "summon-blue"
  | "brewer"
  | "table"
  | "submission"
  | "trash";

export type ActorStatus = "IDLE" | "MOVING" | "WORKING";
export type TilePosition = { col: number; row: number };

export const itemColor = (item: ItemId) => item.split("-")[0] as ItemColor;
export const itemKind = (item: ItemId) => item.split("-")[1] as ItemKind;

export function itemLabel(item: ItemId) {
  const color = itemColor(item) === "red" ? "붉은" : "파란";
  const kind = { herb: "약초", potion: "물약", scroll: "스크롤" }[itemKind(item)];
  return `${color} ${kind}`;
}

// 한글 받침을 보고 목적격 조사를 붙인다.
export function withParticle(word: string, pair: [string, string] = ["을", "를"]) {
  const code = word.charCodeAt(word.length - 1);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasFinal = isHangul && (code - 0xac00) % 28 !== 0;
  return `${word}${hasFinal ? pair[0] : pair[1]}`;
}

export const stationLabels: Record<StationId, string> = {
  "summon-red": "붉은 소환진",
  "summon-blue": "파란 소환진",
  brewer: "양조기",
  table: "마법 테이블",
  submission: "제출대",
  trash: "쓰레기통",
};

export const allItems: ItemId[] = [
  "red-herb",
  "blue-herb",
  "red-potion",
  "blue-potion",
  "red-scroll",
  "blue-scroll",
];
export const allStations: StationId[] = [
  "summon-red",
  "summon-blue",
  "brewer",
  "table",
  "submission",
  "trash",
];

export type StatLevels = {
  workSpeed: number;
  moveSpeed: number;
  hearing: number;
  focus: number;
};

export const slimeTypes: Record<
  SlimeTypeId,
  { name: string; trait: string; statLevels: StatLevels }
> = {
  nerd: {
    name: "너드",
    trait: "느리게 이동하지만 복잡한 작업을 잘 기억함",
    statLevels: { workSpeed: 2, moveSpeed: 0, hearing: 1, focus: 3 },
  },
  swift: {
    name: "날쌘",
    trait: "이동이 빠르지만 긴 명령에는 약함",
    statLevels: { workSpeed: 1, moveSpeed: 3, hearing: 1, focus: 1 },
  },
  keen: {
    name: "쫑긋",
    trait: "멀리서도 명령을 받아 맵 반대편 작업에 대응함",
    statLevels: { workSpeed: 1, moveSpeed: 1, hearing: 3, focus: 1 },
  },
  worker: {
    name: "일꾼",
    trait: "가까이에서 지시해야 하지만 작업이 빠름",
    statLevels: { workSpeed: 3, moveSpeed: 1, hearing: 0, focus: 2 },
  },
};

export const statTables = {
  workSpeedMultiplier: [0.7, 0.85, 1.0, 1.2, 1.45, 1.75],
  moveTilesPerSecond: [1.6, 1.9, 2.2, 2.5, 2.8, 3.1],
  hearingRangeTiles: [2, 3, 4, 5, 6, 7],
  focusCapacity: [1, 2, 3, 4, 5, 6],
} as const;

// 명령 하나는 행동 하나가 아니라 물품 이동의 목적 하나다.
// 슬라임이 집기·이동·투입을 알아서 잇는다.
export type Command = {
  actorId: ActorId;
  item: ItemId;
  target: StationId;
  sequence: number;
};

export type CommandEnvelope = {
  status: "OK";
  confidence: number;
  commands: Command[];
  reason: string | null;
  transcript?: string | null;
};

// 한 명령을 처리하는 단계. 집으러 갔다가 넣으러 간다.
export type Leg = "FETCH" | "DELIVER";

export type ActorState = {
  typeId: SlimeTypeId;
  name: string;
  x: number;
  y: number;
  moveSpeed: number;
  status: ActorStatus;
  carrying: ItemId | null;
  current: Command | null;
  leg: Leg;
  queue: Command[];
  path: TilePosition[];
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
  player: { x: number; y: number; carrying: ItemId | null };
  actors: Partial<Record<ActorId, ActorState>>;
  summons: Record<ItemColor, { stock: number; timerMs: number }>;
  brewer: ItemId[];
  table: ItemId[];
  order: {
    need: Partial<Record<ItemId, number>>;
    done: Partial<Record<ItemId, number>>;
  };
  lastEvent: string;
  history: string[];
};

export const TILE_SIZE = 60;
export const GOLD_PER_ORDER = 100;
export const SUMMON_MAX = 4;
export const SUMMON_INTERVAL_MS = 6_000;
export const STORAGE_MAX = 3;

// R 붉은 소환진, B 파란 소환진, W 양조기, T 마법 테이블,
// S 제출대, X 쓰레기통.
export const WORKSHOP_ROWS = [
  "################",
  "#..............#",
  "#..............#",
  "#...R......B...#",
  "#..............#",
  "#..W........T..#",
  "#..............#",
  "#.....S..X.....#",
  "#..............#",
  "################",
] as const;

export const displayTiles: Record<StationId, TilePosition> = {
  "summon-red": { col: 4, row: 3 },
  "summon-blue": { col: 11, row: 3 },
  brewer: { col: 3, row: 5 },
  table: { col: 12, row: 5 },
  submission: { col: 6, row: 7 },
  trash: { col: 9, row: 7 },
};

// 작업 타일은 설비와 상하좌우로 인접한 바닥이다.
export const taskTiles: Record<StationId, TilePosition> = {
  "summon-red": { col: 4, row: 4 },
  "summon-blue": { col: 11, row: 4 },
  brewer: { col: 3, row: 6 },
  table: { col: 12, row: 6 },
  submission: { col: 6, row: 6 },
  trash: { col: 9, row: 6 },
};

export const spawnTiles: TilePosition[] = [
  { col: 7, row: 5 },
  { col: 5, row: 8 },
  { col: 10, row: 8 },
];
export const playerStartTile: TilePosition = { col: 8, row: 4 };

const workDuration = { pick: 700, put: 700 };

export const tileCenter = ({ col, row }: TilePosition) => ({
  x: col * TILE_SIZE + TILE_SIZE / 2,
  y: row * TILE_SIZE + TILE_SIZE / 2,
});

export const pixelToTile = (x: number, y: number): TilePosition => ({
  col: Math.floor(x / TILE_SIZE),
  row: Math.floor(y / TILE_SIZE),
});

export const isWalkable = ({ col, row }: TilePosition) =>
  WORKSHOP_ROWS[row]?.[col] === ".";

export function findPath(
  start: TilePosition,
  destination: TilePosition,
): TilePosition[] | null {
  if (!isWalkable(start) || !isWalkable(destination)) return null;
  const key = ({ col, row }: TilePosition) => `${col},${row}`;
  const previous = new Map<string, TilePosition | null>([[key(start), null]]);
  const queue = [start];
  const directions = [
    { col: 0, row: -1 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
  ];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.col === destination.col && current.row === destination.row) {
      const path: TilePosition[] = [];
      let cursor: TilePosition | null = current;
      while (cursor && key(cursor) !== key(start)) {
        path.unshift(cursor);
        cursor = previous.get(key(cursor)) ?? null;
      }
      return path;
    }
    for (const direction of directions) {
      const next = {
        col: current.col + direction.col,
        row: current.row + direction.row,
      };
      if (isWalkable(next) && !previous.has(key(next))) {
        previous.set(key(next), current);
        queue.push(next);
      }
    }
  }
  return null;
}

// 물품을 어디서 집는지. 약초는 소환진, 가공품은 만든 설비에 있다.
export function sourceOf(item: ItemId): StationId {
  const kind = itemKind(item);
  if (kind === "herb") {
    return itemColor(item) === "red" ? "summon-red" : "summon-blue";
  }
  return kind === "potion" ? "brewer" : "table";
}

// 그 물품을 그 설비로 보내는 것이 말이 되는지.
export function isValidRoute(item: ItemId, target: StationId) {
  if (target === "submission" || target === "trash") return true;
  return (
    (target === "brewer" || target === "table") && itemKind(item) === "herb"
  );
}

// 가공 결과. 양조기는 물약, 테이블은 스크롤을 만든다.
export function productOf(item: ItemId, target: StationId): ItemId | null {
  if (itemKind(item) !== "herb") return null;
  if (target === "brewer") return `${itemColor(item)}-potion`;
  if (target === "table") return `${itemColor(item)}-scroll`;
  return null;
}

function makeActor(typeId: SlimeTypeId, spawn: TilePosition): ActorState {
  const kind = slimeTypes[typeId];
  return {
    typeId,
    name: kind.name,
    ...tileCenter(spawn),
    moveSpeed:
      statTables.moveTilesPerSecond[kind.statLevels.moveSpeed] * TILE_SIZE,
    status: "IDLE",
    carrying: null,
    current: null,
    leg: "FETCH",
    queue: [],
    path: [],
    workLeftMs: 0,
    statLevels: { ...kind.statLevels },
    buffs: [],
    alert: null,
    alertMs: 0,
  };
}

// 주문은 색과 형태만 보여 준다. 효과명은 쓰지 않는다.
const orderPool: Partial<Record<ItemId, number>>[] = [
  { "red-herb": 2 },
  { "blue-potion": 1, "red-herb": 1 },
  { "red-scroll": 1, "blue-scroll": 1 },
  { "blue-herb": 1, "red-potion": 1 },
  { "red-potion": 2 },
  { "blue-scroll": 2 },
];

function pickOrder(seed: number) {
  return orderPool[seed % orderPool.length];
}

export function initialState(
  seed = 2026,
  squad: SlimeTypeId[] = ["keen"],
): GameState {
  if (
    squad.length < 1 ||
    squad.length > spawnTiles.length ||
    new Set(squad).size !== squad.length ||
    squad.some((typeId) => !(typeId in slimeTypes))
  ) {
    throw new Error("스쿼드는 서로 다른 슬라임 1~3마리여야 합니다.");
  }
  const actors: Partial<Record<ActorId, ActorState>> = {};
  squad.forEach((typeId, index) => {
    actors[typeId] = makeActor(typeId, spawnTiles[index]);
  });
  return {
    seed: seed >>> 0,
    phase: "playing",
    timeLeft: 180,
    timeLeftMs: 180_000,
    filled: 0,
    goal: 5,
    gold: 0,
    player: { ...tileCenter(playerStartTile), carrying: null },
    actors,
    summons: {
      red: { stock: 1, timerMs: SUMMON_INTERVAL_MS },
      blue: { stock: 1, timerMs: SUMMON_INTERVAL_MS },
    },
    brewer: [],
    table: [],
    order: { need: pickOrder(seed), done: {} },
    lastEvent: "3분 동안 주문 5건을 채우세요.",
    history: ["공방 작업 시작"],
  };
}

export function movePlayer(state: GameState, x: number, y: number): GameState {
  return { ...state, player: { ...state.player, x, y } };
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

export function shelfOf(state: GameState, target: StationId): ItemId[] | null {
  if (target === "brewer") return state.brewer;
  if (target === "table") return state.table;
  return null;
}

// 그 물품을 지금 몇 개 꺼낼 수 있는지.
export function stockOf(state: GameState, item: ItemId) {
  const kind = itemKind(item);
  if (kind === "herb") return state.summons[itemColor(item)].stock;
  const shelf = kind === "potion" ? state.brewer : state.table;
  return shelf.filter((entry) => entry === item).length;
}

export function validateEnvelope(
  value: unknown,
  squad?: ActorId[],
): { ok: true; value: CommandEnvelope } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "명령 JSON이 객체가 아닙니다." };
  }
  const envelope = value as Partial<CommandEnvelope>;
  const roster = squad ?? (Object.keys(slimeTypes) as ActorId[]);
  if (
    envelope.status !== "OK" ||
    typeof envelope.confidence !== "number" ||
    envelope.confidence < 0 ||
    envelope.confidence > 1 ||
    !Array.isArray(envelope.commands) ||
    envelope.commands.length < 1 ||
    envelope.commands.length > 6 ||
    (envelope.transcript !== undefined &&
      envelope.transcript !== null &&
      typeof envelope.transcript !== "string")
  ) {
    return { ok: false, reason: "명령 형식이 올바르지 않습니다." };
  }
  for (const item of envelope.commands) {
    if (
      !item ||
      !roster.includes(item.actorId) ||
      !allItems.includes(item.item) ||
      !allStations.includes(item.target) ||
      !isValidRoute(item.item, item.target) ||
      !Number.isInteger(item.sequence)
    ) {
      return { ok: false, reason: "허용 목록 밖의 슬라임/물품/목적지입니다." };
    }
  }
  return { ok: true, value: envelope as CommandEnvelope };
}

function hearingRangePx(actor: ActorState) {
  return statTables.hearingRangeTiles[actor.statLevels.hearing] * TILE_SIZE;
}

export const MAX_VOICE_TILES = 4;
export function voiceRadiusPx(loudness: number) {
  const clamped = Math.min(1, Math.max(0, loudness));
  return clamped * MAX_VOICE_TILES * TILE_SIZE;
}

// 플레이어의 소리 원과 슬라임의 청력 원이 만나면 들린다.
function canHear(state: GameState, actor: ActorState, voiceRadius: number) {
  return (
    Math.hypot(actor.x - state.player.x, actor.y - state.player.y) <=
    voiceRadius + hearingRangePx(actor)
  );
}

// 출발 전에 끝까지 해낼 수 있는 명령인지 본다.
export function checkCommand(state: GameState, command: Command): string | null {
  if (!isValidRoute(command.item, command.target)) return "INVALID_ROUTE";
  if (stockOf(state, command.item) < 1) return "SOURCE_EMPTY";
  const shelf = shelfOf(state, command.target);
  if (shelf && shelf.length >= STORAGE_MAX) return "TARGET_FULL";
  return null;
}

const failureText: Record<string, string> = {
  INVALID_ROUTE: "그 물품은 그곳으로 보낼 수 없습니다.",
  SOURCE_EMPTY: "필요한 물품이 없습니다.",
  TARGET_FULL: "목적지 재고가 가득 찼습니다.",
};

export function executeEnvelope(
  state: GameState,
  envelope: CommandEnvelope,
  loudness = 0,
): GameState {
  const checked = validateEnvelope(envelope);
  if ("reason" in checked) return event(state, checked.reason, {});
  if (state.phase !== "playing") {
    return event(state, "종료된 공방에서는 명령을 받을 수 없습니다.", {});
  }
  const ordered = [...checked.value.commands].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const byActor = new Map<ActorId, Command[]>();
  for (const item of ordered) {
    byActor.set(item.actorId, [...(byActor.get(item.actorId) ?? []), item]);
  }
  let next = state;
  for (const [actorId, commands] of byActor) {
    const actor = next.actors[actorId];
    if (!actor) {
      next = event(next, "이번 판에 선택되지 않은 슬라임입니다.", {});
      continue;
    }
    if (!canHear(next, actor, voiceRadiusPx(loudness))) {
      next = event(
        next,
        `${actor.name}이(가) 명령을 듣지 못했습니다 — 더 가까이 가세요.`,
        {
          actors: patchActor(next, actorId, {
            ...actor,
            alert: "NOT_HEARD",
            alertMs: 1_800,
          }),
        },
      );
      continue;
    }
    const capacity = statTables.focusCapacity[actor.statLevels.focus];
    const used = actor.queue.length + (actor.current ? 1 : 0);
    if (commands.length > capacity) {
      next = event(
        next,
        `${actor.name}에게 너무 복잡한 명령입니다 (집중력 ${capacity}개).`,
        {
          actors: patchActor(next, actorId, {
            ...actor,
            alert: "TOO_COMPLEX",
            alertMs: 1_800,
          }),
        },
      );
      continue;
    }
    if (used + commands.length > capacity) {
      next = event(
        next,
        `${actor.name}의 기억 공간이 가득 찼습니다 (집중력 ${capacity}개).`,
        {
          actors: patchActor(next, actorId, {
            ...actor,
            alert: "QUEUE_FULL",
            alertMs: 1_800,
          }),
        },
      );
      continue;
    }
    // 출발 전 검증. 실패하면 슬라임을 보내지 않는다.
    const blocked = commands
      .map((item) => checkCommand(next, item))
      .find(Boolean);
    if (blocked) {
      next = event(next, `${actor.name}: ${failureText[blocked] ?? blocked}`, {
        actors: patchActor(next, actorId, {
          ...actor,
          alert: blocked,
          alertMs: 1_800,
        }),
      });
      continue;
    }
    const summary = commands
      .map((item) => `${itemLabel(item.item)}→${stationLabels[item.target]}`)
      .join(", ");
    next = event(next, `${actor.name} 큐에 ${summary}`, {
      actors: patchActor(next, actorId, {
        ...actor,
        queue: [...actor.queue, ...commands],
      }),
    });
  }
  return next;
}

export function redirectCarried(
  state: GameState,
  actorId: ActorId,
  target: StationId,
  loudness = 0,
): GameState {
  if (state.phase !== "playing") {
    return event(state, "종료된 공방에서는 명령을 받을 수 없습니다.", {});
  }
  const actor = state.actors[actorId];
  if (!actor) {
    return event(state, "이번 판에 선택되지 않은 슬라임입니다.", {});
  }
  if (!canHear(state, actor, voiceRadiusPx(loudness))) {
    return event(
      state,
      `${actor.name}이(가) 명령을 듣지 못했습니다 — 더 가까이 가세요.`,
      {
        actors: patchActor(state, actorId, {
          ...actor,
          alert: "NOT_HEARD",
          alertMs: 1_800,
        }),
      },
    );
  }
  if (!actor.carrying) {
    return event(state, `${actor.name}이(가) 들고 있는 물품이 없습니다.`, {});
  }
  const item = actor.carrying;
  if (!isValidRoute(item, target)) {
    return event(
      state,
      `${itemLabel(item)}은(는) ${stationLabels[target]}에 보낼 수 없습니다.`,
      {},
    );
  }
  const path = findPath(pixelToTile(actor.x, actor.y), taskTiles[target]);
  if (!path) return event(state, `${stationLabels[target]}에 갈 수 없습니다.`, {});
  return event(
    state,
    `${actor.name}이(가) ${withParticle(itemLabel(item))} ${stationLabels[target]}에 가져갑니다.`,
    {
      actors: patchActor(state, actorId, {
        ...actor,
        current: {
          actorId,
          item,
          target,
          sequence: actor.current?.sequence ?? 1,
        },
        leg: "DELIVER",
        path,
        status: "MOVING",
        workLeftMs: 0,
        alert: null,
        alertMs: 0,
      }),
    },
  );
}

function takeStock(state: GameState, item: ItemId): Partial<GameState> {
  const kind = itemKind(item);
  if (kind === "herb") {
    const color = itemColor(item);
    return {
      summons: {
        ...state.summons,
        [color]: {
          ...state.summons[color],
          stock: Math.max(0, state.summons[color].stock - 1),
        },
      },
    };
  }
  const key = kind === "potion" ? "brewer" : "table";
  const shelf = [...state[key]];
  const index = shelf.indexOf(item);
  if (index >= 0) shelf.splice(index, 1);
  return { [key]: shelf } as Partial<GameState>;
}

// 들고 있던 물품을 설비에 넘긴다. 슬라임과 플레이어가 같은 규칙을 쓴다.
function putItem(
  state: GameState,
  who: string,
  held: ItemId,
  target: StationId,
  rest: Partial<GameState>,
): GameState {
  if (target === "trash") {
    return event(state, `${who} ${withParticle(itemLabel(held))} 버렸습니다.`, rest);
  }
  if (target === "submission") {
    const need = state.order.need[held] ?? 0;
    const done = state.order.done[held] ?? 0;
    if (done >= need) {
      return event(state, "주문에 없는 물품이라 제출하지 못했습니다.", rest);
    }
    const nextDone = { ...state.order.done, [held]: done + 1 };
    const complete = Object.entries(state.order.need).every(
      ([item, count]) => (nextDone[item as ItemId] ?? 0) >= (count ?? 0),
    );
    if (!complete) {
      return event(state, `${itemLabel(held)} 제출 (${done + 1}/${need})`, {
        ...rest,
        order: { ...state.order, done: nextDone },
      });
    }
    const filled = state.filled + 1;
    return event(
      state,
      `주문 완료 — ${filled}/${state.goal} (+${GOLD_PER_ORDER}G)`,
      {
        ...rest,
        filled,
        gold: state.gold + GOLD_PER_ORDER,
        phase: filled >= state.goal ? "won" : "playing",
        order: { need: pickOrder(state.seed), done: {} },
      },
    );
  }
  // 양조기·테이블은 넣는 즉시 같은 색 결과물을 만든다.
  const product = productOf(held, target);
  const key = target === "brewer" ? "brewer" : "table";
  const shelf = state[key];
  if (!product || shelf.length >= STORAGE_MAX) {
    return event(state, "목적지 재고가 가득 찼습니다.", rest);
  }
  return event(
    state,
    `${itemLabel(product)} 완성 (${shelf.length + 1}/${STORAGE_MAX})`,
    { ...rest, [key]: [...shelf, product] } as Partial<GameState>,
  );
}

function workDurationFor(slime: ActorState, base: number) {
  return base / statTables.workSpeedMultiplier[slime.statLevels.workSpeed];
}

function moveActor(state: GameState, actorId: ActorId, deltaMs: number) {
  let next = state;
  let remaining = deltaMs;
  let slime = next.actors[actorId]!;
  while (remaining > 0 && next.phase === "playing") {
    if (!slime.current) {
      const [pending, ...queue] = slime.queue;
      if (!pending) {
        slime = { ...slime, status: "IDLE", path: [], workLeftMs: 0 };
        break;
      }
      const position = pixelToTile(slime.x, slime.y);
      const path = findPath(position, taskTiles[sourceOf(pending.item)]);
      if (!path) {
        slime = { ...slime, current: null, queue, status: "IDLE", path: [] };
        next = event(next, "물품 위치로 갈 수 없습니다.", {});
        continue;
      }
      slime = {
        ...slime,
        current: pending,
        queue,
        leg: "FETCH",
        path,
        status: "MOVING",
        workLeftMs: 0,
      };
    }
    if (slime.status === "MOVING") {
      const waypoint = slime.path[0];
      if (!waypoint) {
        slime = {
          ...slime,
          status: "WORKING",
          workLeftMs: workDurationFor(
            slime,
            slime.leg === "FETCH" ? workDuration.pick : workDuration.put,
          ),
        };
        continue;
      }
      const destination = tileCenter(waypoint);
      const dx = destination.x - slime.x;
      const dy = destination.y - slime.y;
      const distance = Math.hypot(dx, dy);
      const travelMs = (distance / slime.moveSpeed) * 1000;
      if (travelMs > remaining) {
        const ratio = remaining / travelMs;
        slime = { ...slime, x: slime.x + dx * ratio, y: slime.y + dy * ratio };
        remaining = 0;
        break;
      }
      slime = {
        ...slime,
        x: destination.x,
        y: destination.y,
        path: slime.path.slice(1),
      };
      remaining -= travelMs;
      continue;
    }
    if (slime.workLeftMs > remaining) {
      slime = { ...slime, workLeftMs: slime.workLeftMs - remaining };
      remaining = 0;
      break;
    }
    remaining -= slime.workLeftMs;
    const current = slime.current!;
    if (slime.leg === "FETCH") {
      // 도착해 보니 재고가 비었을 수 있다.
      if (stockOf(next, current.item) < 1) {
        next = event(next, `${slime.name}: 필요한 물품이 없습니다.`, {
          actors: patchActor(next, actorId, {
            ...slime,
            current: null,
            status: "IDLE",
            path: [],
            workLeftMs: 0,
          }),
        });
        slime = next.actors[actorId]!;
        continue;
      }
      next = {
        ...next,
        ...takeStock(next, current.item),
        actors: patchActor(next, actorId, { ...slime, carrying: current.item }),
      };
      slime = next.actors[actorId]!;
      const path = findPath(
        pixelToTile(slime.x, slime.y),
        taskTiles[current.target],
      );
      slime = {
        ...slime,
        leg: "DELIVER",
        path: path ?? [],
        status: "MOVING",
        workLeftMs: 0,
      };
      continue;
    }
    next = putItem(
      { ...next, actors: patchActor(next, actorId, slime) },
      `${slime.name}이(가)`,
      slime.carrying!,
      current.target,
      {
        actors: patchActor(next, actorId, { ...slime, carrying: null }),
      },
    );
    slime = {
      ...next.actors[actorId]!,
      current: null,
      leg: "FETCH",
      status: "IDLE",
      path: [],
      workLeftMs: 0,
    };
  }
  return { ...next, actors: patchActor(next, actorId, slime) };
}

function decayAlerts(state: GameState, deltaMs: number) {
  let changed = false;
  const actors = { ...state.actors };
  for (const id of Object.keys(actors) as ActorId[]) {
    const actor = actors[id]!;
    if (!actor.alert) continue;
    const alertMs = Math.max(0, actor.alertMs - deltaMs);
    actors[id] = { ...actor, alertMs, alert: alertMs > 0 ? actor.alert : null };
    changed = true;
  }
  return changed ? { ...state, actors } : state;
}

// 소환진은 재고가 최대치 미만일 때만 약초를 만든다.
function advanceSummons(state: GameState, deltaMs: number) {
  let next = state;
  for (const color of ["red", "blue"] as ItemColor[]) {
    const summon = next.summons[color];
    if (summon.stock >= SUMMON_MAX) {
      next = {
        ...next,
        summons: {
          ...next.summons,
          [color]: { ...summon, timerMs: SUMMON_INTERVAL_MS },
        },
      };
      continue;
    }
    const timerMs = summon.timerMs - deltaMs;
    if (timerMs > 0) {
      next = {
        ...next,
        summons: { ...next.summons, [color]: { ...summon, timerMs } },
      };
      continue;
    }
    next = event(
      next,
      `${color === "red" ? "붉은" : "파란"} 약초가 생겼습니다.`,
      {
        summons: {
          ...next.summons,
          [color]: { stock: summon.stock + 1, timerMs: SUMMON_INTERVAL_MS },
        },
      },
    );
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
  next = advanceSummons(next, elapsed);
  if (next.phase === "won") return next;
  const timeLeftMs = next.timeLeftMs - elapsed;
  return timeLeftMs === 0
    ? event(next, `시간 종료 — 주문 ${next.filled}/${next.goal}건 완료`, {
        phase: "lost",
        timeLeft: 0,
        timeLeftMs: 0,
      })
    : { ...next, timeLeftMs, timeLeft: Math.ceil(timeLeftMs / 1000) };
}

export function command(
  actorId: ActorId,
  item: ItemId,
  target: StationId,
  sequence = 1,
): CommandEnvelope {
  return {
    status: "OK",
    confidence: 1,
    commands: [{ actorId, item, target, sequence }],
    reason: null,
  };
}

// 플레이어가 직접 손을 댈 수 있는 범위.
const REACH_PX = TILE_SIZE * 1.4;

function nearestStation(state: GameState) {
  return allStations
    .map((id) => ({
      id,
      distance: Math.hypot(
        tileCenter(displayTiles[id]).x - state.player.x,
        tileCenter(displayTiles[id]).y - state.player.y,
      ),
    }))
    .filter((station) => station.distance <= REACH_PX)
    .sort((a, b) => a.distance - b.distance)[0];
}

// 앞에 있는 설비와 지금 든 물건으로 할 일 하나가 정해진다.
export function nextPlayerAction(
  state: GameState,
): { label: string; station: StationId; item: ItemId } | null {
  if (state.phase !== "playing") return null;
  const near = nearestStation(state);
  if (!near) return null;
  const held = state.player.carrying;
  if (held === null) {
    if (near.id === "summon-red" && state.summons.red.stock > 0) {
      return { label: "붉은 약초 집기", station: near.id, item: "red-herb" };
    }
    if (near.id === "summon-blue" && state.summons.blue.stock > 0) {
      return { label: "파란 약초 집기", station: near.id, item: "blue-herb" };
    }
    for (const key of ["brewer", "table"] as const) {
      if (near.id === key && state[key].length > 0) {
        const item = state[key][state[key].length - 1];
        return { label: `${itemLabel(item)} 꺼내기`, station: near.id, item };
      }
    }
    return null;
  }
  if (!isValidRoute(held, near.id)) return null;
  if (near.id === "brewer" || near.id === "table") {
    if (state[near.id].length >= STORAGE_MAX) return null;
    const product = productOf(held, near.id);
    return product
      ? { label: `${itemLabel(product)} 만들기`, station: near.id, item: held }
      : null;
  }
  if (near.id === "submission") {
    return { label: `${itemLabel(held)} 제출`, station: near.id, item: held };
  }
  return { label: `${itemLabel(held)} 버리기`, station: near.id, item: held };
}

export function playerAct(state: GameState): GameState {
  const option = nextPlayerAction(state);
  if (!option) return state;
  const { station, item } = option;
  if (state.player.carrying === null) {
    return event(state, `직접 ${withParticle(itemLabel(item))} 들었습니다.`, {
      ...takeStock(state, item),
      player: { ...state.player, carrying: item },
    });
  }
  return putItem(state, "직접", item, station, {
    player: { ...state.player, carrying: null },
  });
}
