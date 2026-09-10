import type { RerankedChunk } from "./rerank.service.js";
import {
    getOutgoingRelationships,
    getIncomingRelationships,
    getImportedChunks,
    getImportsChunkForFile,
    type RelatedChunk,
} from "./relationship.service.js";

export type ExpandedChunk = {
    id: string;
    path: string;
    type: string;
    name: string | null;
    startLine: number;
    endLine: number;
    content: string;
    context: string | null;
    parentCall: string | null;
    source: "retrieval" | "graph";
    relevanceScore?: number;
    relationshipType?: "calls" | "imports";
    relationshipDirection?: "incoming" | "outgoing";
};

type ExpansionOptions = {
    includeOutgoing?: boolean;
    includeIncoming?: boolean;
    includeImports?: boolean;
    maxTotalChunks?: number;
};

const DEFAULT_OPTIONS: Required<ExpansionOptions> = {
    includeOutgoing: true,
    includeIncoming: true,
    includeImports: true,
    maxTotalChunks: 20,
};

const toExpandedChunk = (
    related: RelatedChunk,
    relationshipType: "calls" | "imports",
    relationshipDirection: "incoming" | "outgoing",
): ExpandedChunk => ({
    id: related.id,
    path: related.path,
    type: related.type,
    name: related.name,
    startLine: related.startLine,
    endLine: related.endLine,
    content: related.content,
    context: related.context,
    parentCall: related.parentCall,
    source: "graph",
    relationshipType,
    relationshipDirection,
});

// A single (seed, relationshipType) neighbor list, consumed one item at
// a time during round-robin merging.
type NeighborQueue = {
    items: ExpandedChunk[];
    cursor: number;
};

const makeQueue = (items: ExpandedChunk[]): NeighborQueue => ({ items, cursor: 0 });

// Takes reranked chunks and pulls in their direct graph neighbors
// (calls, callers, imports) as additional context. Pure graph
// expansion only — no prompt shaping, no LLM calls.
export const expandContext = async (
    rerankedChunks: RerankedChunk[],
    projectId: string,
    options: ExpansionOptions = {},
): Promise<ExpandedChunk[]> => {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (rerankedChunks.length === 0) {
        return [];
    }

    const chunksById = new Map<string, ExpandedChunk>();

    for (const chunk of rerankedChunks) {
        chunksById.set(chunk.id, {
            id: chunk.id,
            path: chunk.path,
            type: chunk.type,
            name: chunk.name,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content,
            context: chunk.context,
            parentCall: chunk.parentCall,
            source: "retrieval",
            relevanceScore: chunk.relevanceScore,
        });
    }

    const perSeedResults = await Promise.all(
        rerankedChunks.map(async (chunk) => {
            const importsChunk = opts.includeImports
                ? await getImportsChunkForFile(chunk.path, projectId)
                : null;

            const [outgoing, incoming, imported] = await Promise.all([
                opts.includeOutgoing ? getOutgoingRelationships(chunk.id) : Promise.resolve([]),
                opts.includeIncoming ? getIncomingRelationships(chunk.id) : Promise.resolve([]),
                importsChunk ? getImportedChunks(importsChunk.id, projectId) : Promise.resolve([]),
            ]);

            return {
                outgoingQueue: makeQueue(
                    outgoing
                        .filter((r) => r.type !== "imports")
                        .map((r) => toExpandedChunk(r, r.relationshipType, "outgoing")),
                ),
                incomingQueue: makeQueue(
                    incoming
                        .filter((r) => r.type !== "imports")
                        .map((r) => toExpandedChunk(r, r.relationshipType, "incoming")),
                ),
                importedQueue: makeQueue(
                    imported
                        .filter((r) => r.type !== "imports")
                        .map((r) => toExpandedChunk(r, "imports", "outgoing")),
                ),
            };
        }),
    );

    const queues: NeighborQueue[] = perSeedResults.flatMap((r) => [
        r.outgoingQueue,
        r.incomingQueue,
        r.importedQueue,
    ]);

    let remainingBudget = opts.maxTotalChunks - chunksById.size;
    let anyQueueHadItem = remainingBudget > 0;

    while (remainingBudget > 0 && anyQueueHadItem) {
        anyQueueHadItem = false;

        for (const queue of queues) {
            if (remainingBudget <= 0) break;

            while (queue.cursor < queue.items.length) {
                const candidate = queue.items[queue.cursor];
                queue.cursor += 1;

                if (!candidate || chunksById.has(candidate.id)) {
                    continue;
                }

                chunksById.set(candidate.id, candidate);
                remainingBudget -= 1;
                anyQueueHadItem = true;
                break;
            }
        }
    }

    return [...chunksById.values()];
};