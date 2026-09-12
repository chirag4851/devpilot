import { prisma } from "../lib/prisma.js";
import { ingestRepository } from "./repository-ingestion.service.js";
import { analyzeRepositoryFile } from "./code-parser.service.js";
import { createCodeChunks } from "./chunking.service.js";
import { embedChunks } from "./embedding.service.js";
import { storeChunkEmbeddings } from "./vector-storage.service.js";
import {
    buildFunctionNameIndex,
    extractCallEdges,
    extractImportEdges,
} from "./relationship.service.js";
import { storeRelationships } from "./relationship-storage.service.js";
import { getValidGitHubAccessToken, getGitHubBranchSha } from "./github.service.js";
import { getProjectRepository } from "./repository.service.js";

export const resyncProjectRepository = async (
    projectId: string,
    userId: string,
): Promise<{ chunkCount: number; edgeCount: number; sha: string }> => {
    const repository = await getProjectRepository(projectId);

    if (!repository) {
        throw new Error("Repository not connected");
    }

    await prisma.gitHubRepository.update({
        where: { projectId },
        data: { status: "processing" },
    });

    try {
        // Clean slate before re-ingesting — no incremental diffing yet,
        // this is the known/accepted cost for now (see earlier notes).
        await prisma.$executeRaw`DELETE FROM "CodeRelationship" WHERE "projectId" = ${projectId}`;
        await prisma.$executeRaw`DELETE FROM "CodeChunk" WHERE "projectId" = ${projectId}`;

        const files = await ingestRepository(projectId, userId);
        const analyzedFiles = files
            .map(analyzeRepositoryFile)
            .filter((f): f is NonNullable<typeof f> => f !== null);

        const allChunks = analyzedFiles.flatMap((file) =>
            createCodeChunks(
                {
                    path: file.path,
                    sha: file.sha,
                    language: file.language,
                    content: files.find((o) => o.path === file.path)!.content,
                },
                file.structure,
            ),
        );

        const embeddings = await embedChunks(allChunks);
        await storeChunkEmbeddings(projectId, allChunks, embeddings);

        const nameIndex = buildFunctionNameIndex(allChunks);
        const knownPaths = new Set(allChunks.map((c) => c.path));

        const allEdges = allChunks.flatMap((chunk) => {
            if (chunk.type === "imports") return extractImportEdges(chunk, projectId, knownPaths);
            if (chunk.type === "function") return extractCallEdges(chunk, nameIndex, projectId);
            return [];
        });

        await storeRelationships(allEdges);

        const accessToken = await getValidGitHubAccessToken(userId);
        const currentSha = await getGitHubBranchSha(
            accessToken,
            repository.owner,
            repository.name,
            repository.defaultBranch,
        );

        await prisma.gitHubRepository.update({
            where: { projectId },
            data: {
                status: "ready",
                lastProcessedAt: new Date(),
                lastIngestedSha: currentSha,
            },
        });

        return { chunkCount: allChunks.length, edgeCount: allEdges.length, sha: currentSha };
    } catch (error) {
        await prisma.gitHubRepository.update({
            where: { projectId },
            data: { status: "failed" },
        });
        throw error;
    }
};