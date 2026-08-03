import {
  allItems,
  recipes,
  type ItemId,
  type StationId,
} from "../game/core.js";

export type StageInfoNextStep = "RECRUIT" | "PLAY";

export type StageInfoUiConfig = {
  mapPreviewKey: string;
  tipLines: string[];
  availableFoodIds: string[];
  nextStep: StageInfoNextStep;
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
      "도마는 슬라임 누구나 쓸 수 있어요.",
      "완성 음식은 깨끗한 그릇에 담아요.",
    ],
    availableFoodIds: ["roasted-potato"],
    nextStep: "PLAY",
  },
  "1-2": {
    mapPreviewKey: "kitchen-v1",
    tipLines: [
      "조리 완료 뒤 12초가 지나면 불이 나요.",
      "물 슬라임은 화재를 5초간 진화해요.",
    ],
    availableFoodIds: ["roasted-potato"],
    nextStep: "RECRUIT",
  },
  "1-3": {
    mapPreviewKey: "kitchen-v1",
    tipLines: [
      "주문 수가 많아도 조리 순서는 같아요.",
      "더러운 그릇은 세척해서 다시 써요.",
    ],
    availableFoodIds: ["roasted-potato"],
    nextStep: "RECRUIT",
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
