import express from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth.middleware.js";
import { createProject, getProjects, getProjectById, deleteProject } from "../services/project.service.js";

const router = express.Router();

router.post("/", authMiddleware, async (req: AuthRequest, res) => {
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
            error: "Project name is required",
        });
    }

    const project = await createProject(
        req.userId!,
        name.trim(),
        description,
    );

    res.status(201).json(project);
});

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
    const projects = await getProjects(req.userId!);

    res.json(projects);
});


router.get(
    "/:projectId",
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

        const project = await getProjectById(
            projectId,
            req.userId,
        );

        if (!project) {
            return res.status(404).json({
                error: "Project not found",
            });
        }

        res.json(project);
    },
);

router.delete(
    "/:projectId",
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

        const project = await deleteProject(
            projectId,
            req.userId,
        );

        if (!project) {
            return res.status(404).json({
                error: "Project not found",
            });
        }

        return res.status(204).send();
    },
);

export default router;