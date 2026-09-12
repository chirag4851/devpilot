import { prisma } from "../lib/prisma.js";
import { embedQuery } from "./embedding.service.js";


const RRF_K = 60;

export type RetrievedChunk = {
    id: string;
    path: string;
    type: string;
    name: string | null;
    startLine: number;
    endLine: number;
    content: string;
    context: string | null;
    parentCall: string | null;
    distance: number;
};

export type KeywordMatch = {
    id: string;
    rank: number;
};

export const searchChunks = async (
    projectId: string,
    query: string,
    limit: number = 5,
): Promise<RetrievedChunk[]> => {
    const queryEmbedding = await embedQuery(query);
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    const results = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
        id,
        path,
        type,
        name,
        "startLine",
        "endLine",
        content,
        context,
        "parentCall",
        embedding <=> ${vectorLiteral}::vector AS distance
    FROM "CodeChunk"
    WHERE "projectId" = ${projectId}
    ORDER BY distance
    LIMIT ${limit}
`;

    return results;
};



const keywordSearch = async (
    projectId: string,
    query: string,
    limit: number = 20,
): Promise<KeywordMatch[]> => {
    const results = await prisma.$queryRaw<KeywordMatch[]>`
        SELECT
            id,
            ts_rank(search_vector, plainto_tsquery('english', ${query})) AS rank
        FROM "CodeChunk"
        WHERE "projectId" = ${projectId}
          AND search_vector @@ plainto_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT ${limit}
    `;

    return results;
};



export const hybridSearch = async (
    projectId: string,
    query: string,
    limit: number = 5,
): Promise<RetrievedChunk[]> => {
    const [semanticResults, keywordResults] = await Promise.all([
        searchChunks(projectId, query, 20), // wider net than final limit
        keywordSearch(projectId, query, 20),
    ]);

    console.log("Semantic ranks:", semanticResults.map((c, i) => `${i}: ${c.id.slice(0, 8)} (${c.name ?? c.type})`));
    console.log("Keyword ranks:", keywordResults.map((m, i) => `${i}: ${m.id.slice(0, 8)}`));


    const scores = new Map<string, number>();

    semanticResults.forEach((chunk, rank) => {
        scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (RRF_K + rank + 1));
    });

    keywordResults.forEach((match, rank) => {
        scores.set(match.id, (scores.get(match.id) ?? 0) + 1 / (RRF_K + rank + 1));
    });

    const chunkById = new Map(semanticResults.map((c) => [c.id, c]));

    const topIds = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

    // A chunk might have matched via keyword search only, and not be in
    // semanticResults' top 20 — fetch anything missing by id.
    const missingIds = topIds.filter((id) => !chunkById.has(id));
    if (missingIds.length > 0) {
        const missingChunks = await prisma.$queryRaw<RetrievedChunk[]>`
            SELECT id, path, type, name, "startLine", "endLine", content, context, "parentCall", 0 AS distance
            FROM "CodeChunk"
            WHERE id = ANY(${missingIds})
        `;
        missingChunks.forEach((c) => chunkById.set(c.id, c));
    }

    return topIds.map((id) => chunkById.get(id)!);
};