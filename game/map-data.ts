// `npm run map:edit`가 이 파일을 검증한 뒤 직접 갱신한다.
export default {
  "rows": [
    "################",
    "#...I..T...D...#",
    "#..............#",
    "#C............W#",
    "#..............#",
    "#....#....#....#",
    "#..............#",
    "#....#....#....#",
    "#..............#",
    "#######S#X######"
  ],
  "taskTiles": {
    "ingredient-box": {
      "col": 4,
      "row": 2
    },
    "stove": {
      "col": 2,
      "row": 3
    },
    "submission": {
      "col": 7,
      "row": 8
    },
    "trash": {
      "col": 9,
      "row": 8
    },
    "dish-rack": {
      "col": 11,
      "row": 2
    },
    "washer": {
      "col": 13,
      "row": 3
    },
    "table": {
      "col": 7,
      "row": 2
    }
  },
  "spawnTiles": [
    {
      "col": 2,
      "row": 2
    },
    {
      "col": 13,
      "row": 2
    },
    {
      "col": 3,
      "row": 7
    },
    {
      "col": 12,
      "row": 7
    }
  ]
} as const;
