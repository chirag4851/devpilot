import { prisma } from "../lib/prisma.js";
import type { CodeChunk } from "./chunking.service.js";

export const storeChunkEmbeddings = async (
    projectId: string,
    chunks: CodeChunk[],
    embeddings: { id: string; embedding: number[] }[],
): Promise<void> => {
    const embeddingById = new Map(
        embeddings.map((e) => [e.id, e.embedding]),
    );

    for (const chunk of chunks) {
        const vector = embeddingById.get(chunk.id);

        if (!vector) {
            console.warn(`No embedding found for chunk ${chunk.id}, skipping.`);
            continue;
        }

        // pgvector expects the vector as a string like '[0.1,0.2,...]'
        const vectorLiteral = `[${vector.join(",")}]`;

        await prisma.$executeRaw`
            INSERT INTO "CodeChunk" (
                id, "projectId", path, sha, language, type, name,
                "startLine", "endLine", content, context, "parentCall", embedding
            )
            VALUES (
                ${chunk.id}, ${projectId}, ${chunk.path}, ${chunk.sha}, ${chunk.language},
                ${chunk.type}, ${chunk.name}, ${chunk.startLine}, ${chunk.endLine},
                ${chunk.content}, ${chunk.context}, ${chunk.parentCall},
                ${vectorLiteral}::vector
            )
            ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                sha = EXCLUDED.sha
        `;
    }
};