import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  command,
  executeEnvelope,
  initialState,
  tick,
  type Action,
  type ActorId,
} from "./core.js";

const actorIds = ["slime-01", "slime-02"] as const;
const actions = ["GET", "CHOP", "COOK", "SERVE", "PREPARE"] as const;

export function simulate(args: string[]) {
  let seed = 2026;
  let hungry = true;
  const commands: Array<{ token: string; actorId: ActorId; action: Action }> = [];

  for (const token of args) {
    if (token === "--no-hungry") {
      hungry = false;
      continue;
    }
    if (token.startsWith("--seed=")) {
      seed = Number(token.slice(7));
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        throw new Error(`잘못된 seed: ${token}`);
      }
      continue;
    }
    const [actorId, action, extra] = token.split(":");
    if (
      extra !== undefined ||
      !actorIds.includes(actorId as ActorId) ||
      !actions.includes(action as Action)
    ) {
      throw new Error(`허용되지 않은 명령: ${token}`);
    }
    commands.push({
      token,
      actorId: actorId as ActorId,
      action: action as Action,
    });
  }

  let state = { ...initialState(seed), hungry };
  let elapsedMs = 0;
  const steps = commands.map(({ token, actorId, action }) => {
    state = executeEnvelope(state, command(actorId, action));
    while (
      state.actors[actorId].current ||
      state.actors[actorId].queue.length
    ) {
      state = tick(state, 50);
      elapsedMs += 50;
      if (state.phase !== "playing") {
        throw new Error(`${token} 완료 전에 라운드가 종료되었습니다.`);
      }
    }
    return {
      command: token,
      elapsedMs,
      event: state.lastEvent,
      mushroom: state.mushroom,
      ordersPending: state.ordersPending,
      score: state.score,
    };
  });

  return {
    seed,
    hungry,
    elapsedMs,
    steps,
    final: {
      actors: state.actors,
      mushroom: state.mushroom,
      ordersPending: state.ordersPending,
      ordersReceived: state.ordersReceived,
      score: state.score,
      history: state.history,
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(`${JSON.stringify(simulate(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "시뮬레이션 실패"}\n`,
    );
    process.exitCode = 1;
  }
}
