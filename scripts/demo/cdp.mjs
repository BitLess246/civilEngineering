// Minimal CDP bridge: evaluate an expression in the page and print the JSON
// result. Node 22 ships a global WebSocket, so this needs no dependencies.
//   node cdp.mjs '<js expression>'
const expr = process.argv[2];
if (!expr) { console.error("usage: cdp.mjs <expression>"); process.exit(2); }

const res = await fetch("http://127.0.0.1:9222/json");
const targets = await res.json();
const page = targets.find((t) => t.type === "page" && t.url.includes("127.0.0.1:8080"));
if (!page) { console.error("no page target"); process.exit(3); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("cdp timeout")), 20000);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: expr, returnByValue: true, awaitPromise: true },
    }));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== 1) return;
    clearTimeout(timer);
    if (msg.result?.exceptionDetails) {
      reject(new Error(msg.result.exceptionDetails.text + " " +
        (msg.result.exceptionDetails.exception?.description ?? "")));
      return;
    }
    resolve(msg.result?.result?.value);
  });
  ws.addEventListener("error", (e) => reject(new Error("ws error " + e.message)));
});

try {
  const value = await done;
  console.log(JSON.stringify(value));
  ws.close();
  process.exit(0);
} catch (e) {
  console.error(String(e.message ?? e));
  ws.close();
  process.exit(1);
}
