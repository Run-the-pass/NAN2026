import { createServer } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 4173;
const MAP_WIDTH = 14;
const MAP_HEIGHT = 8;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "tools/map-editor.html");
const mapPath = resolve(root, "game/map-data.ts");
const tempMapPath = resolve(root, "game/map-data.ts.tmp");
const stationCodes = {
  "potato-box": "P",
  "carrot-box": "R",
  "cabbage-box": "A",
  "banana-box": "B",
  "strawberry-box": "Y",
  "mushroom-box": "U",
  stove: "C",
  oven: "O",
  fryer: "F",
  blender: "M",
  submission: "S",
  trash: "X",
  "dish-rack": "D",
  "dish-return": "N",
  washer: "W",
  table: "T",
};
const stationLabels = {
  "potato-box": "감자 상자",
  "carrot-box": "당근 상자",
  "cabbage-box": "양배추 상자",
  "banana-box": "바나나 상자",
  "strawberry-box": "딸기 상자",
  "mushroom-box": "버섯 상자",
  stove: "도마",
  oven: "화로",
  fryer: "튀김기",
  blender: "믹서기",
  submission: "음식 제출대",
  trash: "소각기",
  "dish-rack": "그릇 상자",
  "dish-return": "그릇 반납대",
  washer: "세척대",
  table: "테이블",
};
// 여러 칸을 차지하는 기구. 여기 없는 기구는 한 칸이다.
const stationTileCount = { washer: 2, submission: 2 };
const tilesFor = (type) => stationTileCount[type] ?? 1;
const elements = ["water", "fire", "lightning", "earth"];
const elementLabels = { water: "물", fire: "불", lightning: "번개", earth: "땅" };

function parseMapSource(source) {
  const start = source.indexOf("{");
  const end = source.lastIndexOf("} as const;");
  if (start < 0 || end < start) throw new Error("맵 데이터 파일 형식을 읽을 수 없습니다.");
  return JSON.parse(source.slice(start, end + 1));
}

const position = (value) =>
  value &&
  Number.isInteger(value.col) &&
  Number.isInteger(value.row) &&
  value.col >= 0 &&
  value.col < MAP_WIDTH &&
  value.row >= 0 &&
  value.row < MAP_HEIGHT;

const neighbours = ({ col, row }) => [
  { col, row: row - 1 },
  { col: col - 1, row },
  { col: col + 1, row },
  { col, row: row + 1 },
];

// 맞닿은 같은 글자를 한 대로 묶는다. 한 칸짜리는 붙어 있어도 각각 다른 대다.
function stationInstances(data) {
  const seen = new Set();
  const instances = [];
  const key = ({ col, row }) => `${col},${row}`;
  const codeToType = new Map(Object.entries(stationCodes).map(([type, code]) => [code, type]));
  for (let row = 0; row < data.rows.length; row += 1) {
    for (let col = 0; col < data.rows[row].length; col += 1) {
      const code = data.rows[row][col];
      const type = codeToType.get(code);
      if (!type || seen.has(key({ col, row }))) continue;
      if (tilesFor(type) === 1) {
        seen.add(key({ col, row }));
        instances.push({ type, tiles: [{ col, row }] });
        continue;
      }
      const tiles = [];
      const queue = [{ col, row }];
      seen.add(key({ col, row }));
      while (queue.length) {
        const tile = queue.shift();
        tiles.push(tile);
        for (const next of neighbours(tile)) {
          if (seen.has(key(next)) || data.rows[next.row]?.[next.col] !== code) continue;
          seen.add(key(next));
          queue.push(next);
        }
      }
      tiles.sort((one, two) => one.row - two.row || one.col - two.col);
      instances.push({ type, tiles });
    }
  }
  return instances;
}

function validateMap(data) {
  const errors = [];
  if (!data || !Array.isArray(data.rows) || data.rows.length !== MAP_HEIGHT || data.rows.some((row) => typeof row !== "string" || row.length !== MAP_WIDTH)) {
    return [`맵은 ${MAP_WIDTH}×${MAP_HEIGHT}여야 합니다.`];
  }
  const allowed = new Set(["#", ".", ...Object.values(stationCodes)]);
  if (data.rows.some((row) => [...row].some((tile) => !allowed.has(tile)))) errors.push("알 수 없는 타일이 있습니다.");
  if ([...data.rows[0], ...data.rows[MAP_HEIGHT - 1]].includes(".") || data.rows.slice(1, -1).some((row) => row[0] === "." || row.at(-1) === ".")) {
    errors.push("맵 바깥 테두리는 조리대나 설비로 막아야 합니다.");
  }
  const instances = stationInstances(data);
  for (const type of Object.keys(stationCodes)) {
    if (!instances.some((station) => station.type === type)) errors.push(`${stationLabels[type]}: 한 대 이상 있어야 합니다.`);
  }
  for (const station of instances) {
    const need = tilesFor(station.type);
    if (station.tiles.length !== need) {
      errors.push(`${stationLabels[station.type]}: ${need}칸이어야 하는데 ${station.tiles.length}칸입니다.`);
      continue;
    }
    const sameRow = station.tiles.every((tile) => tile.row === station.tiles[0].row);
    const sameCol = station.tiles.every((tile) => tile.col === station.tiles[0].col);
    if (need > 1 && !sameRow && !sameCol) errors.push(`${stationLabels[station.type]}: 가로나 세로로 이어 놓아야 합니다.`);
    const reachable = station.tiles.some((tile) => neighbours(tile).some((side) => data.rows[side.row]?.[side.col] === "."));
    if (!reachable) errors.push(`${stationLabels[station.type]}: 붙어 설 수 있는 바닥이 없습니다.`);
  }
  if (!data.spawnTiles || typeof data.spawnTiles !== "object") {
    errors.push("슬라임 위치 정보가 없습니다.");
    return errors;
  }
  const used = new Set();
  for (const element of elements) {
    const tile = data.spawnTiles[element];
    if (!position(tile) || data.rows[tile.row]?.[tile.col] !== ".") {
      errors.push(`${elementLabels[element]} 슬라임 위치는 빈 바닥이어야 합니다.`);
      continue;
    }
    const key = `${tile.col},${tile.row}`;
    if (used.has(key)) errors.push(`${elementLabels[element]} 슬라임 위치가 다른 슬라임과 겹칩니다.`);
    used.add(key);
  }
  return errors;
}

const serializeMap = (data) => `// \`npm run map:edit\`가 이 파일을 검증한 뒤 직접 갱신한다.\nexport default ${JSON.stringify(data, null, 2)} as const;\n`;
const json = (response, status, body) => {
  // 응답을 이미 보내기 시작한 뒤(예: HTML 스트리밍 중 실패) 오류를 다시 쓰면
  // 서버 자체가 죽는다. 그 경우는 연결만 닫는다.
  if (response.headersSent) return response.end();
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
};
const secureHeaders = (response) => {
  response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
};

async function currentMap() {
  return parseMapSource(await readFile(mapPath, "utf8"));
}

if (process.argv.includes("--check")) {
  const errors = validateMap(await currentMap());
  if (errors.length) throw new Error(errors.join(" "));
  console.log("맵 데이터 검증 PASS");
} else {
  const origin = `http://${HOST}:${PORT}`;
  // 브라우저가 localhost로 열어도 같은 로컬 서버다. 둘 다 허용하지 않으면
  // 주소창에 localhost를 친 것만으로 403이 떨어진다.
  const localHosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
  const localOrigins = new Set([origin, `http://localhost:${PORT}`]);
  const server = createServer(async (request, response) => {
    secureHeaders(response);
    if (!localHosts.has(request.headers.host)) return json(response, 403, { errors: ["로컬 편집기 주소로만 접근할 수 있습니다."] });
    try {
      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return response.end(await readFile(htmlPath));
      }
      if (request.method === "GET" && request.url === "/map") return json(response, 200, await currentMap());
      if (request.method === "PUT" && request.url === "/map") {
        if (!localOrigins.has(request.headers.origin) || request.headers["content-type"]?.split(";")[0] !== "application/json") return json(response, 403, { errors: ["편집기 화면에서만 저장할 수 있습니다."] });
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 32_768) return json(response, 413, { errors: ["맵 데이터가 너무 큽니다."] });
        }
        const data = JSON.parse(body);
        const errors = validateMap(data);
        if (errors.length) return json(response, 422, { errors });
        await writeFile(tempMapPath, serializeMap(data), { encoding: "utf8", mode: 0o600 });
        await rename(tempMapPath, mapPath);
        return json(response, 200, { saved: true });
      }
      return json(response, 404, { errors: ["찾을 수 없습니다."] });
    } catch (error) {
      return json(response, 400, { errors: [error instanceof Error ? error.message : "요청을 처리할 수 없습니다."] });
    }
  });
  server.listen(PORT, HOST, () => console.log(`로컬 맵 에디터: ${origin}`));
}
