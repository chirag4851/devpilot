import { useEffect, useState } from "react";
import ContextSearch from "../components/ContextSearch";
import { api } from "../lib/api";

interface Project {
    id: string;
    name: string;
    description: string | null;
}

interface Repository {
    id: string;
    projectId: string;
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
    status: string;
    lastProcessedAt: string | null;
}

interface GitHubRepository {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    url: string;
    defaultBranch: string;
    private: boolean;
}

interface ProjectPageProps {
    project: Project;
    onBack: () => void;
    onLogout: () => void;
}

const ProjectPage = ({
    project,
    onBack,
    onLogout,
}: ProjectPageProps) => {
    const [repository, setRepository] =
        useState<Repository | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [checkingGitHub, setCheckingGitHub] = useState(true);
    const [githubConnected, setGithubConnected] = useState(false);
    const [connectingGitHub, setConnectingGitHub] = useState(false);

    const [showRepositoryPicker, setShowRepositoryPicker] =
        useState(false);

    const [githubRepositories, setGithubRepositories] =
        useState<GitHubRepository[]>([]);

    const [loadingRepositories, setLoadingRepositories] =
        useState(false);

    const [connecting, setConnecting] = useState(false);

    // New states for updates/resync
    const [hasUpdates, setHasUpdates] = useState(false);
    const [resyncing, setResyncing] = useState(false);
    const [resyncMessage, setResyncMessage] = useState("");

    useEffect(() => {
        const checkGitHubConnection = async () => {
            try {
                const data = await api<{
                    connected: boolean;
                    account: {
                        login: string;
                    } | null;
                }>("/github/status", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                setGithubConnected(data.connected);
            } catch (error) {
                setError(
                    error instanceof Error
                        ? error.message
                        : "Failed to check GitHub connection",
                );
            } finally {
                setCheckingGitHub(false);
            }
        };

        checkGitHubConnection();
    }, []);

    useEffect(() => {
        const loadRepository = async () => {
            try {
                const data = await api<Repository | null>(
                    `/projects/${project.id}/repository`,
                    {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem(
                                "token",
                            )}`,
                        },
                    },
                );

                setRepository(data);
            } catch (error) {
                setError(
                    error instanceof Error
                        ? error.message
                        : "Failed to load repository",
                );
            } finally {
                setLoading(false);
            }
        };

        loadRepository();
    }, [project.id]);

    // New effect: check for repository drift/updates
    useEffect(() => {
        if (!repository) {
            return;
        }

        const checkForUpdates = async () => {
            try {
                const data = await api<{ hasUpdates: boolean }>(
                    `/projects/${project.id}/repository/status`,
                    {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem("token")}`,
                        },
                    },
                );
                setHasUpdates(data.hasUpdates);
            } catch (error) {
                console.error("Failed to check repository status:", error);
            }
        };

        checkForUpdates();
    }, [repository, project.id]);

    const loadGitHubRepositories = async () => {
        setLoadingRepositories(true);
        setError("");
    
        try {
            const data = await api<{ repositories: GitHubRepository[] }>(
                "/github/repositories",
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                },
            );
    
            setGithubRepositories(data.repositories);
            setShowRepositoryPicker(true);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("GitHub connection expired")
            ) {
                setError(
                    "Your GitHub connection has expired. Please reconnect GitHub.",
                );
            } else {
                setError(
                    error instanceof Error
                        ? error.message
                        : "Failed to load GitHub repositories",
                );
            }
        } finally {
            setLoadingRepositories(false);
        }
    };

    const handleConnectGitHub = async () => {
        setConnectingGitHub(true);
        setError("");

        try {
            const data = await api<{ authorizationUrl: string }>(
                `/github/connect?returnTo=${encodeURIComponent(
                    `/project/${project.id}`,
                )}`,
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                },
            );

            window.location.href = data.authorizationUrl;
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to connect GitHub",
            );
            setConnectingGitHub(false);
        }
    };

    const handleConnectRepository = async (
        githubRepository: GitHubRepository,
    ) => {
        setConnecting(true);
        setError("");

        try {
            const data = await api<Repository>(
                `/projects/${project.id}/repository`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem(
                            "token",
                        )}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        githubRepositoryId: githubRepository.id,
                    }),
                },
            );

            setRepository(data);
            setShowRepositoryPicker(false);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to connect repository",
            );
        } finally {
            setConnecting(false);
        }
    };

    // New handler: resync
    const handleResync = async () => {
        setResyncing(true);
        setResyncMessage("");

        try {
            const result = await api<{ chunkCount: number; edgeCount: number; sha: string }>(
                `/projects/${project.id}/repository/resync`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                },
            );

            setHasUpdates(false);
            setResyncMessage(
                `Resynced: ${result.chunkCount} chunks, ${result.edgeCount} relationships.`,
            );
        } catch (error) {
            setResyncMessage(
                error instanceof Error ? error.message : "Failed to resync repository",
            );
        } finally {
            setResyncing(false);
        }
    };

    return (
        <main className="project-page">
            <header className="dashboard-header">
                <div className="dashboard-brand">
                    <div className="brand-mark">D</div>
                    <span>DevPilot</span>
                </div>
    
                <button
                    type="button"
                    className="logout-button"
                    onClick={onLogout}
                >
                    Sign out
                </button>
            </header>
    
            <section className="project-content">
                <button
                    type="button"
                    className="back-button"
                    onClick={onBack}
                >
                    ← Projects
                </button>
    
                <div className="project-heading">
                    <p className="eyebrow">Project</p>
    
                    <h1>{project.name}</h1>
    
                    <p>
                        {project.description ||
                            "No description provided."}
                    </p>
                </div>
    
                <section className="repository-section">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">Source</p>
                            <h2>Repository</h2>
                        </div>
                    </div>
    
                    {/* Loading repository */}
                    {loading && (
                        <div className="state-message">
                            Loading repository...
                        </div>
                    )}
    
                    {/* Checking GitHub connection */}
                    {checkingGitHub && (
                        <div className="state-message">
                            Checking GitHub connection...
                        </div>
                    )}
    
                    {/* Error */}
                    {error && (
                        <div className="error">
                            {error}

                            {error.includes("GitHub connection has expired") && (
                                <button
                                    type="button"
                                    className="connect-button"
                                    onClick={handleConnectGitHub}
                                    disabled={connectingGitHub}
                                >
                                    {connectingGitHub
                                        ? "Reconnecting..."
                                        : "Reconnect GitHub"}
                                </button>
                            )}
                        </div>
                    )}
    
                    {/* GitHub is NOT connected */}
                    {!loading &&
                        !checkingGitHub &&
                        !error &&
                        !repository &&
                        !showRepositoryPicker &&
                        !githubConnected && (
                            <div className="empty-state">
                                <h2>Connect GitHub</h2>
    
                                <p>
                                    Connect your GitHub account to select a
                                    repository for this project.
                                </p>
    
                                <button
                                    type="button"
                                    className="connect-button"
                                    onClick={handleConnectGitHub}
                                    disabled={connectingGitHub}
                                >
                                    {connectingGitHub
                                        ? "Connecting..."
                                        : "Connect GitHub"}
                                </button>
                            </div>
                        )}
    
                    {/* GitHub IS connected, but no repository is selected */}
                    {!loading &&
                        !checkingGitHub &&
                        !error &&
                        githubConnected &&
                        !repository &&
                        !showRepositoryPicker && (
                            <div className="empty-state">
                                <h2>No repository connected</h2>
    
                                <p>
                                    Your GitHub account is connected. Select a
                                    repository to add to this project.
                                </p>
    
                                <button
                                    type="button"
                                    className="connect-button"
                                    onClick={loadGitHubRepositories}
                                    disabled={loadingRepositories}
                                >
                                    {loadingRepositories
                                        ? "Loading repositories..."
                                        : "Select Repository"}
                                </button>
                            </div>
                        )}
    
                    {/* GitHub repository picker */}
                    {!loading &&
                        !checkingGitHub &&
                        !error &&
                        githubConnected &&
                        showRepositoryPicker && (
                            <div className="repository-picker">
                                <div className="picker-header">
                                    <div>
                                        <p className="eyebrow">GitHub</p>
                                        <h2>Select a repository</h2>
                                    </div>
    
                                    <button
                                        type="button"
                                        className="close-button"
                                        onClick={() =>
                                            setShowRepositoryPicker(false)
                                        }
                                    >
                                        ×
                                    </button>
                                </div>
    
                                <div className="github-repository-list">
                                    {githubRepositories.length === 0 && (
                                        <div className="state-message">
                                            No repositories found.
                                        </div>
                                    )}
    
                                    {githubRepositories.map((repo) => (
                                        <button
                                            key={repo.id}
                                            type="button"
                                            className="github-repository"
                                            onClick={() =>
                                                handleConnectRepository(repo)
                                            }
                                            disabled={connecting}
                                        >
                                            <div className="repository-info">
                                                <div className="repository-icon">
                                                    {repo.name
                                                        .charAt(0)
                                                        .toUpperCase()}
                                                </div>
    
                                                <div>
                                                    <h3>
                                                        {repo.fullName}
                                                    </h3>
    
                                                    <p>
                                                        {repo.private
                                                            ? "Private"
                                                            : "Public"}{" "}
                                                        ·{" "}
                                                        {repo.defaultBranch}
                                                    </p>
                                                </div>
                                            </div>
    
                                            <span className="arrow">
                                                →
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
    
                    {/* Repository is connected */}
                    {!loading &&
                        !error &&
                        repository && (
                            <div className="repository-card">
                                <div className="repository-info">
                                    <div className="repository-icon">
                                        {repository.name
                                            .charAt(0)
                                            .toUpperCase()}
                                    </div>
    
                                    <div>
                                        <h3>
                                            {repository.owner}/
                                            {repository.name}
                                        </h3>
    
                                        <p>
                                            {repository.defaultBranch}
                                        </p>
                                    </div>
                                </div>
    
                                <div className="repository-status">
                                    <span
                                        className={`status-dot status-${repository.status}`}
                                    />
    
                                    <span>
                                        {repository.status
                                            .charAt(0)
                                            .toUpperCase() +
                                            repository.status.slice(1)}
                                    </span>
                                </div>
    
                                <a
                                    href={repository.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="repository-link"
                                >
                                    View on GitHub ↗
                                </a>
                            </div>
                        )}

                    {/* New drift/resync banner and result message */}
                    {repository && hasUpdates && (
                        <div
                            style={{
                                marginTop: "1rem",
                                padding: "0.75rem 1rem",
                                borderRadius: "8px",
                                border: "1px solid #4a4a2a",
                                background: "#2a2a1a",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <span>New changes detected in this repository.</span>
                            <button type="button" onClick={handleResync} disabled={resyncing}>
                                {resyncing ? "Resyncing..." : "Resync now"}
                            </button>
                        </div>
                    )}

                    {repository && resyncMessage && (
                        <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                            {resyncMessage}
                        </div>
                    )}
                </section>
                {repository && <ContextSearch projectId={project.id} />}
            </section>
        </main>
    );
};

export default ProjectPage;