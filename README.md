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

1. 선택 화면에서 첫 직원 슬라임 1마리를 고른다 (너드·날쌘·쫑긋·일꾼,
   종류마다 작업·이동·청력·집중력 스탯이 다르다).
2. `WASD`로 붉은 플레이어를 슬라임의 청력 원 안으로 이동한다.
   원 밖에서 내린 명령은 `NOT_HEARD`로 버려진다.
3. 슬라임 이름을 불러 지시한다: `약초 가져오기` → `약초 넣기` →
   `젓기`. 솥을 지정하지 않으면 가까운 솥을 스스로 고른다.
4. 솥별 5초 조합이 끝나면 `양피지 가져오기` → `양피지 담그기`,
   5초 각인 후 `마도서 꺼내기` → `납품하기` (+100G).
5. 슬라임에 커서를 올리면 스탯 게이지와 받은 버프가 보인다.
   집중력 한도를 넘는 명령은 `TOO_COMPLEX`/`QUEUE_FULL`로 거절된다.

3분 안에 마도서 8권을 납품하면 성공한다.

## 검증

```bash
npm test
npm run lint
npm run build
npm run simulate -- --seed=7 --slimes=keen GET_HERB ADD_HERB MIX WAIT:5000 GET_PARCHMENT DIP_PARCHMENT WAIT:5000 TAKE_BOOK SUBMIT
```

`simulate`는 Phaser 없이 같은 게임 코어를 실행하고 작업별 결과, 경과
시간, 소지품, 솥 상태와 납품 수·골드를 JSON으로 출력한다.
`--slimes=nerd,swift`처럼 스쿼드를 고르고 `swift.GET_HERB`처럼 액터를
지정한다. 기본은 플레이어가 지시 대상을 따라다니는 모드이며
`--player=col,row` 또는 `PLAYER:col,row` 토큰으로 위치를 고정해 청력을
시험할 수 있다.
