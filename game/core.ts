export type SlimeTypeId = "nerd" | "swift" | "keen" | "worker";
export type ActorId = SlimeTypeId;
export type CauldronId = "cauldron-01" | "cauldron-02";
export type Action =
  | "GET_HERB"
  | "ADD_HERB"
  | "MIX"
  | "GET_PARCHMENT"
  | "DIP_PARCHMENT"
  | "TAKE_BOOK"
  | "SUBMIT";
export type TargetId =
  | "herb-box"
  | "parchment-box"
  | CauldronId
  | "submission-table";
export type ActorStatus = "IDLE" | "MOVING" | "WORKING";
export type CarriedItem = "herb" | "parchment" | "book" | null;
export type CauldronStatus =
  | "EMPTY"
  | "HERB_LOADED"
  | "MIXING"
  | "READY_FOR_PARCHMENT"
  | "INSCRIBING"
  | "BOOK_READY";
export type TilePosition = { col: number; row: number };

export type StatLevels = {
  workSpeed: number;
  moveSpeed: number;
  hearing: number;
  focus: number;
};

// 스탯 문서의 종류별 기본 레벨. 레벨 0~5.
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

// 스탯 문서의 중앙 레벨 표. 인덱스 = 레벨.
export const statTables = {
  workSpeedMultiplier: [0.7, 0.85, 1.0, 1.2, 1.45, 1.75],
  moveTilesPerSecond: [1.6, 1.9, 2.2, 2.5, 2.8, 3.1],
  hearingRangeTiles: [2, 3, 4, 5, 6, 7],
  focusCapacity: [1, 2, 3, 4, 5, 6],
} as const;

export type Command = {
  actorId: ActorId;
  action: Action;
  // 솥 작업은 null을 허용하며, 실행 시점에 가까운 유효한 솥으로 결정한다.
  targetId: TargetId | null;
  destinationId: null;
  sequence: number;
};

export type CommandEnvelope = {
  status: "OK";
  confidence: number;
  commands: Command[];
  reason: string | null;
  // Gemini가 들은 문장. 표시용이며 명령 해석에는 사용하지 않는다.
  transcript?: string | null;
};

export type ActorState = {
  typeId: SlimeTypeId;
  name: string;
  x: number;
  y: number;
  moveSpeed: number;
  status: ActorStatus;
  carrying: CarriedItem;
  current: Command | null;
  queue: Command[];
  path: TilePosition[];
  workLeftMs: number;
  statLevels: StatLevels;
  buffs: string[];
  // NOT_HEARD 같은 상태 아이콘 표시용. tick으로 소멸한다.
  alert: string | null;
  alertMs: number;
};

export type CauldronState = {
  status: CauldronStatus;
  timerMs: number;
};

export type GameState = {
  seed: number;
  phase: "playing" | "won" | "lost";
  timeLeft: number;
  timeLeftMs: number;
  submitted: number;
  goal: number;
  gold: number;
  player: { x: number; y: number };
  actors: Partial<Record<ActorId, ActorState>>;
  cauldrons: Record<CauldronId, CauldronState>;
  lastEvent: string;
  history: string[];
};

export const TILE_SIZE = 60;
export const GOLD_PER_BOOK = 100;
// 참고 이미지 기반 배치. 가구는 종류마다 정확히 한 타일만 차지한다.
// H 약초 상자(좌측 벽), P 양피지 상자(우측 벽), T 납품대(하단 벽),
// C 솥, B 장식 테이블, # 벽, . 바닥.
export const WORKSHOP_ROWS = [
  "################",
  "#..............#",
  "#.BB..BB..BB...#",
  "#....CBBBBB....#",
  "#..........C...#",
  "###.......##...#",
  "H..............P",
  "#.....#....#...#",
  "#..............#",
  "#######T########",
] as const;

export const displayTiles = {
  herb: { col: 0, row: 6 },
  parchment: { col: 15, row: 6 },
  submission: { col: 7, row: 9 },
  "cauldron-01": { col: 5, row: 3 },
  "cauldron-02": { col: 11, row: 4 },
} satisfies Record<string, TilePosition>;

// 작업 타일은 가구 타일과 상하좌우로 인접한 바닥이다.
export const taskTiles: Record<TargetId, TilePosition> = {
  "herb-box": { col: 1, row: 6 },
  "parchment-box": { col: 14, row: 6 },
  "submission-table": { col: 7, row: 8 },
  "cauldron-01": { col: 5, row: 4 },
  "cauldron-02": { col: 12, row: 4 },
};

// 선택 순서대로 배치한다. 첫 슬라임은 플레이어 옆에서 시작해
// 첫 명령이 청력 범위 안에 들어오게 한다.
export const spawnTiles: TilePosition[] = [
  { col: 7, row: 6 },
  { col: 4, row: 8 },
  { col: 12, row: 8 },
];

// 참고 이미지의 중앙 붉은 타원 = 플레이어 시작 위치.
export const playerStartTile: TilePosition = { col: 8, row: 5 };

const actions: Action[] = [
  "GET_HERB",
  "ADD_HERB",
  "MIX",
  "GET_PARCHMENT",
  "DIP_PARCHMENT",
  "TAKE_BOOK",
  "SUBMIT",
];
const cauldronActions: Action[] = [
  "ADD_HERB",
  "MIX",
  "DIP_PARCHMENT",
  "TAKE_BOOK",
];
const fixedTargets: Partial<Record<Action, TargetId>> = {
  GET_HERB: "herb-box",
  GET_PARCHMENT: "parchment-box",
  SUBMIT: "submission-table",
};
// 작업 기본 시간. 실제 시간 = 기본 시간 ÷ 작업 속도 배율.
const workDuration: Record<Action, number> = {
  GET_HERB: 700,
  ADD_HERB: 700,
  MIX: 800,
  GET_PARCHMENT: 700,
  DIP_PARCHMENT: 700,
  TAKE_BOOK: 700,
  SUBMIT: 700,
};

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
    queue: [],
    path: [],
    workLeftMs: 0,
    statLevels: { ...kind.statLevels },
    buffs: [],
    alert: null,
    alertMs: 0,
  };
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
    submitted: 0,
    goal: 8,
    gold: 0,
    player: tileCenter(playerStartTile),
    actors,
    cauldrons: {
      "cauldron-01": { status: "EMPTY", timerMs: 0 },
      "cauldron-02": { status: "EMPTY", timerMs: 0 },
    },
    lastEvent: "3분 동안 마도서를 8권 납품하세요.",
    history: ["공방 작업 시작"],
  };
}

// 플레이어 이동은 청력 판정의 기준 위치만 갱신한다. 이벤트를 남기지 않는다.
export function movePlayer(state: GameState, x: number, y: number): GameState {
  return { ...state, player: { x, y } };
}

function validTarget(action: Action, targetId: unknown) {
  const fixed = fixedTargets[action];
  return fixed
    ? targetId === fixed
    : cauldronActions.includes(action) &&
        (targetId === null ||
          ["cauldron-01", "cauldron-02"].includes(String(targetId)));
}

export function validateEnvelope(
  value: unknown,
): { ok: true; value: CommandEnvelope } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "명령 JSON이 객체가 아닙니다." };
  }
  const envelope = value as Partial<CommandEnvelope>;
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
      !(String(item.actorId) in slimeTypes) ||
      !actions.includes(item.action) ||
      !validTarget(item.action, item.targetId) ||
      item.destinationId !== null ||
      !Number.isInteger(item.sequence)
    ) {
      return { ok: false, reason: "허용 목록 밖의 actor/action/target입니다." };
    }
  }
  return { ok: true, value: envelope as CommandEnvelope };
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

function hearingRangePx(actor: ActorState) {
  return statTables.hearingRangeTiles[actor.statLevels.hearing] * TILE_SIZE;
}

// 명령이 확정된 순간의 플레이어와 슬라임 위치로 청취를 판정한다.
// 장애물과 관계없는 유클리드 거리를 사용한다.
function canHear(state: GameState, actor: ActorState) {
  return (
    Math.hypot(actor.x - state.player.x, actor.y - state.player.y) <=
    hearingRangePx(actor)
  );
}

export function executeEnvelope(
  state: GameState,
  envelope: CommandEnvelope,
): GameState {
  const checked = validateEnvelope(envelope);
  if ("reason" in checked) return event(state, checked.reason, {});
  if (state.phase !== "playing") {
    return event(state, "종료된 공방에서는 명령을 받을 수 없습니다.", {});
  }
  const ordered = [...checked.value.commands].sort(
    (a, b) => a.sequence - b.sequence,
  );
  // 팀 명령도 슬라임마다 개별적으로 듣고 개별적으로 수락·거절한다.
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
    if (!canHear(next, actor)) {
      next = event(next, `${actor.name}이(가) 명령을 듣지 못했습니다 — 더 가까이 가세요.`, {
        actors: patchActor(next, actorId, {
          ...actor,
          alert: "NOT_HEARD",
          alertMs: 1_800,
        }),
      });
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
    next = event(
      next,
      `${actor.name} 큐에 ${commands.map(({ action }) => action).join(", ")} 추가`,
      {
        actors: patchActor(next, actorId, {
          ...actor,
          queue: [...actor.queue, ...commands],
        }),
      },
    );
  }
  return next;
}

function cauldron(state: GameState, id: TargetId) {
  return state.cauldrons[id as CauldronId];
}

function patchCauldron(state: GameState, id: TargetId, next: CauldronState) {
  return {
    ...state.cauldrons,
    [id]: next,
  };
}

const cauldronNeeds: Partial<Record<Action, CauldronStatus>> = {
  ADD_HERB: "EMPTY",
  MIX: "HERB_LOADED",
  DIP_PARCHMENT: "READY_FOR_PARCHMENT",
  TAKE_BOOK: "BOOK_READY",
};

// 솥을 지정하지 않은 명령은 실행 시점 위치에서 가까운 솥으로 보낸다.
// 작업 상태가 맞는 솥을 우선하고, 없으면 전체에서 가까운 솥을 고른다.
// 경로 길이 동률이면 고정 순서상 앞의 솥을 유지해 결정론을 지킨다.
function nearestCauldron(
  state: GameState,
  from: TilePosition,
  action: Action,
): CauldronId {
  const ids: CauldronId[] = ["cauldron-01", "cauldron-02"];
  const pathLength = (id: CauldronId) =>
    findPath(from, taskTiles[id])?.length ?? Infinity;
  const eligible = ids.filter(
    (id) => state.cauldrons[id].status === cauldronNeeds[action],
  );
  const pool = eligible.length ? eligible : ids;
  return pool.reduce((best, id) =>
    pathLength(id) < pathLength(best) ? id : best,
  );
}

function completeAction(
  state: GameState,
  actorId: ActorId,
  command: Command,
): GameState {
  const slime = state.actors[actorId]!;
  // 실행 전에 targetId를 확정하므로 여기서는 항상 존재한다.
  const targetId = command.targetId!;
  const pot = cauldron(state, targetId);
  if (command.action === "GET_HERB") {
    return slime.carrying === null
      ? event(state, `${slime.name}이(가) 약초를 들었습니다.`, {
          actors: patchActor(state, actorId, { ...slime, carrying: "herb" }),
        })
      : event(state, `${slime.name}이(가) 이미 무언가 들고 있습니다.`, {});
  }
  if (command.action === "ADD_HERB") {
    return slime.carrying === "herb" && pot.status === "EMPTY"
      ? event(state, `${targetId}에 약초를 넣었습니다.`, {
          actors: patchActor(state, actorId, { ...slime, carrying: null }),
          cauldrons: patchCauldron(state, targetId, {
            status: "HERB_LOADED",
            timerMs: 0,
          }),
        })
      : event(state, "빈 솥과 들고 있는 약초가 필요합니다.", {});
  }
  if (command.action === "MIX") {
    return pot.status === "HERB_LOADED"
      ? event(state, `${targetId} 조합 시작 — 5초`, {
          cauldrons: patchCauldron(state, targetId, {
            status: "MIXING",
            timerMs: 5_000,
          }),
        })
      : event(state, "약초가 든 솥만 저을 수 있습니다.", {});
  }
  if (command.action === "GET_PARCHMENT") {
    return slime.carrying === null
      ? event(state, `${slime.name}이(가) 양피지를 들었습니다.`, {
          actors: patchActor(state, actorId, {
            ...slime,
            carrying: "parchment",
          }),
        })
      : event(state, `${slime.name}이(가) 이미 무언가 들고 있습니다.`, {});
  }
  if (command.action === "DIP_PARCHMENT") {
    return slime.carrying === "parchment" &&
      pot.status === "READY_FOR_PARCHMENT"
      ? event(state, `${targetId}에 양피지를 담갔습니다 — 5초`, {
          actors: patchActor(state, actorId, { ...slime, carrying: null }),
          cauldrons: patchCauldron(state, targetId, {
            status: "INSCRIBING",
            timerMs: 5_000,
          }),
        })
      : event(state, "완성된 마력액과 들고 있는 양피지가 필요합니다.", {});
  }
  if (command.action === "TAKE_BOOK") {
    return slime.carrying === null && pot.status === "BOOK_READY"
      ? event(state, `${targetId}에서 마도서를 꺼냈습니다.`, {
          actors: patchActor(state, actorId, { ...slime, carrying: "book" }),
          cauldrons: patchCauldron(state, targetId, {
            status: "EMPTY",
            timerMs: 0,
          }),
        })
      : event(state, "완성된 마도서와 빈손이 필요합니다.", {});
  }
  if (slime.carrying !== "book") {
    return event(state, "납품할 마도서를 들고 있지 않습니다.", {});
  }
  const submitted = state.submitted + 1;
  return event(
    state,
    `마도서 납품 완료 — ${submitted}/${state.goal} (+${GOLD_PER_BOOK}G)`,
    {
      submitted,
      gold: state.gold + GOLD_PER_BOOK,
      phase: submitted >= state.goal ? "won" : "playing",
      actors: patchActor(state, actorId, { ...slime, carrying: null }),
    },
  );
}

function workDurationFor(slime: ActorState, action: Action) {
  return (
    workDuration[action] /
    statTables.workSpeedMultiplier[slime.statLevels.workSpeed]
  );
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
      const current = {
        ...pending,
        targetId:
          pending.targetId ?? nearestCauldron(next, position, pending.action),
      };
      const path = findPath(position, taskTiles[current.targetId]);
      if (!path) {
        slime = { ...slime, current: null, queue, status: "IDLE", path: [] };
        next = event(next, `${current.action} 작업 위치로 갈 수 없습니다.`, {});
        continue;
      }
      slime = {
        ...slime,
        current,
        queue,
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
          workLeftMs: workDurationFor(slime, slime.current!.action),
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
    next = completeAction(
      { ...next, actors: patchActor(next, actorId, slime) },
      actorId,
      slime.current!,
    );
    slime = {
      ...next.actors[actorId]!,
      current: null,
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
    actors[id] = {
      ...actor,
      alertMs,
      alert: alertMs > 0 ? actor.alert : null,
    };
    changed = true;
  }
  return changed ? { ...state, actors } : state;
}

function advanceCauldrons(state: GameState, deltaMs: number) {
  let next = state;
  for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
    const pot = next.cauldrons[id];
    if (!["MIXING", "INSCRIBING"].includes(pot.status)) continue;
    // 냄비에서 익는 시간에는 작업 속도를 적용하지 않는다.
    const timerMs = Math.max(0, pot.timerMs - deltaMs);
    if (timerMs > 0) {
      next = {
        ...next,
        cauldrons: patchCauldron(next, id, { ...pot, timerMs }),
      };
      continue;
    }
    const status =
      pot.status === "MIXING" ? "READY_FOR_PARCHMENT" : "BOOK_READY";
    next = event(
      next,
      `${id} ${status === "BOOK_READY" ? "마도서 완성" : "마력액 완성"}`,
      {
        cauldrons: patchCauldron(next, id, { status, timerMs: 0 }),
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
  next = advanceCauldrons(next, elapsed);
  if (next.phase === "won") return next;
  const timeLeftMs = next.timeLeftMs - elapsed;
  return timeLeftMs === 0
    ? event(next, `시간 종료 — 마도서 ${next.submitted}/${next.goal}권 납품`, {
        phase: "lost",
        timeLeft: 0,
        timeLeftMs: 0,
      })
    : {
        ...next,
        timeLeftMs,
        timeLeft: Math.ceil(timeLeftMs / 1000),
      };
}

export function command(
  actorId: ActorId,
  action: Action,
  targetId?: TargetId,
  sequence = 1,
): CommandEnvelope {
  // 솥 작업에서 target이 없으면 null로 두고 실행 시점에 가까운 솥을 고른다.
  const target = targetId ?? fixedTargets[action] ?? null;
  return {
    status: "OK",
    confidence: 1,
    commands: [
      {
        actorId,
        action,
        targetId: target,
        destinationId: null,
        sequence,
      },
    ],
    reason: null,
  };
}
