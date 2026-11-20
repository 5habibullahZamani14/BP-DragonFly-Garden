const fs = require("node:fs");
const http = require("node:http");
const { URL } = require("node:url");

const [statusFile, portFile] = process.argv.slice(2);
if (!statusFile || !portFile) {
  console.error("Expected status-file and port-file arguments.");
  process.exit(2);
}

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Starting DragonFly Garden</title>
  <style>
    :root {
      color-scheme: light;
      --forest: hsl(160 60% 14%);
      --forest-soft: hsl(154 50% 22%);
      --cream: hsl(42 55% 95%);
      --paper: hsl(44 65% 98%);
      --gold: hsl(36 85% 56%);
      --gold-deep: hsl(28 80% 46%);
      --leaf: hsl(96 42% 36%);
      --muted: hsl(158 22% 28%);
      --berry: hsl(348 68% 46%);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      overflow-x: hidden;
      padding: 28px;
      color: var(--forest);
      background:
        radial-gradient(ellipse at 50% 0%, hsl(152 45% 22% / .12), transparent 58%),
        radial-gradient(ellipse at 100% 100%, hsl(36 85% 56% / .12), transparent 48%),
        linear-gradient(180deg, var(--cream), hsl(38 42% 89%));
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .falling-botanicals { position: fixed; z-index: 2; inset: 0; overflow: hidden; pointer-events: none; }
    .botanical {
      position: absolute;
      top: -12vh;
      width: var(--size, 28px);
      height: var(--size, 28px);
      opacity: .2;
      animation: fall var(--duration, 13s) linear var(--delay, 0s) infinite;
    }
    .botanical.leaf { color: var(--leaf); }
    .botanical.flower { color: var(--berry); }
    main {
      position: relative;
      z-index: 1;
      width: min(100%, 650px);
      overflow: hidden;
      padding: clamp(34px, 6vw, 56px);
      border: 1px solid hsl(38 30% 80% / .8);
      border-radius: 32px;
      background: linear-gradient(145deg, hsl(44 70% 98% / .98), hsl(40 55% 93% / .97));
      box-shadow: 0 1px 0 hsl(40 80% 96% / .9) inset, 0 30px 60px -28px hsl(160 60% 8% / .45), 0 12px 30px -16px hsl(32 90% 45% / .22);
      text-align: center;
    }
    main::before {
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      height: 5px;
      background: linear-gradient(90deg, var(--forest), var(--leaf), var(--gold), var(--berry));
      content: "";
    }
    .brand-lockup { display: flex; align-items: center; justify-content: center; gap: 13px; margin-bottom: 34px; }
    .brand-mark {
      display: grid;
      width: 48px;
      height: 48px;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid hsl(40 90% 80% / .8);
      border-radius: 16px;
      background: linear-gradient(135deg, var(--forest), var(--forest-soft));
      box-shadow: 0 5px 14px hsl(160 60% 8% / .2);
      color: hsl(40 95% 75%);
    }
    .brand-mark svg { width: 28px; height: 28px; }
    .brand-name { margin: 0; color: var(--forest); font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 700; letter-spacing: .01em; }
    .brand-caption { margin: 3px 0 0; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 22px;
      padding: 8px 13px;
      border: 1px solid hsl(38 30% 80% / .85);
      border-radius: 999px;
      background: hsl(44 70% 97% / .82);
      color: var(--forest-soft);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .11em;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold-deep); box-shadow: 0 0 0 4px hsl(36 85% 56% / .16); }
    .status-pill.is-error { border-color: hsl(348 68% 46% / .3); color: hsl(348 68% 36%); }
    .status-pill.is-error .status-dot { background: var(--berry); box-shadow: 0 0 0 4px hsl(348 68% 46% / .13); }
    .spinner {
      position: relative;
      display: grid;
      width: 108px;
      height: 108px;
      margin: 0 auto 27px;
      place-items: center;
      border: 7px solid hsl(160 60% 14% / .1);
      border-top-color: var(--forest);
      border-right-color: var(--gold);
      border-radius: 50%;
      box-shadow: 0 0 0 9px hsl(40 90% 80% / .22), 0 10px 24px hsl(160 60% 8% / .1);
      animation: spin 1.25s linear infinite;
    }
    .spinner-core { display: grid; width: 72px; height: 72px; place-items: center; border-radius: 50%; background: linear-gradient(145deg, hsl(44 70% 98%), hsl(40 65% 91%)); }
    .spinner-core svg { width: 39px; height: 39px; color: var(--leaf); }
    .spinner.is-ready { border-color: var(--gold); animation: none; }
    h1 { margin: 0 0 12px; color: var(--forest); font-family: Georgia, "Times New Roman", serif; font-size: clamp(30px, 6vw, 42px); font-weight: 700; letter-spacing: -.025em; line-height: 1.12; }
    #message { min-height: 52px; margin: 0 auto; color: var(--muted); font-size: clamp(16px, 2.8vw, 19px); line-height: 1.55; }
    .progress-track { height: 6px; overflow: hidden; margin: 27px 0 0; border-radius: 999px; background: hsl(160 60% 14% / .1); }
    .progress-glow { width: 40%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--forest-soft), var(--leaf), var(--gold)); animation: progress 2s ease-in-out infinite; }
    .garden-note {
      display: flex;
      min-height: 74px;
      align-items: center;
      gap: 13px;
      margin-top: 27px;
      padding: 14px 17px;
      border: 1px solid hsl(40 65% 82% / .85);
      border-radius: 18px;
      background: linear-gradient(135deg, hsl(44 80% 94% / .9), hsl(38 70% 86% / .72));
      text-align: left;
    }
    .note-flower { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 13px; background: hsl(44 70% 97% / .9); color: var(--gold-deep); }
    .note-flower svg { width: 22px; height: 22px; }
    .note-label { display: block; margin-bottom: 3px; color: var(--forest-soft); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    #garden-note-text { display: block; color: var(--muted); font-size: 13px; line-height: 1.45; transition: opacity .25s ease; }
    .hint { margin: 21px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
    .hint strong { color: var(--forest); }
    .error { margin-top: 24px; padding: 18px; border: 1px solid hsl(348 68% 46% / .32); border-radius: 16px; background: hsl(348 68% 46% / .06); color: hsl(348 68% 30%); text-align: left; }
    .error p { margin: 0 0 10px; }
    .error code { display: block; overflow-wrap: anywhere; white-space: pre-wrap; font-family: Consolas, monospace; font-size: 13px; }
    [hidden] { display: none !important; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes progress { 0% { transform: translateX(-120%); } 100% { transform: translateX(260%); } }
    @keyframes fall {
      0% { transform: translate3d(0, -12vh, 0) rotate(0deg); }
      100% { transform: translate3d(var(--drift, 50px), 115vh, 0) rotate(var(--turn, 300deg)); }
    }
    @media (max-width: 520px) {
      body { padding: 16px; }
      main { border-radius: 25px; }
      .brand-lockup { margin-bottom: 28px; }
      .garden-note { padding: 12px; }
    }
    @media (max-height: 820px) {
      body { padding: 12px; }
      main { padding: 25px 32px; }
      .brand-lockup { margin-bottom: 20px; }
      .status-pill { margin-bottom: 16px; }
      .spinner { width: 88px; height: 88px; margin-bottom: 20px; }
      .spinner-core { width: 60px; height: 60px; }
      .spinner-core svg { width: 34px; height: 34px; }
      h1 { font-size: clamp(29px, 5vw, 36px); }
      #message { min-height: 0; }
      .progress-track { margin-top: 20px; }
      .garden-note { min-height: 64px; margin-top: 20px; }
      .hint { margin-top: 15px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; }
      .botanical { display: none; }
      .spinner, .progress-glow { animation: none; }
      .progress-glow { width: 100%; }
      #garden-note-text { transition: none; }
    }
  </style>
</head>
<body>
  <div class="falling-botanicals" aria-hidden="true">
    <svg class="botanical leaf" style="left:4%;--size:30px;--delay:-8s;--duration:15s;--drift:12px;--turn:280deg" viewBox="0 0 32 32"><path fill="currentColor" d="M27 4C14 4 5 9 5 19c0 5 4 8 8 8C23 27 28 17 27 4Zm-17 18c5-5 9-8 15-12-5 6-9 10-13 15l-2-3Z"/></svg>
    <svg class="botanical flower" style="left:6%;--size:23px;--delay:-3s;--duration:18s;--drift:-14px;--turn:220deg" viewBox="0 0 32 32"><g fill="currentColor"><ellipse cx="16" cy="8" rx="4" ry="7"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(72 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(144 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(216 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(288 16 16)"/></g><circle cx="16" cy="16" r="3" fill="hsl(36 85% 56%)"/></svg>
    <svg class="botanical leaf" style="left:8%;--size:20px;--delay:-12s;--duration:17s;--drift:22px;--turn:350deg" viewBox="0 0 32 32"><path fill="currentColor" d="M27 4C14 4 5 9 5 19c0 5 4 8 8 8C23 27 28 17 27 4Zm-17 18c5-5 9-8 15-12-5 6-9 10-13 15l-2-3Z"/></svg>
    <svg class="botanical flower" style="left:92%;--size:29px;--delay:-6s;--duration:20s;--drift:-18px;--turn:310deg" viewBox="0 0 32 32"><g fill="currentColor"><ellipse cx="16" cy="8" rx="4" ry="7"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(72 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(144 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(216 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(288 16 16)"/></g><circle cx="16" cy="16" r="3" fill="hsl(40 95% 65%)"/></svg>
    <svg class="botanical leaf" style="left:94%;--size:26px;--delay:-4s;--duration:16s;--drift:-22px;--turn:250deg" viewBox="0 0 32 32"><path fill="currentColor" d="M27 4C14 4 5 9 5 19c0 5 4 8 8 8C23 27 28 17 27 4Zm-17 18c5-5 9-8 15-12-5 6-9 10-13 15l-2-3Z"/></svg>
    <svg class="botanical flower" style="left:96%;--size:25px;--delay:-10s;--duration:19s;--drift:15px;--turn:330deg" viewBox="0 0 32 32"><g fill="currentColor"><ellipse cx="16" cy="8" rx="4" ry="7"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(72 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(144 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(216 16 16)"/><ellipse cx="16" cy="8" rx="4" ry="7" transform="rotate(288 16 16)"/></g><circle cx="16" cy="16" r="3" fill="hsl(348 68% 46%)"/></svg>
    <svg class="botanical leaf" style="left:98%;--size:32px;--delay:-1s;--duration:18s;--drift:-18px;--turn:300deg" viewBox="0 0 32 32"><path fill="currentColor" d="M27 4C14 4 5 9 5 19c0 5 4 8 8 8C23 27 28 17 27 4Zm-17 18c5-5 9-8 15-12-5 6-9 10-13 15l-2-3Z"/></svg>
  </div>
  <main>
    <header class="brand-lockup">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none"><path d="M16 15C12 8 7 7 5 8c0 5 4 9 10 10M16 15c4-7 9-8 11-7 0 5-4 9-10 10M16 13v12m-5 0h10m-8-7-4 4m12-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="12" r="2" fill="currentColor"/></svg>
      </div>
      <div>
        <p class="brand-name">DragonFly Garden</p>
        <p class="brand-caption">A little moment in the garden</p>
      </div>
    </header>
    <div id="status-pill" class="status-pill"><span class="status-dot" aria-hidden="true"></span><span id="status-label">GETTING READY</span></div>
    <div id="spinner" class="spinner" role="img" aria-label="Loading DragonFly Garden">
      <div class="spinner-core" aria-hidden="true">
        <svg viewBox="0 0 32 32"><path fill="currentColor" d="M27 4C14 4 5 9 5 19c0 5 4 8 8 8C23 27 28 17 27 4Zm-17 18c5-5 9-8 15-12-5 6-9 10-13 15l-2-3Z"/></svg>
      </div>
    </div>
    <h1 id="title">Getting your garden ready</h1>
    <p id="message" aria-live="polite">Starting the app launcher. Please wait.</p>
    <div id="progress" class="progress-track" role="progressbar" aria-label="DragonFly Garden is starting" aria-valuetext="Startup in progress"><div class="progress-glow"></div></div>
    <aside id="garden-note" class="garden-note" aria-live="off">
      <div class="note-flower" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5c1.6 0 2.4 2.7 2.4 4.5 1.2-1.3 3.4-2.7 4.5-1.6 1.1 1.1-.3 3.3-1.6 4.5 1.8 0 4.5.8 4.5 2.4s-2.7 2.4-4.5 2.4c1.3 1.2 2.7 3.4 1.6 4.5-1.1 1.1-3.3-.3-4.5-1.6 0 1.8-.8 4.5-2.4 4.5s-2.4-2.7-2.4-4.5c-1.2 1.3-3.4 2.7-4.5 1.6-1.1-1.1.3-3.3 1.6-4.5-1.8 0-4.5-.8-4.5-2.4s2.7-2.4 4.5-2.4c-1.3-1.2-2.7-3.4-1.6-4.5 1.1-1.1 3.3.3 4.5 1.6 0-1.8.8-4.5 2.4-4.5Z" fill="currentColor"/><circle cx="12" cy="13.3" r="2" fill="hsl(40 95% 65%)"/></svg>
      </div>
      <div>
        <span class="note-label">A little dragonfly note</span>
        <span id="garden-note-text">A dragonfly can move each of its four wings independently—a tiny master of the air.</span>
      </div>
    </aside>
    <p id="hint" class="hint">Your app will open here automatically. Please <strong>keep this window open</strong> and avoid opening another copy while setup finishes.</p>
    <section id="error" class="error" role="alert" hidden>
      <p><strong>DragonFly Garden could not finish starting.</strong></p>
      <code id="error-message"></code>
      <p id="log-path"></p>
      <p>Close this tab, resolve the reported issue, then try the desktop shortcut again.</p>
    </section>
  </main>
  <script>
    let finished = false;
    const title = document.getElementById("title");
    const message = document.getElementById("message");
    const hint = document.getElementById("hint");
    const spinner = document.getElementById("spinner");
    const statusPill = document.getElementById("status-pill");
    const statusLabel = document.getElementById("status-label");
    const progress = document.getElementById("progress");
    const gardenNote = document.getElementById("garden-note");
    const gardenNoteText = document.getElementById("garden-note-text");
    const errorPanel = document.getElementById("error");
    const gardenFactPool = [
      "A dragonfly can steer its four wings independently, helping it hover and dart in different directions.",
      "A dragonfly's compound eyes wrap around much of its head, giving it an almost panoramic view.",
      "Many dragonflies spend most of their lives underwater as nymphs before taking flight.",
      "Butterflies taste with sensory organs on their feet.",
      "Honeybees use waggle dances to share the direction and distance of food.",
      "Many bees can see ultraviolet flower patterns that human eyes cannot.",
      "Young sunflowers follow the sun; mature flowers usually settle facing east.",
      "A sunflower's dark center is a crowd of tiny individual flowers.",
      "Bamboo is a fast-growing grass, not a tree.",
      "Vanilla comes from the seed pods of a climbing orchid.",
      "Saffron is made from the red stigmas inside crocus flowers.",
      "Pineapples grow close to the ground on leafy plants, not on trees.",
      "Peanuts are legumes, and their pods develop underground.",
      "Tomatoes are fruits botanically, even though cooks often use them as vegetables.",
      "The tiny specks on a strawberry's outside are individual fruits called achenes.",
      "Broccoli florets are clusters of unopened flower buds.",
      "The edible part of a globe artichoke is an unopened flower bud.",
      "Many mints spread through underground stems called rhizomes.",
      "Some plants fold their leaves after dark in a movement known as nyctinasty.",
      "Earthworm tunnels help air and water move through soil.",
      "Garden snails rasp food with a ribbon-like tongue covered in tiny teeth.",
      "Ladybugs are beetles, not true bugs.",
      "Mushrooms are fungi, a separate kingdom from plants.",
      "Lichens are partnerships between fungi and algae or cyanobacteria.",
      "Air plants absorb most of the water they need through their leaves.",
      "Venus flytraps naturally grow in wetlands in parts of North and South Carolina, USA.",
      "Orange carrots get much of their color from beta-carotene.",
      "Cacao pods can grow straight from the trunk and larger branches of the cacao tree.",
      "A fig is formed from many tiny flowers tucked inside its hollow structure.",
      "Many night-blooming flowers release their strongest scent after sunset to attract pollinators.",
      "Dragonfly-like insects have been flying for more than 300 million years."
    ];

    function shuffleGardenNotes(previousNote) {
      const shuffled = [...gardenFactPool];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      if (shuffled.length > 1 && shuffled[0] === previousNote) {
        const swapIndex = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
      }
      return shuffled;
    }

    let gardenNotes = shuffleGardenNotes(null);
    let gardenNoteIndex = 0;
    gardenNoteText.textContent = gardenNotes[gardenNoteIndex];

    function getNextGardenNote() {
      gardenNoteIndex += 1;
      if (gardenNoteIndex === gardenNotes.length) {
        gardenNotes = shuffleGardenNotes(gardenNotes[gardenNoteIndex - 1]);
        gardenNoteIndex = 0;
      }
      return gardenNotes[gardenNoteIndex];
    }

    const gardenNoteTimer = window.setInterval(() => {
      gardenNoteText.style.opacity = "0";
      window.setTimeout(() => {
        gardenNoteText.textContent = getNextGardenNote();
        gardenNoteText.style.opacity = "1";
      }, 250);
    }, 7000);

    function stopWaitingAnimation() {
      window.clearInterval(gardenNoteTimer);
      gardenNote.hidden = true;
      progress.hidden = true;
    }

    async function complete() {
      try {
        await fetch("/complete", { method: "POST", cache: "no-store" });
      } catch (_) {
        // The page can remain useful even if the temporary status server closed.
      }
    }

    async function poll() {
      if (finished) return;
      try {
        const response = await fetch("/status", { cache: "no-store" });
        if (!response.ok) throw new Error("Status request failed.");
        const status = await response.json();

        if (typeof status.message === "string") message.textContent = status.message;

        if (status.state === "ready" && typeof status.url === "string" && /^https?:\\/\\//i.test(status.url)) {
          finished = true;
          stopWaitingAnimation();
          statusLabel.textContent = "READY TO BLOOM";
          spinner.classList.add("is-ready");
          title.textContent = "Your garden is ready";
          message.textContent = "Opening the selected screen...";
          hint.hidden = true;
          await complete();
          window.location.replace(status.url);
          return;
        }

        if (status.state === "error") {
          finished = true;
          stopWaitingAnimation();
          statusPill.classList.add("is-error");
          statusLabel.textContent = "ATTENTION NEEDED";
          title.textContent = "Startup needs attention";
          spinner.hidden = true;
          hint.hidden = true;
          errorPanel.hidden = false;
          document.getElementById("error-message").textContent = status.message || "An unexpected startup error occurred.";
          document.getElementById("log-path").textContent = status.logPath ? "Launcher log: " + status.logPath : "";
          await complete();
          return;
        }
      } catch (_) {
        message.textContent = "Connecting to the startup helper...";
      }

      window.setTimeout(poll, 800);
    }

    poll();
  </script>
</body>
</html>`;

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(statusFile, "utf8"));
  } catch {
    return { state: "working", message: "Preparing the startup screen..." };
  }
}

function cleanup() {
  for (const file of [statusFile, portFile]) {
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") console.error(`Could not remove ${file}:`, error.message);
    }
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "GET" && requestUrl.pathname === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
    });
    response.end(page);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/status") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(readStatus()));
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/complete") {
    response.writeHead(204);
    response.end();
    setTimeout(() => server.close(), 250);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

let idleTimer;
server.on("request", () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => server.close(), 10 * 60 * 1000);
  idleTimer.unref();
});
server.on("close", () => {
  clearTimeout(idleTimer);
  cleanup();
});
process.on("exit", cleanup);

server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(portFile, String(server.address().port), "utf8");
});
