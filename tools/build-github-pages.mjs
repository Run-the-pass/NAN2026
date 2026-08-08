import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const route = "app/api/sessions/route.ts";
const hiddenRoute = `${route}.pages-disabled`;

async function nextBuild() {
  await rename(route, hiddenRoute);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("node_modules/.bin/next", ["build", "--webpack"], {
        stdio: "inherit",
        env: {
          ...process.env,
          GITHUB_PAGES: "true",
          NEXT_PUBLIC_STATIC_EXPORT: "true",
          NEXT_PUBLIC_SITE_URL: "https://run-the-pass.github.io/NAN2026/",
        },
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`next build exited ${code}`)),
      );
    });
  } finally {
    await rename(hiddenRoute, route);
  }
}

async function rewritePublicPaths(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewritePublicPaths(path);
    } else if (/\.(?:css|html|js|json|txt)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      const rewritten = source.replace(
        /(["'])\/(favicon\.svg|(?:food|home|music|sfx|slimes|stations|text|ui)\/)/g,
        "$1/NAN2026/$2",
      );
      if (rewritten !== source) await writeFile(path, rewritten);
    }
  }
}

await nextBuild();
await rewritePublicPaths("out");
