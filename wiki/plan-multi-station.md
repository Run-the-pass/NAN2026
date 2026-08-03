---
type: plan
status: todo
updated: 2026-08-03
sources:
  - raw/assets_0/
---

# 작업대 여러 대 설치 계획

**상태**: 설계 확정, 코어 앞부분만 작성됨(이번 세션 스크래치패드). 저장소에는
반영하지 않았다. 되돌린 이유는 타입 오류 169개 + 의미를 새로 정해야 하는 자리
54곳이 남아 한 번에 끝내지 않으면 트리가 깨진 채로 남기 때문이다.

사용자 결정: **작업 위치는 자동 계산(A), 단 지정할 수단도 남긴다.**

## 모델

설비를 "종류"가 아니라 "놓인 타일"로 식별한다.

```ts
type StationKey = string;                       // `table@7,1`
stationKeyOf(id, tile) => `${id}@${tile.col},${tile.row}`

type StationInstance = {
  key: StationKey; id: StationId; tile: TilePosition;
  taskTile: TilePosition;   // 지정값 없으면 인접 바닥에서 자동
  pinnedTask: boolean;      // 맵에서 고정했는지
};
```

작업 위치 자동 선택은 **위·왼쪽·오른쪽·아래** 고정 순서로 첫 바닥을 고른다.
순서가 고정이라 같은 맵이면 늘 같은 칸이 나오고 결정론이 유지된다.

지정 수단: `map-data.ts`의 `taskTiles`를 인스턴스 키로 바꾼다.

```jsonc
"taskTiles": { "stove@1,3": { "col": 2, "row": 3 } }   // 이 한 대만 고정
```

기존 7개 항목은 키만 바꿔 옮기면 현재 배치가 그대로 유지된다:
`ingredient-box@4,1`→(4,2), `stove@1,3`→(2,3), `submission@7,9`→(7,8),
`trash@9,9`→(9,8), `dish-rack@11,1`→(11,2), `washer@14,3`→(13,3),
`table@7,1`→(7,2).

## 상태

종류별 단수 필드(`stove`, `dishRack`, `table`, `washer`, `workstation`, `fires`)를
전부 없애고 인스턴스 하나로 합친다.

```ts
type StationState = {
  items: Carried[];   // 조리 도구 재료·음식 / 그릇대·테이블의 물건 / 세척기의 그릇
  work: { status; workerId; progressMs; totalMs };   // 조리·세척·진화 진행도
  fire: FireState | null;                            // 화재 대상만
};
GameState.stations: Record<StationKey, StationState>
```

`Carried = ItemId | Dish`라서 네 종류의 보관 칸이 `items` 하나로 합쳐진다.
이게 이 리팩터의 핵심 단순화다.

## 호환 요령 (중요)

`interactActors(state, ids, target)`에서 **target에 종류 이름도 계속 허용**한다.
종류만 오면 액터마다 경로가 가장 짧은 인스턴스를 고르고, 동률이면 키 순서로
자른다. 이러면 기존 테스트·CLI가 `"stove"` 그대로 통과한다. 화면은 클릭한
타일을 알고 있으므로 `StationKey`를 직접 넘긴다.

이 프로젝트에 이미 있던 "가까운 솥 자동 선택" 규칙과 같은 방식이다.

## 표시 규칙 (2026-08-03 결정)

**내부 키와 좌표를 플레이어에게 보여 주지 않는다.** `table@7,1` 같은 키는
코드에서 설비를 구분하는 용도일 뿐이고, 설비 정보 패널·툴팁·이벤트 로그에는
지금처럼 `stationLabels`의 이름만 쓴다. `소각장 - trash 1@3` 같은 표기는 안 된다.

같은 종류가 여러 대라서 구분이 필요하면 좌표 대신 사람이 읽는 방식을 쓴다.
클릭한 그 설비를 화면에서 강조하는 것이 가장 낫고, 글로 써야 하면 번호를
붙인다(`테이블 2`). 맵 에디터의 검증 메시지도 좌표를 나열하는 대신 문제가 있는
칸을 맵 위에 표시한다.

## 남은 일

| 파일 | 내용 |
|---|---|
| `game/core.ts` | 상태 접근 54곳. `state.stove` → `stationState(state, key).items` 등. `submitFood`·`advanceFires`·`canUseStation`·`releaseWork`는 어느 대인지 받아야 한다 |
| `game/core.ts` | 화재 전파 인접 판정을 인스턴스 타일 간 거리로 (지금은 종류 간) |
| `app/Game.tsx` | 설비를 인스턴스 목록으로 렌더링, 클릭 존이 `StationKey`를 넘기게, 상태 텍스트도 인스턴스별로 |
| `tests/game.test.ts` | 48곳. 대부분 종류 이름 그대로 통과. 맵 검증 테스트는 인스턴스 키로 수정 |
| `tools/map-editor.*` | 같은 글자 여러 칸 허용, 작업 위치 고정을 인스턴스 단위로, "정확히 한 칸" 검증 → "최소 한 대" |
| `game/map-data.ts` | `taskTiles` 키를 인스턴스 키로 이전 |

## 이미 작성된 부분 (이번 세션 스크래치패드)

- `StationKey` / `StationInstance` / `stationKeyOf` / `stationInstancesIn`
- 인접 바닥 자동 선택 `floorNeighbours`
- `validateKitchenMap`: "정확히 한 칸" → "최소 한 대" + 인스턴스별 작업 위치 검증
- `stationInstances` / `stationByKey` / `stationsOf` / `firstStationOf`
- `stationHitboxes`를 인스턴스 기준으로
- `StationState` 타입, `newStation` / `newStations` / `stationState` / `patchStation`
- `initialState`의 설비 초기화
- `ActorIntent.INTERACT`에 `stationKey` 추가

## 주의

작업 위치 겹침 금지 규칙은 없앴다. 설비가 많아지면 서로 붙게 되고, 슬라임끼리
충돌 판정이 없어서 같은 칸에 서도 문제가 없다.
