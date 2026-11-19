import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Robot, Task, SchedulerRequest
from app.scheduling import schedule, calculate_metrics
from app.simulation import run_simulation

def task(id, arrival, burst, priority=5, **kwargs):
    return Task(id=id, name=kwargs.pop("name", id), arrival_time=arrival, burst_time=burst, priority=priority, **kwargs)

def test_fcfs_metrics_and_idle_gantt():
    tasks = [task("A", 0, 5), task("B", 1, 3), task("C", 2, 7), task("D", 18, 2)]
    result = schedule(tasks, "fcfs")
    assert [(x.task_id, x.start, x.end) for x in result.gantt] == [("A",0,5),("B",5,8),("C",8,15),(None,15,18),("D",18,20)]
    assert calculate_metrics(tasks, result) == [
        {"task_id":"A","completion_time":5,"turnaround_time":5,"waiting_time":0,"response_time":0},
        {"task_id":"B","completion_time":8,"turnaround_time":7,"waiting_time":4,"response_time":4},
        {"task_id":"C","completion_time":15,"turnaround_time":13,"waiting_time":6,"response_time":6},
        {"task_id":"D","completion_time":20,"turnaround_time":2,"waiting_time":0,"response_time":0}]

def test_srtf_preempts_for_shorter_job():
    result = schedule([task("A",0,7), task("B",2,2)], "srtf")
    assert [(x.task_id,x.start,x.end) for x in result.gantt] == [("A",0,2),("B",2,4),("A",4,9)]

def test_round_robin_slices_and_response():
    tasks = [task("A",0,5), task("B",1,3)]
    result = schedule(tasks, "round_robin", quantum=2)
    assert [(x.task_id,x.start,x.end) for x in result.gantt] == [("A",0,2),("B",2,4),("A",4,6),("B",6,7),("A",7,8)]
    assert calculate_metrics(tasks,result)[1]["response_time"] == 1

def test_sjf_selects_shortest_available():
    result = schedule([task("A",0,5),task("B",0,2),task("C",0,1)], "sjf")
    assert [x.task_id for x in result.gantt] == ["C","B","A"]

def test_priority_uses_configured_priority_value():
    result = schedule([task("normal",0,2,priority=2), task("urgent",0,1,priority=9)], "priority")
    assert result.gantt[0].task_id == "urgent"

def test_preemptive_priority_runs_higher_priority_arrival_first():
    result = schedule([task("long",0,6,priority=2), task("urgent",2,2,priority=9)], "priority_preemptive")
    assert [(segment.task_id, segment.start, segment.end) for segment in result.gantt] == [
        ("long",0,2), ("urgent",2,4), ("long",4,8)]

def test_ai_dynamic_priority_recalculates_and_explains_changes():
    request = SchedulerRequest(robot=Robot(name="Robo", battery_level=16, battery_drain_per_unit=1), tasks=[
        task("routine",0,4,priority=2,deadline=5),
        task("charge",0,2,priority=3,name="Charging task",safety_level="high",deadline=20),
    ], algorithm="ai_dynamic", validate_resources=False)
    result = run_simulation(request)
    assert [(segment.task_id,segment.start,segment.end) for segment in result.gantt[:2]] == [
        ("routine",0,1), ("charge",1,3)]
    assert result.priorities[1].reasons
    update = next(event for event in result.events if event["type"] == "priority_updated" and event["task_id"] == "charge")
    assert update["time"] == 1

def test_dependency_waits_until_prerequisite_completes():
    tasks = [task("A",0,3), task("B",0,2,dependencies=["A"])]
    result = schedule(tasks, "fcfs")
    assert result.first_start["B"] >= result.completion["A"]

def test_dependency_cycle_is_rejected():
    req = SchedulerRequest(robot=Robot(name="Robo"), tasks=[task("A",0,1,dependencies=["B"]),task("B",0,1,dependencies=["A"])], validate_resources=False)
    with pytest.raises(ValueError, match="cycle"):
        run_simulation(req)

def test_incompatible_task_is_reported_instead_of_scheduled():
    request = SchedulerRequest(robot=Robot(name="Robo", components=["Wheels"]), tasks=[
        task("camera",0,2,required_components=["Camera"])
    ])
    result = run_simulation(request)
    assert result.metrics == []
    assert result.rejected_tasks[0]["task_id"] == "camera"
    assert "Missing components: Camera" in result.rejected_tasks[0]["reasons"]

def test_api_simulation_and_comparison_integration():
    client = TestClient(app)
    payload = {"robot":{"name":"Robo","components":["Camera"]},"tasks":[
        {"id":"A","name":"First","arrival_time":0,"burst_time":3},
        {"id":"B","name":"Second","arrival_time":1,"burst_time":2}],
        "algorithm":"fcfs"}
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 200
    assert response.json()["metrics"][1]["waiting_time"] == 2
    comparison = client.post("/api/compare", json=payload)
    assert comparison.status_code == 200
    assert len(comparison.json()["results"]) == 6
    available = client.get("/api/algorithms").json()
    assert [item["id"] for item in available] == ["fcfs", "sjf", "srtf", "round_robin", "priority", "ai_dynamic"]
