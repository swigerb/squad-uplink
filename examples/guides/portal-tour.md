# Show Me Around Copilot Portal

You're giving a friendly, casual tour of Copilot Portal. Walk the user through features one section at a time, explaining what they see and inviting them to try things along the way.

**Pacing:**
- Keep each section short — explain, suggest something to try, then pause and let them respond.
- Don't prompt the user with choices at every step. A simple "just say next when you're ready" or "let me know what you'd like to explore" keeps things relaxed.
- When something requires action outside the chat (pressing a key in the terminal, scanning a QR code), describe what to do and wait for them to come back naturally.
- If the user seems familiar with something, offer to skip ahead. If they seem curious, go deeper.
- Keep the tone warm and conversational — this might be their first time using the portal.

---

## 1. Sending Messages

Start here — before anything else, make sure the user knows how to interact. Explain the input area at the bottom of the screen:
- **Message box** — grows as you type. Press Enter to send, Shift+Enter for a new line. On mobile, Enter adds a new line — use the send button instead.
- **Send button** — the blue button on the right side of the input.
- **Recall button** (↩ arrow) — appears when the input is empty and you've sent at least one message. Click it to bring back your last message for editing or resending.
- **Clear button** (✕) — appears when there's text in the box. Click to clear the input.
- **Prompt tray toggle** (chat bubble icon) — appears when session prompts are loaded. Click to open a scrollable tray of canned prompts above the input. Click any prompt to fill the message box, ready to send.

Let the user know they can say "next" or type any question to move through the tour at their own pace. If prompts are loaded, point out they can also use the prompt tray to jump to a specific topic.

---

## 2. The Header

Now orient the user — describe what they see across the top of the page:
- **Logo and version** — top-left shows "Copilot Portal" with the version and build number.
- **Top-right controls (left to right):**
  - **Stop button** (red square) — only appears when Copilot is actively working. Click to cancel.
  - **Sessions** (stacked squares icon) — opens the session picker to switch between sessions, create new ones, or manage existing ones.
  - **Guides & Prompts** (3-fold map icon) — opens the guides and prompts panel.
  - **Rules** (bulleted list icon) — manages always-allow rules that let tools execute without asking for permission each time. Displays a count badge when rules exist. Turns green when auto-approve-all is enabled.
  - **Connection dot** — a small circle at the far right. Green means connected, yellow means connecting, red means disconnected.

Below the header is the session drawer bar — it shows the current session name (or "untitled session"). Tap it to expand and see session details like the session ID, start time, current model, and working directory.

---

## 3. Session Management

Explain the two ways to manage sessions:

**The session picker** (click the stacked squares icon in the header):
- **Session list** — shows all sessions with names and timestamps. Click any session to switch to it — your conversations are preserved.
- **+ New Session** — creates a fresh session at the top.
- **Shield icon** — click the shield next to a session to protect it from accidental deletion. Shielded sessions show a dimmed trash icon.
- **Delete** — click the trash icon, then confirm inline.
- **Session ID** — the short code next to each session name. Click it to copy the full ID.

**The session drawer** shows details about the active session (tap the session name bar below the header to expand):
- Shows the session ID, start time, and current model.
- The working directory at the bottom shows where Copilot runs commands, including the git branch if applicable.

Invite the user to try creating a new session and switching back — reassure them the tour conversation will still be here when they return.

---

## 4. Approvals & Tools

Explain what happens when Copilot wants to take an action:
- **Permission cards** — a highlighted card appears describing the action (run a command, read a file, etc.) with a summary of what Copilot intends to do and why.
- **Allow / Deny** — approve or reject that specific action.
- **Allow Always** — creates a persistent rule so similar actions are auto-approved going forward. The matching pattern is shown (e.g., "read_file in C:\Projects\**").
- **Rules button** — in the header, shows how many always-allow rules exist. Click to view, manage, or clear them.
- **Tool summaries** — after a response completes, a collapsible "🔧 N tools ran" section shows what tools were used and what each one did.
- **Reasoning** — if the model shares its thinking process, a collapsible "💭 Thought" section appears showing its internal reasoning.

Mention that approvals keep the user in control — they can be as cautious or permissive as they like. Rules build up over time so the experience gets smoother.

---

## 5. Guides & Prompts

Explain the Guides & Prompts panel (click the 3-fold map icon in the header):

**The list view** shows all available guides and prompts. Each item shows indicators for what it includes:
- Eye icon — a guide file exists for this item.
- Chat bubble icon — a prompts file exists for this item.
- Trash icon — delete with inline confirmation.

**Clicking an item** opens a detail view where you can read the content before deciding what to do:
- **Guide tab / Prompts tab** — switch between viewing the guide content and the companion prompts.
- **File path** — shown at the top with a copy button. If a file doesn't exist yet, the path appears dimmed with "(not created)".
- **Apply** — applies the guide to the current session (Copilot reads and follows it) or loads the prompts into the tray.
- **Edit** — opens a full-height editor where you can modify the content, rename the item, and save.
- **Unsaved changes guard** — if you try to navigate away with unsaved edits, an inline banner asks whether to discard or keep editing. No work is lost by accident.

**+ New button** at the bottom of the list:
- Browse a catalog of example templates to start from, or create one from scratch.
- **Import from URL** — paste a GitHub Gist URL to import guides and prompts shared by others. Gist files use the `name_guide.md` / `name_prompts.md` naming convention.
- Preview the content before adding. Choose which files to include and customize the name.

**Prompts tray** — once prompts are loaded, a chat bubble icon appears in the message input area. Click it to open a scrollable tray of prompts. Prompts from multiple sources stack together and deduplicate. They persist across page reloads and session switches.

Invite the user to open the panel and explore. Mention they can also create `.md` files directly in the `data/guides/` and `data/prompts/` folders if they prefer working in their editor.

---

## 6. Console Control Keys

These are keyboard shortcuts that work in the **terminal window** where the server is running — not in the browser:
- **c** — Opens the Copilot CLI console in a new terminal window. Great for quick tasks without leaving the terminal.
- **l** — Launches the portal URL in your default browser.
- **q** — Shows the QR code and URL. If a tunnel is running, shows both the local and tunnel URLs with a QR code for remote access.
- **t** — Starts a DevTunnel for remote access (HTTPS from anywhere, not just your local network). Press again to stop it. First time, it asks about access settings.
- **T** (Shift+T) — Security reset. Destroys the tunnel, rotates the access token, and disconnects all clients. Use if you think a URL was compromised.
- **u** — Checks for SDK, CLI, and portal updates.
- **r** — Restarts the server gracefully (waits for any active work to finish first). If a tunnel was running, it auto-restarts.
- **x** — Exits the server.

Invite the user to try pressing 'q' in their terminal to see the QR code — they can come back and say "next" when they're ready.

---

## 7. Mobile Access

Explain how to use the portal from a phone or tablet:
- **QR code** — when the server starts, it displays a QR code in the terminal. Scan it with your phone's camera to open the portal instantly.
- **Same network** — by default, your phone needs to be on the same Wi-Fi network as the computer running the server.
- **Remote access** — press **t** in the terminal to start a DevTunnel. This creates an HTTPS URL that works from anywhere — cellular, different networks, even another building. The tunnel QR code appears automatically.
- **Add to Home Screen** — on iOS, use Share → Add to Home Screen. The portal opens in standalone mode (no browser chrome) with a proper app icon. A subtle hint appears on mobile after a couple of visits.
- **Touch-friendly** — the UI is designed for mobile. Buttons are large, approvals are easy to tap, and everything scrolls naturally.
- **Enter key** — on mobile, Enter adds a new line (useful for multi-line messages). Tap the send button to send.

Mention that the portal works great as a home screen app — no install from the App Store needed.

---

## 8. Updates & Tips

Wrap up with a few handy things:
- **Update banner** — when updates are available for the SDK, CLI, or the portal itself, a banner appears at the top of the page. The portal can download updates and restart itself in place — no manual steps needed.
- **Session names** — sessions automatically name themselves based on the conversation. You can see the current name in the session drawer bar below the header.
- **Dark theme** — the portal uses a dark theme designed for comfortable extended use.
- **Shared with the CLI** — the portal connects to the same Copilot CLI server that powers the terminal console. If you have both open, messages from either side show up in both places.

End the tour warmly — let the user know they can ask about any section again anytime, or start a new session to explore on their own.
