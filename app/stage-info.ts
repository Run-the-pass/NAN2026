import {
  allItems,
  recipes,
  type ItemId,
  type StationId,
} from "../game/core.js";

export type StageInfoUiConfig = {
  mapPreviewKey: string;
  tipLines: string[];
  availableFoodIds: string[];
};

export const itemIcons: Record<ItemId, string> = {
  potato: "🥔",
  "roasted-potato": "🍟",
};

export const stationIcons: Record<StationId, string> = {
  "ingredient-box": "🥔",
  stove: "🔪",
  submission: "📬",
  trash: "🔥",
  "dish-rack": "🍽️",
  washer: "🫧",
  table: "▤",
};

const mapPreviewKeys = new Set(["kitchen-v1"]);

export const stageInfoUiConfig: Record<string, StageInfoUiConfig> = {
  "1-1": {
    mapPreviewKey: "kitchen-v1",
    tipLines: [
      "슬라임을 고르면 갈 수 있는 칸이 보여요.",
      "도마는 땅 슬라임만 쓸 수 있어요.",
    ],
    availableFoodIds: ["roasted-potato"],
  },
  "1-2": {
    mapPreviewKey: "kitchen-v1",
    tipLines: [
      "번개 슬라임은 한 턴에 두 번 움직여요.",
      "쓰던 일은 다음 턴에 이어서 할 수 있어요.",
    ],
    availableFoodIds: ["roasted-potato"],
  },
  "1-3": {
    mapPreviewKey: "kitchen-v1",
    tipLines: [
      "기준보다 더 많이 처리하면 별이 늘어요.",
      "더러운 그릇은 물 슬라임이 씻어요.",
    ],
    availableFoodIds: ["roasted-potato"],
  },
};

const isKnownFood = (foodId: string): foodId is ItemId =>
  allItems.includes(foodId as ItemId) &&
  foodId in itemIcons &&
  foodId in recipes;

export const availableStageFoods = (config: StageInfoUiConfig) =>
  config.availableFoodIds.filter(isKnownFood);

export function validateStageInfoUiConfig(
  configs: Record<string, StageInfoUiConfig>,
) {
  const errors: string[] = [];
  for (const [stageId, config] of Object.entries(configs)) {
    if (!mapPreviewKeys.has(config.mapPreviewKey)) {
      errors.push(`${stageId}: 존재하지 않는 맵 미리보기`);
    }
    if (config.tipLines.length > 2) {
      errors.push(`${stageId}: TIP은 최대 2개`);
    }
    if (config.tipLines.some((tip) => tip.length > 30)) {
      errors.push(`${stageId}: TIP은 최대 30자`);
    }
    if (config.availableFoodIds.length > 6) {
      errors.push(`${stageId}: 음식은 최대 6개`);
    }
    if (new Set(config.availableFoodIds).size !== config.availableFoodIds.length) {
      errors.push(`${stageId}: 음식 ID 중복`);
    }
    if (config.availableFoodIds.some((foodId) => !isKnownFood(foodId))) {
      errors.push(`${stageId}: 존재하지 않거나 레시피가 없는 음식`);
    }
  }
  return errors;
}
