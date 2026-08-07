import { stageSlots, type StageSlot } from "../game/core.js";

// 스테이지별 최고 별. 계정이 없어 기기에 남긴다.
export type StageProgress = Record<string, number>;

const KEY = "nan2026.progress.v1";

// 앞 칸을 깼는지로 잠금을 판단한다. 튜토리얼은 늘 열려 있다.
export function unlockedSlots(progress: StageProgress): Set<string> {
  const open = new Set<string>([stageSlots[0].id]);
  for (const [index, slot] of stageSlots.entries()) {
    if (index === 0) continue;
    const previous = stageSlots[index - 1];
    // 앞 칸을 한 번이라도 깼으면(별 0 이상 기록) 다음이 열린다.
    if (previous.id in progress) open.add(slot.id);
  }
  return open;
}

export const slotState = (slot: StageSlot, progress: StageProgress) => ({
  cleared: slot.id in progress,
  stars: progress[slot.id] ?? 0,
  unlocked: slot.ready && unlockedSlots(progress).has(slot.id),
});

// 최고 성적만 남긴다. 못 깬 판도 0으로 기록해 다음 칸을 열지 않게 구분한다.
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
    // 저장값은 사용자가 고칠 수 있으므로 들일 때 거른다.
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        ([id, stars]) =>
          stageSlots.some((slot) => slot.id === id) &&
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
