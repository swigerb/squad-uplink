# Decision: Pip-Boy Codepen Exact Port

**By:** Kare (Frontend Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Brady requested (twice) that the Pip-Boy implementation match the Codepen reference (https://codepen.io/stix/pen/KdJEwB) exactly. The previous implementation used a CSS grid layout with custom device chrome that didn't match the reference.

## Decision

Complete replacement of `src/styles/pipboy.css` and the `PipBoyLayout` component in `src/App.tsx` with a faithful port of the Codepen's CSS and HTML structure.

## Key Choices

1. **Fixed dimensions + transform scaling**: Kept the Codepen's 630x400px design and used `transform: scale()` with a viewport-responsive scale factor (via `usePipBoyScale` hook) instead of making everything fluid/responsive. This preserves pixel-perfect fidelity.

2. **Class namespacing**: All Codepen classes prefixed with `pipboy-` (e.g., `.pip` → `.pipboy-pip`) and scoped under `[data-theme='pipboy']` to avoid conflicts with other themes.

3. **Tab label strategy**: Used `pipboy-lbl-*` class names for CSS `::before` content labels (avoiding conflicts with existing `pipboy-stat`/`pipboy-inv` component classes). Nav tabs use `aria-label` for accessibility while `::before` provides visible text.

4. **Content integration**: Codepen decorative elements (supplies, info-bar icons, HUD bar) rendered alongside functional tab content. The screen inner area uses absolute-fill flexbox for tab panels.

5. **Three Codepen animations preserved**: `pipboy-flicker` (power button glow), `pipboy-meter` (RADS needle oscillation), `pipboy-scan` (green scan line sweep).

## Impact

- `src/styles/pipboy.css`: Complete replacement (~650 lines)
- `src/App.tsx` PipBoyLayout: Complete replacement (~170 lines)
- All 399 tests passing, build clean
- No changes to other themes or components
