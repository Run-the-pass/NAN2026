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

1. `말랑 · GET` — 배고픈 말랑이가 버섯을 먹는 사고 발생
2. `말랑 · GET` → `CHOP` → `COOK`
3. `빨강 · SERVE` — 판매 후 강화 선택
4. `강화 선택 · 추상 명령 해금`
5. `말랑 · PREPARE` — `GET → CHOP` 자동 분해
6. `COOK` → `SERVE` — 2라운드 완료

플레이어는 `WASD` 또는 방향키로 움직인다.

## 검증

```bash
npm run build
npm run lint
npm test
```

`firebase.json`은 현재 정적 클라이언트 결과물의 최소 Hosting 설정만
담는다. `/api/command`까지 Firebase에서 운영할 때 서버 런타임을 추가한다.
