---
type: plan
status: current
updated: 2026-08-09
sources:
  - wiki/project.md
---

# GitHub Pages 배포 계획

## 범위

- `main` 브랜치를 GitHub Pages용 정적 빌드로 배포한다.
- 저장소 경로 `/NAN2026` 아래에서 홈과 게임 에셋이 로드되게 한다.
- GitHub Pages에 서버가 없으므로 D1 플레이 기록 API만 Pages 빌드에서 제외한다.

## 제외 범위

- 기존 Sites 배포와 D1 설정은 변경하지 않는다.
- 게임 내용과 UI를 추가로 변경하지 않는다.

## 완료 조건

- GitHub Pages 워크플로우가 `main` 푸시에서 성공한다.
- 공개 Pages 링크의 홈 화면이 열린다.
- 시작 버튼으로 게임 화면에 진입하고 `<img>` 에셋과 CSS 배경·테두리 에셋,
  음원이 실제 배포 화면에서 정상 표시된다.
- `npm test`, `npm run lint`, Pages 정적 빌드가 통과한다.

## 뒤로가기 경로 보정

- 게임의 모드 선택 `뒤로`는 Pages의 `basePath`를 직접 조합하지 않고 Next
  라우터에 앱 루트 `/`만 넘긴다.
- `https://run-the-pass.github.io/NAN2026/game/`에서 누르면
  `/NAN2026/`로 이동하며 `/NAN2026/NAN2026`처럼 접두사가 중복되지 않는다.
- `PASS`: Pages 정적 결과를 `/NAN2026/game/`에 마운트한 브라우저에서 뒤로
  버튼을 누른 뒤 주소가 정확히 `/NAN2026/`가 되고 홈 화면이 표시됨을 확인했다.
