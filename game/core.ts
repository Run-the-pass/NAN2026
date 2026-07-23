export type ActorId = "slime-01" | "slime-02";
export type Action = "GET" | "CHOP" | "COOK" | "SERVE" | "PREPARE";
export type TargetId =
  | "mushroom-box"
  | "cutting-board"
  | "pot"
  | "customer";

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

export type GameState = {
  seed: number;
  round: 1 | 2;
  phase: "playing" | "upgrade" | "finished";
  timeLeft: number;
  score: number;
  upgraded: boolean;
  mushroom: "stock" | "held" | "chopped" | "stew" | "sold";
  hungry: boolean;
  mistakeUsed: boolean;
  lastEvent: string;
  history: string[];
};

const targets: Record<Action, TargetId> = {
  GET: "mushroom-box",
  CHOP: "cutting-board",
  COOK: "pot",
  SERVE: "customer",
  PREPARE: "mushroom-box",
};

export function initialState(seed = 2026): GameState {
  return {
    seed: seed >>> 0,
    round: 1,
    phase: "playing",
    timeLeft: 75,
    score: 0,
    upgraded: false,
    mushroom: "stock",
    hungry: true,
    mistakeUsed: false,
    lastEvent: "1라운드 시작 — 주문: 버섯 스튜 1개",
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
      return { ok: false, reason: "PREPARE는 강화 후에만 사용할 수 있습니다." };
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

export function executeCommand(
  state: GameState,
  command: Command,
): GameState {
  if (state.phase !== "playing") {
    return event(state, "현재 라운드에서는 명령을 실행할 수 없습니다.", {});
  }
  if (command.action === "PREPARE") {
    if (state.round !== 2 || !state.upgraded) {
      return event(state, "아직 재료 준비 명령을 이해하지 못합니다.", {});
    }
    const got = executeCommand(state, {
      actorId: command.actorId,
      action: "GET",
      targetId: "mushroom-box",
      destinationId: null,
      sequence: command.sequence,
    });
    if (got.mushroom !== "held") return got;
    const chopped = executeCommand(got, {
      actorId: command.actorId,
      action: "CHOP",
      targetId: "cutting-board",
      destinationId: null,
      sequence: command.sequence + 1,
    });
    return event(chopped, "PREPARE 분해 완료: GET → CHOP", {});
  }
  if (command.action === "GET") {
    if (command.actorId !== "slime-01" || state.mushroom !== "stock") {
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
  if (command.action === "CHOP") {
    return command.actorId === "slime-01" && state.mushroom === "held"
      ? event(state, "말랑이가 버섯을 손질했습니다.", { mushroom: "chopped" })
      : event(state, "손질할 버섯이 없습니다.", {});
  }
  if (command.action === "COOK") {
    return command.actorId === "slime-01" && state.mushroom === "chopped"
      ? event(state, "버섯 스튜가 완성되어 패스에 놓였습니다.", {
          mushroom: "stew",
        })
      : event(state, "손질된 버섯이 필요합니다.", {});
  }
  if (command.action === "SERVE") {
    if (command.actorId !== "slime-02" || state.mushroom !== "stew") {
      return event(state, "빨강이와 완성된 스튜가 필요합니다.", {});
    }
    const lastRound = state.round === 2;
    return event(
      state,
      lastRound
        ? "판매 완료! 2라운드를 성공했습니다."
        : "판매 완료! 강화 선택으로 이동합니다.",
      {
        mushroom: "sold",
        score: state.score + 100,
        phase: lastRound ? "finished" : "upgrade",
      },
    );
  }
  return state;
}

export function executeEnvelope(
  state: GameState,
  envelope: CommandEnvelope,
): GameState {
  return [...envelope.commands]
    .sort((a, b) => a.sequence - b.sequence)
    .reduce(executeCommand, state);
}

export function startRoundTwo(state: GameState): GameState {
  if (state.phase !== "upgrade") return state;
  return event(state, "강화 완료 — PREPARE 명령 해금! 2라운드 시작", {
    round: 2,
    phase: "playing",
    timeLeft: 75,
    upgraded: true,
    mushroom: "stock",
    hungry: false,
    mistakeUsed: false,
  });
}

export function tick(state: GameState): GameState {
  if (state.phase !== "playing" || state.timeLeft <= 0) return state;
  const timeLeft = state.timeLeft - 1;
  return timeLeft
    ? { ...state, timeLeft }
    : event(state, "시간 종료 — 새로고침하여 다시 도전하세요.", {
        timeLeft: 0,
        phase: "finished",
      });
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
