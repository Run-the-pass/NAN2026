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
      "col": 3,
      "row": 5
    },
    "fire": {
      "col": 8,
      "row": 2
    },
    "lightning": {
      "col": 10,
      "row": 2
    },
    "earth": {
      "col": 5,
      "row": 2
    }
  }
} as const;
