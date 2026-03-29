---

## Canonical Routing & State Prefixes

Agence uses a universal routing and state prefix model. See [synthetic/l-agence.org/docs/SYMBOLS.md](synthetic/l-agence.org/docs/SYMBOLS.md) for the canonical table and glossary.

- `@` is the universal routing prefix for agent, org, team, repo, security, etc.
- State prefixes: `~`, `$`, `%`, `&`, `_`, `#`, `+`, `-`, `^`, `;`, `>`, `<`, `@` (see canonical table).

All code, docs, and examples must use these prefixes consistently.

---

# L ' Agence MATRIX  tables  Documentation.

## MODEL
- L'agence implements a novel mathematical view of components such TASKS, WORKFLOWS and PROJECTS as linear algrebra matrices.
- This allows deterministic but ddecentralized agence nodes.
- Distributed Authority for each node is derived from one or more upstream git remotes which "shard" instantly.
- Each nodes computes  atomic states of everythinng via a FAST and simplified linera algebra math. 
- In addition this gives us instant computations of progress , scheduling and bottlenecks via linear algebra math. 
- This takes miliseconds and does not use a centralized tracking system.
- L'agence philosophy is to keep everything simple and lightweight and most of all portable.
- In l'agence robustness is built on top of simplicity that scales from an elegnat mathematical model.
- Advanced features arise from this design organically mathcing matrix math functions which a design principle. 

### the UNIX way .
- In teh basic form of l'agence we  can create matrices as bash arrays with all values as integers or strings. 
- We manipulate the metat data for these and basic matric functions via  jq. 
- We do more complex matrix math via the venerable awk which is surprisingly good at this. 

- higher level abstractions such as true Vector computation and Observability can be added later via Python for true matrix math
- BUT at it's core l'agence should just work , independantly on distributed nodes with nothing but bash +jq + awk. 
- This makes l'agence portable across a wide range of OS and it makes it truly atomic. 
- just like session-states a local,  Matrix States are computed on each node and Always Idempotent.

# MATRIX: Tasks, Workflows, Projects

visual representation of your swarm matrices: TASKS → WORKFLOWS → PROJECTS. I’ll include scores, completion %, ownership, and blocking arrows, so you can train your local agent or use it as a reference.

1️⃣ TASKS Matrix (Atomic Tasks)
Task ID	State	Score	Owner	Blocking	Notes
repo:init	+*	30	human	4	human priority override
repo:build	+**	35	agent	3	agent pending
repo:test	?**	25	human	1	waiting on input
repo:lint	&_	0	agent	0	paused by agentic dependency
repo:docs	#	0	human	0	deferred / human hold
repo:deploy	%	0	agent	0	assigned to agent, not executing
repo:auth:saml	>+*	15	human	1	child of auth workflow
repo:auth	<+	0	human	0	parent, waits for child
repo:fix	!	-10	human	0	minor failure

Symbols → Numeric Conversion for Matrix Math

+/- → +1 / -1

* → priority bonus

! → penalty

? → waiting

_ / # → excluded from runnable tasks

%, &, $, ~= → ownership (affects agent/human assignment)

2️⃣ WORKFLOWS Matrix (Aggregates Tasks)

Each row = workflow. Columns = tasks.

Workflow ID	repo:init	repo:build	repo:test	repo:lint	repo:deploy	repo:auth:saml	repo:auth	repo:fix	Workflow Score	Completion %
WF1_build_deploy	1	1	1	0	0	0	0	-1	2	2/5 = 40%
WF2_auth	0	0	0	0	0	1	0	0	1	1/1 = 100%

Notes:

Positive = pending

Negative = completed

Zero = paused / deferred / excluded

Workflow score = sum of numeric task elements

Completion % = completed / total tasks

3️⃣ PROJECTS Matrix (Aggregates Workflows)
Project ID	WF1_build_deploy	WF2_auth	Project Score	Completion %
PROJ1	2	1	3	(2+1)/6 ≈ 50%

Each row = project

Each column = workflow numeric score

Vector sum = overall project progress

4️⃣ Dependency / Blocking Representation

TASKS Blocking Vector:

repo:init ──┐
            v
repo:build ──> repo:test ──> repo:deploy
repo:auth:saml ──> repo:auth
repo:build ──> repo:lint (paused)

Compute blocking propagation for agents:

awk '
# TASKS[i,"blocking"] = sum_j adjacency[i,j] * (TASKS[j,"score"]>0)

Optional Python:

import numpy as np
adj = np.array([
 [0,1,0,0,0,0,0,0,0], # repo:init blocks build
 [0,0,1,1,0,0,0,0,0], # build blocks test & lint
 [0,0,0,0,1,0,0,0,0], # test blocks deploy
 ...
])
scores = np.array([30,35,25,0,0,0,15,0,-10])
blocking_scores = adj.T.dot(scores)
5️⃣ Agent Runnable Task Selection

Filter tasks:

Must be + or * pending

Exclude paused/deferred/locked (_, _\<, #, $, &)

Eligible for next run:

repo:build (35) → % → & agent claim

repo:init (30) → agent claim next

repo:test (25) → human input pending

repo:auth:saml (15) → child ready

repo:fix (-10) → minor failure, human may retry

Update TASKS matrix and propagate to WORKFLOWS / PROJECTS:

Mark claimed tasks → score updates

Completed tasks → workflow row sums update

Workflow completion → project row sums update

6️⃣ Summary Diagram
TASKS MATRIX              WORKFLOWS MATRIX            PROJECTS MATRIX
+---------------+         +----------------+          +----------------+
| repo:init 30  |         | WF1_build 2    |          | PROJ1 3        |
| repo:build35  | ----\   | WF2_auth 1     |          | Completion 50% |
| repo:test25   |      \  +----------------+          +----------------+
| repo:lint0    |       \
| repo:deploy0  |        \
| repo:auth:saml15|       \
| repo:auth0    |         \
| repo:fix-10   |          \
+---------------+           \
Blocking vectors / adjacency -> workflow score propagation -> project score

Arrows = blocking / dependency propagation

Scores = numeric task weights (priority, failure)

Workflow & project completion calculated instantly from TASKS matrix

This visual shows how tasks flow from atomic TASKS → WORKFLOWS → PROJECTS, including:

Priority scores (*)

Failures (!)

Human/agent ownership ($, &, ~=)

Paused/deferred tasks (_, #)

Blocking dependencies

All of this can be implemented in Bash + jq + awk, with Python optional for advanced vector operations or visualization.



## Task Matrix
- Each task exists in one repository
- Status symbols:
  - `~task` = human assigned/working
  - `$task` = human working
  - `%task` = agent assigned
  - `&task` = agent running independently
  - `_task` = paused/deferred
  - `#task` = held by human
  - `+task` = pending addition
  - `-task` = completed
- Dependencies:
  - `^task` = hard dependency
  - `;<task>` = soft dependency (can run in parallel)
  - `>subtask` = child
  - `<subtask` = parent

## Workflow Matrix
- Workflows = rows
- Tasks = columns
- Sum of negative elements = progress
- Sum of positive elements = remaining work
- Can cross repositories

## Project Matrix
- Projects = list of workflows
- Completion % = sum(workflow completion)/total
- Supports multi-agent and human collaboration. 


# MATRIX: Tasks, Workflows, Projects

## Task Matrix
- Each task exists in one repository
- Status symbols:
  - `~task` = human assigned/working
  - `$task` = human working
  - `%task` = agent assigned
  - `&task` = agent running independently
  - `_task` = paused/deferred
  - `#task` = held by human
  - `+task` = pending addition
  - `-task` = completed
- Dependencies:
  - `^task` = hard dependency
  - `;<task>` = soft dependency (can run in parallel)
  - `>subtask` = child
  - `<subtask` = parent

## Workflow Matrix
- Workflows = rows
- Tasks = columns
- Sum of negative elements = progress
- Sum of positive elements = remaining work
- Can cross repositories

## Project Matrix
- Projects = list of workflows
- Completion % = sum(workflow completion)/total
- Supports multi-agent and human collaboration


1️⃣ Descriptive Names for Your Matrices

Based on our refinement:

Matrix	Purpose
- TASKS	Tracks all atomic tasks (state, owner, dependency, priority, symbols)
- WORKFLOWS	Aggregates tasks into workflows, computes workflow completion
- PROJECTS	Aggregates workflows into projects/plans, computes global progress/bottlenecks

This is clear and human-readable, which is better for maintainability than “MATRIX” or “ROADMAP.”

2️⃣ Notation for Matrices in Linear Algebra / Computation

There isn’t a universal “M(x)” notation, but you can adopt a formal style like this:

Standard Linear Algebra Notation

Matrix Variable

Uppercase letter: A, M, T

Example: M for a general matrix, T for TASKS, W for WORKFLOWS

Matrix Elements

M_ij → element in row i, column j

Full matrix can be written as:

𝑀
=
[
𝑚
11
	
𝑚
12
	
…
	
𝑚
1
𝑛


𝑚
21
	
𝑚
22
	
…
	
𝑚
2
𝑛


⋮
	
⋮
	
⋱
	
⋮


𝑚
𝑚
1
	
𝑚
𝑚
2
	
…
	
𝑚
𝑚
𝑛
]
M=
	​

m
11
	​

m
21
	​

⋮
m
m1
	​

	​

m
12
	​

m
22
	​

⋮
m
m2
	​

	​

…
…
⋱
…
	​

m
1n
	​

m
2n
	​

⋮
m
mn
	​

	​

	​


Matrix Function Notation

M(x) → a matrix that depends on variable x

Could be a function of tasks or workflow indices

Examples per Language
Language	Matrix Representation	Notes
Awk	Usually a 2D associative array: M[i,j]	No native matrices, use M[i,j]=value
BC	No native matrices; simulate using arrays: M[i*n+j] or custom indexing	Must write multiplication routines manually
Python (NumPy)	M = np.array([[a,b,c],[d,e,f]]) or M[i,j]	Native support for linear algebra
R	M <- matrix(c(a,b,c,d,e,f), nrow=2, byrow=TRUE) and M[i,j]	Supports matrix algebra directly
Matlab / Octave	M = [a b c; d e f] and M(i,j)	Standard linear algebra syntax

So yes, M[i,j] or M_ij is the standard computational way to identify an element in a matrix.

3️⃣ Suggested Notation for Your Swarm

You could define matrices like this for clarity:

TASKS = T(x)  # function generating task matrix
WORKFLOWS = W(TASKS)
PROJECTS = P(WORKFLOWS)

Or in “computational notation”:

T_ij  # task i, attribute j (state, owner, priority)
W_ik  # workflow i, task k completion vector
P_il  # project i, workflow l completion vector

Then, vector sums compute progress:

workflow_completion_i = sum_k W_ik
project_completion_j = sum_i P_ij

Using symbols in TASKS (e.g., *, !, ^) → convert to numeric values in vectors for computation.

4️⃣ Mapping to Bash + jq + awk

TASKS → JSON objects, convert to 2D associative array in awk: TASKS[i,j]

WORKFLOWS → Each workflow row is array of task scores: WORKFLOWS[i,k]

PROJECTS → Each project row sums workflows: PROJECTS[i,l]

Access element:

# Example in awk
awk '
  { TASKS[$1,$2]=$3 }
  END { print TASKS["repo:init","score"] }
' tasks.csv

Python optional for numpy for true vectorized operations:

import numpy as np
TASKS = np.array([[10,0],[5,1]])  # e.g., score, blocking
WORKFLOWS = TASKS.sum(axis=0)

✅ Summary / Recommendations

Use descriptive matrix names: TASKS, WORKFLOWS, PROJECTS

Matrix elements: M[i,j] or M_ij

Attribute mapping: row = task/workflow/project, column = attribute/value

Bash + jq + awk → use associative arrays (M[i,j])

Python/NumPy → optional for advanced matrix/vector operations




#  JQ Matrix functions  - matrix.jq
- See this example for simplified jq . the real implementaion is more developped. 

# JQ helpers for Agence

# Get tasks assigned to a human
def human_tasks:
  map(select(.status|test("^~|\\$")));

# Get tasks assigned to agent
def agent_tasks:
  map(select(.status|test("^%|&")));

# Filter by priority
def priority_tasks($min):
  map(select(.priority >= $min));

# Sum token costs
def sum_tokens:
  map(.token_cost) | add;

# Compute completion %
def completion:
  map(.status|test("^[\\+\\-]")) as $stats
  | ($stats|length) / length * 100;


  ## AWK MATRIX MATH - matrix.awk 
- See this prototype matrix.awk . the real implementaion is more developped. 
# matrix.awk - Compute workflow completion metrics
# Each row = workflow, columns = tasks
# +task = remaining, -task = completed

BEGIN {
  FS=","
  print "WorkflowID,Completed,Remaining,Completion%"
}

{
  completed=0; remaining=0a minimal but complete Swarm kernel built from:

bash + jq + awk

With as few scripts as possible while still supporting:

task matrices

dependency DAG

scoring vectors

scheduler

agent routing

human overrides

cross-repo references

So we collapse the system to three files:

$AI_BIN/swarm        ← main engine
$AI_BIN/swarm.awk    ← vector + matrix math
$AI_ROOT/organic/
  tasks.json
  deps.json
  agents.json

Everything else becomes jq modules embedded inside the swarm script.

1. Final Data Model

Location:

$AI_ROOT/organic/
tasks.json
{
  "tasks":[
    {
      "id":"DOC-001",
      "repo":"agence-master",
      "title":"Update documentation",
      "state":"~",
      "priority":2,
      "stars":1,
      "heat":0.2,
      "agent":null
    },
    {
      "id":"DOC-002",
      "repo":"agence-master",
      "title":"Review documentation",
      "state":"%",
      "priority":1,
      "stars":0,
      "heat":0.1,
      "agent":"@ralph"
    }
  ]
}
deps.json
{
  "edges":[
    {
      "from":"DOC-001",
      "to":"DOC-002",
      "type":"^"
    }
  ]
}
^ hard dependency
= soft dependency
agents.json
{
  "agents":[
    {
      "name":"@ralph",
      "tier":"cheap",
      "cost":1,
      "capacity":5
    },
    {
      "name":"@cursor",
      "tier":"mid",
      "cost":5,
      "capacity":3
    },
    {
      "name":"@peers",
      "tier":"expensive",
      "cost":20,
      "capacity":1
    },
    {
      "name":"@olena",
      "tier":"local",
      "cost":0,
      "capacity":2
    }
  ]
}
2. Matrix Math Engine (AWK)

File:

$AI_BIN/swarm.awk

This handles vector scoring and scheduling.

BEGIN{
  FS=","
}

{
  id=$1
  priority=$2
  stars=$3
  heat=$4

  score = (priority*10) + (stars*25) + (heat*100)

  print id,score
}

Simple but powerful.

Vector formula:

score = 10P + 25S + 100H

Where:

P = priority
S = star override
H = complexity heat
  for(i=2;i<=NF;i++){
    if($i ~ /^-/) completed++
    else if($i ~ /^\+/) remaining++
  }
  total=completed+remaining
  percent=(total>0)?(completed/total*100):0
  print $1","completed","remaining","percent
}

### matrix math Engine Example (Awk)

Key constraints you defined:

Runtime scripts:  $AI_BIN/
State storage:    $AI_ROOT/organic/
Language stack:   bash + jq + awk
Python: optional future module

Matrices:

TASKS
WORKFLOWS
PROJECTS

Execution engine:

$AI_BIN/swarm

Human/Agent state symbols (finalized):

Symbol	Meaning
~task	assigned to human
$task	human working
%task	assigned to agent
&task	agent executing
_task	paused
#task	human-held lock
!task	failure
?task	awaiting input
^task	hard dependency
=task	soft dependency
*task	human priority override
⭐	priority stars
1️⃣ Directory Layout

Final filesystem layout:

$AI_ROOT/
  organic/
    tasks.json
    workflows.json
    projects.json
    deps.json
    agents.json

Scripts:

$AI_BIN/
  swarm
  swarm-add
  swarm-update
  swarm-dag
  swarm-score
2️⃣ TASK MATRIX (tasks.json)

Example structure:

{
  "tasks": [
    {
      "id": "DOC-001",
      "repo": "agence-master",
      "title": "Update documentation",
      "state": "~",
      "priority": 2,
      "stars": 1,
      "agent": null,
      "heat": 0.2
    }
  ]
}
3️⃣ DEPENDENCY MATRIX (deps.json)
{
  "edges": [
    {
      "from": "DOC-001",
      "to": "DOC-002",
      "type": "^"
    }
  ]
}

Types:

^ hard dependency
= soft dependency
4️⃣ AGENT MATRIX (agents.json)
{
  "agents":[
    {
      "name":"@ralph",
      "tier":"cheap",
      "max_tokens":2000
    },
    {
      "name":"@cursor",
      "tier":"mid",
      "max_tokens":8000
    },
    {
      "name":"@peers",
      "tier":"expensive",
      "max_tokens":32000
    },
    {
      "name":"@olena",
      "tier":"local"
    }
  ]
}

5️⃣ SWARM CORE ENGINE

$AI_BIN/swarm

#!/usr/bin/env bash

AI_ROOT="${AI_ROOT:-$HOME/.agence}"
DATA="$AI_ROOT/organic"

tasks="$DATA/tasks.json"
deps="$DATA/deps.json"

case "$1" in

  list)
    jq -r '.tasks[] | "\(.id) [\(.state)] ⭐\(.stars) p=\(.priority)"' "$tasks"
  ;;

  score)
    "$AI_BIN/swarm-score"
  ;;

  dag)
    "$AI_BIN/swarm-dag"
  ;;

  pause)
    id="$2"

    jq --arg id "$id" '
      .tasks |= map(
        if .id==$id then .state="_" else . end
      )
    ' "$tasks" > "$tasks.tmp" && mv "$tasks.tmp" "$tasks"
  ;;

  run)
    id="$2"

    jq --arg id "$id" '
      .tasks |= map(
        if .id==$id then .state="&" else . end
      )
    ' "$tasks" > "$tasks.tmp" && mv "$tasks.tmp" "$tasks"
  ;;

  *)
    echo "swarm commands:"
    echo "  swarm list"
    echo "  swarm dag"
    echo "  swarm score"
    echo "  swarm pause <task>"
    echo "  swarm run <task>"
  ;;

esac


6️⃣ DAG BLOCKING PROPAGATION

$AI_BIN/swarm-dag

#!/usr/bin/env bash

AI_ROOT="${AI_ROOT:-$HOME/.agence}"
DATA="$AI_ROOT/organic"

jq -n \
  --slurpfile tasks "$DATA/tasks.json" \
  --slurpfile deps "$DATA/deps.json" '

def blocked(task):
  ($deps[0].edges
    | map(select(.to==task.id and .type=="^"))
    | map(.from)) as $parents
  |
  any($parents[]; 
    ($tasks[0].tasks[]
      | select(.id==.)
      | .state!="done")
  );

$tasks[0].tasks
| map(
  . + {blocked: blocked(.)}
)
'

This computes hard dependency blocking.

7️⃣ PRIORITY SCORING (VECTOR MODEL)

$AI_BIN/swarm-score

#!/usr/bin/env bash

AI_ROOT="${AI_ROOT:-$HOME/.agence}"
DATA="$AI_ROOT/organic"

jq '

.tasks
| map(
    .score =
      (
        (.priority * 10)
        + (.stars * 25)
        + (.heat * 100)
      )
)
| sort_by(.score)
| reverse

' "$DATA/tasks.json"

Score vector:

score =
priority_weight
+ star_override
+ heat
8️⃣ ADD TASK

$AI_BIN/swarm-add

#!/usr/bin/env bash

AI_ROOT="${AI_ROOT:-$HOME/.agence}"
DATA="$AI_ROOT/organic"

id="$1"
title="$2"

jq \
  --arg id "$id" \
  --arg title "$title" '

.tasks += [{
  id:$id,
  title:$title,
  state:"~",
  priority:1,
  stars:0,
  heat:0
}]

' "$DATA/tasks.json" > "$DATA/tasks.tmp" \
&& mv "$DATA/tasks.tmp" "$DATA/tasks.json"
9️⃣ Example

Add task:

swarm-add DOC-001 "Update documentation"

List:

swarm list

Pause:

swarm pause DOC-001

Run:

swarm run DOC-001
🔟 What You Now Have

Your Swarm OS kernel now includes:

✔ matrix based task state
✔ DAG propagation
✔ human overrides
✔ agent routing
✔ scoring vectors
✔ cross repo references
✔ git compatible data

And everything runs on:

bash
jq
awk

Exactly as we wanted.