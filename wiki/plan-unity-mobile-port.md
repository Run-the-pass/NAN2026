---
type: plan
status: current
updated: 2026-08-25
sources:
  - wiki/project.md
  - game/core.ts
  - game/balance.json
  - game/recipes.json
  - game/stages.json
  - game/map-data.ts
  - app/Game.tsx
  - tests/game.test.ts
---

# Unity 모바일 포트 계획

## 전제

현재 게임은 규칙(`game/`)과 화면(`app/`)이 완전히 분리돼 있다. 옮길 것은
`game/core.ts` 하나이고 `app/`은 전부 뷰라 Unity에서 새로 만든다.

| 영역 | 파일 | 줄 | 처리 |
|---|---|---:|---|
| 게임 규칙 | `game/core.ts` | 2099 | C#으로 이식 |
| 밸런스·레시피·스테이지 | `game/*.json` | - | 그대로 복사 |
| 맵 | `game/map-data.ts` | 31 | `map.json`으로 변환 |
| 코어 테스트 | `tests/game.test.ts` | 1593 (67케이스) | Unity Test Framework로 이식 |
| Phaser 렌더링·DOM UI | `app/Game.tsx` | 2752 | 버리고 Unity로 재작성 |
| 튜토리얼·대사 | `app/tutorial.ts`, `dialogue-script.ts` | 442 | 이식 |
| 에셋 | `public/` | 149개 | PNG·MP3 그대로 사용, 슬라임 SVG만 재작업 |

## 확정된 전제

- **저장소를 분리한다.** Unity 프로젝트는
  `~/Desktop/2_충동적인 개발/11_SlimeRestaurant`의 별도 git 저장소다.
  이 저장소는 웹판 제출본으로 동결한다.
- **웹 버전은 공모전 제출본으로 동결한다.** Unity가 새 본선이며 두 코어를
  동기화하는 계층은 만들지 않는다. 데이터는 한 번만 Unity로 옮겼고 그 뒤로는
  Unity 쪽이 원본이다.
- 모바일 **가로 전용**. 세로 대응과 데스크톱 대응은 하지 않는다.
- 게임 규칙·스테이지·레시피는 그대로 옮긴다. 이번 작업에 신규 콘텐츠는 없다.

## 하지 않는 것

- 웹↔Unity 코어 동기화, 공용 데이터 링크
- Addressables, DOTween, UniTask, Zenject, 상태머신·MVVM 프레임워크 — 새 의존성 없음
- 로컬라이제이션(한국어 고정), 세로 모드, 서버 플레이 기록(D1)
- 신규 스테이지·레시피·업그레이드

## 단계

### Phase 0 — 프로젝트 셋업 (설정 복구 2026-08-25)

- `unity/SlimeRestaurant/`, Unity 6000.5.4f1, 2D 템플릿 기본값
- Player Settings: Android + iOS, Landscape Left/Right만 허용
- Graphics: Transparency Sort Mode = Custom Axis `(0,1,0)`
  → `app/Game.tsx`의 y좌표 깊이 정렬 코드가 통째로 필요 없어진다
- `.gitignore`에 Unity 표준 항목 추가
- `public/{food,stations,tiles,ui,text}` → `Assets/Art/`, `public/{sfx,music}` → `Assets/Audio/` 복사

**완료 조건**: 빈 씬이 안드로이드 실기기에서 가로로 실행된다.

**결과**: `Game.unity`를 첫 빌드 씬으로 추가하고 가로 회전 제한과 Custom Axis를
실제 프로젝트 설정에 반영했다. Mac Player 빌드는 통과했지만 Android·iOS 모듈과
실기기가 없어 이 완료 조건의 실기기 검증은 남아 있다.

### Phase 1 — 코어 이식 (완료 2026-08-24)

- `Assets/Scripts/Core/*.cs` — MonoBehaviour 없는 순수 C#. 씬 없이 테스트에서 돌아야 한다.
- `GameState`는 mutable class + `[Serializable]`. 되돌리기(`Z`)는 행동 직전
  상태를 JSON 스냅샷으로 복제한다 (불변 구조 이식보다 코드가 적다).
- JSON 3개 + `map.json`은 `Resources/`에 TextAsset으로 두고 Newtonsoft
  (`com.unity.nuget.newtonsoft-json`, Unity 기본 제공)로 읽는다.
- `checkBalance` / `checkStages` / `validateKitchenMap`은 신뢰 경계 검증이므로
  단순화하지 않고 그대로 옮긴다. 데이터가 규칙에 어긋나면 시작 시 예외.
- 결정론: `advanceSeed`를 그대로 이식한다. `UnityEngine.Random`을 쓰지 않는다.
- `tests/game.test.ts`의 67개 케이스를 EditMode 테스트로 이식한다.
  **이식이 맞았는지 증명하는 유일한 장치라 축약하지 않는다.**

**결과**: 코어 테스트 53개 통과. 웹판 `npm run simulate`와 28스텝 시나리오를
맞춰 최종 seed·슬라임별 행동 수·그릇 ID까지 일치하는 것을 확인했다.

- 테스트는 Unity Test Framework가 아니라 `dotnet`으로 돈다. 코어가 UnityEngine을
  참조하지 않아 에디터 없이 검증할 수 있고, Unity 배치모드 라이선스가 없어도 막히지 않는다.
- 67개 중 뷰 계층(슬라임 아트, 대사, 효과음, 에셋 목록, 쿠키 진행도, 화살표 좌표)과
  CLI 인자 파싱 테스트는 각 Phase로 미뤘다. 서버 플레이 기록(`parseSession`)은 범위 밖이다.
- 레시피의 `count`·`submissionStation`은 읽는 곳이 없어 뺐다.

### Phase 2 — 게임 화면 (구현 완료 2026-08-25)

- `Grid` + `Tilemap` 하나로 바닥·벽을 맵 rows에서 생성
- 설비·슬라임·소지품은 `SpriteRenderer`. 깊이는 Phase 0의 Custom Axis가 처리
- 입력: `Camera.ScreenToWorldPoint` → 타일 좌표 계산. **콜라이더를 쓰지 않는다.**
  탭 한 번으로 슬라임 선택 / 이동 / 설비 상호작용을 모두 처리하고, 판정은
  코어의 `moveOptions`·`interactActor`가 한다
- 슬라임: 몸통 스프라이트 + 눈·입 자식 스프라이트. 깜빡임은 스프라이트 교체,
  방향은 flip X, 숨쉬기·걷기·작업 모션은 Coroutine + `Mathf.Lerp`
- 이동 가능 칸 하이라이트는 반투명 스프라이트 풀 하나

**완료 조건**: 스테이지 1을 탭만으로 처음부터 끝까지 클리어할 수 있다.

**결과**: 빈 씬에서 `GameView` 하나가 맵·설비·슬라임·소지품·이동 하이라이트를
만들고 터치/마우스 좌표를 코어 타일 행동으로 연결한다. Mac Universal Player에서
스테이지 1·슬라임 4마리·설비 24대 초기화를 확인했고, 같은 이동·상호작용 규칙의
회귀 검사는 14턴에 목표 2건을 채우고 마감 때 `Won`이 됐다. 실제 모바일 터치
확인은 Phase 6에서 진행한다.

### Phase 3 — UI

- uGUI Canvas(Screen Space Overlay), Canvas Scaler `Scale With Screen Size`
- 기존 목재·종이 패널은 9-slice `Image`로 재현 (`panel-base2.png` 등이 이미 9분할 전제)
- 상단 주문 카드 2장 + 턴 시계, 하단 슬라임 로스터 + 턴 종료, 우측 정보 패널
  — 배치는 웹 모바일 가로 레이아웃을 그대로 따른다
- 터치 타겟 최소 44dp
- 홈 / 모드·스테이지 선택 / 설정 / 정산 화면

**완료 조건**: 실기기 가로에서 모든 화면을 스크롤 없이 읽고 조작할 수 있다.

### Phase 4 — 진행 저장·오디오

- 별 진행도: 쿠키 → `PlayerPrefs`
- `AudioSource` 2개(음악·효과음) + 볼륨 `PlayerPrefs`. 오디오 매니저 만들지 않음

**완료 조건**: 앱을 껐다 켜도 별과 음량이 유지된다.

### Phase 5 — 튜토리얼·대사

- `app/tutorial.ts`(단계 판정) + `dialogue-script.ts` 이식
- 화살표는 uGUI `Image` + 앵커. `tutorial-arrow-layout.ts`의 좌표 값을 옮긴다

**완료 조건**: 튜토리얼 스테이지 0을 안내대로 끝까지 진행할 수 있다.

### Phase 6 — 빌드·검증

- Android APK, iOS 시뮬레이터 빌드
- 실기기 터치·성능 확인

**완료 조건**: 두 플랫폼 빌드가 나오고 스테이지 0~3 + 무한 모드가 실기기에서 돈다.

## 리스크

1. **코어 이식 정확도** — 2099줄 상태 전이. 방어선은 67개 테스트뿐이라
   Phase 1을 먼저·완전히 끝내고 화면을 시작한다.
2. **슬라임 SVG** — `app/slime-art.ts`가 절차적으로 그린다. Unity에는 SVG가
   없으므로 몸통 PNG + 눈·입 스프라이트 조합으로 재구성해야 한다. 원본은
   `raw/*_slime.svg`에 있다.
3. **음원 라이선스** — `wiki/project.md`의 미해결 항목. 웹 제출과 달리 앱
   배포는 조건이 더 빡빡하므로 Phase 6 전에 정리해야 한다.
4. **모바일 빌드 모듈이 없다** — Unity Personal 라이선스와 Mac Standalone 모듈은
   정상 동작한다. Android·iOS 모듈과 실기기가 없어 Phase 0 실기기 완료 조건과
   Phase 6 모바일 빌드는 아직 검증할 수 없다.
5. **IL2CPP 리플렉션** — 되돌리기(Z)가 상태를 JSON으로 통째 복제한다.
   빌드 때 잘려 나가면 `link.xml`이 필요할 수 있다.
