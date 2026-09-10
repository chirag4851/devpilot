import "dotenv/config";
import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";
import projectRoutes from "./routes/project.routes.js";
import repositoryRoutes from "./routes/repository.routes.js";
import githubRoutes from "./routes/github.routes.js";
import contextRoutes from "./routes/context.routes.js";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.use("/users", userRoutes);
app.use("/projects", projectRoutes);
app.use("/projects", repositoryRoutes);
app.use("/github", githubRoutes);
app.use("/api/context", contextRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});