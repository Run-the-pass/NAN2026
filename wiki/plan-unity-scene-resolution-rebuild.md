---
type: plan
status: current
updated: 2026-08-25
sources:
  - wiki/plan-unity-mobile-port.md
  - raw/home v2/home_reference.png
  - public/home/
---

# Unity 씬·해상도 재구성 계획

## 문제

기존 `Game.unity`는 빈 루트 하나뿐이고, `GameUI.Awake()`와
`GameView.Awake()`가 고정 UI·카메라·맵·설비·슬라임을 모두 Play 시점에
생성했다. 이 구조에서는 Scene View로 화면을 확인하거나 RectTransform을
수정할 수 없고, 작은 원본을 크게 확대하면서 임포터 압축까지 적용해 화질도
떨어졌다.

## 구현 범위

- `FrontEnd.unity`: Camera, Canvas, EventSystem, 홈·모드·스테이지·메뉴 설정·크레딧을 직렬화한다.
- `Game.unity`: Camera, 고해상도 맵, Highlight Tilemap, HUD·결과·인게임 설정·치명적 오류 패널을 직렬화한다.
- 게임 데이터에 따라 생기는 설비와 슬라임만 `StationView`, `SlimeView` 프리팹으로 생성한다.
- 이동 표시는 112개 GameObject 대신 Highlight Tilemap 셀만 갱신한다.
- 홈의 314×225 배경은 확대하지 않고, 씬에 직렬화한 색면·벽선·바닥선으로 재구성한다.
- SVG 파생 런타임 PNG는 약 2배 해상도로 다시 출력하고, 실제 사용 Sprite는 mipmap 없이 무손실로 임포트한다.
- `GameView.Boot`, `DontDestroyOnLoad`, 런타임 UI 빌더와 임시 Sprite 생성 코드를 제거한다.
- 버튼 패딩은 기존 SVG의 움직임 여백을 보존하고, 외부 간격과 테두리는 RectTransform과 공통 패널 에셋으로 통일한다.

## 구현하지 않는 것

- 메뉴와 모달을 각각 별도 씬으로 나누지 않는다.
- Boot 씬, DI, Addressables, 외부 의존성이나 셰이더 패키지를 추가하지 않는다.
- 해상도 문제를 셰이더로 가리지 않는다. 홈 애니메이션은 기존 Transform 애니메이션을 유지한다.
- 원본 SVG와 `raw/`는 수정·이동·삭제하지 않는다.

## 검증 가능한 완료 조건

- Edit Mode에서 `FrontEnd.unity`와 `Game.unity`를 열면 Camera·Canvas·UI·맵 계층을 확인할 수 있다.
- 홈 Play 직후에는 GameView, 설비, 슬라임, 이동 표시가 존재하지 않는다.
- 스테이지 선택 뒤 Game 씬에서만 StationView와 SlimeView가 생성되며, 이동 표시는 Tilemap으로 표시된다.
- 홈→모드→스테이지→게임→설정→재도전→홈 왕복이 두 씬에 걸쳐 동작한다.
- 전체 맵은 2520×1440, PPU 180, max texture 4096, mipmap off, 무손실 상태다.
- 코어 54개 검사, Unity 컴파일, 씬 무결성 검사, Mac Player 빌드가 통과하고 Console에 경고·오류가 없다.
