---
type: plan
status: current
updated: 2026-08-10
sources:
  - wiki/code-cleanup-audit-2026-08-10.md
---

# 현 단계 코드 정리 실행 계획

## 범위

- 컴포넌트 참조가 없는 스테이지 정보 화면·음성 실험실·옛 선택/HUD CSS를 삭제한다.
- 샘플 D1 메모 API와 쓰이지 않는 Firebase Hosting 설정을 삭제한다.
- 화면과 규칙에서 읽지 않는 `GameState.history`와 주문 실수 누계 `misses`를 삭제하고,
  해당 필드만 검증하던 중복 테스트를 정리한다.

## 제외 범위

- Tailwind reset 교체, 플레이 세션 API·D1, Vinext·Cloudflare·Sites 배포 계층은
  현재 배포·분석 정책이 확정되지 않았으므로 유지한다.
- `raw/` 원본과 현재 게임 기능·화면은 바꾸지 않는다.

## 완료 조건

- 삭제 대상 이름이 실행 코드와 CSS에 남지 않는다.
- 코어 테스트·타입 검사·린트·GitHub Pages 빌드가 통과한다.
- 홈·스테이지 선택·인게임·정산 화면에 시각 회귀가 없다.

## 검증 결과

- `npm test`: 58/58 PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- 깨끗한 Next 캐시의 `npm run build:pages`: PASS
- Pages 산출물의 홈·모드 선택·스테이지 선택·인게임을 실제 브라우저에서 확인: PASS
- 브라우저 콘솔 오류 없음
