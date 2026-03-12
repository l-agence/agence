# Symlink-Based Context Routing in Agence

l'Agence implements an elegant context-resolution system using local @ symlinks as active context pointers. This approach solves several hard problems in distributed tooling:

- Multi-org support
- User-local context switching
- Git compatibility without merge conflicts

## 1️⃣ The @ Context Pointer

- `@` → current default context
- Implemented as a symlink: `@ -> mycompany.com` inside each relevant directory.
- Example layout:

```
$AI_ROOT/
  synthetic/
    acme.ltd/
    l-agence.org/
    mycompany.com/
    @ -> mycompany.com
```

Because `@` is gitignored, each user can redefine their context locally without affecting the repository. This is extremely clean and behaves almost like `$PWD` but for knowledge routing.

## 2️⃣ Why the Local Symlink Trick Is Smart

Most systems would use config files (json, env, yaml), but that introduces merge conflicts, drift, and parsing logic. l'Agence's model leverages the filesystem as the configuration layer:

- Zero parsing
- Instant resolution
- Visible to scripts
- Trivial in bash

Example: `readlink "$AI_ROOT/synthetic/@"` gives the active org immediately.

## 3️⃣ Context Override by Directory

Local overrides are possible deeper in the tree:

```
synthetic/
  @ -> mycompany.com
  mycompany.com/
    @ -> mycompany.com:teamA
```

Global default: mycompany.com
Team subdirectory override: mycompany.com:teamA

## 4️⃣ Agent Routing Symmetry

The same pattern exists for agents:
- `@agent` for specific agent
- `@` for current agent

Grammar:
| Symbol | Meaning |
|--------|---------|
| @      | current context |
| @agent | specific agent |
| @org   | specific org |
| @team  | specific team |

## 5️⃣ Example Workflow

User setup:
```
mkdir synthetic/mycompany.com
ln -s mycompany.com synthetic/@
```
Now `~share lesson42` routes to `synthetic/mycompany.com/` automatically. Explicit override: `~share lesson42 @acme.ltd` routes to `synthetic/acme.ltd/`.

## 6️⃣ Multi-Org Collaboration

The skeleton:
```
synthetic/
  acme.ltd/
  l-agence.org/
```
l'Agence users add their own org and point `@` to it. l'Agence becomes multi-tenant by design.

## 7️⃣ Hardening Suggestion

When resolving @, scripts should fallback safely:
```bash
if [ -L "$AI_ROOT/synthetic/@" ]; then
  CONTEXT=$(readlink "$AI_ROOT/synthetic/@")
else
  CONTEXT="l-agence.org"
fi
```
This ensures new installs work and broken symlinks don't crash the swarm.

## 8️⃣ Why This Model Scales

Filesystem namespaces make routing deterministic and offline-friendly. Example: `synthetic/@/lessons/` resolves based on local symlink.

## 9️⃣ Hidden Advantage: Offline Swarm Nodes

Context resolution is local, so a swarm node can operate fully offline with just AI_ROOT, @, and repo structure.

## 🔟 This Pattern Is Rare

The @ symlink trick is conceptually similar to HEAD in Git or /etc/alternatives in Linux—very sound.

## 11️⃣ Optional Enhancement

Allow @ to chain contexts: `@ -> mycompany.com:research` or `@ -> mycompany.com/research` for trivial parsing.

## 12️⃣ Big Picture

The routing stack:
- Command
- Context (@)
- Org / Shard
- Knowledge store

l'Agence now has context-aware knowledge, multi-org routing, user-local config, and Git-safe collaboration—a very clean system.
