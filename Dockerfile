# agence/agent — Minimal agentic container image
#
# Design constraints:
#   - Bun as standalone static binary (NO npm, NO node_modules)
#   - Guard.ts gates all command execution (TCB boundary)
#   - aibash provides restricted shell (PATH, env, sandbox)
#   - aido wraps whitelisted commands with session capture
#   - No tmux inside container (host-side agentd handles IPC)
#   - Read-only .git mount, writable /workspace volume
#
# Build:
#   docker build -t agence/agent:latest .
#
# Run (via agentd, not directly):
#   agentd start --driver docker
#   agentd tangent create t1 ralph

FROM debian:bookworm-slim AS base

LABEL org.opencontainers.image.title="agence-agent"
LABEL org.opencontainers.image.description="Agence agentic shell container"
LABEL org.opencontainers.image.source="https://github.com/l-agence/agence"

# ── System deps (minimal, no recommends) ──────────────────────────────────

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    gawk \
    git \
    jq \
    socat \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# ── Bun (standalone static binary — no npm) ──────────────────────────────

ARG BUN_VERSION=1.2.9
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
  && ln -sf /usr/local/bin/bun /usr/local/bin/bunx \
  && bun --version

# ── yq (static binary — YAML/JSON/TOML processor) ────────────────────────

ARG YQ_VERSION=v4.44.1
RUN ARCH=$(dpkg --print-architecture) \
  && curl -fsSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" \
     -o /usr/local/bin/yq \
  && chmod +x /usr/local/bin/yq \
  && yq --version

# ── Agence layout ────────────────────────────────────────────────────────

# /agence = read-only agence runtime (bin + lib + codex)
# /workspace = writable worktree volume (mounted by agentd)
# /repo/.git = read-only shared git object store (mounted by agentd)

WORKDIR /agence

# Copy only what the container needs — no hermetic, no synthetic, no nexus
COPY bin/.agencerc   bin/.agencerc
COPY bin/agence      bin/agence
COPY bin/aibash      bin/aibash
COPY bin/aicmd       bin/aicmd
COPY bin/aido        bin/aido
COPY bin/airun       bin/airun
COPY bin/aipolicy    bin/aipolicy
COPY bin/aisession   bin/aisession
COPY bin/figrep      bin/figrep

COPY lib/aicmd-lib.sh  lib/aicmd-lib.sh
COPY lib/env.sh        lib/env.sh
COPY lib/format.sh     lib/format.sh
COPY lib/shell-ui.sh   lib/shell-ui.sh
COPY lib/aibash.ts     lib/aibash.ts
COPY lib/guard.ts      lib/guard.ts
COPY lib/session.ts    lib/session.ts
COPY lib/ailedger.ts   lib/ailedger.ts
COPY lib/ailedger.sh   lib/ailedger.sh
COPY lib/audit.ts      lib/audit.ts
COPY lib/ledger.ts     lib/ledger.ts
COPY lib/signal.ts     lib/signal.ts
COPY lib/commands.ts   lib/commands.ts
COPY lib/router.sh     lib/router.sh
COPY lib/router.ts     lib/router.ts
COPY lib/matrix.ts     lib/matrix.ts

COPY codex/AIPOLICY.yaml       codex/AIPOLICY.yaml
COPY codex/AIPOLICY.schema.json codex/AIPOLICY.schema.json
COPY codex/LAWS.md              codex/LAWS.md
COPY codex/RULES.md             codex/RULES.md
COPY codex/PRINCIPLES.md        codex/PRINCIPLES.md

# Ensure bin/ is executable
RUN chmod +x bin/*

# ── Environment ──────────────────────────────────────────────────────────

ENV AGENCE_ROOT=/agence \
    AI_ROOT=/workspace \
    GIT_ROOT=/workspace \
    AGENCE_BIN=/agence/bin \
    AGENCE_LIB=/agence/lib \
    AI_BIN=/agence/bin \
    PATH="/agence/bin:/usr/local/bin:/usr/bin:/bin" \
    AI_ROLE=agentic \
    TERM=xterm-256color

# ── Entrypoint ───────────────────────────────────────────────────────────
# Default: sleep infinity (agentd sends commands via docker exec)
# Override: docker run agence/agent:latest bash --rcfile /agence/bin/aibash

CMD ["sleep", "infinity"]
