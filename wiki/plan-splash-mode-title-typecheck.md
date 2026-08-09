---
type: plan
status: current
updated: 2026-08-09
sources:
  - raw/team logo 2.png
  - raw/A_heavy_rubber_stamp.mp3
  - raw/mode-select-title.png
---

# 스플래시·모드 선택 타이틀·앱 타입체크 계획

## 범위

- Claude가 남긴 팀 로고 도장 스플래시, 효과음, 전용 설정 버튼과 패널 그림을 현재 `main`에 완성한다.
- 모드 선택의 글자 제목을 제공된 `mode-select-title.png`로 교체한다.
- 기존 튜토리얼의 `SELECT_EARTH` 한 타일 위 화살표 배치를 보존한다.
- 전체 `app/*.tsx`를 검사하는 `typecheck` 스크립트를 Pages CI에 추가한다.
- `raw/` 원문은 삭제하거나 변환하지 않고 그대로 보존한다.

## 완료 조건

- 첫 진입 때 팀 로고 도장 연출이 표시되고 도장 효과음은 실패해도 화면을 막지 않는다.
- 모드 선택 화면에 새 그림 제목이 표시되며 스크린 리더용 제목은 남는다.
- `npm test`, `npm run typecheck`, lint, 일반 빌드와 Pages 빌드가 통과한다.
- 실제 브라우저에서 스플래시, 모드 선택 제목과 `SELECT_EARTH` 위치를 확인한다.
- 변경을 커밋해 `main`에 푸시한다.

## 구현·검증 결과

- 팀 로고 도장 스플래시와 `09_stamp.mp3` 사전 로드를 적용했다. 브라우저 자동재생 정책이 막으면 소리만 건너뛴다.
- 모드 선택 제목을 840×266 파생 이미지로 교체하고 접근 가능한 텍스트 제목을 유지했다.
- `SELECT_EARTH`와 도입 대사의 푸름이 화살표가 같은 한 타일 위 설정을 공유한다.
- Workers 타입과 `npm run typecheck`를 추가하고 Pages CI가 앱 타입검사를 먼저 수행한다.
- Pages 경로 보정에 팀 로고와 템플릿 문자열 효과음 경로를 포함했다.
- 브라우저 화면·오류 로그, 테스트 56/56, typecheck, lint, 일반 빌드와 Pages 빌드: `PASS`.
