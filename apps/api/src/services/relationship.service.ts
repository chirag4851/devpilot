import path from "node:path";
import Parser from "tree-sitter";
import { createHash } from "node:crypto";
import type { CodeChunk } from "./chunking.service.js";
import { parseCode } from "./code-parser.service.js";
import { prisma } from "../lib/prisma.js";

export type CodeRelationship = {
    id: string;
    projectId: string;
    fromChunkId: string;
    toChunkId: string | null;
    toPath: string | null;
    type: "calls" | "imports";
};


const IMPORT_FROM_PATTERN = /from\s+["']([^"']+)["']/g;
const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

const resolveImportPath = (
    importerDir: string,
    importPath: string,
    knownPaths: Set<string>,
): string | null => {
    // Import specifiers may already end in .js/.ts/.jsx/.tsx, or have no
    // extension at all — strip whatever's there and try every real
    // possibility against files we actually ingested/chunked.
    const joined = path.normalize(path.join(importerDir, importPath));
    const base = joined.replace(/\.(js|jsx|ts|tsx)$/, "");

    const candidates = [
        ...RESOLVABLE_EXTENSIONS.map((ext) => `${base}${ext}`),
        ...RESOLVABLE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)), // `from "../lib"` -> lib/index.ts
    ];

    return candidates.find((candidate) => knownPaths.has(candidate)) ?? null;
};

export const extractImportEdges = (
    importChunk: CodeChunk,
    projectId: string,
    knownPaths: Set<string>,
): CodeRelationship[] => {
    const edges: CodeRelationship[] = [];
    const matches = importChunk.content.matchAll(IMPORT_FROM_PATTERN);

    for (const match of matches) {
        const importPath = match[1];

        if (!importPath) {
            continue;
        }

        // Skip packages (e.g. "express", "@prisma/client") — only
        // relative imports ("./" or "../") point at files in this repo.
        if (!importPath.startsWith(".")) {
            continue;
        }

        const importerDir = path.dirname(importChunk.path);
        const resolvedPath = resolveImportPath(importerDir, importPath, knownPaths);

        if (!resolvedPath) {
            // Points at a file we didn't ingest/chunk (filtered extension,
            // a tsconfig path alias, a file outside the scanned tree, etc).
            // Don't store an edge with a guessed/wrong path.
            continue;
        }

        edges.push({
            id: makeEdgeId({
                fromChunkId: importChunk.id,
                toChunkId: null,
                toPath: resolvedPath,
                type: "imports",
            }),
            projectId,
            fromChunkId: importChunk.id,
            toChunkId: null,
            toPath: resolvedPath,
            type: "imports",
        });
    }

    return edges;
};

const makeEdgeId = (edge: {
    fromChunkId: string;
    toChunkId: string | null;
    toPath: string | null;
    type: string;
}): string => {
    const fingerprint = [
        edge.fromChunkId,
        edge.toChunkId ?? "",
        edge.toPath ?? "",
        edge.type,
    ].join("::");

    return createHash("sha256").update(fingerprint).digest("hex");
};

const findCallExpressions = (
    node: Parser.SyntaxNode,
    results: Parser.SyntaxNode[] = [],
): Parser.SyntaxNode[] => {
    if (node.type === "call_expression") {
        results.push(node);
    }

    for (const child of node.namedChildren) {
        findCallExpressions(child, results);
    }

    return results;
};

export const extractCallEdges = (
    chunk: CodeChunk,
    nameToChunkIds: Map<string, string[]>,
    projectId: string,
): CodeRelationship[] => {
    if (chunk.type !== "function") {
        return [];
    }

    const edges: CodeRelationship[] = [];
    const tree = parseCode(chunk.content, chunk.language);
    const callNodes = findCallExpressions(tree.rootNode);

    for (const callNode of callNodes) {
        const fnNode = callNode.childForFieldName("function");

        // Only resolve bare calls like getGitHubRepositories(...).
        // Skip member/method calls (router.get(...), this.foo()) —
        // matching those by name alone is too ambiguous to trust.
        if (!fnNode || fnNode.type !== "identifier") {
            continue;
        }

        const targetChunkIds = nameToChunkIds.get(fnNode.text) ?? [];

        for (const targetChunkId of targetChunkIds) {
            if (targetChunkId === chunk.id) {
                continue;
            }

            edges.push({
                id: makeEdgeId({
                    fromChunkId: chunk.id,
                    toChunkId: targetChunkId,
                    toPath: null,
                    type: "calls",
                }),
                projectId,
                fromChunkId: chunk.id,
                toChunkId: targetChunkId,
                toPath: null,
                type: "calls",
            });
        }
    }

    return edges;
};



export const buildFunctionNameIndex = (
    chunks: CodeChunk[],
): Map<string, string[]> => {
    const index = new Map<string, string[]>();

    for (const chunk of chunks) {
        if (chunk.type !== "function" || !chunk.name) {
            continue;
        }

        const existing = index.get(chunk.name) ?? [];
        existing.push(chunk.id);
        index.set(chunk.name, existing);
    }

    return index;
};



export type RelatedChunk = {
    id: string;
    path: string;
    type: string;
    name: string | null;
    startLine: number;
    endLine: number;
    content: string;
    context: string | null;
    parentCall: string | null;
    relationshipType: "calls" | "imports";
};

// What does this chunk call, or what file does it import from?
export const getOutgoingRelationships = async (
    chunkId: string,
): Promise<RelatedChunk[]> => {
    return prisma.$queryRaw<RelatedChunk[]>`
        SELECT
            target.id, target.path, target.type, target.name,
            target."startLine", target."endLine", target.content,
            target.context, target."parentCall",
            rel.type AS "relationshipType"
        FROM "CodeRelationship" rel
        JOIN "CodeChunk" target ON target.id = rel."toChunkId"
        WHERE rel."fromChunkId" = ${chunkId}
    `;
};

// What calls this chunk? (Reverse direction — useful for "what breaks if I change this")
export const getIncomingRelationships = async (
    chunkId: string,
): Promise<RelatedChunk[]> => {
    return prisma.$queryRaw<RelatedChunk[]>`
        SELECT
            source.id, source.path, source.type, source.name,
            source."startLine", source."endLine", source.content,
            source.context, source."parentCall",
            rel.type AS "relationshipType"
        FROM "CodeRelationship" rel
        JOIN "CodeChunk" source ON source.id = rel."fromChunkId"
        WHERE rel."toChunkId" = ${chunkId}
    `;
};



export const getImportedChunks = async (
    chunkId: string,
    projectId: string,
): Promise<RelatedChunk[]> => {
    return prisma.$queryRaw<RelatedChunk[]>`
        SELECT
            target.id, target.path, target.type, target.name,
            target."startLine", target."endLine", target.content,
            target.context, target."parentCall",
            'imports'::text AS "relationshipType"
        FROM "CodeRelationship" rel
        JOIN "CodeChunk" target
            ON target.path = rel."toPath"
            AND target."projectId" = ${projectId}
        WHERE rel."fromChunkId" = ${chunkId}
          AND rel.type = 'imports'
    `;
};

// Every file has at most one "imports" chunk (the import block at the
// top). Given any chunk's file path, find that sibling chunk's id so
// its import edges (keyed by fromChunkId = the imports chunk, not the
// function/class chunk) can be looked up.
export const getImportsChunkForFile = async (
    filePath: string,
    projectId: string,
): Promise<{ id: string } | null> => {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "CodeChunk"
        WHERE path = ${filePath} AND type = 'imports' AND "projectId" = ${projectId}
        LIMIT 1
    `;
    return rows[0] ?? null;
};