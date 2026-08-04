// `npm run map:edit`가 이 파일을 검증한 뒤 직접 갱신한다.
export default {
  "rows": [
    "##############",
    "##TTDTTDTT####",
    "#T........T###",
    "#C........C###",
    "#I..T..T..I###",
    "#X..W..W..X###",
    "##TT#SS#TT####",
    "##############"
  ],
  "taskTiles": {},
  "spawnTiles": [
    {
      "col": 2,
      "row": 3
    },
    {
      "col": 3,
      "row": 3
    },
    {
      "col": 4,
      "row": 3
    },
    {
      "col": 5,
      "row": 3
    }
  ]
} as const;
