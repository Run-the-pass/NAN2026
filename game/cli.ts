import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allStations,
  initialState,
  interactActors,
  slimeTypes,
  squadActorIds,
  tick,
  type ActorId,
  type GameState,
  type SlimeTypeId,
  type StationId,
} from "./core.js";

function runUntilDone(state: GameState, actorId: ActorId) {
  let next = state;
  for (let count = 0; count < 20_000 && next.actors[actorId]?.intent; count += 1) {
    next = tick(next, 50);
  }
  return next;
}

// 토큰 형식: SLIME:STATION 예) lightning:ingredient-box
export function simulate(args: string[]) {
  let seed = 2026;
  let squad: SlimeTypeId[] = ["lightning", "fire"];
  const operations: ({ token: string; waitMs: number } | {
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
    if (token.startsWith("WAIT:")) {
      const waitMs = Number(token.slice(5));
      if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
        throw new Error(`잘못된 대기: ${token}`);
      }
      operations.push({ token, waitMs });
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
    operations.push({
      token,
      actorId,
      station: station as StationId,
    });
  }

  let state = initialState(seed, squad);
  let elapsedMs = 0;
  const steps = operations.map((operation) => {
    if ("waitMs" in operation) {
      for (let elapsed = 0; elapsed < operation.waitMs; elapsed += 50) {
        state = tick(state, Math.min(50, operation.waitMs - elapsed));
      }
      elapsedMs += operation.waitMs;
    } else {
      const before = state.timeLeftMs;
      state = runUntilDone(
        interactActors(state, [operation.actorId], operation.station),
        operation.actorId,
      );
      elapsedMs += before - state.timeLeftMs;
    }
    return {
      operation: operation.token,
      elapsedMs,
      event: state.lastEvent,
      ingredients: state.ingredients,
      stoves: state.stoves,
      workstations: state.workstations,
      filled: state.filled,
    };
  });

  return { seed, squad, elapsedMs, steps, final: state };
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
