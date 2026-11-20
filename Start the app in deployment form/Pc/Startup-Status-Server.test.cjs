const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const serverScript = path.join(__dirname, "Startup-Status-Server.cjs");

test("startup page shows progress and releases its temporary server after completion", async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dragonfly-startup-status-"));
  const statusFile = path.join(testDirectory, "status.json");
  const portFile = path.join(testDirectory, "port.txt");
  fs.writeFileSync(statusFile, JSON.stringify({
    state: "working",
    message: "Building the frontend...",
    logPath: "launcher.log",
  }));

  const child = spawn(process.execPath, [serverScript, statusFile, portFile], { stdio: "ignore" });
  let exitPromise;
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(portFile) && Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Status server exited unexpectedly with code ${child.exitCode}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(fs.existsSync(portFile), "status server should publish its local port");

    const port = Number(fs.readFileSync(portFile, "utf8"));
    const baseUrl = `http://127.0.0.1:${port}`;
    const pageResponse = await fetch(`${baseUrl}/`);
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, /Getting your garden ready/);
    assert.match(page, /avoid opening another copy/);
    assert.match(page, /A dragonfly can move each of its four wings independently/);
    assert.match(page, /prefers-reduced-motion: reduce/);
    assert.match(page, /role="progressbar"/);
    const inlineScript = page.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inlineScript, "startup page should include its status polling script");
    assert.doesNotThrow(() => new Function(inlineScript[1]));
    const factPoolMatch = inlineScript[1].match(/const gardenFactPool = (\[[\s\S]*?\]);/);
    assert.ok(factPoolMatch, "startup page should include its garden fact pool");
    const facts = JSON.parse(factPoolMatch[1]);
    assert.ok(facts.length >= 30, "the loading page should have plenty of facts to rotate through");
    assert.equal(new Set(facts).size, facts.length, "garden facts should not be duplicated");
    assert.match(inlineScript[1], /shuffleGardenNotes\(gardenNotes\[gardenNoteIndex - 1\]\)/);

    function runPageWithRandom(random) {
      const elements = new Map();
      const context = {
        document: {
          getElementById(id) {
            if (!elements.has(id)) {
              elements.set(id, { classList: { add() {} }, hidden: false, style: {}, textContent: "" });
            }
            return elements.get(id);
          },
        },
        fetch: async () => ({ ok: true, json: async () => ({ state: "working", message: "Testing" }) }),
        Math: { floor: Math.floor, random },
        window: {
          clearInterval() {},
          location: { replace() {} },
          setInterval() { return 1; },
          setTimeout() { return 1; },
        },
      };
      vm.runInNewContext(
        `${inlineScript[1]}\nglobalThis.testHooks = { facts: gardenFactPool, current: gardenNotes[gardenNoteIndex], getNextGardenNote };`,
        context
      );
      return context.testHooks;
    }

    const firstRun = runPageWithRandom(() => 0);
    const secondRun = runPageWithRandom(() => 0.999999);
    assert.notEqual(firstRun.current, secondRun.current, "different startup shuffles should show different first facts");
    const shownFacts = [firstRun.current];
    for (let index = 1; index < facts.length; index += 1) {
      shownFacts.push(firstRun.getNextGardenNote());
    }
    assert.equal(new Set(shownFacts).size, facts.length, "facts should not repeat until the whole pool has been shown");
    assert.notEqual(
      firstRun.getNextGardenNote(),
      shownFacts[shownFacts.length - 1],
      "reshuffling should not repeat the last fact at the cycle boundary"
    );

    const statusResponse = await fetch(`${baseUrl}/status`);
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(await statusResponse.json(), {
      state: "working",
      message: "Building the frontend...",
      logPath: "launcher.log",
    });

    exitPromise = new Promise((resolve) => child.once("exit", resolve));
    const completionResponse = await fetch(`${baseUrl}/complete`, { method: "POST" });
    assert.equal(completionResponse.status, 204);
    let timeout;
    const exitCode = await Promise.race([
      exitPromise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Status server did not exit.")), 3000);
      }),
    ]);
    clearTimeout(timeout);
    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(statusFile), false);
    assert.equal(fs.existsSync(portFile), false);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once("exit", resolve);
      });
    }
    for (const file of [statusFile, portFile]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(testDirectory);
  }
});
