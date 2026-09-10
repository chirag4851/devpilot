import "dotenv/config";
import { ingestRepository } from "./services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./services/code-parser.service.js";
import { createCodeChunks } from "./services/chunking.service.js";

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

const routeFileChunks = allChunks.filter((c) => c.path.includes("routes") && c.type === "function");
for (const chunk of routeFileChunks) {
    console.log(`${chunk.path} L${chunk.startLine}-${chunk.endLine} name=${chunk.name} context=${chunk.context} parentCall=${chunk.parentCall}`);
}