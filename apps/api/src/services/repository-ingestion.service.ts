import { prisma } from "../lib/prisma.js";
import {
    getGitHubRepositoryTree,
    getGitHubFileContent,
    getValidGitHubAccessToken,
} from "./github.service.js";

import { analyzeRepositoryFile } from "./code-parser.service.js";

type GitHubTreeEntry = {
    path: string;
    mode: string;
    type: "blob" | "tree";
    sha: string;
    size?: number;
    url: string;
};

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_CONCURRENT_FILES = 5;

const IGNORED_FILE_EXTENSIONS = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",
    ".tiff",
    ".mp4",
    ".mov",
    ".avi",
    ".mp3",
    ".wav",
    ".ogg",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".zip",
    ".tar",
    ".gz",
    ".pdf",
    ".svg",
];

const IGNORED_PATH_PREFIXES = [
    "node_modules/",
    ".git/",
    "dist/",
    "build/",
    ".next/",
    "coverage/",
];

const IGNORED_FILE_NAMES = [
    ".env",
];


const isBinaryContent = (content: string) => {
    return content.includes("\u0000");
};

const isIgnoredPath = (path: string) => {
    const normalizedPath = path.replace(/\\/g, "/");

    if (
        IGNORED_PATH_PREFIXES.some((prefix) =>
            normalizedPath.startsWith(prefix),
        )
    ) {
        return true;
    }

    const fileName = normalizedPath.split("/").pop();

    if (
        fileName &&
        IGNORED_FILE_NAMES.includes(fileName)
    ) {
        return true;
    }

    const extension = fileName
        ?.slice(fileName.lastIndexOf("."))
        .toLowerCase();

    if (
        extension &&
        IGNORED_FILE_EXTENSIONS.includes(extension)
    ) {
        return true;
    }

    return false;
};

export const filterRepositoryTree = (
    tree: GitHubTreeEntry[],
) => {
    return tree.filter((entry) => {
        // We only want files, not directories.
        if (entry.type !== "blob") {
            return false;
        }

        // Ignore generated/dependency/secret files.
        if (isIgnoredPath(entry.path)) {
            return false;
        }

        return true;
    });
};

export type RepositoryFile = {
    path: string;
    sha: string;
    size: number;
    content: string;
};

export const ingestRepository = async (
    projectId: string,
    userId: string,
): Promise<RepositoryFile[]> => {
    // 1. Get the project and connected repository
    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            userId,
        },
        include: {
            repository: true,
        },
    });

    if (!project) {
        throw new Error("Project not found");
    }

    if (!project.repository) {
        throw new Error("Repository not connected");
    }

    const repository = project.repository;

    const accessToken =
    await getValidGitHubAccessToken(userId);

    // 3. Fetch the repository tree
    const treeResponse = await getGitHubRepositoryTree(
        accessToken,
        repository.owner,
        repository.name,
        repository.defaultBranch,
    );

    ////Todo :implement full large-repository traversal system for  truncated trees
    if (treeResponse.truncated) {
        throw new Error(
            "Repository tree is too large to process",
        );
    }
    

    // 4. Filter the tree
    const usefulFiles = filterRepositoryTree(
        treeResponse.tree,
    );

    // 5. Fetch the contents of every useful file in batches
    const files: RepositoryFile[] = [];

    for (
        let i = 0;
        i < usefulFiles.length;
        i += MAX_CONCURRENT_FILES
    ) {
        const batch = usefulFiles.slice(
            i,
            i + MAX_CONCURRENT_FILES,
        );

        const batchResults = await Promise.all(
            batch.map(async (entry) => {
                if (entry.size === undefined) {
                    return null;
                }

                if (entry.size > MAX_FILE_SIZE) {
                    console.log(
                        `Skipping large file: ${entry.path} (${entry.size} bytes)`,
                    );
                    return null;
                }

                const file = await getGitHubFileContent(
                    accessToken,
                    repository.owner,
                    repository.name,
                    entry.sha,
                );

                if (isBinaryContent(file.content)) {
                    console.log(
                        `Skipping binary file: ${entry.path}`,
                    );
                    return null;
                }

                return {
                    path: entry.path,
                    sha: file.sha,
                    size: file.size,
                    content: file.content,
                };
            }),
        );

        for (const file of batchResults) {
            if (file !== null) {
                files.push(file);
            }
        }
    }

    return files;
};