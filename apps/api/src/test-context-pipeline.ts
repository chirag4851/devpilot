// import "dotenv/config";
// import { hybridSearch } from "./services/retrieval.service.js"; // adjust to actual path
// import { rerankChunks } from "./services/rerank.service.js";
// import { expandContext } from "./services/context-expansion.service.js";

// const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
// const query = "how does github oauth work in this repo"; // swap for a real question

// const retrieved = await hybridSearch(projectId, query, 5);
// const reranked = await rerankChunks(query, retrieved, 5);
// const expanded = await expandContext(reranked, projectId);

// console.log(`\n${expanded.length} chunks in final context (query: "${query}")\n`);

// let totalChars = 0;

// for (const [i, chunk] of expanded.entries()) {
//     console.log("=".repeat(70));
//     console.log(`#${i + 1} [${chunk.source}${chunk.relationshipType ? ` / ${chunk.relationshipDirection} ${chunk.relationshipType}` : ""}]`);
//     console.log(`path: ${chunk.path}`);
//     console.log(`name: ${chunk.name ?? "(unnamed)"}  type: ${chunk.type}  lines: ${chunk.startLine}-${chunk.endLine}`);
//     if (chunk.relevanceScore !== undefined) console.log(`relevanceScore: ${chunk.relevanceScore}`);
//     console.log(`content (${chunk.content.length} chars):`);
//     console.log("-".repeat(70));
//     console.log(chunk.content);
//     console.log();
//     totalChars += chunk.content.length;
// }

// console.log("=".repeat(70));
// console.log(`\nTotal content chars across all chunks: ${totalChars}`);
// console.log(`Rough token estimate (chars/4): ~${Math.round(totalChars / 4)}`);













import "dotenv/config";
import { hybridSearch } from "./services/retrieval.service.js"; // adjust to actual path
import { rerankChunks } from "./services/rerank.service.js";
import { expandContext } from "./services/context-expansion.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const query = "What routes does this API expose?"; // swap for a real question against your test repo
console.log(query)
const retrieved = await hybridSearch(projectId, query, 5);
const reranked = await rerankChunks(query, retrieved, 5);
const expanded = await expandContext(reranked, projectId);

console.log(`\n${expanded.length} chunks in final context:\n`);

for (const chunk of expanded) {
    console.log("─".repeat(60));
    console.log(`[${chunk.source}${chunk.relationshipType ? ` / ${chunk.relationshipDirection} ${chunk.relationshipType}` : ""}]`);
    console.log(`${chunk.path} :: ${chunk.name ?? "(unnamed)"} (${chunk.type}, L${chunk.startLine}-${chunk.endLine})`);
    if (chunk.relevanceScore !== undefined) console.log(`relevanceScore: ${chunk.relevanceScore}`);
    console.log(`content length: ${chunk.content.length} chars`);
    console.log(chunk.content.slice(0, 200) + (chunk.content.length > 200 ? "..." : ""));
    if (chunk.context) console.log(`context: ${chunk.context}`);
}





// Straightforward retrieval (should work well already)
// "How does GitHub OAuth work in this repo?" — you've already run this one
// "What happens when a user connects their GitHub account?"
// "How is the JWT state token used during OAuth?"
// Multi-hop, tests whether graph expansion actually helps
// 4. "What happens if the GitHub access token expires?" — should pull in refreshGitHubAccessToken, which isn't in your top-5 semantic/keyword hits directly, only reachable via graph
// 5. "What does connectRepository depend on to work?" — direct test of outgoing calls + imports resolution
// 6. "What would break if I changed the signature of getGitHubAccount?" — direct test of incoming calls (who calls this)
// Cross-file / structural understanding
// 7. "Walk me through the full flow from OAuth callback to storing the GitHub account in the database."
// 8. "Where is authMiddleware used, and what does it protect?"
// Edge cases worth knowing the failure mode for, not just the happy path
// 9. "What routes does this API expose?" — tests the gap you already flagged (route path/method not captured in chunk metadata); expect the answer to be vague or wrong here, which confirms the known limitation rather than surprising you
// 10. "What npm packages does this project use?" — tests the deferred package.json gap; expect it to either hallucinate from import lines it can still see in retrieval seeds, or admit it doesn't know — worth seeing which
// 11. "How does user authentication work in the frontend?" — tests whether retrieval correctly returns nothing useful or something wrong, since your test corpus and this query are backend-oauth-heavy; a good failure here is the system saying "I don't have enough context" rather than confidently answering from unrelated chunks
// 12. A completely unrelated question, e.g. "What testing framework does this project use?" — if there's no test framework in the ingested repo, this checks whether generateAnswer correctly says "I don't see that in the available context" instead of fabricating an answer