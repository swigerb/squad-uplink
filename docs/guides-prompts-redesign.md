# Guides & Prompts Redesign Spec

## Overview
Redesign the guides and prompts system from a one-time seed model to a catalog-based
model where examples are browsable templates and users explicitly choose what to add.

## Storage Model

```
examples/guides/          Read-only templates, shipped with portal updates
examples/prompts/         Read-only templates, shipped with portal updates
data/guides/              User's working guide files
data/prompts/             User's working prompt files
```

- `examples/` is read-only — never modified by the portal
- `data/` is the user's space — created, edited, deleted freely
- Same filename in guides/ and prompts/ = paired set (unchanged)
- Remove the seed-on-first-run logic — examples are a catalog, not auto-copied

## Picker UI Changes

### Main List
- Shows files from `data/guides/` and `data/prompts/` (current behavior)
- Same icons: eye (guide), speech bubble (prompts), trash (delete)
- **"+ New" button** in the picker header (consistent with Sessions picker)

### "+ New" Flow
When the user clicks "+ New", a panel opens within the picker:

1. **Example Selector**
   - Dropdown at the top listing all examples from `examples/`
   - First option: "Blank (start from scratch)"
   - Examples listed by filename (same merge logic — matched guide+prompts shown together)

2. **Preview Area**
   - Two tabs below the dropdown: **Guide | Prompts**
   - Shows the content of the selected example (read-only preview)
   - If the example only has one type, the other tab shows "Not available"
   - If "Blank" is selected, tabs show empty state with filename input

3. **Selection Checkboxes**
   - ☑ Guide  ☑ Prompts — user chooses which to copy
   - Both checked by default when the example has both
   - At least one must be checked

4. **"Add" Button**
   - Copies selected files from `examples/` to `data/`
   - If "Blank" selected, creates empty `.md` files with the user's chosen name
   - After adding, the item appears in the main list
   - Newly added items are **briefly highlighted** with an accent color (e.g. primary-tint
     background that fades after a few seconds) to draw attention to the new entry
   - Optionally opens the editor immediately

### Conflict Handling
- If a file with the same name already exists in `data/`, warn the user:
  "A guide/prompts file with this name already exists. Overwrite?"
- Options: Overwrite / Rename / Cancel

## Editor

### Container
- When viewing or editing content, the picker **expands to a wider container**
  (the item list can stay narrow, but text content needs more room to read/edit)
- The wider view applies to both the guide viewer and the prompts viewer
- Returns to narrow width when going back to the list

### Integration
- In the existing viewer, add an **"Edit" button** next to "Apply" and "Back"
- Clicking Edit toggles the content area from `<pre>` (view) to `<textarea>` (edit)
- **"Save" button** appears in edit mode — POSTs to the server
- **"Cancel"** returns to view mode without saving
- Works for both guides and prompts

### Editor Features (v1 — keep it simple)
- Plain textarea, monospace font
- No syntax highlighting (future enhancement)
- Auto-grows to content height
- Save via existing POST /api/guides endpoint (or new /api/prompts endpoint)
- Filename shown (not editable after creation)

## "Guide Builder" Example

A special example guide that uses Copilot to interactively create new guides:

### `examples/guides/guide-builder.md`
```markdown
# Guide Builder

Help the user create a new Copilot guide by walking them through the process.

## Steps

1. Ask the user: "What domain or task should this guide cover?"
   Examples: API access, project conventions, data analysis, game rules

2. Ask: "What tools will Copilot need? (e.g., PowerShell, web search, file access)"

3. Ask: "Should the guide discover information automatically, ask the user,
   or use hardcoded values?"

4. Ask: "What are 3-5 common questions someone would ask in this domain?"
   (These become the companion prompts file)

5. Based on the answers, generate two files:
   - A guide .md file in data/guides/{name}.md
   - A prompts .md file in data/prompts/{name}.md

6. Show the user what was created and offer to edit either file.

## Guidelines for the generated guide
- Use ## sections for logical groupings
- Include a Glossary section if the domain has jargon
- Use [DISCOVER] or [ASK] placeholders for user-specific values
- Include a "How This Works" section at the end
- Tell Copilot to narrate what it's doing
```

### `examples/prompts/guide-builder.md`
```markdown
# Guide Builder Prompts

## Create a new guide
Walk me through creating a new Copilot guide for a domain I work in.

## Create prompts for an existing guide
Look at my existing guides and help me create a set of canned prompts for one of them.

## Improve an existing guide
Review one of my guides and suggest improvements — missing sections, better structure, or additional patterns.
```

## API Changes

### New Endpoints
- `GET /api/examples` — list all examples (merged guides + prompts, same format as /api/guides)
- `GET /api/examples/{id}` — get example content (guide)
- `GET /api/examples/{id}/prompts` — get example prompts
- `POST /api/guides/from-example` — copy example to data/
  Body: `{ exampleId: string, copyGuide: boolean, copyPrompts: boolean, name?: string }`

### Modified Endpoints
- `POST /api/guides` — also accept prompts content for creating new prompts files
  Or: `POST /api/prompts` — new endpoint for creating/saving prompts files

### Removed
- `seedContextExamples()` — no longer auto-copies on startup

## Migration
- Existing users: their `data/guides/` and `data/prompts/` files are untouched
- The seed logic is removed, but existing seeded files remain
- New installs: `data/` starts empty, users add from examples or create new

## Future Enhancements (not in v1)
- Syntax highlighting in editor (CodeMirror or similar)
- Drag-and-drop .md file upload
- Import from URL
- Guide versioning (track changes)
- Share guides (export/import between portal installs)
- Dynamic prompts with template variables
