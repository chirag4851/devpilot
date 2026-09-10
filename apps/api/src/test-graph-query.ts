// test-graph-query.ts
import "dotenv/config";
import { getIncomingRelationships } from "./services/relationship.service.js";

const targetChunkId = "0f2e72df3cb2b141ad8732d4647af0505ab3ebcac32678e2f4734977c6357f4a"; // getGitHubRepositories

const callers = await getIncomingRelationships(targetChunkId);

for (const c of callers) {
    console.log(`${c.path} — ${c.name ?? c.type} (${c.startLine}-${c.endLine})`);
}
