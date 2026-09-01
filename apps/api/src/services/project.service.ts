import { prisma } from "../lib/prisma.js";

export const createProject = async (
    userId: string,
    name: string,
    description?: string,
) => {
    const project = await prisma.project.create({
        data: {
            userId,
            name,
            ...(description !== undefined && { description }),
        },
    });

    return project;
};

export const getProjects = async (userId: string) => {
    return await prisma.project.findMany({
        where: {
            userId,
        },
    });
};

export const getProjectById = async (
    projectId: string,
    userId: string,
) => {
    return await prisma.project.findFirst({
        where: {
            id: projectId,
            userId,
        },
    });
};

export const verifyProjectOwnership = async (
    projectId: string,
    userId: string,
) => {
    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            userId,
        },
    });

    return project;
};

export const deleteProject = async (
    projectId: string,
    userId: string,
) => {
    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            userId,
        },
    });

    if (!project) {
        return null;
    }

    return await prisma.project.delete({
        where: {
            id: projectId,
        },
    });
};