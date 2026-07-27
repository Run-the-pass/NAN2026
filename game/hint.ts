import type { ActorId, GameState } from "./core.js";

export type Hint = { title: string; say: string | null };

// 지금 해야 할 일 하나만 돌려준다. 레시피 전체를 외우게 하는 대신
// 다음 한 걸음만 보여 주어 첫 판에서도 흐름을 따라갈 수 있게 한다.
export function nextHint(state: GameState, actorId: ActorId): Hint {
  const slime = state.actors[actorId];
  if (!slime) return { title: "슬라임이 없습니다", say: null };
  const name = slime.name;
  const pots = Object.values(state.cauldrons);
  const has = (status: string) => pots.some((pot) => pot.status === status);

  if (slime.carrying === "book") {
    return { title: "납품대에 마도서를 납품하세요", say: `${name}아, 납품해` };
  }
  if (slime.carrying === "herb") {
    return { title: "솥에 약초를 넣으세요", say: `${name}아, 솥에 넣어` };
  }
  if (slime.carrying === "parchment") {
    return { title: "솥에 양피지를 담그세요", say: `${name}아, 양피지 담가` };
  }
  // 빈손일 때는 솥 상태를 보고 다음 할 일을 정한다.
  if (has("BOOK_READY")) {
    return { title: "완성된 마도서를 꺼내세요", say: `${name}아, 마도서 꺼내` };
  }
  if (has("READY_FOR_PARCHMENT")) {
    return { title: "양피지를 가져오세요", say: `${name}아, 양피지 가져와` };
  }
  if (has("HERB_LOADED")) {
    return { title: "솥을 저어 마력액을 만드세요", say: `${name}아, 저어` };
  }
  if (has("EMPTY")) {
    return { title: "약초를 가져오세요", say: `${name}아, 약초 가져와` };
  }
  // 두 솥이 모두 타이머를 돌리는 중이면 기다리는 것이 유일한 선택지다.
  return { title: "솥이 끓는 동안 기다리세요", say: null };
}
