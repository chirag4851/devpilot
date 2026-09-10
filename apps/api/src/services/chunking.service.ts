import Parser from "tree-sitter";
import { createHash } from "node:crypto";

import {
    parseCode,
    type CodeStructure,
    type SupportedLanguage,

} from "./code-parser.service.js";

export type CodeChunk = {
    id: string;
    path: string;
    sha: string;
    language: SupportedLanguage;
    type:
    | "imports"
    | "function"
    | "class"
    | "method"
    | "variable";
    name: string | null;
    startLine: number;
    endLine: number;
    content: string;
    context: string | null;
    parentCall: string | null;
};

const makeChunk = (data: Omit<CodeChunk, "id">): CodeChunk => {
    const fingerprint = [
        data.path,
        data.type,
        data.name ?? "",
        data.startLine,
        data.endLine,
        data.content,
    ].join("::");

    const id = createHash("sha256")
        .update(fingerprint)
        .digest("hex");

    return { id, ...data };
};


const MAX_FUNCTION_CHUNK_LINES = 40;

const splitLargeFunction = (
    fn: CodeStructure["functions"][number],
    file: {
        path: string;
        sha: string;
        language: SupportedLanguage;
    },
): CodeChunk[] => {
    const tree = parseCode(
        fn.text,
        file.language,
    );

    const findFunctionNode = (
        node: Parser.SyntaxNode,
    ): Parser.SyntaxNode | null => {
        if (
            node.type === "function_declaration" ||
            node.type === "function_definition" ||
            node.type === "method_definition" ||
            node.type === "arrow_function"
        ) {
            return node;
        }

        for (const child of node.namedChildren) {
            const result = findFunctionNode(child);

            if (result) {
                return result;
            }
        }

        return null;
    };

    const functionNode = findFunctionNode(
        tree.rootNode,
    );

    if (!functionNode) {
        return [makeChunk({
            path: file.path,
            sha: file.sha,
            language: file.language,
            type: "function",
            name: fn.name,
            startLine: fn.startLine,
            endLine: fn.endLine,
            content: fn.text,
            context: fn.context,
            parentCall: fn.parentCall,
        })];
    }

    const body =
        functionNode.childForFieldName("body");

    if (!body || body.namedChildren.length === 0) {
        return [makeChunk({
            path: file.path,
            sha: file.sha,
            language: file.language,
            type: "function",
            name: fn.name,
            startLine: fn.startLine,
            endLine: fn.endLine,
            content: fn.text,
            context: fn.context,
            parentCall: fn.parentCall,
        })];

    }

    const chunks: CodeChunk[] = [];

    const createChunk = (
        statements: Parser.SyntaxNode[],
    ) => {
        if (statements.length === 0) {
            return;
        }

        const first = statements[0];
        const last = statements[statements.length - 1];

        if (!first || !last) {
            return;
        }

        const content = statements
            .map((statement) => statement.text)
            .join("\n\n");

            chunks.push(makeChunk({
                path: file.path,
                sha: file.sha,
                language: file.language,
                type: "function",
                name: fn.name,
                startLine:
                    fn.startLine +
                    first.startPosition.row,
                endLine:
                    fn.startLine +
                    last.endPosition.row,
                content,
                context: fn.context,
                parentCall: fn.parentCall,
            }));
    };

    const splitStatements = (
        statements: Parser.SyntaxNode[],
    ) => {
        let currentStatements: Parser.SyntaxNode[] = [];

        const flush = () => {
            if (currentStatements.length === 0) {
                return;
            }

            createChunk(currentStatements);
            currentStatements = [];
        };

        for (const statement of statements) {
            const statementStart =
                statement.startPosition.row + 1;

            const statementEnd =
                statement.endPosition.row + 1;

            const statementSize =
                statementEnd - statementStart + 1;

            if (
                statementSize <=
                MAX_FUNCTION_CHUNK_LINES
            ) {
                const proposedStatements = [
                    ...currentStatements,
                    statement,
                ];

                const proposedFirst =
                    proposedStatements[0];

                const proposedLast =
                    proposedStatements[
                        proposedStatements.length - 1
                    ];

                if (!proposedFirst || !proposedLast) {
                    continue;
                }

                const proposedStart =
                    proposedFirst.startPosition.row + 1;

                const proposedEnd =
                    proposedLast.endPosition.row + 1;

                const proposedSize =
                    proposedEnd - proposedStart + 1;

                if (
                    currentStatements.length > 0 &&
                    proposedSize >
                        MAX_FUNCTION_CHUNK_LINES
                ) {
                    flush();
                }

                currentStatements.push(statement);

                continue;
            }

            // This statement is itself too large.
            // Try to split inside its body.
            const nestedBody =
                statement.childForFieldName("body");

            if (
                nestedBody &&
                nestedBody.namedChildren.length > 0
            ) {
                flush();

                splitStatements(
                    nestedBody.namedChildren,
                );

                continue;
            }

            // No safe AST boundary exists inside this
            // statement, so keep it intact.
            flush();
            createChunk([statement]);
        }

        flush();
    };

    splitStatements(
        body.namedChildren,
    );

    return chunks;
};

export const createCodeChunks = (
    file: {
        path: string;
        sha: string;
        language: SupportedLanguage;
        content: string;
    },
    structure: CodeStructure,
): CodeChunk[] => {
    const chunks: CodeChunk[] = [];

    // Imports
    if (structure.imports.length > 0) {
        const firstImport = structure.imports.at(0);
        const lastImport = structure.imports.at(-1);

        if (firstImport && lastImport) {
            chunks.push(makeChunk({
                path: file.path,
                sha: file.sha,
                language: file.language,
                type: "imports",
                name: null,
                startLine: firstImport.startLine,
                endLine: lastImport.endLine,
                content: structure.imports
                    .map((item) => item.text)
                    .join("\n"),
                context: null,
                parentCall: null,
            }));
        }
    }

    // Functions
    for (const fn of structure.functions) {
        const functionChunks =
            splitLargeFunction(
                fn,
                file,
            );

        chunks.push(
            ...functionChunks,
        );
    }

    // Classes + methods
    for (const cls of structure.classes) {
        // Create a class chunk only when the class contains non-method members.
        if (cls.members.length > 0) {
            chunks.push(makeChunk({
                path: file.path,
                sha: file.sha,
                language: file.language,
                type: "class",
                name: cls.name,
                startLine: cls.startLine,
                endLine: cls.endLine,
                content: cls.members.join("\n"),
                context: null,
                parentCall: null,
            }));
        }

        // Create one chunk per method.
        for (const method of cls.methods) {
            chunks.push(makeChunk({
                path: file.path,
                sha: file.sha,
                language: file.language,
                type: "method",
                name: `${cls.name}.${method.name}`,
                startLine: method.startLine,
                endLine: method.endLine,
                content: method.text,
                context: null,
                parentCall: null,
            }));
        }
    }

    // Variables
    for (const variable of structure.variables) {
        chunks.push(makeChunk({
            path: file.path,
            sha: file.sha,
            language: file.language,
            type: "variable",
            name: variable.name,
            startLine: variable.startLine,
            endLine: variable.endLine,
            content: variable.text,
            context: null,
            parentCall: null,
        }));
    }

    return chunks;
};