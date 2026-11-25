const allowedTopics = new Set(["delivery", "pricing", "other"]);
const manualReview = Object.freeze({ status: "manual_review", topic: null, draft: null });
const modelTimeoutMs = 300;

export class TriageService {
  #classify;

  constructor(classify) {
    this.#classify = classify;
  }

  async run(text) {
    if (typeof text !== "string" || !text.trim()) {
      return { status: "invalid_input" };
    }

    try {
      const output = await this.#classifyWithinDeadline(text.trim());
      const result = JSON.parse(output);

      if (!allowedTopics.has(result?.topic) ||
          typeof result.draft !== "string" || !result.draft.trim()) {
        return manualReview;
      }

      return { status: "ready", topic: result.topic, draft: result.draft.trim() };
    } catch {
      return manualReview;
    }
  }

  async #classifyWithinDeadline(text) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Model deadline exceeded"));
      }, modelTimeoutMs);
    });

    try {
      return await Promise.race([
        this.#classify(text, { signal: controller.signal }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
