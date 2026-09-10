import "dotenv/config";
import { hybridSearch } from "./services/retrieval.service.js";
import { rerankChunks } from "./services/rerank.service.js";

const projectId = "f4978b77-bca6-4e1b-8a88-6007eb4b492a";
const query = "where is the JWT or session token verified";

const candidates = await hybridSearch(projectId, query, 15);
const reranked = await rerankChunks(query, candidates, 5);

for (const r of reranked) {
    console.log(
        JSON.stringify(
            {
                id: r.id,
                path: r.path,
                type: r.type,
                name: r.name,
                startLine: r.startLine,
                endLine: r.endLine,
                relevanceScore: r.relevanceScore,
                distance: r.distance,
            },
            null,
            2,
        ),
    );
}