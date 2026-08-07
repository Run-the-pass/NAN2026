// `npm run map:edit`가 이 파일을 검증한 뒤 직접 갱신한다.
export default {
  "rows": [
    "##############",
    "#PRABYUCOFMTT#",
    "#............#",
    "#............#",
    "#T..........T#",
    "#............#",
    "#DNSSWWXTTTTT#",
    "##############"
  ],
  "spawnTiles": {
    "water": {
      "col": 2,
      "row": 3
    },
    "fire": {
      "col": 5,
      "row": 3
    },
    "lightning": {
      "col": 8,
      "row": 3
    },
    "earth": {
      "col": 11,
      "row": 3
    }
  }
} as const;
