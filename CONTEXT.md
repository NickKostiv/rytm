# Rytm — Project Context

## Idea

Rytm is an AI medical reference in chat form. Users ask questions in natural language and get answers grounded **only** in official sources (MoH of Ukraine protocols, drug instructions, official clinical guidelines), each with a citation and a link to the source document.

It is not a general-purpose chatbot: if the answer is not in the source base, the assistant says so instead of guessing.

## Audience (phased)

1. **Phase 1 — EMS paramedics (ЕМД).** Fast field reference: official dosing tables, protocols and algorithms, contraindications.
2. **Phase 2 — patients.** Separate mode with simpler language, stricter limits (no dosing advice for self-treatment, escalation to "call 103").

Phase 1 ships first; Phase 2 must not be designed into Phase 1 code prematurely.

## Core features (Phase 1)

- **AI chat** over the official source base (RAG: retrieval over indexed documents + LLM answer generation).
- **Citations** in every answer: document name, section/page, link to the official source.
- **Dosing tables** — dosing questions are answered with the table from the official source, quoted and cited. No dose calculator; the assistant never calculates or estimates a patient-specific dose.
- **Response flag** — every answer starts with GREEN / YELLOW / RED and an explanation. Details: [AGENT_SPEC.md](AGENT_SPEC.md).
- **Authentication is mandatory** — no anonymous access to the app or the API.

## Architecture

Full-stack pnpm monorepo.

| Part | Location | Stack |
|------|----------|-------|
| Mobile + web client | `apps/mobile` | Expo (React Native + web), Expo Router |
| Backend API | `apps/api` | Node.js 22, Hono, Claude via the Anthropic Messages API |
| Shared code | `packages/*` (planned) | TypeScript |

Backend responsibilities: auth, chat API, LLM integration, source ingestion and indexing, retrieval, citation assembly.

## Product principles

- **Source-grounded only.** Every factual claim maps to a cited source; no source → no answer.
- **No calculated doses.** Dosing numbers are only quoted from sources, never computed or estimated.
- **Source freshness.** Each document has a version/date; outdated protocols are replaced, not mixed.
- **Medical safety.** Clear disclaimer; the app supports clinical decisions, it does not replace them.
- **Privacy.** No patient PII in chat logs or LLM requests.

## Goals

- Portfolio project demonstrating full-stack + applied LLM (RAG) skills.
- Real personal use later.

## Open decisions

Decided, see [CLAUDE.md](CLAUDE.md) "Decisions already made": the LLM provider is Anthropic, called through the Messages API from our own backend; the current model is `claude-opus-5-5`.

Each open item below has a decision ticket in Jira project `KAN`; the map is in CLAUDE.md "Backlog".

- Grounding approach: RAG (recommended — citable, updatable without retraining) vs fine-tuning.
- Vector store / database.
- Auth method (email + password, OAuth, magic link) and who may register in Phase 1 (open sign-up vs verified paramedics).
- Source list for v1 and ingestion format (PDF, HTML).
- Clinical use status: README currently says "Demo project. Not for clinical use." — must be revisited before real-world use.
