import express from "express";
import {
    authMiddleware,
    type AuthRequest,
} from "../middleware/auth.middleware.js";
import { verifyProjectOwnership } from "../services/project.service.js";
import { connectRepository,getProjectRepository } from "../services/repository.service.js";

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

export default router;