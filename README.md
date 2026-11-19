# RoboOS — Robot Task Scheduler

A practical, local robot task scheduler with a React frontend and FastAPI backend. It includes standard operating-system schedulers, an explainable AI Dynamic scheduler, robot resource checks, task dependencies, Gantt output, simulation events, and a six-algorithm comparison. Priority Scheduling uses each task's explicit priority from 1–10, with 10 scheduled first. AI Dynamic adjusts at each simulation time unit using documented task priority, deadline urgency, safety, and low-battery charging rules; it does not call an external AI service.

## Open in PyCharm

Open the project folder in PyCharm: `Documents\PyCharmProjects\RoboOS`. Create or select a Python interpreter for the project. The backend and frontend run in separate terminal windows.

## Publish a test version

The repository includes a Render Blueprint at `render.yaml` that deploys both the FastAPI backend and React frontend. In Render, create a new Blueprint and connect the `knsaran45/RoboOS` GitHub repository. After both services finish deploying, test the static frontend at `https://knsaran45-roboos-web.onrender.com`; the API is available at `https://knsaran45-roboos-api.onrender.com/docs`. Render free services can take a short time to wake after inactivity.

## Start the API

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`; interactive API docs are at `/docs`.

## Start the interface

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`). The local Vite proxy forwards `/api` requests to `http://127.0.0.1:8000`; hosted builds use `VITE_API_URL` from `render.yaml`.

## Scheduling behavior

- **FCFS:** arrival order, non-preemptive.
- **SJF:** shortest available burst, non-preemptive.
- **SRTF:** shortest remaining burst, preemptive at unit boundaries.
- **Round Robin:** FIFO time slices, configurable quantum.
- **Priority:** task priority value from 1 to 10, higher values first; choose preemptive or non-preemptive.
- **AI Dynamic Priority:** recalculates task scores as simulation time advances, with a visible explanation of the factors and score changes.

Resources and capabilities are checked before scheduling. Task dependencies gate task arrivals until their prerequisites complete. Invalid dependency cycles return HTTP 422. Battery, task lifecycle, and dynamic priority changes are part of the simulation trace. `/api/compare` runs the same workload through all six schedulers. The frontend saves robot and task setup in the current browser using local storage.

## Verify

```powershell
cd backend
pip install pytest
pytest -q
```


