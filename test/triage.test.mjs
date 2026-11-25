import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { createTriageServer } from "../http.mjs";
import { classify } from "../mock-ai.mjs";
import { TriageService } from "../triage.mjs";

const server = createTriageServer(new TriageService(classify));
let endpoint;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  endpoint = `http://127.0.0.1:${server.address().port}/api/triage`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function triage(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { code: response.status, body: await response.json() };
}

test("returns a topic and draft for a valid request", async () => {
  assert.deepEqual(await triage(JSON.stringify({ text: " Когда будет доставка? " })), {
    code: 200,
    body: {
      status: "ready",
      topic: "delivery",
      draft: "Спасибо за обращение. Уточним детали заявки.",
    },
  });
});

for (const [name, body] of [
  ["empty body", ""],
  ["malformed JSON", "{"],
  ["missing text", "{}"],
  ["non-string text", '{"text":42}'],
  ["empty text", '{"text":""}'],
  ["whitespace-only text", '{"text":"   "}'],
  ["null body", "null"],
]) {
  test(`rejects ${name}`, async () => {
    assert.deepEqual(await triage(body), {
      code: 400,
      body: { status: "invalid_input" },
    });
  });
}

const manualReview = { status: "manual_review", topic: null, draft: null };

for (const marker of ["timeout", "error", "bad-json", "bad-topic", "empty-draft"]) {
  test(`returns manual review for [${marker}]`, async () => {
    assert.deepEqual(await triage(JSON.stringify({ text: `Заявка [${marker}]` })), {
      code: 200,
      body: manualReview,
    });
  });
}

test("stops waiting at the deadline even if the provider ignores cancellation", {
  timeout: 1000,
}, async () => {
  let modelSignal;
  const service = new TriageService((text, { signal }) => {
    modelSignal = signal;
    return new Promise(() => {});
  });

  assert.deepEqual(await service.run("Заявка"), manualReview);
  assert.equal(modelSignal.aborted, true);
});
