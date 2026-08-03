---
type: project
status: current
updated: 2026-08-03
sources:
  - raw/project-brief.md
  - raw/home/home_reference.png
  - raw/home v2/home_reference.png
  - raw/home v2/
  - raw/references/upgrade-choice-cards.png
  - raw/slime-stats-pricing-and-penalties.md
  - raw/fun-test-design-changes.md
  - raw/voice-command-discussion-summary-revised.md
  - raw/slime-workshop-resource-production-design.md
  - raw/조작_방식_변경_명세_수정본.md
  - raw/다음_개발_작업_상호작용_코어.md
  - raw/테마_변경_명세_공방에서_식당으로.md
  - raw/water_slime.svg
  - raw/fire_slime.svg
  - raw/0_home.mp3
  - raw/1_main.mp3
  - raw/2_rush.mp3
  - raw/GAME OVER.mp3
  - raw/SoundEffect/
  - raw/logo.svg
  - raw/클로드_담당_작업_주문과_화재.md
  - raw/추가본.pptx
  - raw/추가본_정리/
  - raw/stage_transition_info_cards_spec.md
  - raw/image(132).png
  - raw/references/map-ui-orders.png
  - raw/references/map-ui-slime-panel.png
  - raw/references/map-ui-tool-panel.png
  - raw/references/map-ui-help-overlay.png
  - raw/references/map-ui-workflow-panel.png
---

# NAN 2026 Wiki

- [프로젝트](project.md) — 현재 식당 조리 흐름, 조작 경계, 구현 상태와 제외 범위.
- [3분 마도서 제작 펀테스트](fun-test.md) — 이전 마도서 프로토타입 기준과 보류 항목.
- [음성 사전·푸시투토크·공방 맵 보정 계획](plan-voice-push-to-talk-map.md) — 음성 오인식 보정, 스페이스바 입력 전환, 고정 맵 시각 보정의 범위와 완료 조건.
- [음성 인식 실험실 계획](plan-voice-lab.md) — 초기 STT·로컬 사전·Gemini 비교 계획. Gemini 텍스트 재분석 범위가 대체됨.
- [음성 실험실 매칭 근거·정리 계획](plan-voice-lab-diagnostics.md) — 사전 매칭 표현 표시, Gemini 텍스트 폴백 제거, 결과 개별 삭제 계획.
- [현재 소지품 목적지 변경 명령 계획](plan-carried-discard-command.md) — `그거/들고 있는 거/가지고 있는 거`로 현재 운반 물품을 양조기·테이블·제출대·쓰레기통으로 전환.
- [마우스·키보드 조작 전환 계획](plan-pointer-controls.md) — 음성을 제거하고 클릭·속성 키로 선택·이동·상호작용하는 구현 범위와 완료 조건.
- [상호작용 코어 완성 계획](plan-interaction-core.md) — 복수 상호작용과 불 속성 조리, 버섯 구이 제작·제출 흐름의 범위와 완료 조건.
- [식당 테마 전환 계획](plan-restaurant-theme.md) — 속성 슬라임·주방 설비·음악·물 슬라임 아트로 교체하는 범위와 완료 조건.
- [홈·물 슬라임·이동·음악 설정 보정 계획](plan-controls-audio-home-polish.md) — 홈 복원, 음악 설정, 물 슬라임 보정과 직선 이동의 범위와 완료 조건.
- [충돌·깊이·설정 일시정지 보정 계획](plan-collision-depth-pause-settings.md) — 설비 히트박스 우회, y좌표 깊이 정렬, 중앙 설정과 재개 카운트다운의 범위와 완료 조건.
- [주문 시스템·화재 시스템 계획](plan-orders-and-fire.md) — 주문 목록·제출 판정·라운드 판정과 방치 발화·전파·물 슬라임 진화의 범위, 미정 사항의 설정값 분리.
- [효과음·불 슬라임·미사용 client 에셋 정리 계획](plan-sfx-fire-slime-cleanup.md) — 구현 이벤트 효과음, 불 슬라임 몸통 크기·애니메이션, 미사용 public 에셋 삭제 범위.
- [그릇·테이블·편의 선택·인게임 불 슬라임 계획](plan-dishes-table-selection-fire-game.md) — 그릇 순환, 한 칸 테이블, Shift·드래그 선택, 실제 게임 불 슬라임와 배포 완료 조건.
- [전체 화면 레이아웃 보정 계획](plan-full-viewport-layout.md) — 홈·게임의 뷰포트 채움, 긴 화면 배경, 설정 안 홈 이동과 낮은 가로 화면 HUD 완료 조건.
- [스테이지 루프 계획](plan-stage-loop.md) — 추가본의 여러 스테이지·정산·게임 오버 흐름 중 실제 라운드 루프 구현 범위.
- [불 슬라임·설비 타일·병합 검수 계획](plan-fire-slime-station-hitbox-merge-review.md) — 불 방향·깜빡임, 정사각형 설비 판정과 Claude 병합 회귀 검수 범위.
- [스테이지 전환 정보 화면 계획](plan-stage-transition-info.md) — 선택·정산과 인게임 사이의 맵 미리보기, 음식 정보, TIP과 다음 전환 완료 조건.
- [인게임 맵 UI·로컬 맵 에디터 계획](plan-map-ui-local-editor.md) — 주문 카드·우측 정보 패널·선택키 재배치와 배포에서 분리된 16×10 맵 편집 완료 조건.
- [작업 로그](log.md) — ingest, 계획, 구현, 검증의 시간순 기록.

원문: [추가본 정리](../raw/%EC%B6%94%EA%B0%80%EB%B3%B8_%EC%A0%95%EB%A6%AC/) (덱 `raw/추가본.pptx`의 화면별 기획과 2026-08-02 확정·미정), [클로드 담당 작업: 주문과 화재](../raw/%ED%81%B4%EB%A1%9C%EB%93%9C_%EB%8B%B4%EB%8B%B9_%EC%9E%91%EC%97%85_%EC%A3%BC%EB%AC%B8%EA%B3%BC_%ED%99%94%EC%9E%AC.md), [프로젝트 브리프](../raw/project-brief.md), [홈 화면 v2 참고 이미지](../raw/home%20v2/home_reference.png), [홈 화면 v2 에셋](../raw/home%20v2/), [성장 선택 카드 참고 이미지](../raw/references/upgrade-choice-cards.png), [슬라임 스탯·가격·패널티](../raw/slime-stats-pricing-and-penalties.md), [펀테스트 변경 사항](../raw/fun-test-design-changes.md), [음성인식 시스템 논의](../raw/voice-command-discussion-summary-revised.md), [자원·제작 시스템 기획](../raw/slime-workshop-resource-production-design.md)
원문: [그릇·테이블·편의 선택 추가 명세](../raw/%E1%84%80%E1%85%B3%E1%84%85%E1%85%B3%E1%86%BA_%E1%84%90%E1%85%A6%E1%84%8B%E1%85%B5%E1%84%87%E1%85%B3%E1%86%AF_%E1%84%91%E1%85%A7%E1%86%AB%E1%84%8B%E1%85%B4%E1%84%89%E1%85%A5%E1%86%AB%E1%84%90%E1%85%A2%E1%86%A8_%E1%84%8E%E1%85%AE%E1%84%80%E1%85%A1_%E1%84%86%E1%85%A7%E1%86%BC%E1%84%89%E1%85%A6.md), [클로드 담당 작업: 주문과 화재](../raw/%ED%81%B4%EB%A1%9C%EB%93%9C_%EB%8B%B4%EB%8B%B9_%EC%9E%91%EC%97%85_%EC%A3%BC%EB%AC%B8%EA%B3%BC_%ED%99%94%EC%9E%AC.md), [프로젝트 브리프](../raw/project-brief.md), [홈 화면 v2 참고 이미지](../raw/home%20v2/home_reference.png), [홈 화면 v2 에셋](../raw/home%20v2/), [성장 선택 카드 참고 이미지](../raw/references/upgrade-choice-cards.png), [슬라임 스탯·가격·패널티](../raw/slime-stats-pricing-and-penalties.md), [펀테스트 변경 사항](../raw/fun-test-design-changes.md), [음성인식 시스템 논의](../raw/voice-command-discussion-summary-revised.md), [자원·제작 시스템 기획](../raw/slime-workshop-resource-production-design.md)
