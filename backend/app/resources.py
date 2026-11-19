from .models import Robot, Task


def validate_tasks(robot: Robot, tasks: list[Task]):
    components = {x.casefold() for x in robot.components}
    capabilities = {x.casefold() for x in robot.capabilities}
    ids = {t.id for t in tasks}
    rejected, accepted = [], []
    # Schedule eligibility is static; dependency existence is validated here and
    # execution ordering remains the scheduler's responsibility.
    for task in tasks:
        missing_components = [x for x in task.required_components if x.casefold() not in components]
        missing_capabilities = [x for x in task.required_capabilities if x.casefold() not in capabilities]
        unknown_dependencies = [x for x in task.dependencies if x not in ids]
        if missing_components or missing_capabilities or unknown_dependencies:
            rejected.append({"task_id": task.id, "reasons": [
                *([f"Missing components: {', '.join(missing_components)}"] if missing_components else []),
                *([f"Missing capabilities: {', '.join(missing_capabilities)}"] if missing_capabilities else []),
                *([f"Unknown dependencies: {', '.join(unknown_dependencies)}"] if unknown_dependencies else [])]})
        else:
            accepted.append(task)
    # A task cannot run when one of its prerequisites was itself rejected.
    rejected_ids = {item["task_id"] for item in rejected}
    changed = True
    while changed:
        changed = False
        for task in list(accepted):
            blocked = [dep for dep in task.dependencies if dep in rejected_ids]
            if blocked:
                accepted.remove(task)
                rejected.append({"task_id": task.id, "reasons": [f"Blocked by ineligible dependencies: {', '.join(blocked)}"]})
                rejected_ids.add(task.id)
                changed = True
    return accepted, rejected
