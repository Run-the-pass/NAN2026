import { defaultStages, shiftCleared } from "../game/core.js";

export type StageProgress = Record<string, number>;
export type ProgressData = { stars: StageProgress; resumeStageId: string | null };

const COOKIE_KEY = "nan2026.progress.v2";
const OLD_KEY = "nan2026.progress.v1";

export const emptyProgress = (): ProgressData => ({ stars: {}, resumeStageId: null });

export const endlessUnlocked = (progress: StageProgress) => shiftCleared(progress);

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
  const value = raw as { stars?: unknown; resumeStageId?: unknown };
  const source = value.stars && typeof value.stars === "object" ? value.stars : {};
  const stars = Object.fromEntries(
    Object.entries(source as Record<string, unknown>).filter(
      ([id, count]) => ids.has(id) && Number.isInteger(count) && (count as number) >= 0 && (count as number) <= 3,
    ),
  ) as StageProgress;
  return {
    stars,
    resumeStageId: typeof value.resumeStageId === "string" && ids.has(value.resumeStageId)
      ? value.resumeStageId
      : null,
  };
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
    const migrated = sanitizeProgress({ stars: JSON.parse(legacy), resumeStageId: null });
    writeProgress(migrated);
    return migrated;
  } catch {
    return emptyProgress();
  }
}
