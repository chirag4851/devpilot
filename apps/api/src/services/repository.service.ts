import { prisma } from "../lib/prisma.js";
import { getGitHubRepositories } from "./github.service.js";

export const connectRepository = async (
    projectId: string,
    userId: string,
    githubRepositoryId: number,
) => {
    const githubAccount = await prisma.gitHubAccount.findUnique({
        where: {
            userId,
        },
    });

    if (!githubAccount) {
        throw new Error("GitHub account is not connected");
    }

    const repositories = await getGitHubRepositories(
        githubAccount.accessToken,
    );

    const repository = repositories.find(
        (repo) => repo.id === githubRepositoryId,
    );

    if (!repository) {
        throw new Error(
            "Repository is not accessible through the connected GitHub account",
        );
    }

    return await prisma.gitHubRepository.upsert({
        where: {
            projectId,
        },
        update: {
            owner: repository.owner.login,
            name: repository.name,
            url: repository.html_url,
            defaultBranch: repository.default_branch ?? "main",
        },
        create: {
            projectId,
            owner: repository.owner.login,
            name: repository.name,
            url: repository.html_url,
            defaultBranch: repository.default_branch ?? "main",
        },
    });
};

export const getProjectRepository = async (projectId: string) => {
    return await prisma.gitHubRepository.findUnique({
        where: {
            projectId,
        },
    });
};