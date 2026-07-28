import {
  allItems,
  isValidRoute,
  itemLabel,
  itemKind,
  slimeTypes,
  stationLabels,
  type ActorId,
  type Command,
  type ItemColor,
  type ItemId,
  type ItemKind,
  type StationId,
} from "./core.js";

const carriedItemPattern =
  /(그거|커|꺼|가|고|그것|고향|건|들고\s*있는\s*(?:거|것)|가지고\s*있는\s*(?:거|것)|갖고\s*있는\s*(?:거|것)|손에\s*든\s*(?:거|것)|손에\s*들고\s*있는\s*(?:거|것))/;

// "붉은 약초를 양조기에 넣어"처럼 물품과 목적지만 담은 한 문장을
// 바로 명령으로 바꾼다. 사전에 걸리는 발화는 Gemini 왕복이 없다.
const colorWords: { color: ItemColor; pattern: RegExp }[] = [
  { color: "red", pattern: /(붉은|불근|불은|빨간|빨강|부원역|레드|적색|분양|불균형|불 그냥|불면증|불 그냥 조용히|부른|불광역|부근|부르는)/ },
  { color: "blue", pattern: /(파란|파랑|파란색|파랑색|푸른|블루|청색|프라임)/ },
];

const kindWords: { kind: ItemKind; pattern: RegExp }[] = [
  { kind: "potion", pattern: /(물약|무략|뭐야|물략|포션)/ },
  { kind: "scroll", pattern: /(스크롤|스크룰|주문서|두루마리|스쿨)/ },
  { kind: "herb", pattern: /(약초|약추|작전|약쵸|야초|초보|투|조리법|양초|풀|허브|쳐|이파리|왕|으로|약술|약 처형)/ },
];

const itemPhraseAliases: { item: ItemId; pattern: RegExp }[] = [
  { item: "blue-herb", pattern: /(프랑스|파이어트)/ },
  { item: "red-scroll", pattern: /중앙스크린/ },
];

// 목적지는 더 구체적인 말부터 본다.
const targetWords: { target: StationId; pattern: RegExp }[] = [
  { target: "trash", pattern: /(버려|버리|폐기|쓰레기|오류|료|보려고|보류)/ },
  { target: "submission", pattern: /(제출|재출|납품|갖다\s*줘|배달)/ },
  { target: "brewer", pattern: /(양조|양주|왼쪽에도|기도|연주회도|주제로|연주해도|중에도|양족|끓|달여|주여|물약으로|주유소|호|양쪽|역시|주위로|조항조|약정|조향|양 조개도|조개도|양주 위에다|양주|안 주게|양 중에도|약 처량|왕조개|왕조|조개|안쪽에도)/ },
  { target: "table", pattern: /(테이블|도와줘|태이블|대블|테이불|책상|스크롤로|적어|써|어떻게|불러|업|테일러|테일로|가져(?!와))/ },
];

export const actorAliases: Record<ActorId, string[]> = {
  nerd: ["너드", "너두", "너디", "널드", "네드", "너 어디야", "너 어디", "너 내가", "교대역", "너 네가", "너도야", "너도", "너네", "너내", "로데오", "노재혁", "너 대화", ""],
  swift: ["날쌘", "날센", "날쎈", "날샌", "날쌔니"],
  keen: ["쫑긋", "돈까스", "좀 켜고", "좀 그사", "전부 다", "좀 그래서", "전기사", "전기장", "좀 크사", "종이컵", "좀 더", "전구", "전구사", "종긋", "쫑끗", "종끗", "전구색", "정크", "종교사", "똥꼬", "좀 꺼", "좀 그저", "쫑기시", "좀 구석", "좀 끄자", "좀끄자", "전국에서", "좀 크서", "중고서", "중국에서", "중고차", "중고사", "중사", "춤 고사", "중구에서", "청구서", "전구 앞으로","중구", "좀 커서", "좀 꺼져", "좀비고등학교", "좀 부근에", "촌구석", "좀 끄다", "중고사", "중고", "좀 꺼서", "손가락", "증권사"],
  worker: ["일꾼", "일군", "일꾸니", "일군이"],
};

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");

export type PhraseMatch = {
  field: "actor" | "color" | "item" | "target";
  spoken: string | null;
  canonical: string;
  source: "dictionary" | "default";
};

export type PhraseInspection = {
  commands: Command[] | null;
  matches: PhraseMatch[];
};

function findActor(text: string, squad: ActorId[]) {
  const spoken = normalize(text);
  for (const actorId of squad) {
    const alias = actorAliases[actorId].find((candidate) => {
      const normalized = normalize(candidate);
      return normalized.length > 0 && spoken.includes(normalized);
    });
    if (alias) return { actorId, alias };
  }
  return { actorId: squad[0], alias: null };
}

export function inspectPhrase(text: string, squad: ActorId[]): PhraseInspection {
  if (!text.trim() || squad.length < 1) return { commands: null, matches: [] };
  const actor = findActor(text, squad);
  const colorEntry = colorWords.find(({ pattern }) => pattern.test(text));
  const kindEntry = kindWords.find(({ pattern }) => pattern.test(text));
  const itemPhraseEntry = itemPhraseAliases.find(({ pattern }) => pattern.test(text));
  const targetEntry = targetWords.find(({ pattern }) => pattern.test(text));
  const carriedSpoken = carriedItemPattern.exec(text)?.[0];
  const matches: PhraseMatch[] = [{
    field: "actor",
    spoken: actor.alias,
    canonical: slimeTypes[actor.actorId].name,
    source: actor.alias ? "dictionary" : "default",
  }];
  const colorSpoken = colorEntry?.pattern.exec(text)?.[0];
  if (colorEntry && colorSpoken) {
    matches.push({
      field: "color",
      spoken: colorSpoken,
      canonical: colorEntry.color === "red" ? "붉은색" : "파란색",
      source: "dictionary",
    });
  }
  const itemPhraseSpoken = itemPhraseEntry?.pattern.exec(text)?.[0];
  const kindSpoken = kindEntry?.pattern.exec(text)?.[0];
  if (itemPhraseEntry && itemPhraseSpoken) {
    matches.push({
      field: "item",
      spoken: itemPhraseSpoken,
      canonical: itemLabel(itemPhraseEntry.item),
      source: "dictionary",
    });
  } else if (kindEntry && kindSpoken) {
    matches.push({
      field: "item",
      spoken: kindSpoken,
      canonical: { herb: "약초", potion: "물약", scroll: "스크롤" }[
        kindEntry.kind
      ],
      source: "dictionary",
    });
  } else if (carriedSpoken) {
    matches.push({
      field: "item",
      spoken: carriedSpoken,
      canonical: "현재 든 물품",
      source: "dictionary",
    });
  }
  const targetSpoken = targetEntry?.pattern.exec(text)?.[0];
  if (targetEntry && targetSpoken) {
    matches.push({
      field: "target",
      spoken: targetSpoken,
      canonical: stationLabels[targetEntry.target],
      source: "dictionary",
    });
  }
  if ((!itemPhraseEntry && (!colorEntry || !kindEntry)) || !targetEntry) {
    return { commands: null, matches };
  }
  const { target } = targetEntry;
  const item = itemPhraseEntry?.item ??
    `${colorEntry!.color}-${kindEntry!.kind}` as ItemId;
  if (!allItems.includes(item) || !isValidRoute(item, target)) {
    return { commands: null, matches };
  }
  // 가공은 약초만 받는다. "물약을 양조기에"는 사전에서 거른다.
  if ((target === "brewer" || target === "table") && itemKind(item) !== "herb") {
    return { commands: null, matches };
  }
  return {
    commands: [{ actorId: actor.actorId, item, target, sequence: 1 }],
    matches,
  };
}

export const matchPhrase = (text: string, squad: ActorId[]) =>
  inspectPhrase(text, squad).commands;

export function matchCarriedPhrase(
  text: string,
  squad: ActorId[],
): { actorId: ActorId; target: StationId } | null {
  const target = targetWords.find(({ pattern }) => pattern.test(text))?.target;
  if (
    !text.trim() ||
    squad.length < 1 ||
    !carriedItemPattern.test(text) ||
    !target
  ) {
    return null;
  }
  return { actorId: findActor(text, squad).actorId, target };
}
