# SLIME SHIFT

NAN 2026 해커톤용 Phaser 3 음성 명령 식당 게임.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다. 실제 음성 명령은
`.env.example`을 `.env.local`로 복사해 `GEMINI_API_KEY`를 설정하면 사용할
수 있다. 키가 없어도 우측 디버그 명령 버튼으로 2라운드 전체 흐름을
시연할 수 있다.

## 시연 순서

1. 시작 주문 1건을 확인한다. 이후 플레이 중 10초마다 주문이 추가된다.
2. `말랑 · GET` — 말랑이가 이동 속도에 맞춰 버섯 상자로 가고, 첫 버섯을 먹는 사고가 발생한다.
3. `말랑 · GET` → `CHOP` → `COOK`을 연달아 눌러 FIFO 작업 큐와 `MOVING → WORKING → IDLE` 변화를 확인한다.
4. `빨강 · SERVE`로 판매한 뒤 `라운드 마감 · 시연용`을 누른다.
5. 화면 중앙의 성장 카드 3장 중 하나를 선택한다.
   - `말랑 숙련 강화` 또는 `전체 슬라임 강화`: 2라운드도 `GET → CHOP` 단일 명령을 사용한다.
   - `재료 준비 해금`: `PREPARE` 한 번으로 `GET → CHOP`을 큐에 넣는다.
6. `COOK` → `SERVE` 후 라운드를 마감해 2라운드를 종료한다.

플레이어는 `WASD` 또는 방향키로 움직인다. 주방과 이동 경로는
16×10 타일로 구성되며 플레이어와 슬라임 모두 벽과 작업대를 통과하지
않는다.

## 검증

```bash
npm run build
npm run lint
npm test
npm run simulate -- --seed=7 --no-hungry slime-01:GET slime-01:CHOP slime-01:COOK slime-02:SERVE
```

`simulate`는 Phaser 없이 같은 게임 코어를 실행하고 작업별 결과, 경과
시간, 점수, 슬라임의 최종 위치·큐·상태를 JSON으로 출력한다.

`firebase.json`은 현재 정적 클라이언트 결과물의 최소 Hosting 설정만
담는다. `/api/command`까지 Firebase에서 운영할 때 서버 런타임을 추가한다.
