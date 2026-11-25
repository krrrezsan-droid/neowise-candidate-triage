import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Script } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = new Script(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1], {
  filename: "index.html",
});

function loadPage() {
  let onSubmit;
  const requests = [];
  const message = { value: "" };
  const status = { textContent: "" };
  const result = { hidden: true };
  const topic = { textContent: "" };
  const draft = { textContent: "" };
  const elements = {
    form: {
      addEventListener(_type, handler) {
        onSubmit = handler;
      },
    },
    "#message": message,
    "#status": status,
    "#result": result,
    "#topic": topic,
    "#draft": draft,
  };

  script.runInNewContext({
    document: { querySelector: (selector) => elements[selector] },
    fetch: () => new Promise((resolve, reject) => {
      requests.push({ resolve, reject });
    }),
  });

  return {
    status, result, topic, draft,
    submit(text) {
      message.value = text;
      const finished = onSubmit({ preventDefault() {} });
      const { resolve, reject } = requests.shift();
      return { reply: (body) => resolve(Response.json(body)), reject, finished };
    },
  };
}

test("clears the previous result and shows manual review when triage fails", async () => {
  const page = loadPage();
  const first = page.submit("Когда доставка?");
  first.reply({ status: "ready", topic: "delivery", draft: "Уточню срок доставки." });
  await first.finished;
  assert.equal(page.result.hidden, false);
  assert.equal(page.draft.textContent, "Уточню срок доставки.");

  const second = page.submit("Новая заявка");
  assert.equal(page.result.hidden, true);
  assert.equal(page.draft.textContent, "");
  second.reply({ status: "manual_review", topic: null, draft: null });
  await second.finished;

  assert.equal(page.status.textContent, "Черновик недоступен. Разберите заявку вручную.");
  assert.equal(page.result.hidden, true);
  assert.equal(page.topic.textContent, "");
  assert.equal(page.draft.textContent, "");
});

for (const [outcome, finishOlderRequest] of [
  ["response", (request) => request.reply({
    status: "ready", topic: "delivery", draft: "Старый черновик.",
  })],
  ["network error", (request) => request.reject(new Error("Connection lost"))],
]) {
  test(`keeps the latest draft after a late ${outcome}`, async () => {
    const page = loadPage();
    const older = page.submit("Когда доставка?");
    const latest = page.submit("Какая цена?");
    latest.reply({ status: "ready", topic: "pricing", draft: "Уточню стоимость." });
    await latest.finished;
    finishOlderRequest(older);
    await older.finished;

    assert.equal(page.status.textContent, "Черновик готов.");
    assert.equal(page.result.hidden, false);
    assert.equal(page.topic.textContent, "Стоимость");
    assert.equal(page.draft.textContent, "Уточню стоимость.");
  });
}
