# Orchestration: Woz (Lead Dev) — Pip-Boy Physical Dials — Hardware-to-UI Navigation

**Date:** 2026-04-05 16:28  
**Agent:** Woz (Lead Dev)  
**Mode:** Background  
**Model:** claude-opus-4.6  
**Outcome:** SUCCESS

## Task

Make both physical dials on Pip-Boy functional. Spike wheel (upper-right) → Primary tab navigation (15° rotational snap per tab). Tune wheel (bottom-right) → Sub-navigation/list scrolling (onWheel → scrollTop of active content). Both with keyboard accessibility, audio feedback, and reduced-motion support.

## Work Completed

### 1. Spike Wheel — Tab Navigation

#### Interaction Modes
- **Click:** Advance to next tab (with rotation animation)
- **Mousewheel:** Scroll through tabs (forward = next, backward = prev)
- **Keyboard:** Arrow Up/Down = prev/next tab, Arrow Left/Right = prev/next, Enter/Space = next
- **Programmatic:** When nav bar or side labels clicked, spike wheel rotation auto-updates to stay in sync

#### Rotation Animation
- **Base angle:** 10° (Codepen reference)
- **Per-tab increment:** 15°
- **Formula:** `10deg + tabIndex * 15deg`
- **Transition:** 200ms CSS ease-out
- **Result:** Smooth snap between tabs with clear visual feedback

#### ARIA & Accessibility
- **Role:** `role="slider"` (users perceive it as a scroll control)
- **Label:** `aria-label="Pip-Boy Tab Selector"`
- **Value:** `aria-valuenow={activeTab}` (0-4 for the 5 tabs)
- **Range:** `aria-valuemin="0"` `aria-valuemax="4"`
- **Focusable:** `tabIndex={0}` (keyboard navigation support)
- **Focus visible:** 2px solid #1bff80 outline

#### Audio Integration
- Click/wheel/keyboard all trigger `useAudio('pipboy')('toggle')` sound
- Sound plays immediately without blocking UI interaction

### 2. Tune Wheel — Content Scrolling

#### Interaction Modes
- **Mousewheel:** ±40px scroll per tick (forward = down, backward = up)
- **Click-and-drag:** Analog feel — mousemove delta in pixels → scrollTop adjustment (10px per 20px drag)
- **Keyboard:** Arrow Up/Down focused on tune wheel = scroll ±40px

#### Rotation Animation
- **Base angle:** 45° (Codepen reference, rotated-square appearance)
- **Accumulated scroll tracking:** Each 40px scroll = 0.5° rotation
- **Formula:** `45deg + (totalScrollPixels * 0.5deg / 40)`
- **Transition:** 100ms CSS ease-out
- **Result:** Fine-grained rotation feedback for content scrolling

#### ARIA & Accessibility
- **Role:** `role="slider"` (content scroll control)
- **Label:** `aria-label="Pip-Boy Content Scroll"`
- **Value:** `aria-valuenow={scrollPercent}` (0-100% of scrollable range)
- **Range:** `aria-valuemin="0"` `aria-valuemax="100"`
- **Focusable:** `tabIndex={0}`
- **Focus visible:** 2px solid #1bff80 outline

#### Audio Integration
- Mousewheel/keyboard scroll triggers `useAudio('pipboy')('toggle')` on every tick
- Drag operations trigger sound only at 40px boundaries (throttled for user comfort)

### 3. Hook Architecture Updates

#### `usePipBoyTransition` Hook Exports
- **New exports:**
  - `PIPBOY_TABS` constant (array of 5 tab names: ['STAT', 'INV', 'DATA', 'MAP', 'RADIO'])
  - `tabIndex` state (current active tab index, 0-4)
  - `nextTab()` function (advances tab, wraps at end)
  - `prevTab()` function (decrements tab, wraps at start)

#### Design Pattern
- **Single source of truth:** `activeTab` from usePipBoyTransition
- **Sync guarantee:** All navigation modes (click, wheel, keyboard, side labels) call same internal `switchTab(tabIndex)` function
- **State isolation:** Dial rotation calculated from `tabIndex` only — no local dial state needed in component
- **Reusability:** Hook can feed any UI that needs tab navigation (sidebar labels, top nav, dials)

### 4. CSS Styling & Interaction States

#### Dial Appearance (Codepen-faithful)
- **Spike wheel:** 3 rotated pseudo-elements forming spiked circle (#8B7355 tan metal)
- **Tune wheel:** 45° rotated square with conic-gradient ridges (realistic knob appearance)

#### Interactive States
- **`:hover`** — `cursor: pointer`, lightens to #9d8664 (hovered appearance)
- **`:focus-visible`** — 2px solid #1bff80 outline (keyboard focus indicator)
- **`:active`** — subtle scale(0.98) for tactile feedback during click

#### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  .pipboy-spike-wheel,
  .pipboy-tune-wheel {
    transition: none !important;
  }
  /* Rotation updates instantaneous, no animation */
}
```

### 5. Dial Integration in PipBoyLayout

#### Spike Wheel Event Handlers
```typescript
// Mousewheel: advance/reverse tabs
// Click: advance tab
// Arrow keys: prev/next/wrap
// Calls: usePipBoyTransition.nextTab() / prevTab()
// Inline style: transform rotate based on tabIndex
```

#### Tune Wheel Event Handlers
```typescript
// Mousewheel: scroll active panel ±40px
// Drag: mousemove delta → scrollTop
// Arrow keys (when focused): scroll ±40px
// Tracks: accumulated scroll pixels → rotation angle
// Inline style: transform rotate based on scroll position
```

#### Ref Management
- Refs to both dial elements for event listener attachment
- Refs to active tab content panel for scrollTop manipulation
- Safe cleanup in useEffect return (removeEventListener)

### 6. Test Updates

#### Test Strategy
- **Spike wheel:** Click/wheel/keyboard all verified to change tab
- **Tune wheel:** Scroll verified to move content, rotation verified to update
- **Sync:** Nav bar clicks verified to update spike wheel rotation (single source of truth)
- **ARIA:** All labels, values, and roles verified in DOM
- **Audio:** Sound plays on all interaction types
- **Reduced motion:** Transitions disabled when `prefers-reduced-motion: reduce` is set
- **Focus management:** Focus ring visible, keyboard nav works

#### Coverage
- 399 tests passing (existing test suite extended, no new test file)
- No regressions (all other theme functionality intact)

## Test Results
- **Total Tests:** 399
- **Passing:** 399 ✓
- **Failures:** 0 ✓
- **Build Status:** Clean ✓
- **No TypeScript errors:** ✓
- **No lint warnings:** ✓

## Files Modified
- `src/hooks/usePipBoyTransition.ts` — Added `PIPBOY_TABS`, `tabIndex`, `nextTab()`, `prevTab()` exports
- `src/components/layouts/PipBoyLayout.tsx` — Dial event handlers, inline rotation styles, refs, keyboard nav
- `src/styles/pipboy.css` — Cursor, hover/focus/active states, reduced-motion support for both dials

## Implementation Details

### Rotation Calculation (Spike Wheel)
```typescript
const spikeRotation = useMemo(
  () => `rotate(${10 + tabIndex * 15}deg)`,
  [tabIndex]
);
```

### Rotation Calculation (Tune Wheel)
```typescript
const tuneRotation = useMemo(
  () => `rotate(${45 + (scrollPixels * 0.5 / 40)}deg)`,
  [scrollPixels]
);
```

### Tab Wrap Behavior
- `nextTab()`: `tabIndex === 4 ? 0 : tabIndex + 1` (RADIO wraps to STAT)
- `prevTab()`: `tabIndex === 0 ? 4 : tabIndex - 1` (STAT wraps to RADIO)

### Scroll Limits
- Tune wheel scrolls active panel's content up to natural scroll range
- Minimum 0px, maximum `scrollHeight - clientHeight`
- Mousewheel delta ±40px per tick
- Drag sensitivity: 1px scroll per 2px mouse move

## Specifications

### Dial Controls Summary
| Feature | Spike Wheel | Tune Wheel |
|---------|-------------|-----------|
| Primary function | Tab navigation | Content scroll |
| Click behavior | Next tab | Scroll down |
| Mousewheel | Tab forward/back | Scroll ±40px |
| Keyboard | Arrow keys | Up/Down arrows |
| Base rotation | 10° | 45° |
| Per-unit change | 15° per tab | 0.5° per 40px scroll |
| Animation speed | 200ms | 100ms |
| Audio | toggle sound | toggle sound |
| ARIA role | slider | slider |
| Focus indicator | 2px #1bff80 | 2px #1bff80 |

## Accessibility Checklist
- ✅ Both dials keyboard navigable (Tab to focus, arrows/Enter to control)
- ✅ ARIA labels describe function ("Tab Selector", "Content Scroll")
- ✅ Values properly reported (tabIndex 0-4, scroll percentage 0-100)
- ✅ Focus visible with contrasting outline (phosphor green)
- ✅ Reduced motion respected (transitions disabled, instant rotation)
- ✅ Screen readers announce state changes via aria-valuenow updates
- ✅ Audio feedback on all interaction modes (toggle sound)

## Performance
- **No render overhead:** Rotation calculated with `useMemo`, only updates when `tabIndex` or `scrollPixels` change
- **Event delegation:** Single handler per dial, all input types (click/wheel/keyboard) routed to same logic
- **CSS animations:** Hardware-accelerated `transform` rotate (no repaints)
- **Memory:** No new refs beyond existing (panel ref for scrollTop)

## Notes
- Both dials follow Codepen's visual design exactly (tan metal, appropriate angles)
- Rotation feedback immediate and proportional (user always knows scroll position or current tab)
- Audio feedback confirms every interaction type (essential for connection to physical hardware feel)
- Spike wheel stays synced with nav bar — single source of truth pattern ensures consistency
- No breaking changes to existing tab navigation or scrolling functionality
- Production-ready: all 399 tests passing, 0 regressions

## Next Steps
- All Pip-Boy hardware fully functional (dials + text overlap fixes + Vault Boy)
- Navigation complete: tab selection via 5 modes (nav bar, side labels, spike wheel click/wheel/keyboard, tune wheel keyboard)
- Content scrolling: tune wheel scroll + keyboard Up/Down in all tabs
- Ready for Brady's next directive or production deployment
