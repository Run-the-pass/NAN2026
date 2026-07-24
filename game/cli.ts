import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  command,
  executeEnvelope,
  initialState,
  tick,
  validateEnvelope,
  type Action,
  type CauldronId,
  type GameState,
  type TargetId,
} from "./core.js";

const actions: Action[] = [
  "GET_HERB",
  "ADD_HERB",
  "MIX",
  "GET_PARCHMENT",
  "DIP_PARCHMENT",
  "TAKE_BOOK",
  "SUBMIT",
];
const cauldrons: CauldronId[] = ["cauldron-01", "cauldron-02"];

function runFor(state: GameState, durationMs: number) {
  let next = state;
  for (let elapsed = 0; elapsed < durationMs && next.phase === "playing"; elapsed += 50) {
    next = tick(next, Math.min(50, durationMs - elapsed));
  }
  return next;
}

export function simulate(args: string[]) {
  let seed = 2026;
  const operations: Array<
    | { token: string; waitMs: number }
    | { token: string; action: Action; targetId?: TargetId }
  > = [];

  for (const token of args) {
    if (token.startsWith("--seed=")) {
      seed = Number(token.slice(7));
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        throw new Error(`잘못된 seed: ${token}`);
      }
      continue;
    }
    const [name, target, extra] = token.split(":");
    if (name === "WAIT" && target && extra === undefined) {
      const waitMs = Number(target);
      if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
        throw new Error(`잘못된 대기: ${token}`);
      }
      operations.push({ token, waitMs });
      continue;
    }
    if (
      extra !== undefined ||
      !actions.includes(name as Action) ||
      (target !== undefined && !cauldrons.includes(target as CauldronId))
    ) {
      throw new Error(`허용되지 않은 명령: ${token}`);
    }
    operations.push({
      token,
      action: name as Action,
      targetId: target as TargetId | undefined,
    });
  }

  let state = initialState(seed);
  let elapsedMs = 0;
  const steps = operations.map((operation) => {
    if ("waitMs" in operation) {
      state = runFor(state, operation.waitMs);
      elapsedMs += operation.waitMs;
    } else {
      const checked = validateEnvelope(
        command(operation.action, operation.targetId),
      );
      if ("reason" in checked) throw new Error(checked.reason);
      state = executeEnvelope(state, checked.value);
      while (
        state.phase === "playing" &&
        (state.actors["slime-01"].current ||
          state.actors["slime-01"].queue.length)
      ) {
        state = tick(state, 50);
        elapsedMs += 50;
      }
    }
    return {
      operation: operation.token,
      elapsedMs,
      event: state.lastEvent,
      carrying: state.actors["slime-01"].carrying,
      submitted: state.submitted,
      cauldrons: state.cauldrons,
    };
  });

  return {
    seed,
    elapsedMs,
    steps,
    final: {
      phase: state.phase,
      timeLeftMs: state.timeLeftMs,
      submitted: state.submitted,
      actors: state.actors,
      cauldrons: state.cauldrons,
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
