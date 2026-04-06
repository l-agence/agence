# @claude — Anthropic Claude Code

**Type**: Agentic code assistant (Anthropic)  
**Model**: claude-sonnet-4-20250514 (default), claude-opus-4 (complex tasks)  
**Interface**: Claude Code CLI (`claude` command)  
**AI_AGENT**: `claude`  
**Session**: Dual-tile (LEFT=ibash human plane, RIGHT=aibash+claude agent plane)  
**Cost Tier**: $$$ (expensive — route only for high-priority × medium/large complexity)  

## Routing Rules

- Priority *** + complexity large → @claude (preferred)
- Priority ** + complexity large → @claude or @claudia (choose by task type)
- Priority * → use cheaper model (@haiku, @pilot)

## Capabilities

- Extended reasoning (architecture, complex refactors)
- Long context (multi-file analysis without chunking)
- Transparent uncertainty (says "I don't know")
- Precise instruction following

## Signal Handling

- Parent: ibash (human control plane) owns SIGKILL authority
- @claude subprocess trapped under aibash SIGTERM handler
- `Ctrl+K` from human tile → SIGKILL aibash → @claude dies cleanly
- Session metadata flushed before exit

## Invocation

```bash
agence @claude "Redesign the routing layer"
agence !claude  # spawn in aibash tile (from agence shell dispatcher)
AI_AGENT=claude bash --rcfile bin/ibash  # direct (human tile)
```
