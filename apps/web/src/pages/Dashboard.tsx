import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Project {
    id: string;
    name: string;
    description: string | null;
    userId: string;
    createdAt: string;
    updatedAt: string;
}

interface DashboardProps {
    onSelectProject: (project: Project) => void;
    onLogout: () => void;
}

const Dashboard = ({
    onSelectProject,
    onLogout,
}: DashboardProps) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [projectName, setProjectName] = useState("");
    const [projectDescription, setProjectDescription] = useState("");
    const [creating, setCreating] = useState(false);




    useEffect(() => {
        const loadProjects = async () => {
            try {
                const data = await api<Project[]>("/projects", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                setProjects(data);
            } catch (error) {
                setError(
                    error instanceof Error
                        ? error.message
                        : "Failed to load projects",
                );
            } finally {
                setLoading(false);
            }
        };

        loadProjects();
    }, []);

    const handleDeleteProject = async (project: Project) => {
        const confirmed = window.confirm(
            `Delete "${project.name}"?\n\nThis will permanently delete the project and its connected repository.`,
        );

        if (!confirmed) {
            return;
        }

        try {
            setError("");

            await api(`/projects/${project.id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            setProjects((currentProjects) =>
                currentProjects.filter(
                    (currentProject) =>
                        currentProject.id !== project.id,
                ),
            );
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to delete project",
            );
        }
    };


    const handleCreateProject = async (
        event: React.FormEvent<HTMLFormElement>,
    ) => {
        event.preventDefault();

        if (!projectName.trim()) {
            setError("Project name is required");
            return;
        }

        try {
            setCreating(true);
            setError("");

            const project = await api<Project>("/projects", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: projectName.trim(),
                    description: projectDescription.trim() || undefined,
                }),
            });

            setProjects((currentProjects) => [
                ...currentProjects,
                project,
            ]);

            setProjectName("");
            setProjectDescription("");
            setShowCreateForm(false);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to create project",
            );
        } finally {
            setCreating(false);
        }
    };

    return (
        <main className="dashboard">
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

            <section className="dashboard-content">
                <div className="dashboard-title">
                    <div>
                        <p className="eyebrow">Workspace</p>
                        <h1>Your Projects</h1>
                        <p>
                            Select a project to manage its repository and
                            development workspace.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="create-project-button"
                        onClick={() => {
                            setError("");
                            setShowCreateForm(true);
                        }}
                    >
                        + New Project
                    </button>
                </div>

                {showCreateForm && (
                    <form
                        className="create-project-form"
                        onSubmit={handleCreateProject}
                    >
                        <div className="form-header">
                            <div>
                                <p className="eyebrow">New project</p>
                                <h2>Create a project</h2>
                            </div>

                            <button
                                type="button"
                                className="close-button"
                                onClick={() => setShowCreateForm(false)}
                            >
                                ×
                            </button>
                        </div>

                        <label>
                            Project name
                            <input
                                type="text"
                                value={projectName}
                                onChange={(event) =>
                                    setProjectName(event.target.value)
                                }
                                placeholder="e.g. DevPilot API"
                                autoFocus
                            />
                        </label>

                        <label>
                            Description
                            <textarea
                                value={projectDescription}
                                onChange={(event) =>
                                    setProjectDescription(event.target.value)
                                }
                                placeholder="What is this project about?"
                                rows={3}
                            />
                        </label>

                        <div className="form-actions">
                            <button
                                type="button"
                                className="cancel-button"
                                onClick={() => setShowCreateForm(false)}
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                className="create-project-submit"
                                disabled={creating}
                            >
                                {creating ? "Creating..." : "Create Project"}
                            </button>
                        </div>
                    </form>
                )}

                {loading && (
                    <div className="state-message">
                        Loading projects...
                    </div>
                )}

                {error && (
                    <div className="error">
                        {error}
                    </div>
                )}

                {!loading && !error && projects.length === 0 && (
                    <div className="empty-state">
                        <h2>No projects yet</h2>
                        <p>
                            Create your first DevPilot project to get
                            started.
                        </p>
                    </div>
                )}

                {!loading && projects.length > 0 && (
                    <div className="project-grid">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="project-card"
                            >
                                <button
                                    type="button"
                                    className="project-card-main"
                                    onClick={() => onSelectProject(project)}
                                >
                                    <div className="project-card-top">
                                        <div className="project-icon">
                                            {project.name.charAt(0).toUpperCase()}
                                        </div>

                                        <span className="arrow">→</span>
                                    </div>

                                    <h2>{project.name}</h2>

                                    <p>
                                        {project.description ||
                                            "No description provided."}
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    className="delete-project-button"
                                    onClick={() => handleDeleteProject(project)}
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
};

export default Dashboard;