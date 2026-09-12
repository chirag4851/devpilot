from fastapi import FastAPI

from routers import auth, context, github, projects
from fastapi.middleware.cors import CORSMiddleware



app = FastAPI(title="DEVpilot Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(context.router)
app.include_router(github.router)
app.include_router(projects.router)





@app.get("/health")
async def health():
    return {"status": "ok"}