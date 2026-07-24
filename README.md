# 터진다! 슬라임 공방

NAN 2026 해커톤용 Phaser 3 음성 명령 마법 공방 게임.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다. 실제 음성 명령은
`.env.example`을 `.env.local`로 복사해 `GEMINI_API_KEY`를 설정하면
사용할 수 있다. 키가 없어도 오른쪽 디버그 버튼으로 전체 흐름을 시연할
수 있다.

## 시연 순서

1. 작업할 솥을 선택한다.
2. `약초 가져오기` → `약초 넣기` → `젓기`를 누른다.
3. 솥별 5초 타이머가 끝나면 `양피지 가져오기` → `양피지 담그기`를
   누른다.
4. 다시 5초가 지나 `마도서 완성`이 되면 `마도서 꺼내기` → `납품하기`를
   누른다.
5. 말랑의 이동, FIFO 큐, 소지 아이콘, 두 솥의 독립 상태와 납품 수를
   확인한다.

플레이어는 `WASD` 또는 방향키로 움직인다. 잘못된 순서로 명령하면 게임
상태는 진행되지 않고 최근 상황에 이유가 표시된다.

## 검증

```bash
npm test
npm run lint
npm run build
npm run simulate -- --seed=7 GET_HERB ADD_HERB:cauldron-01 MIX:cauldron-01 WAIT:5000 GET_PARCHMENT DIP_PARCHMENT:cauldron-01 WAIT:5000 TAKE_BOOK:cauldron-01 SUBMIT
```

`simulate`는 Phaser 없이 같은 게임 코어를 실행하고 작업별 결과, 경과
시간, 소지품, 솥 상태와 납품 수를 JSON으로 출력한다.
