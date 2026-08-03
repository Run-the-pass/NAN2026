import { createServer } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 4173;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "tools/map-editor.html");
const mapPath = resolve(root, "game/map-data.ts");
const tempMapPath = resolve(root, "game/map-data.ts.tmp");
const stationCodes = {
  "ingredient-box": "I",
  stove: "C",
  submission: "S",
  trash: "X",
  "dish-rack": "D",
  washer: "W",
  table: "T",
};
const stationLabels = {
  "ingredient-box": "재료 상자",
  stove: "조리 도구",
  submission: "음식 제출대",
  trash: "쓰레기 처리 공간",
  "dish-rack": "그릇 생성대",
  washer: "세척기",
  table: "테이블",
};

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
  value.col < 16 &&
  value.row >= 0 &&
  value.row < 10;

function validateMap(data) {
  const errors = [];
  if (!data || !Array.isArray(data.rows) || data.rows.length !== 10 || data.rows.some((row) => typeof row !== "string" || row.length !== 16)) {
    return ["맵은 16×10이어야 합니다."];
  }
  const allowed = new Set(["#", ".", ...Object.values(stationCodes)]);
  if (data.rows.some((row) => [...row].some((tile) => !allowed.has(tile)))) errors.push("알 수 없는 타일이 있습니다.");
  if ([...data.rows[0], ...data.rows[9]].includes(".") || data.rows.slice(1, -1).some((row) => row[0] === "." || row.at(-1) === ".")) {
    errors.push("맵 바깥 테두리는 조리대나 설비로 막아야 합니다.");
  }
  if (!data.taskTiles || typeof data.taskTiles !== "object") errors.push("슬라임 작업 위치 정보가 없습니다.");
  for (const [id, code] of Object.entries(stationCodes)) {
    const displays = data.rows.flatMap((row, rowIndex) => [...row].flatMap((tile, col) => tile === code ? [{ col, row: rowIndex }] : []));
    if (displays.length !== 1) {
      errors.push(`${stationLabels[id]}: 정확히 한 칸이어야 합니다.`);
      continue;
    }
    const task = data.taskTiles?.[id];
    if (!position(task) || data.rows[task.row]?.[task.col] !== ".") {
      errors.push(`${stationLabels[id]} 작업 위치는 바닥이어야 합니다.`);
    } else if (Math.abs(task.col - displays[0].col) + Math.abs(task.row - displays[0].row) !== 1) {
      errors.push(`${stationLabels[id]} 작업 위치는 설비에 인접해야 합니다.`);
    }
  }
  const tasks = Object.keys(stationCodes).map((id) => data.taskTiles?.[id]).filter(position);
  if (tasks.length === 7 && new Set(tasks.map((tile) => `${tile.col},${tile.row}`)).size !== 7) errors.push("슬라임 작업 위치는 서로 겹칠 수 없습니다.");
  if (!Array.isArray(data.spawnTiles) || data.spawnTiles.length !== 4 || data.spawnTiles.some((tile) => !position(tile) || data.rows[tile.row]?.[tile.col] !== ".") || new Set(data.spawnTiles.map((tile) => `${tile.col},${tile.row}`)).size !== 4) {
    errors.push("스폰 4칸은 서로 다른 바닥이어야 합니다.");
  }
  return errors;
}

const serializeMap = (data) => `// \`npm run map:edit\`가 이 파일을 검증한 뒤 직접 갱신한다.\nexport default ${JSON.stringify(data, null, 2)} as const;\n`;
const json = (response, status, body) => {
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
  const server = createServer(async (request, response) => {
    secureHeaders(response);
    if (request.headers.host !== `${HOST}:${PORT}`) return json(response, 403, { errors: ["로컬 편집기 주소로만 접근할 수 있습니다."] });
    try {
      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return response.end(await readFile(htmlPath));
      }
      if (request.method === "GET" && request.url === "/map") return json(response, 200, await currentMap());
      if (request.method === "PUT" && request.url === "/map") {
        if (request.headers.origin !== origin || request.headers["content-type"]?.split(";")[0] !== "application/json") return json(response, 403, { errors: ["편집기 화면에서만 저장할 수 있습니다."] });
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
