export type ActorId = "slime-01";
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

export type Command = {
  actorId: ActorId;
  action: Action;
  targetId: TargetId;
  destinationId: null;
  sequence: number;
};

export type CommandEnvelope = {
  status: "OK";
  confidence: number;
  commands: Command[];
  reason: string | null;
};

export type ActorState = {
  x: number;
  y: number;
  moveSpeed: number;
  status: ActorStatus;
  carrying: CarriedItem;
  current: Command | null;
  queue: Command[];
  path: TilePosition[];
  workLeftMs: number;
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
  actors: Record<ActorId, ActorState>;
  cauldrons: Record<CauldronId, CauldronState>;
  lastEvent: string;
  history: string[];
};

export const TILE_SIZE = 60;
export const WORKSHOP_ROWS = [
  "################",
  "#......TT......#",
  "#..............#",
  "#.HH........PP.#",
  "#.HH...####.PP.#",
  "#......####....#",
  "#...CC....CC...#",
  "#...CC....CC...#",
  "#..............#",
  "################",
] as const;

export const displayTiles = {
  herb: { col: 2, row: 3 },
  parchment: { col: 13, row: 3 },
  submission: { col: 7, row: 1 },
  "cauldron-01": { col: 4, row: 6 },
  "cauldron-02": { col: 11, row: 6 },
} satisfies Record<string, TilePosition>;

export const taskTiles: Record<TargetId, TilePosition> = {
  "herb-box": { col: 4, row: 3 },
  "parchment-box": { col: 11, row: 3 },
  "submission-table": { col: 7, row: 2 },
  "cauldron-01": { col: 4, row: 5 },
  "cauldron-02": { col: 11, row: 5 },
};

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

const actor = (): ActorState => ({
  ...tileCenter({ col: 8, row: 8 }),
  moveSpeed: 120,
  status: "IDLE",
  carrying: null,
  current: null,
  queue: [],
  path: [],
  workLeftMs: 0,
});

export function initialState(seed = 2026): GameState {
  return {
    seed: seed >>> 0,
    phase: "playing",
    timeLeft: 180,
    timeLeftMs: 180_000,
    submitted: 0,
    goal: 8,
    actors: { "slime-01": actor() },
    cauldrons: {
      "cauldron-01": { status: "EMPTY", timerMs: 0 },
      "cauldron-02": { status: "EMPTY", timerMs: 0 },
    },
    lastEvent: "3분 동안 마도서를 8권 납품하세요.",
    history: ["공방 작업 시작"],
  };
}

function validTarget(action: Action, targetId: unknown) {
  const fixed = fixedTargets[action];
  return fixed
    ? targetId === fixed
    : cauldronActions.includes(action) &&
        ["cauldron-01", "cauldron-02"].includes(String(targetId));
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
    envelope.commands.length > 4
  ) {
    return { ok: false, reason: "명령 형식이 올바르지 않습니다." };
  }
  for (const item of envelope.commands) {
    if (
      !item ||
      item.actorId !== "slime-01" ||
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

export function executeCommand(state: GameState, next: Command): GameState {
  if (state.phase !== "playing") {
    return event(state, "종료된 공방에서는 명령을 받을 수 없습니다.", {});
  }
  const slime = state.actors["slime-01"];
  return event(state, `말랑 작업 큐에 ${next.action} 추가`, {
    actors: {
      "slime-01": { ...slime, queue: [...slime.queue, next] },
    },
  });
}

export function executeEnvelope(
  state: GameState,
  envelope: CommandEnvelope,
): GameState {
  const checked = validateEnvelope(envelope);
  if ("reason" in checked) return event(state, checked.reason, {});
  return [...checked.value.commands]
    .sort((a, b) => a.sequence - b.sequence)
    .reduce(executeCommand, state);
}

function cauldron(state: GameState, id: TargetId) {
  return state.cauldrons[id as CauldronId];
}

function patchCauldron(
  state: GameState,
  id: TargetId,
  next: CauldronState,
) {
  return {
    ...state.cauldrons,
    [id]: next,
  };
}

function completeAction(state: GameState, command: Command): GameState {
  const slime = state.actors["slime-01"];
  const pot = cauldron(state, command.targetId);
  if (command.action === "GET_HERB") {
    return slime.carrying === null
      ? event(state, "말랑이 약초를 들었습니다.", {
          actors: { "slime-01": { ...slime, carrying: "herb" } },
        })
      : event(state, "이미 무언가 들고 있어 약초를 집을 수 없습니다.", {});
  }
  if (command.action === "ADD_HERB") {
    return slime.carrying === "herb" && pot.status === "EMPTY"
      ? event(state, `${command.targetId}에 약초를 넣었습니다.`, {
          actors: { "slime-01": { ...slime, carrying: null } },
          cauldrons: patchCauldron(state, command.targetId, {
            status: "HERB_LOADED",
            timerMs: 0,
          }),
        })
      : event(state, "빈 솥과 들고 있는 약초가 필요합니다.", {});
  }
  if (command.action === "MIX") {
    return pot.status === "HERB_LOADED"
      ? event(state, `${command.targetId} 조합 시작 — 5초`, {
          cauldrons: patchCauldron(state, command.targetId, {
            status: "MIXING",
            timerMs: 5_000,
          }),
        })
      : event(state, "약초가 든 솥만 저을 수 있습니다.", {});
  }
  if (command.action === "GET_PARCHMENT") {
    return slime.carrying === null
      ? event(state, "말랑이 양피지를 들었습니다.", {
          actors: { "slime-01": { ...slime, carrying: "parchment" } },
        })
      : event(state, "이미 무언가 들고 있어 양피지를 집을 수 없습니다.", {});
  }
  if (command.action === "DIP_PARCHMENT") {
    return slime.carrying === "parchment" &&
      pot.status === "READY_FOR_PARCHMENT"
      ? event(state, `${command.targetId}에 양피지를 담갔습니다 — 5초`, {
          actors: { "slime-01": { ...slime, carrying: null } },
          cauldrons: patchCauldron(state, command.targetId, {
            status: "INSCRIBING",
            timerMs: 5_000,
          }),
        })
      : event(state, "완성된 마력액과 들고 있는 양피지가 필요합니다.", {});
  }
  if (command.action === "TAKE_BOOK") {
    return slime.carrying === null && pot.status === "BOOK_READY"
      ? event(state, `${command.targetId}에서 마도서를 꺼냈습니다.`, {
          actors: { "slime-01": { ...slime, carrying: "book" } },
          cauldrons: patchCauldron(state, command.targetId, {
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
  return event(state, `마도서 납품 완료 — ${submitted}/${state.goal}`, {
    submitted,
    phase: submitted >= state.goal ? "won" : "playing",
    actors: { "slime-01": { ...slime, carrying: null } },
  });
}

function moveActor(state: GameState, deltaMs: number) {
  let next = state;
  let remaining = deltaMs;
  let slime = next.actors["slime-01"];
  while (remaining > 0 && next.phase === "playing") {
    if (!slime.current) {
      const [current, ...queue] = slime.queue;
      if (!current) {
        slime = { ...slime, status: "IDLE", path: [], workLeftMs: 0 };
        break;
      }
      const path = findPath(
        pixelToTile(slime.x, slime.y),
        taskTiles[current.targetId],
      );
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
          workLeftMs: workDuration[slime.current!.action],
        };
        continue;
      }
      const destination = tileCenter(waypoint);
      const dx = destination.x - slime.x;
      const dy = destination.y - slime.y;
      const distance = Math.hypot(dx, dy);
      const travelMs = distance / slime.moveSpeed * 1000;
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
      { ...next, actors: { "slime-01": slime } },
      slime.current!,
    );
    slime = {
      ...next.actors["slime-01"],
      current: null,
      status: "IDLE",
      path: [],
      workLeftMs: 0,
    };
  }
  return { ...next, actors: { "slime-01": slime } };
}

function advanceCauldrons(state: GameState, deltaMs: number) {
  let next = state;
  for (const id of ["cauldron-01", "cauldron-02"] as CauldronId[]) {
    const pot = next.cauldrons[id];
    if (!["MIXING", "INSCRIBING"].includes(pot.status)) continue;
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
    next = event(next, `${id} ${status === "BOOK_READY" ? "마도서 완성" : "마력액 완성"}`, {
      cauldrons: patchCauldron(next, id, { status, timerMs: 0 }),
    });
  }
  return next;
}

export function tick(state: GameState, deltaMs = 1000): GameState {
  if (
    state.phase !== "playing" ||
    !Number.isFinite(deltaMs) ||
    deltaMs <= 0
  ) {
    return state;
  }
  const elapsed = Math.min(deltaMs, state.timeLeftMs);
  let next = moveActor(state, elapsed);
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
  action: Action,
  targetId?: TargetId,
  sequence = 1,
): CommandEnvelope {
  const target = targetId ?? fixedTargets[action];
  if (!target) throw new Error(`${action}에는 솥을 지정해야 합니다.`);
  return {
    status: "OK",
    confidence: 1,
    commands: [
      {
        actorId: "slime-01",
        action,
        targetId: target,
        destinationId: null,
        sequence,
      },
    ],
    reason: null,
  };
}
