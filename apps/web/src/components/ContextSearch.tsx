import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";

interface ExpandedChunk {
    id: string;
    path: string;
    type: string;
    name: string | null;
    startLine: number;
    endLine: number;
    content: string;
    context: string | null;
    parentCall: string | null;
    source: "retrieval" | "graph";
    relevanceScore?: number;
    relationshipType?: "calls" | "imports";
    relationshipDirection?: "incoming" | "outgoing";
}

interface ContextSearchProps {
    projectId: string;
}

const ContextSearch = ({ projectId }: ContextSearchProps) => {
    const [query, setQuery] = useState("");
    const [chunks, setChunks] = useState<ExpandedChunk[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async (event: FormEvent) => {
        event.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError("");

        try {
            const data = await api<{ chunks: ExpandedChunk[] }>("/context", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ projectId, query: query.trim() }),
            });

            setChunks(data.chunks);
            setHasSearched(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch context");
        } finally {
            setLoading(false);
        }
    };

    return (
        <section style={{ marginTop: "2rem" }}>
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Explore</p>
                    <h2>Ask your codebase</h2>
                </div>
            </div>

            <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. how does GitHub OAuth work in this repo?"
                    style={{ flex: 1, padding: "0.5rem" }}
                />
                <button type="submit" disabled={loading}>
                    {loading ? "Searching..." : "Search"}
                </button>
            </form>

            {error && <div className="error">{error}</div>}

            {hasSearched && !loading && chunks.length === 0 && !error && (
                <div className="state-message">No relevant code found for this query.</div>
            )}

            {chunks.map((chunk) => (
                <div
                    key={chunk.id}
                    style={{
                        border: "1px solid #333",
                        borderRadius: "8px",
                        padding: "0.75rem",
                        marginBottom: "0.75rem",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>
                            {chunk.source === "retrieval"
                                ? "Retrieved"
                                : `${chunk.relationshipDirection} ${chunk.relationshipType}`}
                        </span>
                        <span>
                            {chunk.path}
                            {chunk.name ? ` :: ${chunk.name}` : ""}
                        </span>
                    </div>

                    {chunk.context && (
                        <div style={{ fontSize: "0.8rem", opacity: 0.7, marginBottom: "0.5rem" }}>
                            {chunk.context}
                        </div>
                    )}

                    <pre
                        style={{
                            background: "#111",
                            color: "#eee",
                            padding: "0.75rem",
                            borderRadius: "6px",
                            overflowX: "auto",
                            fontSize: "0.8rem",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {chunk.content}
                    </pre>

                    <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.5rem" }}>
                        Lines {chunk.startLine}-{chunk.endLine}
                        {chunk.relevanceScore !== undefined && ` · relevance ${chunk.relevanceScore.toFixed(2)}`}
                    </div>
                </div>
            ))}
        </section>
    );
};

export default ContextSearch;