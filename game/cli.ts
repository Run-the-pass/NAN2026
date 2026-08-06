import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allStations,
  endTurn,
  initialState,
  interactActor,
  isBesideStation,
  isWalkable,
  moveActor,
  moveTargets,
  occupantOf,
  resolveStationTarget,
  slimeTypes,
  squadActorIds,
  type ActorId,
  type GameState,
  type SlimeTypeId,
  type StationId,
  type StationInstance,
  type StationInstanceId,
  type TilePosition,
} from "./core.js";

const neighbours = ({ col, row }: TilePosition): TilePosition[] => [
  { col, row: row - 1 },
  { col: col - 1, row },
  { col: col + 1, row },
  { col, row: row + 1 },
];

const tileKey = ({ col, row }: TilePosition) => `${col},${row}`;

// 설비 옆 칸까지의 최단 경로. 게임 규칙이 아니라 스크립트 편의라서
// 코어가 아니라 여기 둔다. 플레이어는 화면에서 한 칸씩 직접 찍는다.
function pathToStation(
  state: GameState,
  actorId: ActorId,
  station: StationInstance,
): TilePosition[] | null {
  const actor = state.actors[actorId]!;
  const goals = new Set(
    station.tiles
      .flatMap((tile) => neighbours(tile))
      .filter(isWalkable)
      .map(tileKey),
  );
  const start: TilePosition = { col: actor.col, row: actor.row };
  if (goals.has(tileKey(start))) return [];
  const cameFrom = new Map<string, TilePosition | null>([[tileKey(start), null]]);
  const queue: TilePosition[] = [start];
  while (queue.length > 0) {
    const tile = queue.shift()!;
    for (const next of neighbours(tile)) {
      const key = tileKey(next);
      if (cameFrom.has(key) || !isWalkable(next) || occupantOf(state, next)) continue;
      cameFrom.set(key, tile);
      if (goals.has(key)) {
        const path = [next];
        for (
          let step: TilePosition | null = tile;
          step;
          step = cameFrom.get(tileKey(step)) ?? null
        ) {
          path.unshift(step);
        }
        // 첫 칸은 지금 서 있는 자리라 뺀다.
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return null;
}

// 행동력이 떨어지면 턴을 넘겨 가며 설비 옆까지 걸어간다.
function walkToStation(
  state: GameState,
  actorId: ActorId,
  station: StationInstance,
): GameState {
  let next = state;
  for (let guard = 0; guard < 500; guard += 1) {
    const actor = next.actors[actorId]!;
    if (isBesideStation(actor, station)) return next;
    if (actor.actionPoints < 1) {
      next = endTurn(next);
      if (next.phase !== "playing") return next;
      continue;
    }
    const path = pathToStation(next, actorId, station);
    if (!path?.length) return next;
    next = moveActor(next, actorId, path[0]);
    if (next.phase !== "playing") return next;
  }
  return next;
}

// 설비 출입 칸을 동료가 다 막고 있으면 한 칸 비켜 준다. 출입 칸이
// 하나뿐인 설비가 많아 자주 생기는 상황이고, 플레이어가 손으로 할 일을
// 스크립트가 대신하는 것뿐이다. 게임 규칙이 아니다.
function makeWay(
  state: GameState,
  actorId: ActorId,
  station: StationInstance,
): GameState {
  const floors = station.tiles
    .flatMap((tile) => neighbours(tile))
    .filter(isWalkable);
  const free = (current: GameState) =>
    floors.some((tile) => {
      const holder = occupantOf(current, tile);
      return !holder || holder === actorId;
    });
  if (free(state)) return state;
  let next = state;
  for (const tile of floors) {
    const blocker = occupantOf(next, tile);
    if (!blocker || blocker === actorId) continue;
    if (next.actors[blocker]!.actionPoints < 1) next = endTurn(next);
    if (next.phase !== "playing") return next;
    const options = moveTargets(next, blocker);
    // 다른 출입 칸으로 비키면 의미가 없으므로 바깥쪽을 먼저 고른다.
    const away =
      options.find((one) => !floors.some((f) => f.col === one.col && f.row === one.row)) ??
      options[0];
    if (away) next = moveActor(next, blocker, away);
    if (free(next)) return next;
  }
  return next;
}

// 설비 옆까지 걸어가 한 번 상호작용한다. 스크립트와 테스트가 매번
// 이동을 손으로 적지 않게 해 주는 편의일 뿐, 게임 규칙이 아니다.
export function actAt(
  state: GameState,
  actorId: ActorId,
  target: StationInstanceId | StationId,
): GameState {
  const station = resolveStationTarget(target);
  if (!station || state.phase !== "playing") return state;
  let next = makeWay(state, actorId, station);
  if (next.phase !== "playing") return next;
  next = walkToStation(next, actorId, station);
  if (next.phase !== "playing") return next;
  // 행동력을 다 썼으면 다음 턴에 상호작용한다.
  if (next.actors[actorId]!.actionPoints < 1) next = endTurn(next);
  return next.phase === "playing"
    ? interactActor(next, actorId, station.id)
    : next;
}

// 토큰 형식: SLIME:STATION 예) lightning:ingredient-box. TURN은 턴 종료다.
export function simulate(args: string[]) {
  let seed = 2026;
  let squad: SlimeTypeId[] = ["lightning", "fire"];
  const operations: ({ token: string; turns: number } | {
    token: string;
    actorId: ActorId;
    station: StationId;
  })[] = [];

  for (const token of args) {
    if (token.startsWith("--seed=")) {
      seed = Number(token.slice(7));
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        throw new Error(`잘못된 seed: ${token}`);
      }
      continue;
    }
    if (token.startsWith("--slimes=")) {
      squad = token.slice(9).split(",") as SlimeTypeId[];
      if (squad.some((id) => !(id in slimeTypes))) {
        throw new Error(`허용되지 않은 슬라임: ${token}`);
      }
      continue;
    }
    if (token === "TURN" || token.startsWith("TURN:")) {
      const turns = token === "TURN" ? 1 : Number(token.slice(5));
      if (!Number.isSafeInteger(turns) || turns < 1) {
        throw new Error(`잘못된 턴 수: ${token}`);
      }
      operations.push({ token, turns });
      continue;
    }
    const [actor, station, extra] = token.split(":");
    // 액터는 인스턴스 ID(`water-2`)나 속성명으로 지목한다. 속성명은
    // 그 속성의 첫 마리를 뜻한다.
    const ids = squadActorIds(squad);
    const actorId = ids.includes(actor)
      ? actor
      : ids.find((id) => id.startsWith(`${actor}-`));
    if (
      extra !== undefined ||
      !actorId ||
      !allStations.includes(station as StationId)
    ) {
      throw new Error(`허용되지 않은 상호작용: ${token}`);
    }
    operations.push({ token, actorId, station: station as StationId });
  }

  let state = initialState(seed, squad);
  const steps = operations.map((operation) => {
    if ("turns" in operation) {
      for (let count = 0; count < operation.turns; count += 1) state = endTurn(state);
    } else {
      state = actAt(state, operation.actorId, operation.station);
    }
    return {
      operation: operation.token,
      turn: state.turn,
      turnsLeft: state.turnsLeft,
      event: state.lastEvent,
      refusal: state.refusal?.message ?? null,
      ingredients: state.ingredients,
      stoves: state.stoves,
      workstations: state.workstations,
      filled: state.filled,
    };
  });

  return { seed, squad, turn: state.turn, steps, final: state };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(simulate(process.argv.slice(2)), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "시뮬레이션 실패"}\n`,
    );
    process.exitCode = 1;
  }
}
