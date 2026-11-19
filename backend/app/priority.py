from .models import PriorityExplanation, Robot, Task


def explain_priorities(robot: Robot, tasks: list[Task], now: int = 0) -> list[PriorityExplanation]:
    """Return transparent rule-based scores. Higher scores run earlier."""
    safety_points = {"low": 0, "medium": 8, "high": 16, "critical": 24}
    explanations = []
    for task in tasks:
        score = float(task.priority * 4)
        reasons = [f"Task priority {task.priority}/10 contributes {task.priority * 4} points"]

        if task.deadline is not None:
            slack = task.deadline - now - task.burst_time
            urgency = max(0.0, min(30.0, 30.0 - max(0, slack) * 2.0))
            score += urgency
            reasons.append(f"Deadline slack {slack} adds {urgency:g} urgency points")

        safety_bonus = safety_points[task.safety_level.value]
        score += safety_bonus
        if safety_bonus:
            reasons.append(f"{task.safety_level.value.title()} safety adds {safety_bonus} points")

        if robot.battery_level <= 15 and "charging" in task.name.casefold():
            score += 30
            reasons.append("Battery is at or below 15%; charging work adds 30 points")

        score = min(100.0, score)
        level = "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low"
        explanations.append(PriorityExplanation(task_id=task.id, score=score, level=level, reasons=reasons))
    return explanations
