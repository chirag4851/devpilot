import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "./lib/prisma.js";
import { ingestRepository } from "./services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./services/code-parser.service.js";
import { createCodeChunks } from "./services/chunking.service.js";
import {
    buildFunctionNameIndex,
    extractImportEdges,
    extractCallEdges,
    getOutgoingRelationships,
    getImportedChunks,
} from "./services/relationship.service.js";
import { storeRelationships } from "./services/relationship-storage.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const userId = "095fe161-9ebc-49e9-807e-5aab8f9afc87";

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
    console.log(`  ✓ ${message}`);
}

// ingest pipeline
const files = await ingestRepository(projectId, userId);
const analyzedFiles = files
    .map(analyzeRepositoryFile)
    .filter((f): f is NonNullable<typeof f> => f !== null);

const allChunks = analyzedFiles.flatMap((file) =>
    createCodeChunks(
        {
            path: file.path,
            sha: file.sha,
            language: file.language,
            content: files.find((o) => o.path === file.path)!.content,
        },
        file.structure,
    ),
);

const nameIndex = buildFunctionNameIndex(allChunks);
const knownPaths = new Set(allChunks.map((c) => c.path));

const allEdges = allChunks.flatMap((chunk) => {
    if (chunk.type === "imports") {
        return extractImportEdges(chunk, projectId, knownPaths);
    }
    if (chunk.type === "function") {
        return extractCallEdges(chunk, nameIndex, projectId);
    }
    return [];
});

console.log(`Setup: ${allChunks.length} chunks, ${allEdges.length} edges extracted\n`);

// ============================================================
// PHASE 1: Extraction correctness
// ============================================================
console.log("PHASE 1: Extraction correctness");

const callEdges = allEdges.filter((e) => e.type === "calls");
const importEdges = allEdges.filter((e) => e.type === "imports");

assert(callEdges.length + importEdges.length === allEdges.length, "every edge is either calls or imports");
assert(callEdges.every((e) => e.toChunkId !== null && e.toPath === null), "call edges always resolve to a toChunkId, never a toPath");
assert(importEdges.every((e) => e.toChunkId === null && e.toPath !== null), "import edges always resolve to a toPath, never a toChunkId");
assert(callEdges.every((e) => e.fromChunkId !== e.toChunkId), "no self-referencing call edges");
assert(importEdges.every((e) => !e.toPath!.startsWith(".")), "resolved import paths are normalized, not still relative");
assert(new Set(allEdges.map((e) => e.id)).size === allEdges.length, "no duplicate edge ids in a single extraction pass");

console.log(`  (${callEdges.length} call edges, ${importEdges.length} import edges)\n`);

// ============================================================
// PHASE 2: Storage idempotency
// ============================================================
console.log("PHASE 2: Storage idempotency");

await storeRelationships(allEdges);
const countAfterFirstRun = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::int AS count FROM "CodeRelationship" WHERE "projectId" = ${projectId}
`;
const firstCount = countAfterFirstRun[0];
assert(!!firstCount, "count query returned a row");

await storeRelationships(allEdges); // re-run with identical edges, simulating a resync

const countAfterSecondRun = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::int AS count FROM "CodeRelationship" WHERE "projectId" = ${projectId}
`;
const secondCount = countAfterSecondRun[0];
assert(!!secondCount, "count query returned a row");

assert(
    Number(firstCount.count) === Number(secondCount.count),
    `row count stable across resync (${firstCount.count} both times)`,
);
assert(Number(firstCount.count) === allEdges.length, "stored row count matches extracted edge count");

console.log();

// ============================================================
// PHASE 3: Graph read correctness
// ============================================================
console.log("PHASE 3: Graph read correctness");

// --- calls direction ---
const sampleCallEdge = callEdges[0];
assert(!!sampleCallEdge, "at least one call edge exists to test against");

const outgoing = await getOutgoingRelationships(sampleCallEdge.fromChunkId);
assert(
    outgoing.some((r) => r.id === sampleCallEdge.toChunkId),
    `getOutgoingRelationships(${sampleCallEdge.fromChunkId}) includes known target ${sampleCallEdge.toChunkId}`,
);

// --- imports direction ---
const sampleImportEdge = importEdges[0];
assert(!!sampleImportEdge, "at least one import edge exists to test against");

// A single "imports" chunk can fan out to many target files — collect
// every valid toPath for this fromChunkId, not just the sampled edge's.
const validToPathsForChunk = new Set(
    importEdges
        .filter((e) => e.fromChunkId === sampleImportEdge.fromChunkId)
        .map((e) => e.toPath),
);

const imported = await getImportedChunks(sampleImportEdge.fromChunkId, projectId);
assert(imported.length > 0, `getImportedChunks resolves at least one chunk from this import chunk's targets`);
assert(
    imported.every((r) => validToPathsForChunk.has(r.path)),
    `every resolved chunk's path is a valid import target for this chunk (${[...validToPathsForChunk].join(", ")})`,
);

// --- projectId scoping: wrong projectId must return nothing ---
const scoped = await getImportedChunks(sampleImportEdge.fromChunkId, randomUUID());
assert(scoped.length === 0, "getImportedChunks returns nothing when projectId doesn't match (scoping holds)");

console.log("\nAll phases passed.");
await prisma.$disconnect();