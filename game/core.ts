export type ActorId = "slime-01" | "slime-02";
export type Action = "GET" | "CHOP" | "COOK" | "SERVE" | "PREPARE";
export type TargetId =
  | "mushroom-box"
  | "cutting-board"
  | "pot"
  | "customer";
export type ActorStatus = "IDLE" | "MOVING" | "WORKING";
export type ChoiceId = "mallang-mastery" | "prepare" | "team-boost";
export type TilePosition = { col: number; row: number };

export type Command = {
  actorId: ActorId;
  action: Action;
  targetId: TargetId;
  destinationId: string | null;
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
  workSpeed: number;
  status: ActorStatus;
  current: Command | null;
  queue: Command[];
  path: TilePosition[];
  workLeftMs: number;
};

export type GameState = {
  seed: number;
  round: 1 | 2;
  phase: "playing" | "choice" | "finished";
  timeLeft: number;
  timeLeftMs: number;
  score: number;
  upgraded: boolean;
  selectedChoice: ChoiceId | null;
  mushroom: "stock" | "held" | "chopped" | "stew";
  hungry: boolean;
  mistakeUsed: boolean;
  ordersPending: number;
  ordersReceived: number;
  roundSales: number;
  nextOrderInMs: number;
  actors: Record<ActorId, ActorState>;
  lastEvent: string;
  history: string[];
};

export const TILE_SIZE = 60;
export const KITCHEN_ROWS = [
  "################",
  "#......SS......#",
  "#..............#",
  "#.BB........PP.#",
  "#.BB...####.PP.#",
  "#......####....#",
  "#..............#",
  "#.DD........DD.#",
  "#......GG......#",
  "################",
] as const;

export const stationTiles: Record<Action, TilePosition> = {
  GET: { col: 7, row: 7 },
  CHOP: { col: 4, row: 3 },
  COOK: { col: 11, row: 3 },
  SERVE: { col: 7, row: 2 },
  PREPARE: { col: 7, row: 7 },
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
  KITCHEN_ROWS[row]?.[col] === ".";

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
    if (
      current.col === destination.col &&
      current.row === destination.row
    ) {
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

export const choices: ReadonlyArray<{
  id: ChoiceId;
  title: string;
  description: string;
  effect: string;
  color: string;
}> = [
  {
    id: "mallang-mastery",
    title: "말랑 숙련 강화",
    description: "주방 담당 말랑이의 발과 손이 빨라집니다.",
    effect: "말랑 이동·작업 속도 +35%",
    color: "#63d47c",
  },
  {
    id: "prepare",
    title: "재료 준비 해금",
    description: "가져오기와 손질을 한 문장으로 지시합니다.",
    effect: "PREPARE → GET + CHOP",
    color: "#6ba9ff",
  },
  {
    id: "team-boost",
    title: "전체 슬라임 강화",
    description: "주방과 서빙 슬라임이 함께 성장합니다.",
    effect: "모든 슬라임 이동·작업 속도 +15%",
    color: "#ef5b55",
  },
];

const targets: Record<Action, TargetId> = {
  GET: "mushroom-box",
  CHOP: "cutting-board",
  COOK: "pot",
  SERVE: "customer",
  PREPARE: "mushroom-box",
};

const workDuration: Record<Exclude<Action, "PREPARE">, number> = {
  GET: 900,
  CHOP: 1600,
  COOK: 2200,
  SERVE: 900,
};

const actor = (col: number, row: number): ActorState => ({
  ...tileCenter({ col, row }),
  moveSpeed: 120,
  workSpeed: 1,
  status: "IDLE",
  current: null,
  queue: [],
  path: [],
  workLeftMs: 0,
});

export function initialState(seed = 2026): GameState {
  return {
    seed: seed >>> 0,
    round: 1,
    phase: "playing",
    timeLeft: 75,
    timeLeftMs: 75_000,
    score: 0,
    upgraded: false,
    selectedChoice: null,
    mushroom: "stock",
    hungry: true,
    mistakeUsed: false,
    ordersPending: 1,
    ordersReceived: 1,
    roundSales: 0,
    nextOrderInMs: 10_000,
    actors: {
      "slime-01": actor(5, 6),
      "slime-02": actor(10, 2),
    },
    lastEvent: "1라운드 시작 — 버섯 스튜 주문이 들어왔습니다.",
    history: ["1라운드 시작"],
  };
}

export function validateEnvelope(
  value: unknown,
  round: 1 | 2,
  upgraded: boolean,
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
      !["slime-01", "slime-02"].includes(item.actorId) ||
      !["GET", "CHOP", "COOK", "SERVE", "PREPARE"].includes(item.action) ||
      targets[item.action as Action] !== item.targetId ||
      item.destinationId !== null ||
      !Number.isInteger(item.sequence)
    ) {
      return { ok: false, reason: "허용 목록 밖의 actor/action/target입니다." };
    }
    if (item.action === "PREPARE" && (round !== 2 || !upgraded)) {
      return { ok: false, reason: "PREPARE는 해금 후에만 사용할 수 있습니다." };
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
    history: [...state.history.slice(-5), message],
  };
}

function expanded(command: Command): Command[] {
  if (command.action !== "PREPARE") return [command];
  return [
    { ...command, action: "GET", targetId: "mushroom-box" },
    {
      ...command,
      action: "CHOP",
      targetId: "cutting-board",
      sequence: command.sequence + 1,
    },
  ];
}

export function executeCommand(state: GameState, next: Command): GameState {
  if (state.phase !== "playing") {
    return event(state, "현재 라운드에서는 명령을 받을 수 없습니다.", {});
  }
  if (next.action === "PREPARE" && (state.round !== 2 || !state.upgraded)) {
    return event(state, "아직 재료 준비 명령을 이해하지 못합니다.", {});
  }
  const actorState = state.actors[next.actorId];
  return event(state, `${next.actorId === "slime-01" ? "말랑" : "빨강"} 작업 큐에 ${next.action} 추가`, {
    actors: {
      ...state.actors,
      [next.actorId]: {
        ...actorState,
        queue: [...actorState.queue, ...expanded(next)],
      },
    },
  });
}

export function executeEnvelope(
  state: GameState,
  envelope: CommandEnvelope,
): GameState {
  return [...envelope.commands]
    .sort((a, b) => a.sequence - b.sequence)
    .reduce(executeCommand, state);
}

function completeAction(state: GameState, actorId: ActorId, action: Action) {
  if (action === "GET") {
    if (actorId !== "slime-01" || state.mushroom !== "stock") {
      return event(state, "말랑이만 새 버섯을 가져올 수 있습니다.", {});
    }
    if (state.hungry && !state.mistakeUsed) {
      return event(state, "사고! 배고픈 말랑이가 버섯을 먹었습니다. 다시 지시하세요.", {
        hungry: false,
        mistakeUsed: true,
      });
    }
    return event(state, "말랑이가 버섯을 가져왔습니다.", { mushroom: "held" });
  }
  if (action === "CHOP") {
    return actorId === "slime-01" && state.mushroom === "held"
      ? event(state, "말랑이가 버섯을 손질했습니다.", { mushroom: "chopped" })
      : event(state, "손질할 버섯이 없습니다.", {});
  }
  if (action === "COOK") {
    return actorId === "slime-01" && state.mushroom === "chopped"
      ? event(state, "버섯 스튜가 완성되어 패스에 놓였습니다.", {
          mushroom: "stew",
        })
      : event(state, "손질된 버섯이 필요합니다.", {});
  }
  if (action === "SERVE") {
    if (
      actorId !== "slime-02" ||
      state.mushroom !== "stew" ||
      state.ordersPending < 1
    ) {
      return event(state, "빨강이, 완성된 스튜와 대기 주문이 필요합니다.", {});
    }
    return event(state, "판매 완료! 다음 버섯을 준비하세요.", {
      mushroom: "stock",
      score: state.score + 100,
      ordersPending: state.ordersPending - 1,
      roundSales: state.roundSales + 1,
    });
  }
  return state;
}

function moveActor(state: GameState, actorId: ActorId, deltaMs: number) {
  let next = state;
  let remaining = deltaMs;
  let slime = next.actors[actorId];
  while (remaining > 0) {
    if (!slime.current) {
      const [current, ...queue] = slime.queue;
      if (!current) {
        slime = { ...slime, status: "IDLE", path: [], workLeftMs: 0 };
        break;
      }
      const path = findPath(
        pixelToTile(slime.x, slime.y),
        stationTiles[current.action],
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
          workLeftMs:
            workDuration[
              slime.current.action as Exclude<Action, "PREPARE">
            ] / slime.workSpeed,
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
      const path = slime.path.slice(1);
      slime = {
        ...slime,
        x: destination.x,
        y: destination.y,
        path,
        status: path.length ? "MOVING" : "WORKING",
        workLeftMs: path.length
          ? 0
          : workDuration[
              slime.current.action as Exclude<Action, "PREPARE">
            ] / slime.workSpeed,
      };
      remaining -= travelMs;
    }

    if (slime.status === "WORKING") {
      if (slime.workLeftMs > remaining) {
        slime = { ...slime, workLeftMs: slime.workLeftMs - remaining };
        remaining = 0;
        break;
      }
      remaining -= slime.workLeftMs;
      next = {
        ...completeAction(
          { ...next, actors: { ...next.actors, [actorId]: slime } },
          actorId,
          slime.current.action,
        ),
      };
      slime = {
        ...next.actors[actorId],
        current: null,
        status: "IDLE",
        path: [],
        workLeftMs: 0,
      };
    }
  }
  return { ...next, actors: { ...next.actors, [actorId]: slime } };
}

function finishRound(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.round === 1 && state.roundSales > 0) {
    return event(state, "1라운드 성공 — 성장 하나를 선택하세요.", {
      phase: "choice",
      timeLeft: 0,
      timeLeftMs: 0,
    });
  }
  return event(
    state,
    state.round === 2
      ? `2라운드 종료 — ${state.roundSales}개 판매`
      : "시간 종료 — 한 그릇 이상 판매해야 합니다.",
    { phase: "finished", timeLeft: 0, timeLeftMs: 0 },
  );
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
  let next = moveActor(moveActor(state, "slime-01", elapsed), "slime-02", elapsed);
  const due = Math.max(
    0,
    Math.floor((elapsed - next.nextOrderInMs) / 10_000) + 1,
  );
  const nextOrderInMs = due
    ? next.nextOrderInMs + due * 10_000 - elapsed
    : next.nextOrderInMs - elapsed;
  const timeLeftMs = next.timeLeftMs - elapsed;
  next = {
    ...next,
    timeLeftMs,
    timeLeft: Math.ceil(timeLeftMs / 1000),
    nextOrderInMs,
    ordersPending: next.ordersPending + due,
    ordersReceived: next.ordersReceived + due,
  };
  if (due > 0) {
    next = event(next, `버섯 스튜 주문 ${due}건이 들어왔습니다.`, {});
  }
  return timeLeftMs === 0 ? finishRound(next) : next;
}

export function endRound(state: GameState) {
  return finishRound(state);
}

export function chooseUpgrade(state: GameState, choiceId: ChoiceId): GameState {
  if (state.phase !== "choice" || !choices.some(({ id }) => id === choiceId)) {
    return state;
  }
  const actors = Object.fromEntries(
    Object.entries(state.actors).map(([id, slime]) => {
      const multiplier =
        choiceId === "team-boost" ||
        (choiceId === "mallang-mastery" && id === "slime-01")
          ? choiceId === "team-boost"
            ? 1.15
            : 1.35
          : 1;
      return [
        id,
        {
          ...slime,
          moveSpeed: slime.moveSpeed * multiplier,
          workSpeed: slime.workSpeed * multiplier,
          status: "IDLE",
          current: null,
          queue: [],
          path: [],
          workLeftMs: 0,
        },
      ];
    }),
  ) as Record<ActorId, ActorState>;
  return event(state, `${choices.find(({ id }) => id === choiceId)?.title} 선택 — 2라운드 시작`, {
    round: 2,
    phase: "playing",
    timeLeft: 75,
    timeLeftMs: 75_000,
    upgraded: choiceId === "prepare",
    selectedChoice: choiceId,
    mushroom: "stock",
    hungry: false,
    mistakeUsed: false,
    ordersPending: 1,
    ordersReceived: 1,
    roundSales: 0,
    nextOrderInMs: 10_000,
    actors,
  });
}

export function startRoundTwo(state: GameState): GameState {
  return chooseUpgrade(state, "prepare");
}

export function command(
  actorId: ActorId,
  action: Action,
): CommandEnvelope {
  return {
    status: "OK",
    confidence: 1,
    commands: [
      {
        actorId,
        action,
        targetId: targets[action],
        destinationId: null,
        sequence: 1,
      },
    ],
    reason: null,
  };
}
