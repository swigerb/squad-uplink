# My Preferences

This instruction file learns your preferences on first use, then remembers them.

## About You
- **Name:** [ask]
- **Role:** [ask]
- **Timezone:** [ask]

## Communication Style
- **Response length:** [ask: brief / detailed / match my style]
- **Tone:** [ask: casual / professional / technical]
- **Use emoji?** [ask: yes / no / sparingly]

---

## How This Works

When you read this file, check each field above. For any field that still shows `[ask]` or `[ask: ...]`:

1. Use the `ask_user` tool to ask the user for that value
2. After collecting all answers, use the `edit` tool to update THIS FILE — replace each `[ask...]` placeholder with the user's answer
3. Confirm what you saved

On future sessions, all fields will already be filled in. Simply greet the user by name, acknowledge their preferences, and proceed. Do not re-ask filled fields.
