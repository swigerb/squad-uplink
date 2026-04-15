# Open WebUI vs Copilot Portal

Comparison of [Open WebUI](https://github.com/open-webui/open-webui) and Copilot Portal — both are self-hosted web UIs for AI, but for very different use cases.

## What Is Open WebUI?

Open WebUI (132K GitHub stars) is a **self-hosted ChatGPT-like interface** for any AI model. It connects to Ollama (local models), OpenAI, Anthropic, and any OpenAI-compatible API. It's designed for teams, with multi-user auth, knowledge bases, RAG, tools, plugins, and admin dashboards. Think of it as a private, extensible alternative to ChatGPT.

## What Is Copilot Portal?

Copilot Portal is a **mobile-friendly web UI specifically for GitHub Copilot CLI**. It connects to the Copilot CLI agent running on your machine, providing a browser interface for coding sessions — send messages, approve tool actions, apply guides, manage sessions. It's a single-user developer tool.

## They Solve Different Problems

| | Open WebUI | Copilot Portal |
|---|---|---|
| **Primary purpose** | General AI chat interface (ChatGPT replacement) | Remote control for Copilot CLI coding sessions |
| **AI backend** | Any model (Ollama, OpenAI, Anthropic, local, etc.) | GitHub Copilot only |
| **Target audience** | Teams, organizations, anyone wanting private AI chat | Individual developers using Copilot CLI |
| **Multi-user** | Yes — RBAC, groups, SSO/OIDC/LDAP, SCIM | No — single user, token-based |
| **Focus** | Conversations, knowledge, content creation | Software engineering, tool approvals, guided workflows |

## Architecture

### Open WebUI
```
Browser (React/Svelte UI)
  ↕ HTTP/WebSocket
Open WebUI Server (Python/FastAPI)
  ↕ API calls
AI Providers (Ollama / OpenAI / Anthropic / vLLM / etc.)
  + Vector DB (ChromaDB / PGVector / Qdrant / etc.)
```

### Copilot Portal
```
Browser / PWA
  ↕ WebSocket
Portal Server (Node.js)
  ↕ SDK JSON-RPC
Copilot CLI (headless, running locally)
```

## Feature Comparison

| Feature | Open WebUI | Portal |
|---|---|---|
| **Chat interface** | Full ChatGPT-like UI | Chat-style with tool summaries, approvals |
| **Models** | Any — Ollama, OpenAI, Anthropic, local, custom | GitHub Copilot models only |
| **Multi-model** | Side-by-side comparison, switch mid-chat | Switch via dropdown |
| **Knowledge/RAG** | Full RAG pipeline — upload docs, vector search, hybrid retrieval | None — Copilot reads files via tools |
| **Tools/plugins** | Python tools, MCP, OpenAPI, pipelines | Guides & Prompts (markdown-based) |
| **Code execution** | Open Terminal — real computing environment | Copilot CLI runs commands (with approvals) |
| **Image generation** | DALL-E, ComfyUI, Gemini | None |
| **Voice** | Speech-to-text, TTS, voice/video calls | None |
| **Notes** | Rich editor with AI enhance | None |
| **Channels** | Team chat rooms with @model tagging | None |
| **Users** | Multi-user, RBAC, groups, SSO, LDAP, SCIM | Single user, token auth |
| **Admin** | Usage analytics, model evaluation, banners, webhooks | None |
| **Tool approvals** | N/A — tools auto-execute | Allow/Deny/Always with pattern rules |
| **Guides** | System prompts per model | Full guide system, import from gists |
| **Session management** | Conversation history | Multi-session picker, shield, delete |
| **Token tracking** | Usage dashboards with cost tracking | Per-session token stats |
| **Mobile** | Responsive web | PWA, DevTunnel remote access, QR code |
| **Deployment** | Docker, Kubernetes, pip, Helm, horizontal scaling | Unzip + run a script |
| **Offline** | Yes — fully offline with Ollama | No — requires GitHub Copilot connection |
| **Open source** | MIT, 132K stars, massive ecosystem | MIT, personal project |

## Key Differences

### Scope
- **Open WebUI** is a platform for AI conversations, knowledge management, and team collaboration. It replaces ChatGPT for organizations.
- **Portal** is a narrow tool for one thing: using Copilot CLI from a browser/phone.

### AI Provider
- **Open WebUI** is provider-agnostic. Run local models with Ollama, or connect to any cloud API. You manage your own models and API keys.
- **Portal** is Copilot-exclusive. The AI is part of your GitHub subscription.

### Agent Capabilities
- **Open WebUI** focuses on conversation — the AI responds to your queries, searches knowledge bases, generates images, runs code snippets.
- **Portal/Copilot** is an agentic coding assistant — it reads your codebase, edits files, runs shell commands, creates PRs. Each action requires approval. This agent workflow doesn't exist in Open WebUI.

### Knowledge
- **Open WebUI** has a full RAG pipeline — upload documents, build knowledge bases, vector search with reranking. The AI can search and synthesize across your entire document collection.
- **Portal** relies on Copilot's built-in tools to read files and search code. Guides provide static context, not searchable knowledge.

### Team vs Individual
- **Open WebUI** is built for teams from day one — user management, access control, shared channels, admin dashboards.
- **Portal** is single-user by design. One developer, one machine, one Copilot subscription.

## When to Use Which

| Scenario | Use |
|---|---|
| ChatGPT replacement for your team | **Open WebUI** |
| Coding with Copilot CLI, want mobile access | **Portal** |
| Private AI chat with local models (Ollama) | **Open WebUI** |
| Need to approve Copilot tool actions from phone | **Portal** |
| RAG over your company documents | **Open WebUI** |
| Guided domain-specific Copilot workflows | **Portal** (guides) |
| Multi-user AI platform with admin controls | **Open WebUI** |
| Quick mobile access to your coding assistant | **Portal** |
| Image generation, voice, video calls | **Open WebUI** |
| Model evaluation and A/B testing | **Open WebUI** |

## Could They Work Together?

Not directly — they connect to different AI backends. But conceptually:

- Use **Open WebUI** for general AI tasks, research, knowledge management, team collaboration
- Use **Portal** (or `/remote`) for coding sessions where Copilot's agent capabilities (file editing, shell commands, tool approvals) are needed

They'd coexist as separate tools for separate purposes, like having both Slack and VS Code open.

## Summary

Open WebUI is a **general-purpose AI platform** designed for teams — knowledge bases, plugins, multi-model support, and enterprise features. Portal is a **focused developer tool** for Copilot CLI coding workflows — approval management, guides, token tracking, and mobile access.

The overlap is minimal: both are self-hosted web UIs for AI. But Open WebUI is about conversations and knowledge, while Portal is about agent-driven coding workflows with tool approvals. Different audiences, different architectures, different goals.
