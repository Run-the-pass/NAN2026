export type SlimeElement = "water" | "fire" | "lightning" | "earth";
export type SlimeTypeId = SlimeElement;
export type ActorId = SlimeTypeId;
export type ItemId = "mushroom" | "grilled-mushroom";
export type StationId =
  | "ingredient-box"
  | "stove"
  | "submission"
  | "trash";
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
};

export const allItems: ItemId[] = ["mushroom", "grilled-mushroom"];
export const allStations: StationId[] = [
  "ingredient-box",
  "stove",
  "submission",
  "trash",
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
  carrying: ItemId | null;
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
  workstation: {
    status: WorkstationStatus;
    workerId: ActorId | null;
    progressMs: number;
    totalMs: number;
  };
  order: {
    need: Partial<Record<ItemId, number>>;
    done: Partial<Record<ItemId, number>>;
  };
  lastEvent: string;
  history: string[];
};

export const TILE_SIZE = 60;
export const GOLD_PER_ORDER = 100;
export const INGREDIENT_MAX = 4;
export const INGREDIENT_INTERVAL_MS = 6_000;
export const STORAGE_MAX = 1;

// I 재료 상자, C 조리 도구, S 음식 제출대, X 쓰레기 처리 공간.
export const KITCHEN_ROWS = [
  "################",
  "#..............#",
  "#..............#",
  "#...I..........#",
  "#..............#",
  "#..C...........#",
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
};

export const taskTiles: Record<StationId, TilePosition> = {
  "ingredient-box": { col: 4, row: 4 },
  stove: { col: 3, row: 6 },
  submission: { col: 6, row: 6 },
  trash: { col: 9, row: 6 },
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

function makeActor(typeId: SlimeTypeId, spawn: TilePosition): ActorState {
  const kind = slimeTypes[typeId];
  return {
    typeId,
    name: `${kind.name} 슬라임`,
    ...tileCenter(spawn),
    moveSpeed:
      statTables.moveTilesPerSecond[kind.statLevels.moveSpeed] * TILE_SIZE,
    status: "IDLE",
    carrying: null,
    intent: null,
    workLeftMs: 0,
    statLevels: { ...kind.statLevels },
    buffs: [],
    alert: null,
    alertMs: 0,
  };
}

export function initialState(
  seed = 2026,
  squad: SlimeTypeId[] = ["water"],
): GameState {
  if (
    squad.length < 1 ||
    squad.length > spawnTiles.length ||
    new Set(squad).size !== squad.length ||
    squad.some((typeId) => !(typeId in slimeTypes))
  ) {
    throw new Error("스쿼드는 서로 다른 속성 슬라임 1~4마리여야 합니다.");
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
    actors,
    ingredients: { stock: 1, timerMs: INGREDIENT_INTERVAL_MS },
    stove: [],
    workstation: {
      status: "MISSING_MATERIAL",
      workerId: null,
      progressMs: 0,
      totalMs: workDuration.cook,
    },
    order: { need: { "grilled-mushroom": 1 }, done: {} },
    lastEvent: "3분 동안 음식 주문 5건을 완료하세요.",
    history: ["식당 영업 시작"],
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

function releaseWork(state: GameState, actorIds: ActorId[]): GameState {
  if (
    !state.workstation.workerId ||
    !actorIds.includes(state.workstation.workerId)
  ) {
    return state;
  }
  return {
    ...state,
    workstation: {
      ...state.workstation,
      status: state.stove.includes("mushroom") ? "IDLE" : "MISSING_MATERIAL",
      workerId: null,
      progressMs: 0,
    },
  };
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
  if (actor.carrying === "mushroom") {
    return station === "stove" || station === "trash";
  }
  if (actor.carrying === "grilled-mushroom") {
    return station === "submission" || station === "trash";
  }
  if (station === "ingredient-box") return true;
  if (station === "stove") {
    return (
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
) {
  const done = (state.order.done["grilled-mushroom"] ?? 0) + 1;
  const filled = state.filled + 1;
  const nextActor = { ...actor, carrying: null, intent: null, status: "IDLE" as const };
  return event(state, `음식 주문 완료 — ${filled}/${state.goal} (+${GOLD_PER_ORDER}G)`, {
    actors: patchActor(state, actorId, nextActor),
    filled,
    gold: state.gold + GOLD_PER_ORDER,
    phase: filled >= state.goal ? "won" : "playing",
    order: done >= 1
      ? { need: { "grilled-mushroom": 1 }, done: {} }
      : { ...state.order, done: { "grilled-mushroom": done } },
  });
}

function moveActor(state: GameState, actorId: ActorId, deltaMs: number) {
  let next = state;
  let remaining = deltaMs;
  let actor = next.actors[actorId]!;
  while (remaining > 0 && next.phase === "playing" && actor.intent) {
    if (actor.status === "MOVING") {
      const destination = actor.intent.route[0];
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
          intent: { ...actor.intent, route: actor.intent.route.slice(1) },
        };
        continue;
      }

      if (actor.intent.kind === "MOVE") {
        actor = { ...actor, intent: null, status: "IDLE" };
        break;
      }
      if (actor.intent.leader !== actorId) {
        const wrongElement =
          actor.intent.station === "stove" &&
          !actor.carrying &&
          !next.stove.includes("grilled-mushroom") &&
          actor.typeId !== "fire";
        if (wrongElement) {
          next = refuse(
            next,
            actorId,
            actor,
            "불 슬라임만 가열 조리를 할 수 있습니다.",
            "WRONG_ELEMENT",
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

    if (
      station === "stove" &&
      next.workstation.status === "WORKING" &&
      next.workstation.workerId !== actorId
    ) {
      actor = waitAtStation(actor);
      remaining = 0;
      break;
    }

    if (station === "ingredient-box") {
      if (actor.carrying) {
        next = refuse(next, actorId, actor, "이미 음식이나 재료를 들고 있습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      if (next.ingredients.stock < 1) {
        actor = waitAtStation(actor, true);
        remaining = 0;
        break;
      }
      actor = {
        ...actor,
        carrying: "mushroom",
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
      if (actor.carrying === "mushroom") {
        if (next.stove.length >= STORAGE_MAX) {
          next = refuse(next, actorId, actor, "조리 도구가 사용 중입니다.", "TARGET_FULL");
          actor = next.actors[actorId]!;
          continue;
        }
        actor = {
          ...actor,
          carrying: null,
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
      if (actor.carrying) {
        next = refuse(next, actorId, actor, "완성된 음식은 음식 제출대로 옮겨야 합니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      if (next.stove.includes("grilled-mushroom")) {
        actor = {
          ...actor,
          carrying: "grilled-mushroom",
          intent: null,
          status: "IDLE",
        };
        next = event(next, `${actor.name}이(가) 버섯 구이를 들었습니다.`, {
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
      if (actor.carrying !== "grilled-mushroom") {
        next = refuse(next, actorId, actor, "제출할 완성 음식이 없습니다.");
        actor = next.actors[actorId]!;
        continue;
      }
      next = submitFood(next, actorId, actor);
      actor = next.actors[actorId]!;
      continue;
    }

    if (!actor.carrying) {
      next = refuse(next, actorId, actor, "버릴 재료나 음식이 없습니다.");
      actor = next.actors[actorId]!;
      continue;
    }
    const discarded = itemLabel(actor.carrying);
    actor = {
      ...actor,
      carrying: null,
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
  if (next.phase === "won") return next;
  const timeLeftMs = next.timeLeftMs - elapsed;
  return timeLeftMs === 0
    ? event(next, `영업 종료 — 음식 주문 ${next.filled}/${next.goal}건 완료`, {
        phase: "lost",
        timeLeft: 0,
        timeLeftMs: 0,
      })
    : { ...next, timeLeftMs, timeLeft: Math.ceil(timeLeftMs / 1000) };
}
