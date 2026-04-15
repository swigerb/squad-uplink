# Copilot Portal Dev — Prompts

## Build and test
Run a full build (server + UI) and let me know if there are any errors.

## What changed recently?
Show me the last 10 commits and summarize what's been worked on.

## Find where something lives
I need to find where a specific feature is implemented. I'll describe what I'm looking for.

## Walk me through the architecture
Explain how a message flows from the browser input box all the way to the Copilot CLI and back.

## Add a new API endpoint
Help me add a new endpoint to the portal server. I'll describe what it should do.

Follow the existing patterns in server.ts — token check, path matching, sendJson for responses. Add it near related endpoints.

## Add a new UI feature
Help me add something to the portal's React UI. I'll describe what I want it to look like and do.

## Package a release
Walk me through packaging a new release and creating a GitHub release.

## Review before pushing
Check what's uncommitted and unpushed, and help me review it before pushing to GitHub.

Look for:
- Accidental debug code or console.logs
- Sensitive data (tokens, paths, names)
- Files that shouldn't be committed

Summarize what you find before I decide to push.
