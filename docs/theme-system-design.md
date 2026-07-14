# Theme System Design

Global theme support with preset picker, custom theme editor, auto-derived colors, and per-session overrides.

## Implementation Progress

### Done
- Theme derivation engine: `deriveTheme(base, accent, text?)` generates 25+ CSS variables
- WCAG contrast checking: body text, user bubbles, status colors all shift for readability
- Dark and Light built-in presets via CSS `[data-theme="light"]`
- `--button-contrast` and `--primary-contrast` for text on colored backgrounds
- Half-moon icon in header opens theme picker (full-screen overlay panel)
- Custom theme editor with three color pickers (Base, Accent, Text)
- Live preview as you drag color pickers
- "🎲 Surprise me" random palette generator (complementary, analogous, triadic, split-complementary)
- Edit existing custom themes by clicking them
- Copy preset colors into editor by clicking a preset while editing
- Server API endpoints (`GET/POST /api/themes`) for cross-device storage

### Bug / Not Working Yet
- Server save not persisting (themes.json not being created — likely auth/timing issue)
- Custom themes lost on page reload
- `<meta theme-color>` not updating for custom themes on mobile

### Not Started
- Default theme selection (star)
- Per-session theme override
- Session drawer theme picker

## Design

### Preset Picker

A dropdown or swatch grid replacing the current sun/moon toggle:
- **Dark** (default, not deletable)
- **Light** (not deletable)
- User-created custom themes (deletable)
- **+ New Theme** option opens the editor

### Theme Editor

Two color pickers that derive all 25+ variables:

**Inputs:**
1. **Base color** — the background color. Everything else is derived from it.
2. **Accent color** — the interactive/brand color. Buttons, links, highlights.

**Auto-derived colors:**

From Base:
```
bg          = base
surface     = lighten(base, 5%)
border      = lighten(base, 15%)
text        = auto-contrast(base) — white if base is dark, black if light
text-muted  = midpoint(base, text) at 50% opacity
text-bright = full contrast (white or black)
overlay     = rgba(0,0,0, isDark ? 0.6 : 0.3)
subtle-bg   = rgba(contrast, isDark ? 0.08 : 0.04)
code-bg     = darken(base, 3%)
code-fg     = text
scrollbar   = rgba(contrast, 0.15)
button-contrast = isDark ? #111 : #fff
```

From Accent:
```
primary       = accent
primary-hover = darken(accent, 10%)
accent        = accent
primary-tint  = rgba(accent, 0.10)
```

Status colors (semantic, mostly fixed):
```
error    = red variant, contrast-checked against base
success  = green variant, contrast-checked against base
warning  = amber variant, contrast-checked against base
shield   = amber variant
tool-call = gold/olive variant
purple   = purple variant
code-inline = orange/brown variant (dark) or dark orange (light)
```

Status tints auto-derived:
```
error-tint   = rgba(error, isDark ? 0.10 : 0.08)
success-tint = rgba(success, isDark ? 0.10 : 0.08)
...etc
```

### Contrast Logic

Use WCAG relative luminance and contrast ratio:

```typescript
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
```

Rules:
- Text on background must have ≥ 4.5:1 contrast ratio (WCAG AA)
- Status colors on background must have ≥ 3:1 contrast ratio
- If a status color fails contrast against the base, shift its lightness until it passes
- Auto-pick text color: if base luminance > 0.5, use dark text; otherwise light text

### Live Preview

The editor applies changes immediately via CSS variables (no save required to preview). The user sees the full portal update in real-time as they drag the color picker.

### Storage

Custom themes saved to localStorage:
```json
{
  "portal_themes": {
    "my-blue": { "base": "#1a1a2e", "accent": "#e94560", "name": "Midnight Blue" },
    "warm-dark": { "base": "#2d2424", "accent": "#ff6b6b", "name": "Warm Dark" }
  },
  "portal_theme": "my-blue"
}
```

Only base + accent + name are stored. All other values are computed at runtime.

### UI Placement

**Header:** Replace the sun/moon toggle with a theme button that opens a popover:
- Shows current theme name/swatch
- Popover shows preset grid + "+ New Theme" button
- Clicking a preset switches immediately
- "+ New Theme" opens the editor inline in the popover (or as a modal)

**Editor layout:**
```
┌─────────────────────────────┐
│ Theme Name: [____________]  │
│                             │
│ Base:   [color picker] #hex │
│ Accent: [color picker] #hex │
│                             │
│ Preview:                    │
│ ┌─────────────────────────┐ │
│ │ Sample text, buttons,   │ │
│ │ status indicators...    │ │
│ └─────────────────────────┘ │
│                             │
│        [Cancel] [Save]      │
└─────────────────────────────┘
```

### Default Theme (Star)

In the theme picker, each theme has a ☆/★ icon. Click to set it as the **default**:
- One theme is always starred (default: Dark)
- The default applies to all sessions that don't have an override
- Starred theme is stored server-side
- Built-in themes (Dark, Light) can be starred too

### Per-Session Theme Override

The existing theme picker in the header is session-aware:
- Selecting a theme applies it to the **current session**
- Switching sessions loads that session's theme (or the default)
- All theme actions stay in one place — no session drawer UI needed

Storage:
- Per-session theme stored server-side (like approval rules, keyed by session ID)
- Default (starred) theme stored in `data/themes.json`

### Behavior on Session Switch

1. Load the session's theme preference (if any)
2. If no preference → apply the starred default
3. Theme transitions smoothly (CSS variables update, no flash)

### Behavior on Theme Edit

- Editing a theme that's currently the default → all sessions using the default update live
- Editing a theme that's overridden on specific sessions → those sessions update live
- Deleting a theme that sessions reference → they fall back to default

## Implementation Order (Revised)

1. ~~Color derivation utilities~~ ✅
2. ~~Theme picker overlay with presets~~ ✅
3. ~~Custom theme editor (base + accent + text)~~ ✅
4. ~~Live preview~~ ✅
5. ~~Surprise Me palette generator~~ ✅
6. ~~WCAG contrast safety~~ ✅
7. Fix server save/load bug
8. Default theme selection (star icon)
9. Per-session theme (picker sets theme for current session)
10. Agent-preferred theme (future)

## Open Questions

1. **Should the editor show a mini preview or use the full portal as the preview?** Full portal is more honest but the editor needs to be visible too.

2. **Color picker widget:** Use the browser's native `<input type="color">` or a custom picker? Native is easiest and works everywhere. Custom would be prettier.

3. **Status color adjustment:** How aggressively should we shift status colors? Subtle lightness shift, or fully re-map to a different hue family?

4. **Import/export:** Should custom themes be shareable (via gist, like guides)? Probably yes, eventually — but just localStorage for v1.
