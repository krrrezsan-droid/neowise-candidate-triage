import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url));

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

export function createTriageServer(triage) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (request.method !== "POST" || request.url !== "/api/triage") {
      sendJson(response, 404, { status: "not_found" });
      return;
    }

    try {
      const input = await readJson(request);
      const result = await triage.run(input?.text);
      sendJson(response, result.status === "invalid_input" ? 400 : 200, result);
    } catch {
      sendJson(response, 500, { status: "server_error" });
    }
  });
}
