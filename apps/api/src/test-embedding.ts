// test-embedding.ts
import "dotenv/config";
import { embedChunks } from "./services/embedding.service.js";

const testChunk = {
    id: "test123",
    path: "test.ts",
    sha: "abc",
    language: "typescript" as const,
    type: "function" as const,
    name: "testFn",
    startLine: 1,
    endLine: 2,
    content: "function testFn() { return 42; }",
    context: null,
    parentCall: null,
};

const result = await embedChunks([testChunk]);
console.log(result);
if (result[0]?.embedding) {
    console.log("Embedding length:", result[0].embedding.length);
    console.log("First 5 values:", result[0].embedding.slice(0, 5));
} else {
    console.error("No embedding found in the result.");
}