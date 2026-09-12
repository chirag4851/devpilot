import "dotenv/config";
import { prisma } from "./lib/prisma.js";
import { ingestRepository } from "./services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./services/code-parser.service.js";
import { createCodeChunks } from "./services/chunking.service.js";
import { embedChunks } from "./services/embedding.service.js";
import { storeChunkEmbeddings } from "./services/vector-storage.service.js";
import {
    buildFunctionNameIndex,
    extractImportEdges,
    extractCallEdges,
} from "./services/relationship.service.js";
import { storeRelationships } from "./services/relationship-storage.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const userId = "095fe161-9ebc-49e9-807e-5aab8f9afc87";

console.log("Step 1: Clearing existing chunks + relationships for this project...");
await prisma.$executeRaw`DELETE FROM "CodeRelationship" WHERE "projectId" = ${projectId}`;
await prisma.$executeRaw`DELETE FROM "CodeChunk" WHERE "projectId" = ${projectId}`;

console.log("Step 2: Ingesting repository from GitHub...");
const files = await ingestRepository(projectId, userId);
console.log(`  Fetched ${files.length} files`);

const analyzedFiles = files
    .map(analyzeRepositoryFile)
    .filter((f): f is NonNullable<typeof f> => f !== null);
console.log(`  Parsed ${analyzedFiles.length} files`);

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
console.log(`  Generated ${allChunks.length} chunks`);

console.log("\nStep 3: Embedding chunks (this will take a while on the free-tier rate limit)...");
const embeddings = await embedChunks(allChunks);
console.log(`  Embedded ${embeddings.length} chunks`);

console.log("\nStep 4: Storing chunks + embeddings...");
await storeChunkEmbeddings(projectId, allChunks, embeddings);
console.log("  Stored.");

console.log("\nStep 5: Extracting relationships (calls + imports)...");
const nameIndex = buildFunctionNameIndex(allChunks);
const knownPaths = new Set(allChunks.map((c) => c.path));

const allEdges = allChunks.flatMap((chunk) => {
    if (chunk.type === "imports") return extractImportEdges(chunk, projectId, knownPaths);
    if (chunk.type === "function") return extractCallEdges(chunk, nameIndex, projectId);
    return [];
});
console.log(`  Extracted ${allEdges.length} edges`);

console.log("\nStep 6: Storing relationships...");
await storeRelationships(allEdges);
console.log("  Stored.");

console.log(`\nDone. ${allChunks.length} chunks, ${allEdges.length} edges, fully resynced from current GitHub main.`);
await prisma.$disconnect();