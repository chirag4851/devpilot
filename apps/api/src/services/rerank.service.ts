import type { RetrievedChunk } from "./retrieval.service.js";

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const RERANK_MODEL = "rerank-2.5";

type VoyageRerankResponse = {
    data: { relevance_score: number; index: number }[];
};

export type RerankedChunk = RetrievedChunk & {
    relevanceScore: number;
};

export const rerankChunks = async (
    query: string,
    chunks: RetrievedChunk[],
    topN: number = 5,
): Promise<RerankedChunk[]> => {
    if (chunks.length === 0) {
        return [];
    }

    const documents = chunks.map((chunk) => chunk.content);

    const response = await fetch(VOYAGE_RERANK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
            query,
            documents,
            model: RERANK_MODEL,
            top_k: topN,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voyage rerank request failed: ${response.status} ${errorText}`);
    }

    const json: VoyageRerankResponse = await response.json();
    
    return json.data.map((item) => ({
        ...chunks[item.index]!,
        relevanceScore: item.relevance_score,
    }));
};