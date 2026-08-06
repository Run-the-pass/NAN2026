// `npm run map:edit`가 이 파일을 검증한 뒤 직접 갱신한다.
export default {
  "rows": [
    "##############",
    "###CC#TT#TTT##",
    "##P..T..T...R#",
    "##T..T..T...T#",
    "##A.........F#",
    "##M.........T#",
    "###TXDSSWWTT##",
    "##############"
  ],
  "spawnTiles": {
    "water": {
      "col": 3,
      "row": 4
    },
    "fire": {
      "col": 6,
      "row": 4
    },
    "lightning": {
      "col": 9,
      "row": 4
    },
    "earth": {
      "col": 11,
      "row": 4
    }
  }
} as const;
