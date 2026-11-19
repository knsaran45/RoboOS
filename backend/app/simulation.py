from .models import SchedulerRequest, SimulationResult
from .scheduling import schedule, calculate_metrics
from .resources import validate_tasks
from .priority import explain_priorities


def run_simulation(request: SchedulerRequest) -> SimulationResult:
    tasks = request.tasks
    task_ids = {task.id for task in tasks}
    if len(task_ids) != len(tasks):
        raise ValueError("Task ids must be unique")
    for task in tasks:
        unknown = [dep for dep in task.dependencies if dep not in task_ids]
        if unknown:
            raise ValueError(f"Task {task.id} has unknown dependencies: {', '.join(unknown)}")

    rejected = []
    if request.validate_resources:
        tasks, rejected = validate_tasks(request.robot, tasks)

    # Check dependency cycles before starting the scheduler.
    task_map = {task.id: task for task in tasks}
    visiting, visited = set(), set()

    def visit(task_id):
        if task_id in visiting:
            raise ValueError("Task dependencies contain a cycle")
        if task_id in visited:
            return
        visiting.add(task_id)
        for dependency in task_map[task_id].dependencies:
            if dependency in task_map:
                visit(dependency)
        visiting.remove(task_id)
        visited.add(task_id)

    for task in tasks:
        visit(task.id)

    algorithm = request.algorithm
    priority_explanations = []
    dynamic_priority_events = []
    score_at_time = None
    if algorithm == "ai_dynamic":
        priority_explanations = explain_priorities(request.robot, tasks)
        previous_scores = {}

        def score_at_time(now):
            live_robot = request.robot.model_copy(update={
                "battery_level": max(0, request.robot.battery_level - now * request.robot.battery_drain_per_unit)
            })
            live_explanations = explain_priorities(live_robot, tasks, now)
            current_scores = {item.task_id: item.score for item in live_explanations}
            for item in live_explanations:
                if item.task_id in previous_scores and previous_scores[item.task_id] != item.score:
                    dynamic_priority_events.append({
                        "time": now,
                        "type": "priority_updated",
                        "task_id": item.task_id,
                        "score": item.score,
                        "reasons": item.reasons,
                    })
            previous_scores.update(current_scores)
            return current_scores

    if algorithm == "priority" and request.priority_mode == "preemptive":
        algorithm = "priority_preemptive"
    result = schedule(tasks, algorithm, request.time_quantum, score_at_time)
    result.events.extend(dynamic_priority_events)
    metrics = calculate_metrics(tasks, result)

    drain = request.robot.battery_drain_per_unit
    for segment in result.gantt:
        if segment.task_id is not None:
            result.events.append({
                "time": segment.end,
                "type": "battery_updated",
                "task_id": segment.task_id,
                "battery_level": max(0, request.robot.battery_level - segment.end * drain),
            })

    count = len(metrics)
    average = lambda key: round(sum(row[key] for row in metrics) / count, 2) if count else 0.0
    return SimulationResult(
        algorithm=request.algorithm,
        gantt=result.gantt,
        metrics=metrics,
        average_turnaround_time=average("turnaround_time"),
        average_waiting_time=average("waiting_time"),
        average_response_time=average("response_time"),
        makespan=max(result.completion.values(), default=0),
        events=sorted(result.events, key=lambda event: event["time"]),
        priorities=priority_explanations,
        rejected_tasks=rejected,
    )
