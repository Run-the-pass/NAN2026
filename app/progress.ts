import { defaultStages, shiftCleared } from "../game/core.js";

// 스테이지별 최고 별. 계정이 없어 기기에 남긴다.
export type StageProgress = Record<string, number>;

const KEY = "nan2026.progress.v1";

// 스테이지를 다 깨야 무한 모드가 열린다.
export const endlessUnlocked = (progress: StageProgress) => shiftCleared(progress);

// 아르바이트 한 판에서 모은 별과 받을 수 있는 별.
export function shiftStars(progress: StageProgress) {
  const stages = defaultStages();
  return {
    have: stages.reduce((sum, stage) => sum + (progress[stage.id] ?? 0), 0),
    max: stages.length * 3,
  };
}

// 최고 성적만 남긴다. 못 깬 판도 0으로 기록해 어디까지 갔는지 남긴다.
export function withResult(
  progress: StageProgress,
  id: string,
  stars: number,
): StageProgress {
  if (id in progress && progress[id] >= stars) return progress;
  return { ...progress, [id]: stars };
}

export function readProgress(): StageProgress {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    const stages = defaultStages();
    // 저장값은 사용자가 고칠 수 있으므로 들일 때 거른다.
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        ([id, stars]) =>
          stages.some((stage) => stage.id === id) &&
          typeof stars === "number" &&
          Number.isInteger(stars) &&
          stars >= 0 &&
          stars <= 3,
      ),
    ) as StageProgress;
  } catch {
    return {};
  }
}

export function writeProgress(progress: StageProgress) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // 저장 공간이 막혀 있어도 게임은 계속된다.
  }
}
