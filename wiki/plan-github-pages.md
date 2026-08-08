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
