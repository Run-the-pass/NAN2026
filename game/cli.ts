import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allItems,
  allStations,
  command,
  executeEnvelope,
  initialState,
  isValidRoute,
  movePlayer,
  slimeTypes,
  tick,
  tileCenter,
  validateEnvelope,
  type ActorId,
  type GameState,
  type ItemId,
  type SlimeTypeId,
  type StationId,
} from "./core.js";

function runFor(state: GameState, durationMs: number) {
  let next = state;
  for (
    let elapsed = 0;
    elapsed < durationMs && next.phase === "playing";
    elapsed += 50
  ) {
    next = tick(next, Math.min(50, durationMs - elapsed));
  }
  return next;
}

type Operation =
  | { token: string; waitMs: number }
  | { token: string; playerTile: { col: number; row: number } }
  | { token: string; actorId: ActorId; item: ItemId; target: StationId };

// 토큰 형식: [actor.]ITEM>TARGET  예) keen.red-herb>brewer
export function simulate(args: string[]) {
  let seed = 2026;
  let squad: SlimeTypeId[] = ["keen"];
  let followPlayer = true;
  let fixedPlayer: { col: number; row: number } | null = null;
  const operations: Operation[] = [];

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
      if (squad.some((typeId) => !(typeId in slimeTypes))) {
        throw new Error(`허용되지 않은 슬라임: ${token}`);
      }
      continue;
    }
    if (token.startsWith("--player=")) {
      const [col, row] = token.slice(9).split(",").map(Number);
      if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row)) {
        throw new Error(`잘못된 플레이어 위치: ${token}`);
      }
      followPlayer = false;
      fixedPlayer = { col, row };
      continue;
    }
    if (token.startsWith("WAIT:")) {
      const waitMs = Number(token.slice(5));
      if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
        throw new Error(`잘못된 대기: ${token}`);
      }
      operations.push({ token, waitMs });
      continue;
    }
    if (token.startsWith("PLAYER:")) {
      const [col, row] = token.slice(7).split(",").map(Number);
      if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row)) {
        throw new Error(`잘못된 플레이어 위치: ${token}`);
      }
      followPlayer = false;
      operations.push({ token, playerTile: { col, row } });
      continue;
    }
    const [head, target, extra] = token.split(">");
    const [actorPart, itemPart] = head.includes(".")
      ? head.split(".")
      : [null, head];
    if (
      extra !== undefined ||
      !target ||
      (actorPart !== null && !(actorPart in slimeTypes)) ||
      !allItems.includes(itemPart as ItemId) ||
      !allStations.includes(target as StationId) ||
      !isValidRoute(itemPart as ItemId, target as StationId)
    ) {
      throw new Error(`허용되지 않은 명령: ${token}`);
    }
    const actorId = (actorPart ?? squad[0]) as ActorId;
    if (!squad.includes(actorId)) {
      throw new Error(`스쿼드에 없는 슬라임: ${token}`);
    }
    operations.push({
      token,
      actorId,
      item: itemPart as ItemId,
      target: target as StationId,
    });
  }

  let state = initialState(seed, squad);
  if (fixedPlayer) {
    const center = tileCenter(fixedPlayer);
    state = movePlayer(state, center.x, center.y);
  }
  let elapsedMs = 0;
  const steps = operations.map((operation) => {
    if ("waitMs" in operation) {
      state = runFor(state, operation.waitMs);
      elapsedMs += operation.waitMs;
    } else if ("playerTile" in operation) {
      const center = tileCenter(operation.playerTile);
      state = movePlayer(state, center.x, center.y);
    } else {
      const checked = validateEnvelope(
        command(operation.actorId, operation.item, operation.target),
      );
      if ("reason" in checked) throw new Error(checked.reason);
      if (followPlayer) {
        const actor = state.actors[operation.actorId]!;
        state = movePlayer(state, actor.x, actor.y);
      }
      state = executeEnvelope(state, checked.value);
      const actorId = operation.actorId;
      while (
        state.phase === "playing" &&
        (state.actors[actorId]!.current || state.actors[actorId]!.queue.length)
      ) {
        state = tick(state, 50);
        elapsedMs += 50;
      }
    }
    return {
      operation: operation.token,
      elapsedMs,
      event: state.lastEvent,
      summons: state.summons,
      brewer: state.brewer,
      table: state.table,
      order: state.order,
      filled: state.filled,
      gold: state.gold,
    };
  });

  return {
    seed,
    squad,
    elapsedMs,
    steps,
    final: {
      phase: state.phase,
      timeLeftMs: state.timeLeftMs,
      filled: state.filled,
      gold: state.gold,
      summons: state.summons,
      brewer: state.brewer,
      table: state.table,
      order: state.order,
      actors: state.actors,
      history: state.history,
    },
  };
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
