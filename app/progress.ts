import { defaultStages, shiftCleared } from "../game/core.js";

export type StageProgress = Record<string, number>;
export type ProgressData = { stars: StageProgress };

const COOKIE_KEY = "nan2026.progress.v2";
const OLD_KEY = "nan2026.progress.v1";

export const emptyProgress = (): ProgressData => ({ stars: {} });

export const endlessUnlocked = (progress: StageProgress) => shiftCleared(progress);

export function stageUnlocked(progress: StageProgress, id: string) {
  const stages = defaultStages();
  const index = stages.findIndex((stage) => stage.id === id);
  return index === 0 || (index > 0 && (progress[stages[index - 1]!.id] ?? 0) > 0);
}

export function shiftStars(progress: StageProgress) {
  const stages = defaultStages();
  return {
    have: stages.reduce((sum, stage) => sum + (progress[stage.id] ?? 0), 0),
    max: stages.length * 3,
  };
}

export function withResult(progress: StageProgress, id: string, stars: number): StageProgress {
  if (id in progress && progress[id] >= stars) return progress;
  return { ...progress, [id]: stars };
}

// 쿠키는 사용자가 바꿀 수 있으므로 현재 스테이지와 별 범위만 받는다.
export function sanitizeProgress(raw: unknown): ProgressData {
  if (!raw || typeof raw !== "object") return emptyProgress();
  const ids = new Set(defaultStages().map(({ id }) => id));
  const value = raw as { stars?: unknown };
  const source = value.stars && typeof value.stars === "object" ? value.stars : {};
  const stars = Object.fromEntries(
    Object.entries(source as Record<string, unknown>).filter(
      ([id, count]) => ids.has(id) && Number.isInteger(count) && (count as number) >= 0 && (count as number) <= 3,
    ),
  ) as StageProgress;
  return { stars };
}

export function writeProgress(progress: ProgressData) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(sanitizeProgress(progress)))}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function readProgress(): ProgressData {
  if (typeof document === "undefined") return emptyProgress();
  try {
    const cookie = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${COOKIE_KEY}=`))
      ?.slice(COOKIE_KEY.length + 1);
    if (cookie) return sanitizeProgress(JSON.parse(decodeURIComponent(cookie)));

    // 기존 로컬 저장값은 쿠키가 없을 때만 한 번 옮긴다.
    const legacy = localStorage.getItem(OLD_KEY);
    if (!legacy) return emptyProgress();
    const migrated = sanitizeProgress({ stars: JSON.parse(legacy) });
    writeProgress(migrated);
    return migrated;
  } catch {
    return emptyProgress();
  }
}
