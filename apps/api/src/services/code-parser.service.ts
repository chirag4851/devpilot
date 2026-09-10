import Parser from 'tree-sitter';
import JavaScript from "tree-sitter-javascript";
import Python from "tree-sitter-python";
import TypeScript from "@sengac/tree-sitter-typescript";

export type SupportedLanguage =
    | "typescript"
    | "tsx"
    | "javascript"
    | "jsx"
    | "python";

export type ParsedRepositoryFile = {
    path: string;
    sha: string;
    size: number;
    language: SupportedLanguage;
    tree: Parser.Tree;
};

export type CodeMethod = {
    name: string;
    startLine: number;
    endLine: number;
    text: string;
};

export type CodeFunction = {
    name: string | null;
    kind: "function" | "arrow" | "method";
    startLine: number;
    endLine: number;
    text: string;
    context: string | null;
    parentCall: string | null;
};

export type CodeClass = {
    name: string;
    startLine: number;
    endLine: number;
    text: string;
    methods: CodeMethod[];
    members: string[];
};

export type CodeVariable = {
    name: string;
    startLine: number;
    endLine: number;
    text: string;
};

export type CodeImport = {
    text: string;
    startLine: number;
    endLine: number;
};

export type CodeStructure = {
    imports: CodeImport[];
    functions: CodeFunction[];
    variables: CodeVariable[];
    classes: CodeClass[];
};

const LANGUAGE_GRAMMARS = {
    typescript: TypeScript.typescript,
    tsx: TypeScript.tsx,
    javascript: JavaScript,
    jsx: JavaScript,
    python: Python,
} as const;


const LANGUAGE_BY_EXTENSION = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".py": "python",
} as const;




export const detectLanguageFromPath = (
    path: string,
): SupportedLanguage | null => {
    const lastDot = path.lastIndexOf(".");

    if (lastDot === -1) {
        return null;
    }

    const extension = path
        .slice(lastDot)
        .toLowerCase();

    if (
        extension in LANGUAGE_BY_EXTENSION
    ) {
        return LANGUAGE_BY_EXTENSION[
            extension as keyof typeof LANGUAGE_BY_EXTENSION
        ];
    }

    return null;
};

export const parseCode = (
    content: string,
    language: SupportedLanguage,
) => {
    const parser = new Parser();

    parser.setLanguage(LANGUAGE_GRAMMARS[language]);

    return parser.parse(content);
};

export const parseRepositoryFile = (
    file: {
        path: string;
        sha: string;
        size: number;
        content: string;
    },
): ParsedRepositoryFile | null => {
    const language = detectLanguageFromPath(file.path);

    if (!language) {
        return null;
    }

    const tree = parseCode(
        file.content,
        language,
    );

    return {
        path: file.path,
        sha: file.sha,
        size: file.size,
        language,
        tree,
    };
};



const getFunctionContext = (
    node: Parser.SyntaxNode,
): string | null => {
    let current = node.parent;

    while (current) {
        if (current.type === "call_expression") {
            const fn = current.childForFieldName("function");
            const args = current.childForFieldName("arguments");
            const firstArg = args?.namedChildren[0];

            return `${fn?.text ?? ""}(${firstArg?.text ?? ""})`;
        }

        current = current.parent;
    }

    return null;
};


const getParentCall = (
    node: Parser.SyntaxNode,
): string | null => {
    let current = node.parent;

    while (current) {
        if (current.type === "call_expression") {
            const functionNode =
                current.childForFieldName("function");

            return functionNode?.text ?? null;
        }

        current = current.parent;
    }

    return null;
};

export const extractStructure = (
    tree: Parser.Tree,
): CodeStructure => {

    const structure: CodeStructure = {
        imports: [],
        functions: [],
        variables: [],
        classes: [],
    };

    const visit = (node: Parser.SyntaxNode) => {
        switch (node.type) {
            case "import_statement":
                structure.imports.push({
                    text: node.text,
                    startLine: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                });
                break;
            case "function_declaration": {
                const name =
                    node.childForFieldName("name");

                structure.functions.push({
                    name: name?.text ?? null,
                    kind: "function",
                    startLine: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                    text: node.text,
                    context: null,
                    parentCall: null
                });

                break;
            }

            case "arrow_function": {
                const parent = node.parent;

                let name: string | null = null;

                if (
                    parent?.type === "variable_declarator" &&
                    parent.childForFieldName("value")?.id === node.id
                ) {
                    name =
                        parent
                            .childForFieldName("name")
                            ?.text ?? null;
                }

                structure.functions.push({
                    name,
                    kind: "arrow",
                    startLine: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                    text: node.text,
                    context: getFunctionContext(node),
                    parentCall: getParentCall(node),
                });

                break;
            }
            case "class_declaration": {
                const name =
                    node.childForFieldName("name");

                const body =
                    node.childForFieldName("body");

                if (!name || !body) {
                    break;
                }

                const methods: CodeMethod[] = [];
                const members: string[] = [];

                for (const child of body.namedChildren) {
                    if (child.type === "method_definition") {
                        const methodName =
                            child.childForFieldName("name");

                        if (!methodName) {
                            continue;
                        }

                        methods.push({
                            name: methodName.text,
                            startLine: child.startPosition.row + 1,
                            endLine: child.endPosition.row + 1,
                            text: child.text,
                        });

                        continue;
                    }

                    members.push(child.text);
                }

                structure.classes.push({
                    name: name.text,
                    startLine: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                    text: node.text,
                    methods,
                    members,
                });

                break;
            }

            case "lexical_declaration": {
                // Only collect variables declared directly
                // at the top level of the file.
                if (node.parent?.type !== "program") {
                    break;
                }

                for (const declarator of node.namedChildren) {
                    if (declarator.type !== "variable_declarator") {
                        continue;
                    }

                    const name =
                        declarator.childForFieldName("name");

                    const value =
                        declarator.childForFieldName("value");

                    // Arrow functions are already represented
                    // as function chunks.
                    if (
                        value?.type === "arrow_function"
                    ) {
                        continue;
                    }

                    if (!name) {
                        continue;
                    }

                    structure.variables.push({
                        name: name.text,
                        startLine:
                            declarator.startPosition.row + 1,
                        endLine:
                            declarator.endPosition.row + 1,
                        text: declarator.text,
                    });
                }

                break;
            }
        }

        // Don't recursively extract nested functions.
        // They belong to the semantic context of their parent function.
        if (
            node.type === "function_declaration" ||
            node.type === "arrow_function" ||
            node.type === "method_definition"
        ) {
            return;
        }

        for (const child of node.namedChildren) {
            visit(child);
        }
    };

    visit(tree.rootNode);

    return structure;
};


export type AnalyzedRepositoryFile = {
    path: string;
    sha: string;
    size: number;
    language: SupportedLanguage;
    structure: CodeStructure;
};

export const analyzeRepositoryFile = (
    file: {
        path: string;
        sha: string;
        size: number;
        content: string;
    },
): AnalyzedRepositoryFile | null => {
    const parsed = parseRepositoryFile(file);

    if (!parsed) {
        return null;
    }

    const structure = extractStructure(
        parsed.tree,
    );

    return {
        path: parsed.path,
        sha: parsed.sha,
        size: parsed.size,
        language: parsed.language,
        structure,
    };
};