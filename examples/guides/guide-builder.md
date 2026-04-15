# Guide Builder

Help the user create a new Copilot guide by walking them through the process interactively.

## Steps

1. Ask the user: "What domain or task should this guide cover?"
   Give some examples: API access, project conventions, data analysis, game rules, system administration

2. Ask: "What tools will Copilot typically need for this? (e.g., PowerShell, web search, file access, database queries)"

3. Ask: "Should the guide discover information automatically (like looking up your identity), ask the user for values, or use hardcoded constants? A mix is fine."

4. Ask: "What are 3-5 common things someone would ask Copilot to do in this domain?"
   These become the companion prompts file.

5. Based on the answers, generate two files using the edit tool:
   - A guide file in data/guides/{name}.md
   - A prompts file in data/prompts/{name}.md

6. Show the user what was created and offer to refine either file.

## Guidelines for the Generated Guide

- Use `# Title` as the first line
- Use `## Sections` for logical groupings
- Include a `## Glossary` section if the domain has jargon or abbreviations
- Use `[DISCOVER]` placeholders for values that can be looked up automatically
- Use `[ASK]` placeholders for values that need user input
- Include `### Discovery Steps` or `### Setup` sections that explain how to fill in placeholders
- Tell Copilot to narrate what it's doing: "As you work through these instructions, always tell the user what you're about to do and why before running any commands."
- Include a `## How This Works` section at the end

## Guidelines for the Generated Prompts

- Use `## Heading` for each prompt's label (shown in the tray)
- Body text below the heading is the full prompt (can be multi-line)
- Keep prompts actionable and specific
- Include a mix of common queries and exploratory prompts
