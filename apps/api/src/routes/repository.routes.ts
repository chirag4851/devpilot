import express from "express";
import {
    authMiddleware,
    type AuthRequest,
} from "../middleware/auth.middleware.js";
import { verifyProjectOwnership } from "../services/project.service.js";
import { connectRepository,getProjectRepository} from "../services/repository.service.js";
import { getGitHubBranchSha, getValidGitHubAccessToken } from "../services/github.service.js";
import {resyncProjectRepository} from "../services/resync.service.js"

const router = express.Router();

router.get(
    "/:projectId/repository",
    authMiddleware,
    async (req: AuthRequest, res) => {
        const { projectId } = req.params;

        if (typeof projectId !== "string") {
            return res.status(400).json({
                error: "Invalid project ID",
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                error: "Authentication required",
            });
        }

        const project = await verifyProjectOwnership(
            projectId,
            req.userId,
        );

        if (!project) {
            return res.status(404).json({
                error: "Project not found",
            });
        }

        const repository = await getProjectRepository(projectId);

        return res.json(repository);
    },
);

router.post(
    "/:projectId/repository",
    authMiddleware,
    async (req: AuthRequest, res) => {
        const { projectId } = req.params;

        if (typeof projectId !== "string") {
            return res.status(400).json({
                error: "Invalid project ID",
            });
        }

        const { githubRepositoryId } = req.body;

        if (
            typeof githubRepositoryId !== "number" ||
            !Number.isInteger(githubRepositoryId)
        ) {
            return res.status(400).json({
                error: "githubRepositoryId must be an integer",
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                error: "Authentication required",
            });
        }

        const project = await verifyProjectOwnership(
            projectId,
            req.userId,
        );

        if (!project) {
            return res.status(403).json({
                error: "You do not have access to this project",
            });
        }

        try {
            const repository = await connectRepository(
                projectId,
                req.userId,
                githubRepositoryId,
            );

            return res.status(201).json(repository);
        } catch (error) {
            console.error("Repository connection error:", error);

            if (
                error instanceof Error &&
                error.message === "GitHub account is not connected"
            ) {
                return res.status(400).json({
                    error: error.message,
                });
            }

            if (
                error instanceof Error &&
                error.message.includes("not accessible")
            ) {
                return res.status(403).json({
                    error: error.message,
                });
            }

            return res.status(500).json({
                error: "Failed to connect repository",
            });
        }
    },
);


router.get(
    "/:projectId/repository/status",
    authMiddleware,
    async (req: AuthRequest, res) => {
        const { projectId } = req.params;

        if (typeof projectId !== "string") {
            return res.status(400).json({ error: "Invalid project ID" });
        }
        if (!req.userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const project = await verifyProjectOwnership(projectId, req.userId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        const repository = await getProjectRepository(projectId);
        if (!repository) {
            return res.status(404).json({ error: "Repository not connected" });
        }

        try {
            const accessToken = await getValidGitHubAccessToken(req.userId);
            const currentSha = await getGitHubBranchSha(
                accessToken,
                repository.owner,
                repository.name,
                repository.defaultBranch,
            );

            return res.json({
                hasUpdates: repository.lastIngestedSha !== null && repository.lastIngestedSha !== currentSha,
                lastIngestedSha: repository.lastIngestedSha,
                currentSha,
                lastProcessedAt: repository.lastProcessedAt,
                status: repository.status,
            });
        } catch (error) {
            console.error("Repository status check error:", error);
            return res.status(500).json({ error: "Failed to check repository status" });
        }
    },
);



router.post(
    "/:projectId/repository/resync",
    authMiddleware,
    async (req: AuthRequest, res) => {
        const { projectId } = req.params;

        if (typeof projectId !== "string") {
            return res.status(400).json({ error: "Invalid project ID" });
        }
        if (!req.userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const project = await verifyProjectOwnership(projectId, req.userId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }

        try {
            const result = await resyncProjectRepository(projectId, req.userId);
            return res.json(result);
        } catch (error) {
            console.error("Repository resync error:", error);

            if (error instanceof Error && error.message === "Repository not connected") {
                return res.status(404).json({ error: error.message });
            }

            return res.status(500).json({ error: "Failed to resync repository" });
        }
    },
);
export default router;