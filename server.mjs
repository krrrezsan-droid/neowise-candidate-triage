import { createTriageServer } from "./http.mjs";
import { classify } from "./mock-ai.mjs";
import { TriageService } from "./triage.mjs";

const server = createTriageServer(new TriageService(classify));
server.listen(Number(process.env.PORT || 3000), "127.0.0.1");
