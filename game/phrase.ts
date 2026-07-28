import {
  allItems,
  isValidRoute,
  itemKind,
  type ActorId,
  type Command,
  type ItemColor,
  type ItemId,
  type ItemKind,
  type StationId,
} from "./core.js";

// "붉은 약초를 양조기에 넣어"처럼 물품과 목적지만 담은 한 문장을
// 바로 명령으로 바꾼다. 사전에 걸리는 발화는 Gemini 왕복이 없다.
const colorWords: { color: ItemColor; pattern: RegExp }[] = [
  { color: "red", pattern: /(붉은|불근|불은|빨간|빨강|레드|적색)/ },
  { color: "blue", pattern: /(파란|파랑|파랑색|푸른|블루|청색)/ },
];

const kindWords: { kind: ItemKind; pattern: RegExp }[] = [
  { kind: "potion", pattern: /(물약|무략|물략|포션)/ },
  { kind: "scroll", pattern: /(스크롤|스크룰|주문서|두루마리)/ },
  { kind: "herb", pattern: /(약초|약추|약쵸|야초|풀|허브|이파리)/ },
];

// 목적지는 더 구체적인 말부터 본다.
const targetWords: { target: StationId; pattern: RegExp }[] = [
  { target: "trash", pattern: /(버려|버리|폐기|쓰레기)/ },
  { target: "submission", pattern: /(제출|재출|납품|갖다\s*줘|배달)/ },
  { target: "brewer", pattern: /(양조|양주|양족|끓|달여|물약으로)/ },
  { target: "table", pattern: /(테이블|태이블|테이불|책상|스크롤로|적어|써)/ },
];

export const actorAliases: Record<ActorId, string[]> = {
  nerd: ["너드", "너두", "너디", "널드", "네드"],
  swift: ["날쌘", "날센", "날쎈", "날샌", "날쌔니"],
  keen: ["쫑긋", "종긋", "쫑끗", "종끗", "쫑기시"],
  worker: ["일꾼", "일군", "일꾸니", "일군이"],
};

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");

function findActor(text: string, squad: ActorId[]): ActorId {
  const spoken = normalize(text);
  const called = squad.find((id) =>
    actorAliases[id].some((alias) => spoken.includes(normalize(alias))),
  );
  return called ?? squad[0];
}

export function matchPhrase(text: string, squad: ActorId[]): Command[] | null {
  if (!text.trim() || squad.length < 1) return null;
  const target = targetWords.find(({ pattern }) => pattern.test(text))?.target;
  if (!target) return null;
  const kind = kindWords.find(({ pattern }) => pattern.test(text))?.kind;
  const color = colorWords.find(({ pattern }) => pattern.test(text))?.color;
  if (!kind || !color) return null;
  const item = `${color}-${kind}` as ItemId;
  if (!allItems.includes(item) || !isValidRoute(item, target)) return null;
  // 가공은 약초만 받는다. "물약을 양조기에"는 사전에서 거른다.
  if ((target === "brewer" || target === "table") && itemKind(item) !== "herb") {
    return null;
  }
  return [{ actorId: findActor(text, squad), item, target, sequence: 1 }];
}
