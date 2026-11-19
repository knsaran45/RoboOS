from collections import deque
from dataclasses import dataclass
from .models import Task, Segment


@dataclass
class Schedule:
    gantt: list[Segment]
    completion: dict[str, int]
    first_start: dict[str, int]
    events: list[dict]


def _segment(gantt, task_id, start, end):
    if start == end:
        return
    if gantt and gantt[-1].task_id == task_id and gantt[-1].end == start:
        gantt[-1].end = end
    else:
        gantt.append(Segment(task_id=task_id, start=start, end=end))


def schedule(tasks: list[Task], algorithm: str, quantum: int = 2, priority_scores=None) -> Schedule:
    """Discrete time scheduling. CPU is idle until arrivals; ties follow input order."""
    tasks = list(tasks)
    if not tasks:
        return Schedule([], {}, {}, [])
    by_id = {t.id: t for t in tasks}
    if len(by_id) != len(tasks):
        raise ValueError("Task ids must be unique")
    order = {t.id: i for i, t in enumerate(tasks)}
    remaining = {t.id: t.burst_time for t in tasks}
    completion, first = {}, {}
    gantt, events = [], []
    now = 0
    ready = deque()
    arrived = set()

    def add_arrivals():
        for task in sorted(tasks, key=lambda x: (x.arrival_time, order[x.id])):
            dependencies_done = all(dep in completion for dep in task.dependencies)
            if task.id not in arrived and task.arrival_time <= now and dependencies_done:
                arrived.add(task.id)
                ready.append(task.id)
                events.append({"time": now, "type": "task_arrived", "task_id": task.id})

    def choice(candidates, key):
        return min(candidates, key=lambda task_id: (key(task_id), order[task_id]))

    while len(completion) < len(tasks):
        add_arrivals()
        available = [tid for tid in ready if remaining[tid] > 0]
        if not available:
            pending_times = [t.arrival_time for t in tasks if t.id not in arrived]
            # If an arrival is already in the past, its dependency will become
            # eligible at the next completion boundary, so advance one unit.
            next_arrival = min(pending_times)
            next_time = max(now + 1, next_arrival)
            _segment(gantt, None, now, next_time)
            now = next_time
            add_arrivals()
            continue

        preemptive = algorithm in ("srtf", "priority_preemptive", "ai_dynamic")
        if algorithm in ("fcfs", "round_robin"):
            tid = ready.popleft()
        elif algorithm == "sjf":
            tid = choice(available, lambda t: by_id[t].burst_time)
        elif algorithm == "srtf":
            tid = choice(available, lambda t: remaining[t])
        elif algorithm in ("priority", "priority_preemptive"):
            tid = choice(available, lambda t: -by_id[t].priority)
        elif algorithm == "ai_dynamic":
            scores = priority_scores(now) if callable(priority_scores) else (priority_scores or {})
            tid = choice(available, lambda t: -scores.get(t, by_id[t].priority))
        else:
            raise ValueError(f"Unknown scheduling algorithm: {algorithm}")
        if not preemptive and algorithm not in ("fcfs", "round_robin"):
            ready.remove(tid)
        if tid not in first:
            first[tid] = now
            events.append({"time": now, "type": "task_started", "task_id": tid})
        elif algorithm in ("srtf", "priority_preemptive", "ai_dynamic", "round_robin"):
            events.append({"time": now, "type": "task_resumed", "task_id": tid})

        if algorithm == "round_robin":
            run_for = min(quantum, remaining[tid])
        elif preemptive:
            run_for = 1
        else:
            run_for = remaining[tid]
        start = now
        was_preempted = False
        for _ in range(run_for):
            now += 1
            remaining[tid] -= 1
            add_arrivals()
            if algorithm in ("srtf", "priority_preemptive", "ai_dynamic") and remaining[tid] > 0:
                # Re-evaluate only at unit boundaries; newly arrived work can preempt.
                candidates = [x for x in ready if remaining[x] > 0]
                if candidates:
                    if algorithm == "srtf":
                        best = choice([tid] + candidates, lambda x: remaining[x])
                    elif algorithm == "ai_dynamic":
                        scores = priority_scores(now) if callable(priority_scores) else (priority_scores or {})
                        best = choice([tid] + candidates, lambda x: -scores.get(x, by_id[x].priority))
                    else:
                        best = choice([tid] + candidates, lambda x: -by_id[x].priority)
                    if best != tid:
                        was_preempted = True
                        break
        _segment(gantt, tid, start, now)
        if remaining[tid] == 0:
            completion[tid] = now
            deadline = by_id[tid].deadline
            events.append({"time": now, "type": "task_completed", "task_id": tid,
                           "deadline_missed": deadline is not None and now > deadline})
        elif algorithm == "round_robin":
            events.append({"time": now, "type": "time_slice_ended", "task_id": tid})
            ready.append(tid)
        elif tid not in ready:
            events.append({"time": now, "type": "task_preempted", "task_id": tid})
            ready.appendleft(tid)
        elif was_preempted:
            events.append({"time": now, "type": "task_preempted", "task_id": tid})
    return Schedule(gantt, completion, first, events)


def calculate_metrics(tasks: list[Task], result: Schedule):
    metrics = []
    for task in tasks:
        ct = result.completion[task.id]
        tat = ct - task.arrival_time
        metrics.append({"task_id": task.id, "completion_time": ct,
                        "turnaround_time": tat,
                        "waiting_time": tat - task.burst_time,
                        "response_time": result.first_start[task.id] - task.arrival_time})
    return metrics
