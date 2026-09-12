import "dotenv/config";
import { ingestRepository } from "./services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./services/code-parser.service.js";
import { createCodeChunks } from "./services/chunking.service.js";
import { buildFunctionNameIndex, extractImportEdges, extractCallEdges } from "./services/relationship.service.js";
import { storeRelationships } from "./services/relationship-storage.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const userId = "095fe161-9ebc-49e9-807e-5aab8f9afc87";

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
    if (chunk.type === "imports") {
        return extractImportEdges(chunk, projectId, knownPaths);
    }
    if (chunk.type === "function") {
        return extractCallEdges(chunk, nameIndex, projectId);
    }
    return [];
});

await storeRelationships(allEdges);

console.log("Edges extracted and stored:", allEdges.length);