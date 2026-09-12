import { prisma } from "../lib/prisma.js";
import express from "express";

import {
    authMiddleware,
    type AuthRequest,
} from "../middleware/auth.middleware.js";

import {
    createGitHubState,
    exchangeGitHubCode,
    getGitHubAuthorizationUrl,
    verifyGitHubState,
    getGitHubUser,
    getGitHubRepositories,
    getGitHubAccount,
    refreshGitHubAccessToken,
} from "../services/github.service.js";

import { ingestRepository } from "../services/repository-ingestion.service.js";
import { analyzeRepositoryFile } from "../services/code-parser.service.js";

const router = express.Router();

router.get("/connect", authMiddleware, (req: AuthRequest, res) => {
    if (!req.userId) {
        return res.status(401).json({
            error: "Authentication required",
        });
    }

    const returnTo =
        typeof req.query.returnTo === "string"
            ? req.query.returnTo
            : "/";

    const state = createGitHubState(
        req.userId,
        returnTo,
    );

    const authorizationUrl = getGitHubAuthorizationUrl(state);

    res.json({
        authorizationUrl,
    });
});

router.get("/callback", async (req, res) => {
    console.log("🔥 GITHUB CALLBACK HIT");
    console.log("Query:", req.query);

    const { code, state, error } = req.query;

    if (error) {
        console.log("❌ GitHub OAuth error:", error);

        return res.status(400).json({
            error: "GitHub authorization was denied",
        });
    }

    if (typeof code !== "string" || typeof state !== "string") {
        console.log("❌ Missing code or state");

        return res.status(400).json({
            error: "Missing GitHub authorization code or state",
        });
    }

    console.log("✅ Code received");
    console.log("State received");

    let decodedState: {
        userId: string;
        returnTo: string;
        nonce: string;
    };
    try {
        decodedState = verifyGitHubState(state);

        console.log(
            "✅ State verified for DevPilot user:",
            decodedState.userId,
        );
    } catch (error) {
        console.error("❌ State verification failed:", error);

        return res.status(400).json({
            error: "Invalid or expired GitHub authorization state",
        });
    }

    try {
        console.log("🔄 Exchanging GitHub code...");

        const tokenResponse = await exchangeGitHubCode(code);

        console.log("GitHub token response:", {
            hasAccessToken: !!tokenResponse.access_token,
            hasRefreshToken: !!tokenResponse.refresh_token,
            expiresIn: tokenResponse.expires_in,
            refreshTokenExpiresIn: tokenResponse.refresh_token_expires_in,
            error: tokenResponse.error,
            errorDescription: tokenResponse.error_description,
        });

        if (!tokenResponse.access_token) {
            return res.status(400).json({
                error:
                    tokenResponse.error_description ??
                    "GitHub did not return an access token",
            });
        }

        console.log("🔄 Fetching GitHub user...");

        const githubUser = await getGitHubUser(
            tokenResponse.access_token,
        );

        console.log("✅ GitHub user:", {
            id: githubUser.id,
            login: githubUser.login,
        });

        console.log("💾 Saving GitHub account...");

        const githubAccount = await prisma.gitHubAccount.upsert({
            where: {
                userId: decodedState.userId,
            },

            update: {
                githubId: String(githubUser.id),
                githubLogin: githubUser.login,
                accessToken: tokenResponse.access_token,

                ...(tokenResponse.refresh_token && {
                    refreshToken: tokenResponse.refresh_token,
                }),

                ...(tokenResponse.expires_in && {
                    accessTokenExpiresAt: new Date(
                        Date.now() + tokenResponse.expires_in * 1000,
                    ),
                }),

                ...(tokenResponse.refresh_token_expires_in && {
                    refreshTokenExpiresAt: new Date(
                        Date.now() +
                        tokenResponse.refresh_token_expires_in * 1000,
                    ),
                }),
            },

            create: {
                userId: decodedState.userId,
                githubId: String(githubUser.id),
                githubLogin: githubUser.login,
                accessToken: tokenResponse.access_token,

                ...(tokenResponse.refresh_token && {
                    refreshToken: tokenResponse.refresh_token,
                }),

                ...(tokenResponse.expires_in && {
                    accessTokenExpiresAt: new Date(
                        Date.now() + tokenResponse.expires_in * 1000,
                    ),
                }),

                ...(tokenResponse.refresh_token_expires_in && {
                    refreshTokenExpiresAt: new Date(
                        Date.now() +
                        tokenResponse.refresh_token_expires_in * 1000,
                    ),
                }),
            },
        });

        console.log("✅ GitHub account saved:", {
            id: githubAccount.id,
            login: githubAccount.githubLogin,
        });

        return res.redirect(
            `http://localhost:5173${decodedState.returnTo}`,
        );
    } catch (error) {
        console.error("❌ GitHub callback error:", error);

        return res.status(500).json({
            error: "GitHub authorization failed",
        });
    }
});


router.get(
    "/repositories",
    authMiddleware,
    async (req: AuthRequest, res) => {
        if (!req.userId) {
            return res.status(401).json({
                error: "Authentication required",
            });
        }

        try {
            const githubAccount =
                await prisma.gitHubAccount.findUnique({
                    where: {
                        userId: req.userId,
                    },
                });

            if (!githubAccount) {
                return res.status(404).json({
                    error: "GitHub account is not connected",
                });
            }

            console.log("🔑 GitHub account:", {
                login: githubAccount.githubLogin,
                hasAccessToken: !!githubAccount.accessToken,
                hasRefreshToken: !!githubAccount.refreshToken,
                accessTokenExpiresAt:
                    githubAccount.accessTokenExpiresAt,
                refreshTokenExpiresAt:
                    githubAccount.refreshTokenExpiresAt,
            });

            let accessToken = githubAccount.accessToken;

            console.log("🕐 Token expiry check:", {
                expiresAt: githubAccount.accessTokenExpiresAt,
                now: new Date(),
                expired:
                    githubAccount.accessTokenExpiresAt &&
                    githubAccount.accessTokenExpiresAt <= new Date(),
            });

            // Refresh the access token if it has expired
            if (
                githubAccount.accessTokenExpiresAt &&
                githubAccount.accessTokenExpiresAt <= new Date()
            ) {
                console.log("⏰ GitHub access token expired");

                if (!githubAccount.refreshToken) {
                    console.log(
                        "❌ No GitHub refresh token available",
                    );

                    return res.status(401).json({
                        error:
                            "GitHub connection expired. Please reconnect GitHub.",
                    });
                }

                console.log(
                    "🔄 Refreshing GitHub access token...",
                );

                const tokenResponse =
                    await refreshGitHubAccessToken(
                        githubAccount.refreshToken,
                    );

                console.log("GitHub refresh response:", {
                    hasAccessToken:
                        !!tokenResponse.access_token,
                    hasRefreshToken:
                        !!tokenResponse.refresh_token,
                    expiresIn:
                        tokenResponse.expires_in,
                    refreshTokenExpiresIn:
                        tokenResponse.refresh_token_expires_in,
                    error:
                        tokenResponse.error,
                    errorDescription:
                        tokenResponse.error_description,
                });

                if (!tokenResponse.access_token) {
                    console.log(
                        "❌ GitHub token refresh failed",
                    );

                    return res.status(401).json({
                        error:
                            "GitHub connection expired. Please reconnect GitHub.",
                    });
                }

                accessToken =
                    tokenResponse.access_token;

                await prisma.gitHubAccount.update({
                    where: {
                        userId: req.userId,
                    },

                    data: {
                        accessToken:
                            tokenResponse.access_token,

                        ...(tokenResponse.refresh_token && {
                            refreshToken:
                                tokenResponse.refresh_token,
                        }),

                        ...(tokenResponse.expires_in && {
                            accessTokenExpiresAt:
                                new Date(
                                    Date.now() +
                                    tokenResponse.expires_in *
                                    1000,
                                ),
                        }),

                        ...(tokenResponse.refresh_token_expires_in && {
                            refreshTokenExpiresAt:
                                new Date(
                                    Date.now() +
                                    tokenResponse.refresh_token_expires_in *
                                    1000,
                                ),
                        }),
                    },
                });

                console.log(
                    "✅ GitHub access token refreshed",
                );
            }

            // Fetch repositories from GitHub
            const repositories =
                await getGitHubRepositories(
                    accessToken,
                );

            return res.json({
                repositories: repositories.map(
                    (repository) => ({
                        id: repository.id,
                        name: repository.name,
                        fullName:
                            repository.full_name,
                        owner:
                            repository.owner.login,
                        url:
                            repository.html_url,
                        defaultBranch:
                            repository.default_branch,
                        private:
                            repository.private,
                    }),
                ),
            });
        } catch (error) {

            console.error("GitHub repositories error:", error);

            if (
                error instanceof Error &&
                error.message === "GitHub authentication failed"
            ) {
                return res.status(401).json({
                    error: "GitHub connection expired. Please reconnect GitHub.",
                });
            }

            return res.status(500).json({
                error: "Failed to fetch GitHub repositories",
            });
        }
    },
);


router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.userId) {
        return res.status(401).json({
            error: "Authentication required",
        });
    }

    const account = await getGitHubAccount(req.userId);

    return res.json({
        connected: !!account,
        account: account
            ? {
                login: account.githubLogin,
            }
            : null,
    });
});


router.post(
    "/ingest/:projectId",
    authMiddleware,
    async (req: AuthRequest, res) => {
        if (!req.userId) {
            return res.status(401).json({
                error: "Authentication required",
            });
        }

        const { projectId } = req.params;

        if (typeof projectId !== "string") {
            return res.status(400).json({
                error: "Invalid project ID",
            });
        }

        try {
            const files = await ingestRepository(
                projectId,
                req.userId,
            );

            const analyzedFiles = files
                .map(analyzeRepositoryFile)
                .filter(
                    (
                        file,
                    ): file is NonNullable<typeof file> =>
                        file !== null,
                );

            return res.json({
                fileCount: files.length,
                analyzedFileCount: analyzedFiles.length,
                files: analyzedFiles,
            });
        } catch (error) {
            console.error(
                "Repository ingestion error:",
                error,
            );

            if (
                error instanceof Error &&
                error.message === "Project not found"
            ) {
                return res.status(404).json({
                    error: "Project not found",
                });
            }

            if (
                error instanceof Error &&
                error.message === "Repository not connected"
            ) {
                return res.status(404).json({
                    error: "Repository not connected",
                });
            }

            if (
                error instanceof Error &&
                error.message ===
                "GitHub account is not connected"
            ) {
                return res.status(404).json({
                    error: "GitHub account is not connected",
                });
            }

            if (
                error instanceof Error &&
                error.message ===
                "GitHub authentication failed"
            ) {
                return res.status(401).json({
                    error:
                        "GitHub connection expired. Please reconnect GitHub.",
                });
            }

            return res.status(500).json({
                error: "Failed to ingest repository",
            });
        }
    },
);

export default router;