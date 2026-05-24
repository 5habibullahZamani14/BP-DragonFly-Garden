import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "src/locales");
const files = ["en.ts", "ar.ts", "zh.ts", "ms.ts", "fa.ts", "hi.ts"];
const keys = {};
for (const f of files) {
  const c = fs.readFileSync(path.join(dir, f), "utf8");
  keys[f] = new Set([...c.matchAll(/"([^"]+)":/g)].map((x) => x[1]));
}
const en = keys["en.ts"];
for (const f of files.slice(1)) {
  const missing = [...en].filter((k) => !keys[f].has(k));
  console.log(f, "missing", missing.length, missing.slice(0, 5).join(", "));
}
