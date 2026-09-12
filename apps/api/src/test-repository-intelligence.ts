import "dotenv/config";
import { ingestRepository } from "./services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./services/code-parser.service.js";
import { createCodeChunks } from "./services/chunking.service.js";
import { embedChunks } from "./services/embedding.service.js";
import { storeChunkEmbeddings } from "./services/vector-storage.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const userId = "095fe161-9ebc-49e9-807e-5aab8f9afc87";

const files = await ingestRepository(projectId, userId);

const analyzedFiles = files
    .map(analyzeRepositoryFile)
    .filter(
        (file): file is NonNullable<typeof file> =>
            file !== null,
    );

const allChunks = analyzedFiles.flatMap((file) =>
    createCodeChunks(
        {
            path: file.path,
            sha: file.sha,
            language: file.language,
            content: files.find((original) => original.path === file.path)!.content,
        },
        file.structure,
    ),
);

// -- SECTION: Chunks Response --
// To get just the chunk info, comment out from here to the embeddings section below
// console.log("Files fetched:", files.length);
// console.log("Files parsed:", analyzedFiles.length);
// console.log("Chunks generated:", allChunks.length);

// for (const chunk of allChunks) {
//     console.log(
//         `[${chunk.id}]` +
//         `${chunk.path}:${chunk.startLine}-${chunk.endLine} ` +
//         `[${chunk.type}] ` +
//         `${chunk.name ?? ""}` +
//         `${chunk.context ? ` | context: ${chunk.context.slice(0, 100)}` : ""}` +
//         `${chunk.content ? ` | content: ${chunk.content.slice(0, 100)}` : ""}`
//     );
// }
// -- End SECTION: Chunks Response --

// -- SECTION: Embedding Response --
// To get only embeddings, comment out the chunks section above and uncomment this section

const embeddings = await embedChunks(allChunks);
console.log("Embeddings generated:", embeddings.length);
for (const embeddingData of embeddings) {
    console.log(`[${embeddingData.id}] Embedding length: ${embeddingData.embedding.length}`);
    console.log("First 5 values:", embeddingData.embedding.slice(0, 5));
}

await storeChunkEmbeddings(projectId, allChunks, embeddings);
console.log("Stored chunks in database.");