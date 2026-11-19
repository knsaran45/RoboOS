import { useEffect, useMemo, useState } from 'react'
import { Activity, Bot, Check, ChevronDown, CircleHelp, Clock3, Cpu, Gauge, ListTodo, Plus, Play, Radio, RotateCcw, Settings2, ShieldAlert, Trash2, Pencil, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const API = API_ORIGIN ? `${API_ORIGIN}/api` : '/api'
const navItems = ['Dashboard', 'Tasks', 'Robot setup', 'Scheduler & results']
const algorithms = [
  { id: 'fcfs', name: 'First Come, First Served', short: 'FCFS', note: 'Arrival order; no preemption' },
  { id: 'sjf', name: 'Shortest Job First', short: 'SJF', note: 'Shortest available task first' },
  { id: 'srtf', name: 'Shortest Remaining Time', short: 'SRTF', note: 'Preempts for less remaining work' },
  { id: 'round_robin', name: 'Round Robin', short: 'RR', note: 'Shares time in configurable slices' },
  { id: 'priority', name: 'Priority Scheduling', short: 'Priority', note: 'Higher task priority runs first' },
  { id: 'ai_dynamic', name: 'AI Dynamic Priority', short: 'AI Dynamic', note: 'Rechecks deadline, safety, priority, and battery as time advances' },
]
const emptyTask = { id: '', name: '', description: '', arrival_time: 0, burst_time: 3, deadline: '', priority: 5, safety_level: 'medium', required_components: [], required_capabilities: [], dependencies: [] }
const defaultRobot = { id: 'robot-1', name: 'Atlas-01', robot_type: 'Mobile service robot', purpose: 'Hospital deliveries and facility support', components: ['Camera', 'Wheels', 'Lidar', 'Gripper arm'], capabilities: ['Navigation', 'Object detection', 'Payload handling'], battery_capacity: 100, battery_level: 72, battery_drain_per_unit: 1.3 }
const defaultTasks = [
  { ...emptyTask, id: 'T-01', name: 'Emergency medicine delivery', description: 'Deliver pharmacy order to ICU.', arrival_time: 0, burst_time: 5, deadline: 8, priority: 10, safety_level: 'critical', required_components: ['Camera', 'Wheels'], required_capabilities: ['Navigation'], dependencies: [] },
  { ...emptyTask, id: 'T-02', name: 'Inventory scan · Ward B', description: 'Scan shelves and update stock.', arrival_time: 1, burst_time: 4, deadline: 16, priority: 4, safety_level: 'low', required_components: ['Camera'], required_capabilities: ['Object detection'], dependencies: [] },
  { ...emptyTask, id: 'T-03', name: 'Recharge at station', description: 'Return to the nearest charging dock.', arrival_time: 3, burst_time: 3, deadline: 12, priority: 7, safety_level: 'medium', required_components: ['Wheels'], required_capabilities: ['Navigation'], dependencies: [] },
  { ...emptyTask, id: 'T-04', name: 'Deliver lab samples', description: 'Transport sealed samples to pathology.', arrival_time: 5, burst_time: 6, deadline: 20, priority: 8, safety_level: 'high', required_components: ['Wheels', 'Gripper arm'], required_capabilities: ['Navigation', 'Payload handling'], dependencies: ['T-01'] },
]
const colors = ['#42b883', '#4f9ce8', '#a784e8', '#e5a445', '#e37777', '#39a7a0']
const readSaved = (key, fallback) => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback } catch { return fallback } }
const splitList = value => value.split(',').map(item => item.trim()).filter(Boolean)

export default function App() {
  const [page, setPage] = useState('Dashboard')
  const [robot, setRobot] = useState(() => readSaved('roboos-robot', defaultRobot))
  const [tasks, setTasks] = useState(() => readSaved('roboos-tasks', defaultTasks))
  const [algorithm, setAlgorithm] = useState('fcfs')
  const [priorityMode, setPriorityMode] = useState('non_preemptive')
  const [quantum, setQuantum] = useState(2)
  const [result, setResult] = useState(null)
  const [comparison, setComparison] = useState([])
  const [apiOnline, setApiOnline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [dialog, setDialog] = useState(null)

  useEffect(() => { localStorage.setItem('roboos-robot', JSON.stringify(robot)) }, [robot])
  useEffect(() => { localStorage.setItem('roboos-tasks', JSON.stringify(tasks)) }, [tasks])
  useEffect(() => {
    let mounted = true
    const checkApi = () => fetch(`${API}/health`).then(response => { if (mounted) setApiOnline(response.ok) }).catch(() => { if (mounted) setApiOnline(false) })
    checkApi()
    const timer = setInterval(checkApi, 5000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  const payload = (selectedAlgorithm = algorithm) => ({ robot, tasks, algorithm: selectedAlgorithm, priority_mode: priorityMode, time_quantum: Number(quantum), validate_resources: true })
  const compatible = useMemo(() => new Set(tasks.filter(task =>
    task.required_components.every(item => robot.components.some(value => value.toLowerCase() === item.toLowerCase())) &&
    task.required_capabilities.every(item => robot.capabilities.some(value => value.toLowerCase() === item.toLowerCase()))
  ).map(task => task.id)), [robot, tasks])
  async function post(path, body) {
    const response = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setApiOnline(true)
    const data = await response.json()
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The request could not be completed.')
    return data
  }
  async function runSimulation() {
    setBusy(true); setMessage('')
    try { const data = await post('/simulate', payload()); setResult(data); setPage('Scheduler & results'); setMessage('Simulation finished. Metrics below come from the scheduler run.') }
    catch (error) { setMessage(`${error.message}${!apiOnline ? ' Start the backend first.' : ''}`) }
    finally { setBusy(false) }
  }
  async function compareSchedulers() {
    setBusy(true); setMessage('')
    try { const data = await post('/compare', payload()); setComparison(data.results); setPage('Scheduler & results'); setMessage('All six schedulers completed on the same workload.') }
    catch (error) { setMessage(`${error.message}${!apiOnline ? ' Start the backend first.' : ''}`) }
    finally { setBusy(false) }
  }
  function saveTask(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = { ...emptyTask, ...dialog.task, id: dialog.task?.id || nextTaskId(tasks), name: data.get('name').trim(), description: data.get('description').trim(), arrival_time: Number(data.get('arrival_time')), burst_time: Number(data.get('burst_time')), deadline: data.get('deadline') === '' ? null : Number(data.get('deadline')), priority: Number(data.get('priority')), safety_level: data.get('safety_level'), required_components: splitList(data.get('required_components')), required_capabilities: splitList(data.get('required_capabilities')), dependencies: splitList(data.get('dependencies')) }
    setTasks(current => dialog.task ? current.map(task => task.id === next.id ? next : task) : [...current, next])
    setResult(null); setComparison([]); setDialog(null); setMessage('Task saved.')
  }
  function saveRobot(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = { ...robot, name: data.get('name').trim(), robot_type: data.get('robot_type').trim(), purpose: data.get('purpose').trim(), battery_capacity: Number(data.get('battery_capacity')), battery_level: Number(data.get('battery_level')), battery_drain_per_unit: Number(data.get('battery_drain_per_unit')), components: splitList(data.get('components')), capabilities: splitList(data.get('capabilities')) }
    if (next.battery_level > next.battery_capacity) { setMessage('Battery level cannot exceed the robot’s battery capacity.'); return }
    setRobot(next); setResult(null); setComparison([]); setMessage('Robot setup saved.')
  }
  function deleteTask(id) { setTasks(current => current.filter(task => task.id !== id).map(task => ({ ...task, dependencies: task.dependencies.filter(dependency => dependency !== id) }))); setResult(null); setComparison([]); setMessage('Task removed. References to it were cleared.') }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#dashboard" onClick={() => setPage('Dashboard')}><span className="brand-icon"><Bot size={20}/></span><span>Robo<span>OS</span></span></a>
      <div className="robot-switcher"><div className="robot-mark">{robot.name.slice(0, 1).toUpperCase()}</div><div><b>{robot.name}</b><small>Robot workspace</small></div><ChevronDown size={15}/></div>
      <p className="nav-caption">WORKSPACE</p>
      <nav>{navItems.map((item, index) => { const Icon = [Gauge, ListTodo, Bot, Activity][index]; return <button key={item} className={`nav-link ${page === item ? 'active' : ''}`} onClick={() => setPage(item)}><Icon size={17}/>{item}{item === 'Tasks' && <span className="nav-count">{tasks.length}</span>}</button> })}</nav>
      <div className="sidebar-bottom"><div className={`connection ${apiOnline ? 'connected' : ''}`}><span/>{apiOnline ? 'Backend connected' : 'Backend offline'}</div><div className="side-help"><CircleHelp size={16}/><span>Scheduling lab</span></div><small className="version">Robot Task Scheduler · v1.0</small></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Robot workspace <span>/</span> <b>{page}</b></div><div className="topbar-right"><span className={`status-label ${apiOnline ? 'ok' : 'offline'}`}><i/>{apiOnline ? 'Connected' : 'Waiting for backend'}</span><button className="avatar" title="Local workspace">KS</button></div></header>
      <div className="page-wrap">
        <div className="page-title"><div><p className="eyebrow">ROBOT OPERATIONS</p><h1>{page}</h1><p className="subheading">Configure the robot, manage work, and compare operating-system schedulers.</p></div><div className="title-actions"><button className="button secondary" onClick={() => { setResult(null); setComparison([]); setMessage('Simulation results cleared.') }}><RotateCcw size={15}/> Clear results</button><button className="button primary" onClick={runSimulation} disabled={busy || !tasks.length}><Play size={15} fill="currentColor"/>{busy ? 'Working…' : 'Run scheduler'}</button></div></div>
        {message && <div className={`notice ${message.includes('could not') || message.includes('cannot') || message.includes('Error') || message.includes('Start the backend') ? 'notice-error' : ''}`}><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss"><X size={15}/></button></div>}

        {page === 'Dashboard' && <Dashboard robot={robot} tasks={tasks} compatible={compatible} result={result} algorithm={algorithm} setPage={setPage} openTask={task => setDialog({ type: 'task', task })} runSimulation={runSimulation} busy={busy}/>}
        {page === 'Tasks' && <TaskPage tasks={tasks} compatible={compatible} openTask={task => setDialog({ type: 'task', task })} deleteTask={deleteTask}/>}
        {page === 'Robot setup' && <RobotPage robot={robot} saveRobot={saveRobot}/>}
        {page === 'Scheduler & results' && <SchedulerPage algorithm={algorithm} setAlgorithm={setAlgorithm} priorityMode={priorityMode} setPriorityMode={setPriorityMode} quantum={quantum} setQuantum={setQuantum} runSimulation={runSimulation} compare={compareSchedulers} busy={busy} result={result} comparison={comparison} tasks={tasks}/>}
        <footer className="footer"><span>RoboOS · Local robot task scheduling</span><span>FCFS · SJF · SRTF · Round Robin · Priority</span></footer>
      </div>
    </main>
    {dialog?.type === 'task' && <TaskDialog task={dialog.task} tasks={tasks} close={() => setDialog(null)} save={saveTask}/>}
  </div>
}

function nextTaskId(tasks) { const next = Math.max(0, ...tasks.map(task => Number(task.id.replace(/\D/g, '')) || 0)) + 1; return `T-${String(next).padStart(2, '0')}` }
function Dashboard({ robot, tasks, compatible, result, algorithm, setPage, openTask, runSimulation, busy }) {
  const ready = tasks.filter(task => compatible.has(task.id)).length
  return <>
    <section className="robot-summary card"><div className="robot-illustration"><Bot size={32}/></div><div className="robot-summary-copy"><div className="robot-name-line"><h2>{robot.name}</h2><span className="ready-badge"><i/> Ready</span></div><p>{robot.purpose || robot.robot_type}</p><small><Cpu size={14}/>{robot.components.length} components <span>·</span> {robot.capabilities.length} capabilities</small></div><div className="battery-summary"><div><span>BATTERY</span><b>{robot.battery_level}%</b></div><div className="battery-track"><span style={{ width: `${Math.min(100, robot.battery_level / robot.battery_capacity * 100)}%` }}/></div><small>Capacity {robot.battery_capacity}</small></div><button className="button secondary" onClick={() => setPage('Robot setup')}><Settings2 size={15}/> Robot setup</button></section>
    <div className="stats-grid"><Stat icon={ListTodo} label="Tasks in queue" value={tasks.length} note={`${ready} match robot resources`}/><Stat icon={ShieldAlert} label="Need attention" value={tasks.length - ready} note="Resource or capability mismatch" warn={tasks.length > ready}/><Stat icon={Clock3} label="Average wait" value={result ? `${result.average_waiting_time} u` : '—'} note="Calculated after a run"/><Stat icon={Activity} label="Last run" value={result ? `${result.makespan} u` : '—'} note={result ? `${result.metrics.length} tasks scheduled` : 'No simulation yet'}/></div>
    <div className="dashboard-columns"><section className="card section-card"><div className="section-heading"><div><p className="eyebrow">TASK QUEUE</p><h2>Upcoming tasks</h2></div><button className="button text-button" onClick={() => openTask(null)}><Plus size={15}/> Add task</button></div><TaskTable tasks={tasks.slice(0, 5)} compatible={compatible} deleteTask={() => {}} compact/><button className="link-button" onClick={() => setPage('Tasks')}>Manage all tasks →</button></section><section className="card section-card"><div className="section-heading"><div><p className="eyebrow">QUICK ACTIONS</p><h2>Run your workload</h2></div><span className="quick-icon"><Activity size={17}/></span></div><p className="muted">Run the selected scheduler against the task queue and inspect calculated response, waiting, and turnaround metrics.</p><button className="button primary wide-button" onClick={runSimulation} disabled={busy || !tasks.length}><Play size={15} fill="currentColor"/>{busy ? 'Running…' : `Run ${algorithms.find(item => item.id === algorithm)?.short} simulation`}</button><button className="button secondary wide-button" onClick={() => setPage('Scheduler & results')}>Choose a scheduler</button><div className="mini-note"><Radio size={14}/> Simulation runs on the backend using task arrival and burst times.</div></section></div>
    <section className="card workflow-card"><div><p className="eyebrow">HOW THE WORKFLOW RUNS</p><h2>Configure → Schedule → Review</h2></div><div className="workflow-steps"><div><b>01</b><span>Set robot resources</span><small>Components and capabilities</small></div><div><b>02</b><span>Prepare tasks</span><small>Arrival, burst, priority, dependencies</small></div><div><b>03</b><span>Compare algorithms</span><small>Use real simulation metrics</small></div></div></section>
  </>
}
function Stat({ icon: Icon, label, value, note, warn }) { return <section className="card stat-card"><div className="stat-top"><span>{label}</span><i className={warn ? 'warn' : ''}><Icon size={16}/></i></div><b className="stat-value">{value}</b><small>{note}</small></section> }
function TaskPage({ tasks, compatible, openTask, deleteTask }) {
  const [filter, setFilter] = useState('all')
  const shown = tasks.filter(task => filter === 'all' || (filter === 'ready' ? compatible.has(task.id) : !compatible.has(task.id)))
  return <section className="card section-card"><div className="section-heading"><div><p className="eyebrow">WORKLOAD</p><h2>Task management</h2></div><button className="button primary" onClick={() => openTask(null)}><Plus size={15}/> Add task</button></div><div className="toolbar"><div className="filter-tabs">{[['all',`All tasks · ${tasks.length}`],['ready','Robot-ready'],['blocked','Missing resources']].map(([key,label])=><button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><span className="muted">Priority 10 is highest</span></div><TaskTable tasks={shown} compatible={compatible} openTask={openTask} deleteTask={deleteTask}/>{!shown.length && <div className="empty-state">No tasks match this filter.</div>}</section>
}
function TaskTable({ tasks, compatible, openTask, deleteTask, compact = false }) {
  return <div className="table-scroll"><table className="tasks-table"><thead><tr><th>Task</th><th>Arrival</th><th>Burst</th><th>Deadline</th><th>Priority</th><th>Robot resources</th>{!compact && <th>Actions</th>}</tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><div className="task-cell"><span className="task-id">{task.id}</span><span><b>{task.name}</b><small>{task.description || 'No description'}</small></span></div></td><td>{task.arrival_time}</td><td>{task.burst_time} u</td><td>{task.deadline ?? '—'}</td><td><span className={`priority-tag p${task.priority >= 8 ? 'high' : task.priority <= 3 ? 'low' : 'mid'}`}>{task.priority}/10</span></td><td><span className={`resource-status ${compatible.has(task.id) ? 'good' : 'blocked'}`}><i/>{compatible.has(task.id) ? 'Ready' : 'Missing'}</span></td>{!compact && <td><div className="row-actions"><button title="Edit task" onClick={() => openTask(task)}><Pencil size={14}/></button><button title="Delete task" onClick={() => deleteTask(task.id)}><Trash2 size={14}/></button></div></td>}</tr>)}</tbody></table></div>
}
function RobotPage({ robot, saveRobot }) {
  return <form className="card form-card" onSubmit={saveRobot}><div className="section-heading"><div><p className="eyebrow">ROBOT CONFIGURATION</p><h2>Robot setup</h2><p className="muted">Resource validation uses these components and capabilities before scheduling.</p></div><span className="quick-icon"><Bot size={18}/></span></div><div className="form-grid"><Field label="Robot name"><input name="name" required defaultValue={robot.name}/></Field><Field label="Robot type"><input name="robot_type" defaultValue={robot.robot_type}/></Field><Field label="Purpose" wide><input name="purpose" defaultValue={robot.purpose}/></Field><Field label="Battery capacity"><input name="battery_capacity" type="number" min="1" required defaultValue={robot.battery_capacity}/></Field><Field label="Current battery level"><input name="battery_level" type="number" min="0" step="0.1" required defaultValue={robot.battery_level}/></Field><Field label="Battery drain per time unit"><input name="battery_drain_per_unit" type="number" min="0" step="0.1" required defaultValue={robot.battery_drain_per_unit}/></Field><Field label="Components · comma separated" wide><textarea name="components" rows="3" defaultValue={robot.components.join(', ')}/></Field><Field label="Capabilities · comma separated" wide><textarea name="capabilities" rows="3" defaultValue={robot.capabilities.join(', ')}/></Field></div><div className="form-footer"><span className="muted">Saved in this browser on this device.</span><button className="button primary" type="submit"><Check size={15}/> Save robot setup</button></div></form>
}
function SchedulerPage({ algorithm, setAlgorithm, priorityMode, setPriorityMode, quantum, setQuantum, runSimulation, compare, busy, result, comparison, tasks }) {
  const comparisonRows = comparison.map(item => ({ name: algorithms.find(algo => algo.id === item.algorithm)?.short || item.algorithm, Wait: item.average_waiting_time, Turnaround: item.average_turnaround_time, Response: item.average_response_time }))
  return <div className="results-layout"><section className="card section-card scheduler-card"><div className="section-heading"><div><p className="eyebrow">SCHEDULER SETTINGS</p><h2>Select an algorithm</h2></div><span className="quick-icon"><Settings2 size={17}/></span></div><div className="algorithm-options">{algorithms.map(algo => <button className={`algorithm-option ${algorithm === algo.id ? 'chosen' : ''}`} key={algo.id} onClick={() => setAlgorithm(algo.id)}><span className="algorithm-radio">{algorithm === algo.id && <i/>}</span><span><b>{algo.name}</b><small>{algo.note}</small></span></button>)}</div>{algorithm === 'round_robin' && <Field label="Time quantum"><input type="number" min="1" value={quantum} onChange={event => setQuantum(event.target.value)}/></Field>}{algorithm === 'priority' && <Field label="Priority scheduling mode"><select value={priorityMode} onChange={event => setPriorityMode(event.target.value)}><option value="non_preemptive">Non-preemptive</option><option value="preemptive">Preemptive</option></select></Field>}<div className="button-stack"><button className="button primary" onClick={runSimulation} disabled={busy || !tasks.length}><Play size={15} fill="currentColor"/>{busy ? 'Running…' : 'Run selected scheduler'}</button><button className="button secondary" onClick={compare} disabled={busy || !tasks.length}>Compare all six</button></div></section>
    <section className="card section-card results-card"><div className="section-heading"><div><p className="eyebrow">SIMULATION RESULTS</p><h2>{result ? algorithms.find(algo => algo.id === result.algorithm)?.name : 'Run a simulation'}</h2></div>{result && <span className="run-badge"><Check size={14}/> Complete</span>}</div>{result ? <><div className="result-metrics">{averagesFrom(result).map(([label, value]) => <div key={label}><small>{label}</small><b>{value}<i> units</i></b></div>)}<div><small>Makespan</small><b>{result.makespan}<i> units</i></b></div></div><Gantt result={result} tasks={tasks}/>{result.priorities?.length > 0 && <div className="priority-explanations"><h3>AI priority explanations</h3>{result.priorities.map(item => <div key={item.task_id}><b>{item.task_id} · {Math.round(item.score)} · {item.level}</b><span>{item.reasons.join(' · ')}</span></div>)}</div>}<div className="event-list"><h3>Recent simulation events</h3>{result.events.slice(-8).reverse().map((event,index) => <div key={`${event.time}-${event.type}-${index}`}><time>t={event.time}</time><span>{event.type.replaceAll('_', ' ')}{event.task_id ? ` · ${event.task_id}` : ''}{event.deadline_missed ? ' · deadline missed' : ''}{event.score !== undefined ? ` · score ${Math.round(event.score)}` : ''}{event.reasons?.length ? ` · ${event.reasons.join('; ')}` : ''}{event.battery_level !== undefined ? ` · battery ${event.battery_level.toFixed(1)}%` : ''}</span></div>)}</div>{result.rejected_tasks.length > 0 && <div className="rejected-list">{result.rejected_tasks.map(item => <p key={item.task_id}><b>{item.task_id}</b>: {item.reasons.join('; ')}</p>)}</div>}</> : <div className="empty-state">Choose a scheduler and run the workload to see measured completion, waiting, and response times.</div>}</section>
    {comparison.length > 0 && <section className="card section-card comparison-card"><div className="section-heading"><div><p className="eyebrow">SAME WORKLOAD · SIX SCHEDULERS</p><h2>Performance comparison</h2></div></div><div className="comparison-chart"><ResponsiveContainer width="100%" height={260}><BarChart data={comparisonRows} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="#e6eaed" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#657482', fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: '#657482', fontSize: 11 }}/><Tooltip/><Bar dataKey="Wait" fill="#42b883" radius={[4,4,0,0]}/><Bar dataKey="Turnaround" fill="#4f9ce8" radius={[4,4,0,0]}/><Bar dataKey="Response" fill="#a784e8" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="wait"/> Average waiting</span><span><i className="turn"/> Average turnaround</span><span><i className="resp"/> Average response</span></div><div className="table-scroll"><table className="tasks-table"><thead><tr><th>Scheduler</th><th>Average wait</th><th>Average turnaround</th><th>Average response</th><th>Makespan</th></tr></thead><tbody>{comparison.map(item => <tr key={item.algorithm}><td>{algorithms.find(algo => algo.id === item.algorithm)?.name}</td><td>{item.average_waiting_time}</td><td>{item.average_turnaround_time}</td><td>{item.average_response_time}</td><td>{item.makespan}</td></tr>)}</tbody></table></div></section>}
  </div>
}
function averagesFrom(result) { return [['Average waiting', result.average_waiting_time], ['Average turnaround', result.average_turnaround_time], ['Average response', result.average_response_time]] }
function Gantt({ result, tasks }) {
  const duration = Math.max(1, result.makespan)
  const ticks = Array.from({ length: 6 }, (_, index) => Math.round(index * duration / 5))
  return <div className="gantt-wrap"><div className="gantt-axis"><span>Task</span><div>{ticks.map((tick,index) => <span key={`${tick}-${index}`}>{tick}</span>)}</div></div>{result.gantt.map((segment,index) => { const task = tasks.find(item => item.id === segment.task_id); const taskIndex = tasks.findIndex(item => item.id === segment.task_id); return <div className="gantt-row" key={`${segment.task_id || 'idle'}-${segment.start}-${index}`}><span className="gantt-name">{segment.task_id || 'Idle'}{task && <small>{task.name}</small>}</span><div className="gantt-line">{segment.task_id && <span className="gantt-segment" style={{ left: `${segment.start / duration * 100}%`, width: `${Math.max((segment.end - segment.start) / duration * 100, 1.2)}%`, background: colors[Math.max(0, taskIndex) % colors.length] }} title={`${segment.task_id}: ${segment.start}–${segment.end}`}>{segment.end - segment.start >= 3 ? segment.task_id : ''}</span>}</div></div> })}<div className="metric-table"><div className="metric-row metric-head"><span>Task</span><span>Complete</span><span>Turnaround</span><span>Waiting</span><span>Response</span></div>{result.metrics.map(metric => <div className="metric-row" key={metric.task_id}><span>{metric.task_id}</span><span>{metric.completion_time}</span><span>{metric.turnaround_time}</span><span>{metric.waiting_time}</span><span>{metric.response_time}</span></div>)}</div></div>
}
function TaskDialog({ task, tasks, close, save }) {
  const value = { ...emptyTask, ...(task || {}) }
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}><form className="modal" onSubmit={save}><div className="modal-heading"><div><p className="eyebrow">TASK MANAGEMENT</p><h2>{task ? `Edit ${task.id}` : 'Add a task'}</h2></div><button type="button" className="icon-close" onClick={close}><X size={18}/></button></div><div className="form-grid"><Field label="Task name" wide><input name="name" required maxLength="120" defaultValue={value.name} placeholder="e.g. Deliver supply kit"/></Field><Field label="Arrival time"><input name="arrival_time" type="number" min="0" required defaultValue={value.arrival_time}/></Field><Field label="Burst time"><input name="burst_time" type="number" min="1" required defaultValue={value.burst_time}/></Field><Field label="Deadline (optional)"><input name="deadline" type="number" min="0" defaultValue={value.deadline ?? ''}/></Field><Field label="Priority · 10 is highest"><input name="priority" type="number" min="1" max="10" required defaultValue={value.priority}/></Field><Field label="Safety level"><select name="safety_level" defaultValue={value.safety_level}>{['low','medium','high','critical'].map(level => <option key={level} value={level}>{level}</option>)}</select></Field><Field label="Required components · comma separated" wide><input name="required_components" defaultValue={value.required_components.join(', ')}/></Field><Field label="Required capabilities · comma separated" wide><input name="required_capabilities" defaultValue={value.required_capabilities.join(', ')}/></Field><Field label="Dependencies · task IDs" wide><input name="dependencies" defaultValue={value.dependencies.join(', ')} placeholder="T-01, T-02"/><small className="field-help">Choose from: {tasks.filter(item => item.id !== task?.id).map(item => item.id).join(', ') || 'none yet'}</small></Field><Field label="Description" wide><textarea name="description" rows="3" defaultValue={value.description}/></Field></div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button type="submit" className="button primary"><Check size={15}/>{task ? 'Save changes' : 'Add task'}</button></div></form></div>
}
function Field({ label, wide, children }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label> }
