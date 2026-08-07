// 밸런스 수치를 고치는 로컬 편집기. 127.0.0.1에서만 뜨고 배포에 들어가지
// 않는다. game/balance.json · recipes.json · stages.json 세 파일을 다룬다.
import { createServer } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 4174;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "tools/balance-editor.html");
const corePath = resolve(root, "game/core.ts");
const files = {
  balance: resolve(root, "game/balance.json"),
  recipes: resolve(root, "game/recipes.json"),
  stages: resolve(root, "game/stages.json"),
};

// 아이템·설비·속성 목록은 core.ts가 원본이다. 편집기가 따로 베껴 두면
// 한쪽만 바뀌어 어긋나므로 파일에서 읽어 온다. 형식이 바뀌면 바로 터진다.
function listFrom(source, name) {
  const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`core.ts에서 ${name}을(를) 찾지 못했습니다.`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((one) => one[1]);
}

function labelsFrom(source, name) {
  const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!match) throw new Error(`core.ts에서 ${name}을(를) 찾지 못했습니다.`);
  const labels = {};
  for (const [, key, value] of match[1].matchAll(/^\s*"?([\w-]+)"?:\s*"([^"]*)"/gm)) {
    labels[key] = value;
  }
  return labels;
}

async function catalog() {
  const source = await readFile(corePath, "utf8");
  return {
    items: listFrom(source, "allItems"),
    stations: listFrom(source, "allStations"),
    elements: listFrom(source, "allElements"),
    itemLabels: labelsFrom(source, "itemLabels"),
    stationLabels: labelsFrom(source, "stationLabels"),
    // 조리 기구만 레시피의 대상이 된다.
    cooktops: listFrom(source, "cooktopStations").concat("blender"),
  };
}

const whole = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = (value, max = 30) =>
  typeof value === "string" && value.length > 0 && value.length <= max;

// 게임이 시작할 때 하는 검증과 같은 규칙이다. 저장 전에 막아야 편집기에서
// 고친 값 때문에 게임이 안 뜨는 일이 없다.
function validate({ balance, recipes, stages }, list) {
  const errors = [];
  const say = (ok, message) => {
    if (!ok) errors.push(message);
  };

  for (const element of list.elements) {
    say(whole(balance.actionPointsPerTurn?.[element], 1), `${element} 행동력은 1 이상이어야 합니다.`);
  }
  for (const [name, cost] of Object.entries(balance.actionCost ?? {})) {
    say(whole(cost, 1), `${name} 비용은 1 이상이어야 합니다.`);
  }
  for (const [job, workers] of Object.entries(balance.stationElements ?? {})) {
    say(
      Array.isArray(workers) && workers.length > 0 && workers.every((one) => list.elements.includes(one)),
      `${job}을(를) 맡을 속성을 하나 이상 골라야 합니다.`,
    );
  }
  say(whole(balance.ingredients?.max, 1), "재료 상자 최대치는 1 이상이어야 합니다.");
  say(whole(balance.ingredients?.perTurn, 1), "턴당 재료 보충은 1 이상이어야 합니다.");
  const dish = balance.dish ?? {};
  say(whole(dish.rackCapacity, 1), "그릇 상자 용량은 1 이상이어야 합니다.");
  say(whole(dish.initialCount, 0) && dish.initialCount <= dish.rackCapacity, "초기 그릇 수는 0 이상이고 상자 용량 이하여야 합니다.");
  say(whole(dish.washerCapacity, 1), "세척대 용량은 1 이상이어야 합니다.");
  say(whole(dish.earthDishCarry, 1), "땅 슬라임 그릇 운반 수는 1 이상이어야 합니다.");
  say(whole(dish.tableCapacity, 1), "테이블 용량은 1 이상이어야 합니다.");
  say(whole(balance.incinerator?.capacity, 1), "소각기 용량은 1 이상이어야 합니다.");
  const orders = balance.orders ?? {};
  say(whole(orders.activeOrderCount, 1), "동시 노출 주문 수는 1 이상이어야 합니다.");
  say(whole(orders.previewCount, 0), "미리 보기 주문 수는 0 이상이어야 합니다.");
  say(["reject", "discard"].includes(orders.invalidSubmission), "잘못된 제출 처리 값이 올바르지 않습니다.");
  say(typeof orders.endRoundWhenOrdersDone === "boolean", "주문 소진 시 종료 값이 올바르지 않습니다.");
  say(whole(balance.rushTurnsLeft, 0), "마감 임박 턴은 0 이상이어야 합니다.");
  say(whole(balance.goldPerOrder, 0), "주문당 골드는 0 이상이어야 합니다.");

  const foods = new Set();
  const perStation = new Set();
  say(Array.isArray(recipes) && recipes.length > 0, "레시피가 하나도 없습니다.");
  for (const recipe of recipes ?? []) {
    const where = recipe?.foodId ?? "(이름 없음)";
    say(list.items.includes(recipe?.foodId), `${where}: 완성품이 목록에 없습니다.`);
    say(list.items.includes(recipe?.ingredient), `${where}: 재료가 목록에 없습니다.`);
    say(list.stations.includes(recipe?.station), `${where}: 기구가 목록에 없습니다.`);
    say(
      Array.isArray(recipe?.workers) && recipe.workers.length > 0 &&
        recipe.workers.every((one) => list.elements.includes(one)),
      `${where}: 담당 속성을 하나 이상 골라야 합니다.`,
    );
    say(!foods.has(recipe?.foodId), `${where}: 같은 완성품이 두 번 있습니다.`);
    const pair = `${recipe?.station}/${recipe?.ingredient}`;
    say(!perStation.has(pair), `${where}: 같은 기구에서 같은 재료를 두 번 씁니다.`);
    foods.add(recipe?.foodId);
    perStation.add(pair);
  }

  const ids = new Set();
  say(Array.isArray(stages) && stages.length > 0, "스테이지가 하나도 없습니다.");
  for (const stage of stages ?? []) {
    const where = stage?.id ?? "(번호 없음)";
    say(text(stage?.id, 12), `${where}: 번호는 1~12자여야 합니다.`);
    say(text(stage?.name), `${where}: 이름은 1~30자여야 합니다.`);
    say(!ids.has(stage?.id), `${where}: 번호가 겹칩니다.`);
    ids.add(stage?.id);
    say(whole(stage?.turnLimit, 1), `${where}: 제한 턴은 1 이상이어야 합니다.`);
    say(Array.isArray(stage?.orders) && stage.orders.length > 0, `${where}: 주문 목록이 비었습니다.`);
    for (const foodId of stage?.orders ?? []) {
      say(foods.has(foodId), `${where}: 주문 ${foodId}에 맞는 레시피가 없습니다.`);
    }
    const stars = stage?.stars;
    say(
      Array.isArray(stars) && stars.length === 3 &&
        stars.every((need, index) => whole(need, 1) && (index === 0 || need > stars[index - 1])),
      `${where}: 별 기준은 통과·별2·별3 순으로 커지는 정수 3개여야 합니다.`,
    );
    say(
      Array.isArray(stars) && Array.isArray(stage?.orders) && stars[2] <= stage.orders.length,
      `${where}: 별 3개 기준이 주문 수보다 많아 받을 수 없습니다.`,
    );
  }
  return errors;
}

async function currentData() {
  const [balance, recipes, stages] = await Promise.all(
    [files.balance, files.recipes, files.stages].map(async (path) =>
      JSON.parse(await readFile(path, "utf8")),
    ),
  );
  return { balance, recipes: recipes.recipes, stages: stages.stages, notes: {
    balance: balance.note, recipes: recipes.note, stages: stages.note,
  } };
}

async function save(path, value) {
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

const json = (response, status, body) => {
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

if (process.argv.includes("--check")) {
  const data = await currentData();
  const errors = validate(data, await catalog());
  if (errors.length) throw new Error(errors.join(" "));
  console.log("밸런스 데이터 검증 PASS");
} else {
  const origin = `http://${HOST}:${PORT}`;
  const localHosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
  const localOrigins = new Set([origin, `http://localhost:${PORT}`]);
  const server = createServer(async (request, response) => {
    secureHeaders(response);
    if (!localHosts.has(request.headers.host)) {
      return json(response, 403, { errors: ["로컬 편집기 주소로만 접근할 수 있습니다."] });
    }
    try {
      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return response.end(await readFile(htmlPath));
      }
      if (request.method === "GET" && request.url === "/data") {
        return json(response, 200, { ...(await currentData()), catalog: await catalog() });
      }
      if (request.method === "PUT" && request.url === "/data") {
        if (
          !localOrigins.has(request.headers.origin) ||
          request.headers["content-type"]?.split(";")[0] !== "application/json"
        ) {
          return json(response, 403, { errors: ["편집기 화면에서만 저장할 수 있습니다."] });
        }
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 262_144) return json(response, 413, { errors: ["데이터가 너무 큽니다."] });
        }
        const next = JSON.parse(body);
        const errors = validate(next, await catalog());
        if (errors.length) return json(response, 422, { errors });
        const before = await currentData();
        // 파일 첫머리의 설명은 편집기가 건드리지 않고 그대로 되돌려 둔다.
        const balance = { ...next.balance };
        delete balance.note;
        await save(files.balance, { note: before.notes.balance, ...balance });
        await save(files.recipes, { note: before.notes.recipes, recipes: next.recipes });
        await save(files.stages, { note: before.notes.stages, stages: next.stages });
        return json(response, 200, { saved: true });
      }
      return json(response, 404, { errors: ["찾을 수 없습니다."] });
    } catch (error) {
      return json(response, 400, { errors: [error instanceof Error ? error.message : "요청을 처리할 수 없습니다."] });
    }
  });
  server.listen(PORT, HOST, () => console.log(`로컬 밸런스 편집기: ${origin}`));
}
