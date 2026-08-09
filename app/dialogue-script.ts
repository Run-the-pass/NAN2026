import { itemLabels, stationLabels, slimeTypes, type SlimeTypeId } from "../game/core.js";

export type DialogueTone = "food" | "tool" | "slime";

const termTones = new Map<string, DialogueTone>([
  ...Object.values(itemLabels).map((term) => [term, "food"] as const),
  ...[...Object.values(stationLabels), "제출대", "접시", "그릇"].map(
    (term) => [term, "tool"] as const,
  ),
  ...[
    "점장 슬라임",
    ...Object.values(slimeTypes).map(({ name }) => name),
  ].map((term) => [term, "slime"] as const),
]);
const termPattern = new RegExp(
  `(${[...termTones.keys()]
    .sort((one, two) => two.length - one.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "g",
);

export const dialogueParts = (text: string) =>
  text.split(termPattern).filter(Boolean).map((part) => ({
    text: part,
    tone: termTones.get(part),
  }));

export type DialogueFocus = "orders" | "earth" | "inspector" | "next-order" | "clock" | "roster";
export type DialogueLine = {
  speaker: SlimeTypeId;
  text: string;
  name?: string;
  focus?: DialogueFocus;
  portrait?: string;
  companions?: SlimeTypeId[];
};

const MANAGER_PORTRAIT = "/home/green-slime.svg";

// 아르바이트 모드를 처음 열 때 나오는 인사. 규칙은 여기서 설명하지 않는다.
// 아직 해 보지 않은 것을 미리 늘어놓으면 하나도 남지 않는다. 조작은 첫 주문을
// 직접 해 보면서 app/tutorial.ts가 한 번에 하나씩 알려 준다.
export const openingLines: DialogueLine[] = [
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "안녕하세요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "저는 점장 슬라임이에요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "슬라임 레스토랑에 아르바이트 지원해 주셔서 너무나도 감사해요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "어디보자, 맡아주실 업무가… 매장 관리직이시네요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "오늘은 첫날이니까, 제가 차근차근 알려드릴게요!" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "오, 마침 주문이 들어왔어요! 한 번 봐 볼까요?", focus: "orders" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "이건 썰린 양배추네요! 양배추를 썰면 될 것 같아요. 한번 해 볼까요?", focus: "orders" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "지금 쉬고 있는 푸름이를 불렀어요!", focus: "earth" },
];

export const earthInfoLines: DialogueLine[] = [
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "여기는 상세 정보 창이에요! 장비나 친구들을 클릭해 친구들이 할 수 있는 정보를 확인할 수 있어요.", focus: "inspector" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "푸름이가 할 수 있는 일은 도마에서 재료들을 써는 일이에요. 각 슬라임마다 할 수 있는 일이 다르니까, 새로운 슬라임이 오면 꼭 확인해보세요!", focus: "inspector" },
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "이제 푸름이를 움직여보시겠어요?", focus: "earth" },
];

export const actionPointLines: DialogueLine[] = [
  { speaker: "earth", text: "슬라임은 행동력이 존재합니다. 행동력은 이동이나 상호 작용 시에 소모됩니다.", focus: "roster" },
  { speaker: "earth", text: "매 턴 시작 시 행동력은 리셋됩니다. 사용하지 않은 행동력이 다음 턴에 추가되지는 않습니다.", focus: "roster" },
  { speaker: "earth", text: "행동력을 모두 쓰면 다음 턴으로 자동으로 넘어갑니다.", focus: "roster" },
];

export const waterArrivalLines: DialogueLine[] = [
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "앗, 그러고 보니 요리를 서빙하기 위해선 그릇이 필요해요! 그런데 푸름이가 갖고 오기엔 너무 머네요. 어떡한담…" },
  { speaker: "water", name: "퐁당이", text: "제가 할게요, 점장님!" },
];

export const platedFoodLines: DialogueLine[] = [
  { speaker: "water", name: "퐁당이", text: "처음 하시는 일 치고 굉장히 능숙하신데요? 대단해요!" },
  { speaker: "water", name: "퐁당이", text: "이 음식은 제가 서빙할게요!" },
];

// 첫 양배추 주문을 내면 튜토리얼을 분명히 끝낸다.
export const tutorialCompleteLines: DialogueLine[] = [
  { speaker: "earth", name: "점장 슬라임", portrait: MANAGER_PORTRAIT, text: "오늘은 이정도만 하셔도 될 것 같아요! 정말 잘하시는데요?" },
];

const managerLine = (text: string, extra: Partial<DialogueLine> = {}): DialogueLine => ({
  speaker: "earth",
  name: "점장 슬라임",
  portrait: MANAGER_PORTRAIT,
  text,
  ...extra,
});

export const stageOpeningLines = (stageId: string): DialogueLine[] =>
  stageId === "1" ? [
    managerLine("풀 타임으로 근무하시는 건 이번이 처음이시겠네요! 푸름이와 퐁당이만으로는 힘드실까봐 나머지 두 친구들도 오늘 출근시켰어요."),
    managerLine("이글이와 번쩍이에요. 이글이는 불 쓰는 업무를, 번쩍이는 전자제품을 다뤄요.", { companions: ["fire", "lightning"] }),
    managerLine("오늘은 불 쓰는 업무를 하지 않아 이글이는 운반만 하겠지만, 번쩍이는 빠르기 때문에 남들보다 두 배 더 많이 일할 수 있어요. 이 점 참고해주세요!", { companions: ["fire", "lightning"] }),
    managerLine("우측 상단에 있는 시계는 남은 턴 수에요! 저 턴이 모두 지나면, 오늘의 영업은 끝이에요.", { focus: "clock" }),
    managerLine("요리를 하는 것도 중요하지만, 얼마나 많이 서빙할 수 있냐도 중요하겠죠? 시간 엄수 잘 해주세요!"),
    managerLine("오늘부터는 썬 양배추와 썬 당근을 합친 샐러드를 만들 수 있어요! 만드는 방식은 재료의 순서와 상관 없이 합치기만 하면 돼요."),
    managerLine("오늘도 파이팅이에요!"),
  ] : stageId === "2" ? [
    managerLine("적응이 매우 빠르시네요! 오늘부터는 조금 어려운 요리를 도전해도 되겠어요."),
    managerLine("이제부터 화덕과 튀김기를 사용하실 거에요. 화덕과 튀김기는 각각 이글이와 번쩍이가 작업할 수 있어요.", { companions: ["fire", "lightning"] }),
    managerLine("사용 방법은 다른 도구들과 똑같으니까, 새로운 레시피를 참고하시면서 작업해주세요!"),
  ] : [
    managerLine("정말 대단하신데요? 이정도면은 저희 정직원이 되셔도 손색이 없으시겠어요. 물론 오늘 업무를 감당하실 수 있으시다면 말이죠. 후후"),
    managerLine("오늘은 새롭게 믹서기를 사용하실 수 있어요. 믹서기는 특이하게 먼저 과일을 넣고, 물을 넣은 다음에, 전기를 작동시켜야 돌아가는 기계에요."),
    managerLine("물은 퐁당이가 부을 수 있고요, 전기는 역시 번쩍이가 작업할 수 있어요. 스무디에 물을 어떻게 붓냐고요? 그건 영업 기밀이에요!"),
    managerLine("그리고 오늘은, 아르바이트 하시면서 나온 모든 음식들이 전부 다 나올 거에요. 그럼, 건투를 빌게요!"),
  ];

export const finalLines: DialogueLine[] = [
  managerLine("우와… 이걸 전부 다 해내시다니… 정말 저희 레스토랑에서 놓쳐서는 안될 인재세요!"),
  managerLine("저희랑 같이 일해보실래요? 시급은 넉넉하게 챙겨드릴게요!"),
  managerLine("해보고 싶으시면은, 꼭 무한 모드로 와주세요!!!"),
];
