from enum import Enum
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class SafetyLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Robot(BaseModel):
    id: str = "robot-1"
    name: str = Field(min_length=1, max_length=80)
    robot_type: str = "service"
    purpose: str = ""
    components: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    battery_capacity: float = Field(default=100, gt=0)
    battery_level: float = Field(default=100, ge=0)
    battery_drain_per_unit: float = Field(default=1, ge=0)

    @model_validator(mode="after")
    def battery_within_capacity(self):
        if self.battery_level > self.battery_capacity:
            raise ValueError("battery_level cannot exceed battery_capacity")
        return self


class Task(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    arrival_time: int = Field(default=0, ge=0)
    burst_time: int = Field(gt=0)
    deadline: int | None = Field(default=None, ge=0)
    priority: int = Field(default=5, ge=1, le=10, description="Higher values run first in Priority Scheduling")
    safety_level: SafetyLevel = SafetyLevel.low
    required_components: list[str] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class SchedulerRequest(BaseModel):
    robot: Robot
    tasks: list[Task]
    algorithm: Literal["fcfs", "sjf", "srtf", "round_robin", "priority", "ai_dynamic"] = "fcfs"
    priority_mode: Literal["preemptive", "non_preemptive"] = "non_preemptive"
    time_quantum: int = Field(default=2, gt=0)
    validate_resources: bool = True


class Segment(BaseModel):
    task_id: str | None
    start: int
    end: int


class TaskMetrics(BaseModel):
    task_id: str
    completion_time: int
    turnaround_time: int
    waiting_time: int
    response_time: int


class PriorityExplanation(BaseModel):
    task_id: str
    score: float
    level: Literal["critical", "high", "medium", "low"]
    reasons: list[str]


class SimulationResult(BaseModel):
    algorithm: str
    gantt: list[Segment]
    metrics: list[TaskMetrics]
    average_turnaround_time: float
    average_waiting_time: float
    average_response_time: float
    makespan: int
    events: list[dict]
    priorities: list[PriorityExplanation] = Field(default_factory=list)
    rejected_tasks: list[dict] = Field(default_factory=list)

