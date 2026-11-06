// Parser sidecar: POST /parse {dsl} -> {ok, graph} | {ok:false, error:{message,line,column}}
import http from "node:http";
import { parse } from "./parser.mjs";

const PORT = process.env.PORT || 7070;

export function parseDsl(dsl) {
  try {
    return { ok: true, graph: parse(dsl) };
  } catch (e) {
    const loc = e.location?.start || {};
    return { ok: false, error: { message: e.message, line: loc.line ?? null, column: loc.column ?? null } };
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end('{"ok":true}');
  }
  if (req.method !== "POST" || req.url !== "/parse") {
    res.writeHead(404);
    return res.end();
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let dsl = "";
    try { dsl = JSON.parse(body).dsl ?? ""; } catch { /* empty */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(parseDsl(dsl)));
  });
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  server.listen(PORT, () => console.log(`parser sidecar on :${PORT}`));
}
