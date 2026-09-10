
import "dotenv/config";

import Parser from "tree-sitter";

import {
    parseRepositoryFile,
    extractStructure,
} from "./services/code-parser.service.js";

import {
    createCodeChunks,
} from "./services/chunking.service.js";

const file = {
    path: "apps/api/src/server.ts",
    sha: "test",
    size: 0,
    content: `
        import express from "express";
        import { PrismaClient } from "@prisma/client";

        const app = express();
        const prisma = new PrismaClient();

        class UserService {
            private cache = new Map<string, string>();

            getUser(id: string) {
                return this.cache.get(id);
            }
        }

        function hello() {
            return "hello";
        }

        app.get("/health", (req, res) => {
            res.json({
                status: "ok",
            });
        });

        async function processLargeUserWorkflow(
            userId: string,
        ) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                throw new Error("User not found");
            }

            if (!user.email) {
                return {
                    success: false,
                    reason: "User has no email",
                };
            }

            const orders = await prisma.order.findMany({
                where: {
                    userId: user.id,
                },
            });

            const processedOrders = [];

            for (const order of orders) {
                if (order.status === "cancelled") {
                    continue;
                }

                const processedOrder = {
                    id: order.id,
                    total: order.total,
                    status: "processed",
                };

                processedOrders.push(processedOrder);
            }

            if (processedOrders.length === 0) {
                return {
                    success: true,
                    userId: user.id,
                    ordersProcessed: 0,
                };
            }

            await prisma.user.update({
                where: {
                    id: user.id,
                },
                data: {
                    lastProcessedAt: new Date(),
                },
            });

            const summary = {
                userId: user.id,
                email: user.email,
                ordersProcessed: processedOrders.length,
                totalValue: processedOrders.reduce(
                    (total, order) => total + order.total,
                    0,
                ),
            };

            return {
                success: true,
                summary,
            };
        }
    `,
};

const parsed = parseRepositoryFile(file);

if (!parsed) {
    throw new Error("Failed to parse test file");
}

console.log("\n=== AST INSPECTION ===");

const printParentChain = (
    node: Parser.SyntaxNode,
) => {
    let current: Parser.SyntaxNode | null = node;

    while (current) {
        console.log(
            `${current.type} | ${current.text.slice(0, 120)}`,
        );

        current = current.parent;
    }
};

const inspectLargeFunction = (
    node: Parser.SyntaxNode,
) => {
    if (
        node.type === "function_declaration" &&
        node.childForFieldName("name")?.text ===
            "processLargeUserWorkflow"
    ) {
        console.log("\n--- LARGE FUNCTION ---");
        console.log("Function:");
        console.log(node.text);

        console.log("\nDirect named children:");

        for (const child of node.namedChildren) {
            console.log(
                `${child.type} | ` +
                `${child.startPosition.row + 1}-` +
                `${child.endPosition.row + 1} | ` +
                child.text.slice(0, 120),
            );
        }
    }

    for (const child of node.namedChildren) {
        inspectLargeFunction(child);
    }
};

inspectLargeFunction(
    parsed.tree.rootNode,
);

console.log("\n=== NORMALIZED STRUCTURE ===");

const structure = extractStructure(
    parsed.tree,
);

console.log(
    JSON.stringify(structure, null, 2),
);

console.log("\n=== CURRENT CHUNKS ===");

const chunks = createCodeChunks(
    {
        path: parsed.path,
        sha: parsed.sha,
        language: parsed.language,
        content: file.content,
    },
    structure,
);

console.log(
    JSON.stringify(chunks, null, 2),
);

console.log("\n=== CHUNK SUMMARY ===");

for (const chunk of chunks) {
    console.log(
        `${chunk.path}:` +
        `${chunk.startLine}-${chunk.endLine} ` +
        `[${chunk.type}] ` +
        `${chunk.name ?? ""}`,
    );
}

