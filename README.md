# 터진다! 슬라임 식당

NAN 2026 해커톤용 Phaser 3 판타지 식당 운영 게임.

## 실행

```bash
./play-local.sh
```

개발 서버가 준비되면 브라우저에서 `http://localhost:3000/game`을 자동으로 연다.

## 조작

- 슬라임 좌클릭: 한 마리 선택
- 빈 바닥 좌클릭: 선택 해제
- 바닥 우클릭: 선택된 슬라임 이동
- 설비 우클릭: 이동 후 집기·놓기·조리
- `Q/W/E/R`: 물/불/번개/땅 속성 슬라임 선택
- `Space`: 모든 슬라임 선택

## 검증

```bash
npm test
npm run lint
npm run build
```

`npm run simulate -- --seed=7 --slimes=lightning,fire lightning:ingredient-box lightning:stove fire:stove`로 Phaser 없이도 식당 코어를 실행할 수 있다.
