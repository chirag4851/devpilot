import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;


const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 5 * 60 * 1000;


export const createGitHubState = (
    userId: string,
    returnTo: string,
) => {
    return jwt.sign(
        {
            userId,
            returnTo,
            nonce: crypto.randomBytes(16).toString("hex"),
        },
        process.env.JWT_SECRET!,
        {
            expiresIn: "10m",
        },
    );
};

export const verifyGitHubState = (state: string) => {
    return jwt.verify(
        state,
        process.env.JWT_SECRET!,
    ) as {
        userId: string;
        returnTo: string;
        nonce: string;
    };
};

export const getGitHubAuthorizationUrl = (state: string) => {
    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: "http://localhost:5001/github/callback",
        state,
        scope: "offline_access repo",
    });

    return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
};

export const exchangeGitHubCode = async (code: string) => {
    const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
            }),
        },
    );

    if (!response.ok) {
        throw new Error("Failed to exchange GitHub authorization code");
    }

    return response.json() as Promise<{
        access_token?: string;
        token_type?: string;
        scope?: string;

        // New fields for expiring GitHub user tokens
        expires_in?: number;
        refresh_token?: string;
        refresh_token_expires_in?: number;

        error?: string;
        error_description?: string;
    }>;
};

export const refreshGitHubAccessToken = async (
    refreshToken: string,
) => {
    const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        },
    );

    if (!response.ok) {
        throw new Error("Failed to refresh GitHub access token");
    }

    return response.json() as Promise<{
        access_token?: string;
        token_type?: string;
        scope?: string;

        expires_in?: number;
        refresh_token?: string;
        refresh_token_expires_in?: number;

        error?: string;
        error_description?: string;
    }>;
};


export const getGitHubUser = async (accessToken: string) => {
    const response = await fetch("https://api.github.com/user", {
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch GitHub user");
    }

    return response.json() as Promise<{
        id: number;
        login: string;
        name: string | null;
        email: string | null;
        avatar_url: string;
        html_url: string;
    }>;
};


export const getGitHubRepositories = async (accessToken: string) => {
    const response = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100",
        {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${accessToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        },
    );

    if (!response.ok) {
        const body = await response.text();
    
        console.error(
            "GitHub API error:",
            response.status,
            response.statusText,
            body,
        );
    
        if (response.status === 401) {
            throw new Error("GitHub authentication failed");
        }
    
        throw new Error("Failed to fetch GitHub repositories");
    }

    return response.json() as Promise<
        Array<{
            id: number;
            name: string;
            full_name: string;
            html_url: string;
            default_branch: string | null;
            private: boolean;
            owner: {
                login: string;
            };
        }>
    >;
};



export const getGitHubAccount = async (userId: string) => {
    return await prisma.gitHubAccount.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
            githubId: true,
            githubLogin: true,
        },
    });
};


export const getValidGitHubAccessToken = async (
    userId: string,
) => {
    const githubAccount = await prisma.gitHubAccount.findUnique({
        where: {
            userId,
        },
    });

    if (!githubAccount) {
        throw new Error("GitHub account is not connected");
    }

    const now = Date.now();

    const expiresAt =
        githubAccount.accessTokenExpiresAt?.getTime() ?? 0;

    const tokenIsValid =
        expiresAt > now + TOKEN_EXPIRY_SAFETY_WINDOW_MS;

    if (tokenIsValid) {
        return githubAccount.accessToken;
    }

    if (!githubAccount.refreshToken) {
        throw new Error("GitHub refresh token is not available");
    }

    const refreshed = await refreshGitHubAccessToken(
        githubAccount.refreshToken,
    );

    if (!refreshed.access_token) {
        throw new Error("Failed to refresh GitHub access token");
    }

    const newAccessToken = refreshed.access_token;

    const newExpiresAt =
        refreshed.expires_in !== undefined
            ? new Date(
                  Date.now() + refreshed.expires_in * 1000,
              )
            : null;

    await prisma.gitHubAccount.update({
        where: {
            userId,
        },
        data: {
            accessToken: newAccessToken,
            accessTokenExpiresAt: newExpiresAt,
            refreshToken:
                refreshed.refresh_token ??
                githubAccount.refreshToken,
            refreshTokenExpiresAt:
                refreshed.refresh_token_expires_in !== undefined
                    ? new Date(
                          Date.now() +
                              refreshed.refresh_token_expires_in *
                                  1000,
                      )
                    : githubAccount.refreshTokenExpiresAt,
        },
    });

    return newAccessToken;
};


export const getGitHubRepositoryTree = async (
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
) => {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${accessToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        },
    );

    if (!response.ok) {
        const body = await response.text();

        console.error(
            "GitHub tree API error:",
            response.status,
            response.statusText,
            body,
        );

        if (response.status === 401) {
            throw new Error("GitHub authentication failed");
        }

        if (response.status === 404) {
            throw new Error("GitHub repository or branch not found");
        }

        throw new Error("Failed to fetch GitHub repository tree");
    }

    return response.json() as Promise<{
        sha: string;
        url: string;
        tree: Array<{
            path: string;
            mode: string;
            type: "blob" | "tree";
            sha: string;
            size?: number;
            url: string;
        }>;
        truncated: boolean;
    }>;
};


export const getGitHubFileContent = async (
    accessToken: string,
    owner: string,
    repo: string,
    sha: string,
) => {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
        {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${accessToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        },
    );

    if (!response.ok) {
        const body = await response.text();

        console.error(
            "GitHub blob API error:",
            response.status,
            response.statusText,
            body,
        );

        if (response.status === 401) {
            throw new Error("GitHub authentication failed");
        }

        if (response.status === 404) {
            throw new Error("GitHub file not found");
        }

        throw new Error("Failed to fetch GitHub file");
    }

    const data = await response.json() as {
        sha: string;
        size: number;
        content: string;
        encoding: string;
    };

    if (data.encoding !== "base64") {
        throw new Error(
            `Unsupported GitHub blob encoding: ${data.encoding}`,
        );
    }

    const content = Buffer.from(
        data.content,
        "base64",
    ).toString("utf-8");

    return {
        sha: data.sha,
        size: data.size,
        content,
    };
};