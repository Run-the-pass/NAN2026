// `npm run map:edit`가 이 파일을 검증한 뒤 직접 갱신한다.
export default {
  "rows": [
    "################",
    "#...I..T...D...#",
    "#..............#",
    "#C............W#",
    "#..............#",
    "#....T....#....#",
    "#..............#",
    "#....#....#....#",
    "#..............#",
    "#######S#X######"
  ],
  "taskTiles": {
    "ingredient-box@4,1": {
      "col": 4,
      "row": 2
    },
    "stove@1,3": {
      "col": 2,
      "row": 3
    },
    "submission@7,9": {
      "col": 7,
      "row": 8
    },
    "trash@9,9": {
      "col": 9,
      "row": 8
    },
    "dish-rack@11,1": {
      "col": 11,
      "row": 2
    },
    "washer@14,3": {
      "col": 13,
      "row": 3
    },
    "table@7,1": {
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
