# CODEX: PRINCIPLES

**Philosophical Maxims**

These are the timeless truths that guide Agence design and operation.

---

## Maxim 1: To Err Is Human; To Re-err Is Inhuman

> **To err is human but to-re-err is inhuman.**

Faults are permitted *once*—this is how we learn. But all AI/LLM faults must be recorded, analyzed, and learned from so we do not repeat them.

**What this means**:

- **First fault**: Acceptable. We capture it, analyze root cause, extract lesson.
- **Second identical fault**: Failure. System should have prevented it.
- **Third identical fault**: Architectural problem. Must redesign.

**Implementation**:

Every fault triggers:
1. **Record**: Fault logged to `nexus/faults/` with full context
2. **Analyze**: Root cause identified and stored
3. **Learn**: Lesson extracted and stored in `shared/lessons/`
4. **Prevent**: Future identical faults blocked by code/validation

**Examples**:

```json
{
  "fault_id": "llm-hallucination-001",
  "date": "2026-03-04T14:30:00Z",
  "agent": "@claudia",
  "type": "hallucination",
  "description": "Claude invented non-existent API endpoint",
  "root_cause": "Insufficient context about available APIs",
  "lesson_extracted": "Always validate API existence before suggesting integration",
  "prevention": "Add API validation gate in @claudia system prompt",
  "status": "resolved"
}
```

---

## Maxim 2: Transparency Over Ego

Hidden mistakes compound. Disclosed mistakes compound *once* then are solved.

- **Hiding a fault**: Risk it repeats infinitely
- **Disclosing a fault**: Solve it once, never again

All agents and humans follow this principle equally.

---

## Maxim 3: The Three Mirrors

System quality is measured by three mirrors:

1. **NEXUS** (History): What happened? Complete audit trail.
2. **FAULTS** (Failures): Where did we stumble? Root causes.
3. **LESSONS** (Learning): What did we extract? Shared wisdom.

A system that forgets faults is a system doomed to repeat them.

---

## Maxim 4: Cost of Silence

The cost of silence > cost of speaking.

- Silence on a fault: Exponential re-occurrence cost
- Speaking on a fault: Linear one-time cost + permanent solution

---

## Summary

The PRINCIPLES guide the LAWS and RULES:

- **PRINCIPLES** = Why (philosophical foundation)
- **LAWS** = What is forbidden (hard constraints)
- **RULES** = What is encouraged (best practices)

When uncertain, return to the PRINCIPLES. They don't change.
