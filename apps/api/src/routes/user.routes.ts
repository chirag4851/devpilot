import express from "express";
import { createUser, getUsers, loginUser, getUserById } from "../services/user.service.js";

import {
    authMiddleware,
    type AuthRequest,
} from "../middleware/auth.middleware.js";


const router = express.Router();

// router.get("/", async (req, res) => {
//     const users = await getUsers();
//     res.json(users);
// });

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.userId) {
        return res.status(401).json({
            error: "Authentication required",
        });
    }

    const user = await getUserById(req.userId);

    if (!user) {
        return res.status(404).json({
            error: "User not found",
        });
    }

    res.json({
        user,
    });
});

router.post("/", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            !name ||
            typeof name !== "string" ||
            !name.trim()
        ) {
            return res.status(400).json({
                error: "Name is required",
            });
        }

        if (
            !email ||
            typeof email !== "string" ||
            !email.trim()
        ) {
            return res.status(400).json({
                error: "Email is required",
            });
        }

        if (
            !password ||
            typeof password !== "string" ||
            password.length < 6
        ) {
            return res.status(400).json({
                error: "Password must be at least 6 characters",
            });
        }

        const user = await createUser(
            name.trim(),
            email.trim().toLowerCase(),
            password,
        );

        return res.status(201).json(user);
    } catch (error) {
        console.error("Create user error:", error);

        if (
            error instanceof Error &&
            error.message.includes("Unique constraint")
        ) {
            return res.status(409).json({
                error: "An account with this email already exists",
            });
        }

        return res.status(500).json({
            error: "Failed to create account",
        });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            !email ||
            typeof email !== "string" ||
            !password ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                error: "Email and password are required",
            });
        }

        const result = await loginUser(
            email.trim().toLowerCase(),
            password,
        );

        return res.json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Invalid email or password"
        ) {
            return res.status(401).json({
                error: "Invalid email or password",
            });
        }

        console.error("Login error:", error);

        return res.status(500).json({
            error: "Failed to login",
        });
    }
});

export default router;