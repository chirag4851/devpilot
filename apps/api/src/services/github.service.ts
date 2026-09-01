import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;

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