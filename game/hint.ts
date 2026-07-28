import {
  STORAGE_MAX,
  withParticle,
  itemKind,
  itemLabel,
  sourceOf,
  stockOf,
  type ActorId,
  type GameState,
  type ItemId,
} from "./core.js";

export type Hint = { title: string; say: string | null };

// 지금 채워야 할 주문 항목 하나를 골라 그것부터 안내한다.
// 레시피를 외우게 하는 대신 다음 한 걸음만 보여 준다.
export function nextHint(state: GameState, actorId: ActorId): Hint {
  const slime = state.actors[actorId];
  const name = slime ? slime.name : "슬라임";
  const missing = (Object.entries(state.order.need) as [ItemId, number][])
    .map(([item, count]) => ({
      item,
      left: count - (state.order.done[item] ?? 0),
    }))
    .filter(({ left }) => left > 0);
  if (missing.length < 1) return { title: "주문을 확인하세요", say: null };

  // 이미 만들어 둔 것이 있으면 그것부터 제출한다.
  const ready = missing.find(({ item }) => stockOf(state, item) > 0);
  if (ready) {
    return {
      title: `${withParticle(itemLabel(ready.item))} 제출하세요`,
      say: `${name}아, ${itemLabel(ready.item)} 제출해`,
    };
  }
  // 없으면 가공이 필요한 것부터. 약초를 해당 설비로 보낸다.
  const target = missing[0].item;
  const kind = itemKind(target);
  if (kind === "herb") {
    return {
      title: `${withParticle(itemLabel(target), ["이", "가"])} 소환될 때까지 기다리세요`,
      say: null,
    };
  }
  const station = kind === "potion" ? "양조기" : "테이블";
  const herb = `${target.split("-")[0]}-herb` as ItemId;
  if (stockOf(state, herb) < 1) {
    return { title: `${withParticle(itemLabel(herb), ["이", "가"])} 소환되길 기다리세요`, say: null };
  }
  const shelf = sourceOf(target) === "brewer" ? state.brewer : state.table;
  if (shelf.length >= STORAGE_MAX) {
    return {
      title: `${station} 재고가 가득 찼습니다 — 하나 비우세요`,
      say: `${name}아, ${itemLabel(shelf[0])} 버려`,
    };
  }
  return {
    title: `${withParticle(itemLabel(herb))} ${station}에 넣으세요`,
    say: `${name}아, ${withParticle(itemLabel(herb))} ${station}에 넣어`,
  };
}
