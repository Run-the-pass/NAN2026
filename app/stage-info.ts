import { type ItemId, type StationId } from "../game/core.js";

// 그림이 없는 자리에서만 쓰는 대체 아이콘. 같은 이모지를 두 곳에 쓰면
// 무엇을 가리키는지 알 수 없어 모두 다른 것으로 둔다.
export const itemIcons: Record<ItemId, string> = {
  potato: "🥔",
  "shredded-potato": "🥟",
  carrot: "🥕",
  "shredded-carrot": "🍥",
  cabbage: "🥬",
  "shredded-cabbage": "🥗",
  banana: "🍌",
  strawberry: "🍓",
  mushroom: "🍄",
  "banana-smoothie": "🥤",
  "strawberry-smoothie": "🍹",
  "fried-potato": "🍟",
  "fried-mushroom": "🍤",
  "grilled-mushroom": "🍢",
};

export const stationIcons: Record<StationId, string> = {
  "potato-box": "🥔",
  "carrot-box": "🥕",
  "cabbage-box": "🥬",
  "banana-box": "🍌",
  "strawberry-box": "🍓",
  "mushroom-box": "🍄",
  stove: "🔪",
  oven: "🔥",
  fryer: "🍤",
  blender: "🥤",
  submission: "🛎️",
  trash: "🗑️",
  "dish-rack": "🍽️",
  "dish-return": "🧺",
  washer: "🫧",
  table: "▤",
};
