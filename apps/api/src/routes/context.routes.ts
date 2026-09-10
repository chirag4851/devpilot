import express from "express";
import {
    authMiddleware,
    type AuthRequest,
} from "../middleware/auth.middleware.js";
import { verifyProjectOwnership } from "../services/project.service.js";
import { hybridSearch } from "../services/retrieval.service.js"; // confirm actual path
import { rerankChunks } from "../services/rerank.service.js";
import { expandContext } from "../services/context-expansion.service.js";

const router = express.Router();

// POST /api/context
// Body: { projectId: string, query: string, limit?: number }
// Runs the full RAG pipeline (hybridSearch -> rerankChunks -> expandContext)
// and returns the final ExpandedChunk[]. Intended to be called by the
// FastAPI/LangGraph agent as its RAG tool, forwarding the same JWT the
// end user is already authenticated with.
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.userId) {
        return res.status(401).json({
            error: "Authentication required",
        });
    }

    const { projectId, query, limit } = req.body;

    if (typeof projectId !== "string") {
        return res.status(400).json({
            error: "Invalid project ID",
        });
    }

    if (!query || typeof query !== "string") {
        return res.status(400).json({
            error: "query is required",
        });
    }

    const project = await verifyProjectOwnership(projectId, req.userId);

    if (!project) {
        return res.status(403).json({
            error: "You do not have access to this project",
        });
    }

    const searchLimit = typeof limit === "number" && limit > 0 ? limit : 5;

    try {
        const retrieved = await hybridSearch(projectId, query, searchLimit);
        const reranked = await rerankChunks(query, retrieved, searchLimit);
        const expanded = await expandContext(reranked, projectId);

        return res.json({ chunks: expanded });
    } catch (error) {
        console.error("Context pipeline error:", error);

        return res.status(500).json({
            error: "Failed to build context",
        });
    }
});

export default router;