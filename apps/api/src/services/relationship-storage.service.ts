import { prisma } from "../lib/prisma.js";
import type { CodeRelationship } from "./relationship.service.js";

export const storeRelationships = async (
    relationships: CodeRelationship[],
): Promise<void> => {
    for (const edge of relationships) {
        await prisma.$executeRaw`
            INSERT INTO "CodeRelationship" (
                id, "projectId", "fromChunkId", "toChunkId", "toPath", type
            )
            VALUES (
                ${edge.id}, ${edge.projectId}, ${edge.fromChunkId},
                ${edge.toChunkId}, ${edge.toPath}, ${edge.type}
            )
            ON CONFLICT (id) DO UPDATE SET
                "toChunkId" = EXCLUDED."toChunkId",
                "toPath" = EXCLUDED."toPath"
        `;
    }
};
