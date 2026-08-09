---
type: decision
status: current
updated: 2026-08-10
sources:
  - wiki/project.md
  - .github/workflows/pages.yml
---

# 현 단계 코드 정리 감사 보고서

아래 순서는 삭제 효과가 크고 위험이 낮은 순서다. 2026-08-10에 저위험 1~3번을 정리했고,
정책 결정이 필요한 4~6번은 남겨 두었다.

1. **완료** — `delete:` 이미 컴포넌트가 없는 스테이지 정보 화면·음성 실험실·옛 선택/HUD CSS를 삭제했다. 현재 쓰는 공용 버튼·행동력·용량 규칙은 보존했다. [`app/globals.css`](../app/globals.css)
2. **완료** — `delete:` 샘플 D1 메모 API와 쓰이지 않는 Firebase 설정을 삭제했다. 현재 GitHub Pages·Sites 설정은 유지했다.
3. **완료** — `delete:` 화면에서 더 이상 읽지 않는 `GameState.history`와 주문 실수 횟수 `misses`를 삭제했다. `lastEvent`와 현재 주문 진행도는 그대로다. [`game/core.ts`](../game/core.ts)
4. `native:` Tailwind를 유틸리티 없이 초기화 CSS 용도로만 쓰고 있으므로 명시적 최소 reset으로 바꾸고 `tailwindcss`·`@tailwindcss/postcss`를 제거한다. 위험 중간. [`app/globals.css`](../app/globals.css)·[`postcss.config.mjs`](../postcss.config.mjs)
5. `delete:` GitHub Pages에서는 빌드 때 제외되고 실행되지 않는 플레이 세션 API·D1 스키마·마이그레이션·클라이언트 지표 수집 약 1,100줄을 삭제한다. 대체는 쿠키 별 진행도이며, Sites 분석을 계속 쓸지 먼저 결정해야 한다. 위험 중간. [`app/api/sessions/`](../app/api/sessions/)·[`game/session.ts`](../game/session.ts)·[`db/`](../db/)·[`drizzle/`](../drizzle/)
6. `native:` 배포 대상을 GitHub Pages 하나로 확정하면 `vinext`·Vite·Cloudflare Worker·Codex Sites 포장 계층을 표준 `next dev/build`로 대체하고 직접 의존성 8개와 설정 약 180줄을 제거한다. Sites 배포를 유지한다면 건드리지 않는다. 위험 높음. [`vite.config.ts`](../vite.config.ts)·[`worker/`](../worker/)·[`build/sites-vite-plugin.ts`](../build/sites-vite-plugin.ts)·[`deploy.sh`](../deploy.sh)

## 유지할 부분

- `game/core.ts`의 렌더링 독립 규칙과 `tests/game.test.ts`의 결정론 검증
- 실제 데이터 편집에 쓰는 맵·밸런스 편집기
- 튜토리얼 조건·대본·화살표 좌표 파일의 현재 분리
- 첫 화면 선로딩을 검증하는 에셋 매니페스트

남은 최대 정리 여지는 약 -1,250 lines, -12 deps다. 4~6은 각각 CSS 회귀·분석 수집·배포 대상 결정을 먼저 확인한다.
