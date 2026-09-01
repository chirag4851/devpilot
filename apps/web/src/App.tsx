import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { api } from "./lib/api";
import Dashboard from "./pages/Dashboard";
import ProjectPage from "./pages/Project";

type AuthMode = "login" | "register";

interface User {
    id: string;
    name: string;
    email: string;
}

interface AuthResponse {
    token: string;
    user: User;
}

interface Project {
    id: string;
    name: string;
    description: string | null;
    userId: string;
    createdAt: string;
    updatedAt: string;
}

function LoginScreen({
    onAuthenticated,
}: {
    onAuthenticated: (user: User) => void;
}) {
    const [mode, setMode] = useState<AuthMode>("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        setLoading(true);
        setError("");

        try {
            const result = await api<AuthResponse>(
                mode === "login" ? "/users/login" : "/users",
                {
                    method: "POST",
                    body: JSON.stringify(
                        mode === "login"
                            ? { email, password }
                            : { name, email, password },
                    ),
                },
            );

            localStorage.setItem("token", result.token);

            onAuthenticated(result.user);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Something went wrong",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="auth-page">
            <section className="auth-card">
                <div className="brand">
                    <div className="brand-mark">D</div>

                    <div>
                        <h1>DevPilot</h1>
                        <p>AI workspace for engineering teams</p>
                    </div>
                </div>

                <div className="auth-header">
                    <h2>
                        {mode === "login"
                            ? "Welcome back"
                            : "Create your account"}
                    </h2>

                    <p>
                        {mode === "login"
                            ? "Sign in to continue to your workspace."
                            : "Create your DevPilot workspace to get started."}
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    {mode === "register" && (
                        <label>
                            Name
                            <input
                                type="text"
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                placeholder="Your name"
                                required
                            />
                        </label>
                    )}

                    <label>
                        Email
                        <input
                            type="email"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            placeholder="you@example.com"
                            required
                        />
                    </label>

                    <label>
                        Password
                        <input
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            placeholder="••••••••"
                            required
                        />
                    </label>

                    {error && <div className="error">{error}</div>}

                    <button type="submit" disabled={loading}>
                        {loading
                            ? "Please wait..."
                            : mode === "login"
                                ? "Sign in"
                                : "Create account"}
                    </button>
                </form>

                <div className="auth-switch">
                    {mode === "login" ? (
                        <>
                            Don't have an account?{" "}
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("register");
                                    setError("");
                                }}
                            >
                                Create one
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{" "}
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("login");
                                    setError("");
                                }}
                            >
                                Sign in
                            </button>
                        </>
                    )}
                </div>
            </section>
        </main>
    );
}

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [selectedProject, setSelectedProject] =
        useState<Project | null>(null);
    const [projectLoading, setProjectLoading] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const restoreUser = async () => {
            const token = localStorage.getItem("token");

            if (!token) {
                setAuthLoading(false);
                return;
            }

            try {
                const result = await api<{ user: User }>("/users/me", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                setUser(result.user);
            } catch (error) {
                console.error("Failed to restore user:", error);
                localStorage.removeItem("token");
            } finally {
                setAuthLoading(false);
            }
        };

        restoreUser();
    }, []);

    useEffect(() => {
        if (!user) {
            return;
        }

        const match = window.location.pathname.match(
            /^\/project\/([^/]+)$/,
        );

        if (!match) {
            return;
        }

        const projectId = match[1];

        const restoreProject = async () => {
            setProjectLoading(true);

            try {
                const token = localStorage.getItem("token");

                const project = await api<Project>(
                    `/projects/${projectId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    },
                );

                setSelectedProject(project);
            } catch (error) {
                console.error(
                    "Failed to restore project:",
                    error,
                );
            } finally {
                setProjectLoading(false);
            }
        };

        restoreProject();
    }, [user]);

    if (authLoading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return <LoginScreen onAuthenticated={setUser} />;
    }

    if (projectLoading) {
        return <div>Loading project...</div>;
    }

    if (selectedProject) {
        return (
            <ProjectPage
                project={selectedProject}
                onBack={() => setSelectedProject(null)}
                onLogout={() => {
                    localStorage.removeItem("token");
                    setUser(null);
                    setSelectedProject(null);
                }}
            />
        );
    }



    return (
        <Dashboard
            onSelectProject={setSelectedProject}
            onLogout={() => {
                localStorage.removeItem("token");
                setUser(null);
            }}
        />
    );
}

export default App;