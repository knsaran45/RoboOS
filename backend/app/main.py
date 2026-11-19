import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import SchedulerRequest, Robot, Task
from .simulation import run_simulation

app = FastAPI(title="Robot Task Scheduler", version="1.0.0",
              description="Robot configuration, operating-system scheduling, and simulation")
allowed_origins = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                   allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

@app.get("/api/health")
def health(): return {"status": "ok"}

@app.get("/api/algorithms")
def algorithms():
    return [{"id":"fcfs","name":"First Come, First Served"},{"id":"sjf","name":"Shortest Job First"},
            {"id":"srtf","name":"Shortest Remaining Time First"},{"id":"round_robin","name":"Round Robin"},
            {"id":"priority","name":"Priority Scheduling"},{"id":"ai_dynamic","name":"AI Dynamic Priority"}]

@app.post("/api/simulate")
def simulate(request: SchedulerRequest):
    try: return run_simulation(request)
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post("/api/compare")
def compare(request: SchedulerRequest):
    results = []
    algorithms = ["fcfs", "sjf", "srtf", "round_robin", "priority", "ai_dynamic"]
    for algorithm in algorithms:
        run = request.model_copy(update={"algorithm":algorithm})
        results.append(run_simulation(run))
    return {"results":results}

@app.post("/api/validate")
def validate(request: SchedulerRequest):
    try:
        result = run_simulation(request)
        return {"valid": not result.rejected_tasks, "rejected_tasks":result.rejected_tasks,
                "eligible_task_ids":[m.task_id for m in result.metrics]}
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc

