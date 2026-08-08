// `npm run map:edit`가 이 파일을 검증한 뒤 직접 갱신한다.
export default {
  "rows": [
    "##############",
    "###CC#TT#FF###",
    "##T..T..T..M##",
    "##U..T..T..B##",
    "##A........Y##",
    "##P........R##",
    "###OXNSSDWW###",
    "##############"
  ],
  "spawnTiles": {
    "water": {
      "col": 10,
      "row": 5
    },
    "fire": {
      "col": 3,
      "row": 5
    },
    "lightning": {
      "col": 10,
      "row": 2
    },
    "earth": {
      "col": 3,
      "row": 2
    }
  }
} as const;
