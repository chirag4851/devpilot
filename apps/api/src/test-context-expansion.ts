import "dotenv/config";
import { ingestRepository } from "./services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./services/code-parser.service.js";
import { createCodeChunks } from "./services/chunking.service.js";
import { buildFunctionNameIndex, extractImportEdges, extractCallEdges } from "./services/relationship.service.js";
import { storeRelationships } from "./services/relationship-storage.service.js";
import { expandContext, type ExpandedChunk } from "./services/context-expansion.service.js";
import type { RerankedChunk } from "./services/rerank.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const userId = "095fe161-9ebc-49e9-807e-5aab8f9afc87";

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
    console.log(`  ✓ ${message}`);
}

// ---- Setup: rebuild chunks + edges (relationships already verified in test-relationships.ts) ----
const files = await ingestRepository(projectId, userId);
const analyzedFiles = files.map(analyzeRepositoryFile).filter((f): f is NonNullable<typeof f> => f !== null);
const allChunks = analyzedFiles.flatMap((file) =>
    createCodeChunks(
        { path: file.path, sha: file.sha, language: file.language, content: files.find((o) => o.path === file.path)!.content },
        file.structure,
    ),
);

const nameIndex = buildFunctionNameIndex(allChunks);
const knownPaths = new Set(allChunks.map((c) => c.path));

const allEdges = allChunks.flatMap((chunk) => {
    if (chunk.type === "imports") return extractImportEdges(chunk, projectId, knownPaths);
    if (chunk.type === "function") return extractCallEdges(chunk, nameIndex, projectId);
    return [];
});

await storeRelationships(allEdges);

// Pick a seed chunk that we know has all three relationship types available:
// something with an outgoing call, something that calls it (incoming), and
// lives in a file with an import chunk. connectRepository fits per earlier testing.
const seedFunctionChunk = allChunks.find((c) => c.type === "function" && c.name === "connectRepository");
assert(!!seedFunctionChunk, "seed function chunk (connectRepository) exists in this repo");

const seedRerankedChunk: RerankedChunk = {
    id: seedFunctionChunk.id,
    path: seedFunctionChunk.path,
    type: seedFunctionChunk.type,
    name: seedFunctionChunk.name,
    startLine: seedFunctionChunk.startLine,
    endLine: seedFunctionChunk.endLine,
    content: seedFunctionChunk.content,
    context: seedFunctionChunk.context ?? null,
    parentCall: seedFunctionChunk.parentCall ?? null,
    distance: 0,
    relevanceScore: 0.93,
};

console.log(`Setup: seed = ${seedRerankedChunk.name} (${seedRerankedChunk.id.slice(0, 8)})\n`);

// ============================================================
// PHASE 1: Seed preservation
// ============================================================
console.log("PHASE 1: Seed preservation");

const baseline = await expandContext([seedRerankedChunk], projectId);
const seedInOutput = baseline.find((c) => c.id === seedRerankedChunk.id);

assert(!!seedInOutput, "reranked chunks remain in expansion output");
assert(
    seedInOutput.source === "retrieval" && seedInOutput.relevanceScore === seedRerankedChunk.relevanceScore,
    "retrieval metadata preserved (source + relevanceScore)",
);

console.log();

// ============================================================
// PHASE 2: Graph expansion
// ============================================================
console.log("PHASE 2: Graph expansion");

const graphChunks = baseline.filter((c) => c.source === "graph");
assert(graphChunks.length > 0, "graph produced at least one neighbor for this seed");

assert(
    graphChunks.some((c) => c.relationshipType === "calls" && c.relationshipDirection === "outgoing"),
    "outgoing neighbors added (calls, outgoing)",
);
assert(
    graphChunks.some((c) => c.relationshipType === "calls" && c.relationshipDirection === "incoming"),
    "incoming neighbors added (calls, incoming)",
);
assert(
    graphChunks.some((c) => c.relationshipType === "imports"),
    "imported chunks added",
);

console.log();

// ============================================================
// PHASE 3: Deduplication
// ============================================================
console.log("PHASE 3: Deduplication");

const ids = baseline.map((c) => c.id);
assert(new Set(ids).size === ids.length, "no duplicate IDs");

console.log();

// ============================================================
// PHASE 4: Context limit
// ============================================================
console.log("PHASE 4: Context limit");

const capped = await expandContext([seedRerankedChunk], projectId, { maxTotalChunks: 2 });
assert(capped.length <= 2, "maxTotalChunks respected");
assert(capped[0]?.id === seedRerankedChunk.id, "seed chunk survives the cap (retrieval chunks prioritized over graph)");

console.log();

// ============================================================
// PHASE 5: Expansion options
// ============================================================
console.log("PHASE 5: Expansion options");

const noOutgoing = await expandContext([seedRerankedChunk], projectId, { includeOutgoing: false });
assert(
    !noOutgoing.some((c) => c.relationshipType === "calls" && c.relationshipDirection === "outgoing"),
    "outgoing can be disabled",
);

const noIncoming = await expandContext([seedRerankedChunk], projectId, { includeIncoming: false });
assert(
    !noIncoming.some((c) => c.relationshipType === "calls" && c.relationshipDirection === "incoming"),
    "incoming can be disabled",
);

const noImports = await expandContext([seedRerankedChunk], projectId, { includeImports: false });
assert(
    !noImports.some((c) => c.relationshipType === "imports"),
    "imports can be disabled",
);

console.log("\nAll phases passed.");