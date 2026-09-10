import { application } from "express";
import type { CodeChunk } from "./chunking.service.js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-code-3";
const BATCH_SIZE = 12; // keeps each request comfortably under 10K tokens/min on the free tier
const DELAY_BETWEEN_BATCHES_MS = 21_000; // just over 20s so we stay under 3 requests/minute

type VoyageEmbeddingResponse = {
    data: { embedding: number[]; index: number }[];
};

const buildEmbeddingInput = (chunk: CodeChunk): string => {
    const header = [
        chunk.type,
        chunk.name ?? "(anonymous)",
        chunk.path,
        chunk.context,
    ].filter(Boolean).join(" | ");

    return `${header}\n\n${chunk.content}`;
};

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const embedChunks = async (
    chunks: CodeChunk[],
): Promise<{ id: string; embedding: number[] }[]> => {
    const results: { id: string; embedding: number[] }[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const inputs = batch.map(buildEmbeddingInput);

        console.log(
            `Embedding batch ${Math.floor(i / BATCH_SIZE) + 1} ` +
            `of ${Math.ceil(chunks.length / BATCH_SIZE)} ` +
            `(${batch.length} chunks)...`,
        );

        const response = await fetch(VOYAGE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
            },
            body: JSON.stringify({
                input: inputs,
                model: VOYAGE_MODEL,
                input_type: "document",
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Voyage embedding request failed: ${response.status} ${errorText}`);
        }

        const json: VoyageEmbeddingResponse = await response.json();

        json.data.forEach((item) => {
            const chunk = batch[item.index];

            if (!chunk) {
                throw new Error(
                    `Voyage returned an embedding for index ${item.index}, ` +
                    `but no chunk exists at that position in the batch.`,
                );
            }

            results.push({ id: chunk.id, embedding: item.embedding });
        });

        // Don't sleep after the very last batch — nothing left to wait for.
        const isLastBatch = i + BATCH_SIZE >= chunks.length;
        if (!isLastBatch) {
            await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
    }

    return results;
};




export const embedQuery = async (query: string): Promise<number[]> => {
    const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
            input: [query],
            model: VOYAGE_MODEL,
            input_type: "query", 
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voyage query embedding failed: ${response.status} ${errorText}`);
    }

    const json: VoyageEmbeddingResponse = await response.json();
    const embedding = json.data[0]?.embedding;

    if (!embedding) {
        throw new Error("Voyage returned no embedding for the query.");
    }

    return embedding;
};












// use after entering billing details for voyage application over at https://dashboard.voyageai.com/organization/billing
// //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// import type { CodeChunk } from "./chunking.service.js";

// const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
// const VOYAGE_MODEL = "voyage-code-3";
// const BATCH_SIZE = 100; // keep batches modest; stay well under any request-size limits

// type VoyageEmbeddingResponse = {
//     data: { embedding: number[]; index: number }[];
// };

// const buildEmbeddingInput = (chunk: CodeChunk): string => {
//     const header = [
//         chunk.type,
//         chunk.name ?? "(anonymous)",
//         chunk.path,
//         chunk.context,
//     ].filter(Boolean).join(" | ");

//     return `${header}\n\n${chunk.content}`;
// };

// export const embedChunks = async (
//     chunks: CodeChunk[],
// ): Promise<{ id: string; embedding: number[] }[]> => {
//     const results: { id: string; embedding: number[] }[] = [];

//     for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
//         const batch = chunks.slice(i, i + BATCH_SIZE);
//         const inputs = batch.map(buildEmbeddingInput);

//         const response = await fetch(VOYAGE_API_URL, {
//             method: "POST",
//             headers: {
//                 "Content-Type": "application/json",
//                 "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
//             },
//             body: JSON.stringify({
//                 input: inputs,
//                 model: VOYAGE_MODEL,
//                 input_type: "document",
//             }),
//         });

//         if (!response.ok) {
//             const errorText = await response.text();
//             throw new Error(`Voyage embedding request failed: ${response.status} ${errorText}`);
//         }

//         const json: VoyageEmbeddingResponse = await response.json();

//         json.data.forEach((item) => {
//             results.push({ id: batch[item.index].id, embedding: item.embedding });
//         });
//     }

//     return results;
// };