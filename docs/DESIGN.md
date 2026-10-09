# SplitSnap Design Brief

Status: v2 (2026-10-09). Color system replaced with the user-chosen monochrome + blue accent (section 2); the rest of the structure stands. Covers the visual system, components, motion, a blueprint for each page, and the libraries we recommend. Token names match `src/app/globals.css`, so most of section 2 is a value swap plus a few new tokens, not a rewrite.

Diagnosis of "plain": the current UI is clean but flat. Every element has about the same visual weight. Nothing is big (money), nothing is bold (brand), nothing moves at the moments that matter (scan, claim, settle), and the landing page has no product imagery. Top consumer money apps fix this with four levers: **one loud brand color, huge tabular money figures, pill buttons on calm neutral surfaces, and small celebratory motion**. This brief applies those four levers.

---

## 1. Design principles

1. **The number is the hero.** Every screen has one dominant figure: the bill total, your share, or what each person owes. Show it big, in tabular figures, with smaller cents. This is the Cash App and Revolut home-screen pattern.
2. **Monochrome + one accent.** Ink-black primary actions on warm neutrals; electric blue only for focus, selection and links. Payment apps appear as outline buttons with their names, no brand colors or logos.
3. **Thumb-first.** The primary action sits in a bottom bar within thumb reach. Tap targets are at least 44px. Editing happens in bottom sheets, not modals.
4. **The receipt is real.** Extracted items are shown on a paper receipt (mono type, torn edges). People trust what looks like the thing they photographed.
5. **Celebrate settling up.** A check draws itself, a little confetti falls, and the tone is friendly. Keep the delight short (under 1s) and skip it entirely under reduced motion.

---

## 2. Brand

> **Direction chosen by the user on 2026-10-09: Monochrome + one accent (Linear / Vercel / Mercury).** This replaces the earlier "Snap Mint" proposal. Wherever this doc still says "brand", read "primary" (near-black) for fills and "accent" (blue) for selection, focus and links.

### Name treatment
- Wordmark: "SplitSnap" in `foreground`, Geist Sans 600, tracking -0.03em.
- Mark: a 24px rounded square (radius 7) filled with `foreground`, holding a receipt glyph split down the middle in `background`. It inverts in dark mode. The same glyph is the favicon, apple-icon and OG mark.

### Color tokens (`src/app/globals.css`, shadcn/ui token names)
| Token | Light | Dark | Use / contrast (WCAG 2.x) |
|---|---|---|---|
| `--background` | `#FAFAF9` | `#0C0A09` | Page |
| `--card` / `--popover` | `#FFFFFF` / `#FFFFFF` | `#171412` / `#1C1917` | Surfaces; popover = sheets, toasts |
| `--foreground` | `#0C0A09` | `#FAFAF9` | Text: 18.9:1 both modes |
| `--muted-foreground` | `#78716C` | `#A8A29E` | Secondary text: 4.6:1 on bg, 4.8:1 on card (light); 7.3:1 on card (dark). Only 4.4:1 on `--muted`, so no small muted text on the subtle fill |
| `--muted` / `--secondary` | `#F5F5F4` | `#24201E` | Subtle fill, segmented track, hover |
| `--border` | `#E7E5E4` | `#292524` | Hairlines, card borders |
| `--input` | `#D6D3D1` | `#44403C` | Input and outline-button borders |
| `--primary` / `--primary-foreground` | `#0C0A09` / `#FAFAF9` | `#FAFAF9` / `#0C0A09` | Primary buttons are black pills (white in dark) |
| `--accent` = `--ring` | `#2563EB` | `#3B82F6` | Used sparingly: links, focus ring, active progress step, the selected "tapping as" person, key totals. 5.2:1 on white, 5.0:1 on dark card. Never a button fill |
| `--success` / `--success-foreground` | `#16A34A` / `#15803D` | `#4ADE80` | Dots/icons / text (5.0:1). Semantic only |
| `--warning` / `--warning-foreground` | `#D97706` / `#B45309` | `#FBBF24` | Unclaimed and mismatch dots / text (5.0:1) |
| `--destructive` | `#DC2626` | `#F87171` | Errors, delete (4.8:1 / 6.6:1) |

Rules:
- Flat surfaces and 1px borders. No gradients, glows, glass or colored shadows. One subtle neutral shadow (`--shadow-float`) only on floating things: sheets, toasts, sticky bars, the hero device frame.
- Accent appears at most a few times per screen. Semantic colors appear as small dots/icons plus words, never as large fills.
- The receipt uses the card color with torn edges (`.receipt-paper` + `.paper-edge`), in both themes.
- Color never carries meaning alone: every state pairs color with an icon or text.

### Avatar palette (8 muted tones, both themes)
Assigned by join order (`avatarTone`). CSS variables `--av-{0..7}-bg` / `--av-{0..7}-fg`. Initials contrast is 6.1:1 or better in light and 8.0:1 or better in dark.

| # | Name | Light bg / fg | Dark bg / fg |
|---|---|---|---|
| 0 | Slate | `#DDE3EC` / `#344256` | `#27303C` / `#C2CCDA` |
| 1 | Sage | `#DCE6DC` / `#33513A` | `#24302A` / `#BBD0BF` |
| 2 | Clay | `#EEDFD8` / `#73402F` | `#382823` / `#E0BCAE` |
| 3 | Sand | `#ECE4D2` / `#62502B` | `#342E21` / `#D9C8A2` |
| 4 | Lavender | `#E3E0EC` / `#4A4270` | `#2C293A` / `#C9C2E0` |
| 5 | Teal | `#D9E7E6` / `#2D5856` | `#203231` / `#AFD0CE` |
| 6 | Rose | `#EEDEE2` / `#723748` | `#372529` / `#E0B9C3` |
| 7 | Olive | `#E3E3D5` / `#4F5430` | `#2D2E23` / `#CDCFAE` |

---

## 3. Typography

- **Font:** keep **Geist Sans** for UI and display and **Geist Mono** for receipt paper. Both are already loaded via `next/font/google` in `layout.tsx`, so there is no new download. Geist has `tnum`.
- Apply `font-feature-settings: "ss01" off; font-variant-numeric: tabular-nums;` to every money element (Tailwind `tabular-nums`). Body text keeps proportional figures.

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 56/56px (3.5rem) ≥640px; 40/44px mobile | 700 | -0.04em | Landing hero H1 |
| `h1` | 32/38px (2rem) | 700 | -0.03em | Page titles, step titles |
| `h2` | 24/30px (1.5rem) | 650 | -0.02em | Section titles |
| `h3` | 18/24px (1.125rem) | 600 | -0.01em | Card titles |
| `body` | 16/24px (1rem) | 400 | 0 | Default. Inputs are always ≥16px (prevents iOS zoom) |
| `small` | 14/20px (0.875rem) | 400/500 | 0 | Secondary, list meta |
| `caption` | 12/16px (0.75rem) | 600 | 0.06em, UPPERCASE | Eyebrows, table headers |
| `mono-receipt` | 14/22px | 400/500 | 0 | Receipt lines (Geist Mono) |

### Money display (`MoneyText` spec)
```
 $ 142 .80        ← size "hero": dollars 56px/700, "$" and ".80" at 0.5em, weight 600,
 ^      ^            aligned to the cap-height top (flex items-start, cents mt-[0.12em]),
 0.5em  0.5em        cents color = fg at 60% opacity. Tabular. Tracking -0.03em.
```
- Sizes: `hero` 56px (your share, bill total), `lg` 32px (totals card), `md` 18px/600 (per-person rows), `sm` 15px/500 (line items, no cents shrink).
- **Never hide cents** on amounts owed (trust). Always show 2 decimals. `$0.00` displays as "$0.00", never "Free" or "—".
- Format with `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})`, then split on the decimal for styling. Use `aria-label` with the full plain string so screen readers say "$142.80".
- Right-align amounts in lists. Sign colors appear only for refunds or negative adjustments (danger), never for ordinary amounts.

---

## 4. Layout, spacing, radii, elevation

- **Spacing scale (4px base):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96. These are Tailwind's defaults (1–24); don't introduce arbitrary values.
- **Gutters:** 16px mobile, 24px ≥640px. **App column:** `max-w-[30rem]` (480px), centered. Desktop shows the same column, which reads as a phone-width "app card" on a quiet background. **Landing container:** `max-w-[72rem]` (1152px).
- **Vertical rhythm:** 24px between cards in the app, 96px (mobile 64px) between landing sections.
- **Radii:** `rounded-lg` 8px (small chips inside cards, kbd), `rounded-xl` 12px (inputs, list rows), `rounded-2xl` 16px (cards), `rounded-3xl` 24px (bottom-sheet top corners, hero mockup, bento cells), `rounded-full` (buttons, chips, avatars). **All buttons are pills**, following Revolut, Wise and Cash App.
- **Elevation, light:** `shadow-card` = `0 1px 2px rgb(15 20 17/.05), 0 4px 16px -8px rgb(15 20 17/.10)` + `border line`. `shadow-pop` (sheets, menus) = `0 8px 32px -8px rgb(15 20 17/.22)`.
- **Elevation, dark:** no drop shadows. Use a lighter surface step (`surface` → `elevated`) + a 1px `line` border + a top inner highlight `inset 0 1px 0 rgb(255 255 255/.04)`. Borders do the job shadows do in light mode.
- **Hairlines:** 1px everywhere. List rows separated by `divide-line` inset 16px from the left (iOS style).

---

## 5. Components

Icons: **lucide-react**, 20px default (16 in chips, 24 in empty states), stroke 1.75. Icon-only buttons need `aria-label`.

### Buttons (pill, `rounded-full`, weight 600)
| Variant | Style |
|---|---|
| primary | `bg-brand text-brand-fg hover:bg-brand-strong` |
| secondary | `bg-surface text-fg border border-line-strong hover:bg-sunken` |
| ghost | `text-fg hover:bg-sunken` (no border) |
| danger | `bg-danger-soft text-danger` |

| Size | Height | Padding-x | Text |
|---|---|---|---|
| sm | 36px (hit area extended to 44 with `before:` inset) | 14px | 14px |
| md | 44px | 18px | 15px |
| lg | 52px | 24px | 16px; used for the bottom-bar CTA, full width |

Press state: `active:scale-[0.97]`, 120ms. Disabled: 40% opacity, no pointer. Loading: spinner replaces the leading icon, the label stays, and the width doesn't change.

### Cards
`bg-surface rounded-2xl border border-line shadow-card p-4` (p-5 ≥640px). Header row: h3 title + optional muted trailing action (ghost sm). No nested cards. Use dividers inside instead.

### Chips / toggles (claiming)
- Person chip: 36px tall pill, avatar xs (20px) + name 14px/500. **Off:** `bg-surface border-line text-fg`. **On:** background `--av-n-bg`, 1.5px border in `--av-n-fg`, text `--av-n-fg`, leading lucide `Check` 14px. `role="checkbox"` + `aria-checked`.
- "Split evenly" / "Everyone" chip: foreground border when on.
- Segmented control (tip %: 15 / 18 / 20 / Custom): track `bg-sunken rounded-full p-1`, the selected segment is `bg-surface shadow-card` with a sliding indicator (motion `layoutId`).

### Inputs
48px tall, `rounded-xl bg-sunken border border-transparent focus:border-brand-ink focus:bg-surface`, 16px text, label above (14px/500), helper/error below (13px, error in danger with icon). Money inputs: `inputMode="decimal"`, leading "$" in muted, right-aligned, tabular. Venmo/Cash App handle inputs get a leading "@" / "$" prefix.

### Bottom action bar (all /split steps)
```
┌──────────────────────────────────────────┐  fixed bottom-0, bg-elevated/85
│ Your share          [  Continue  →  ]    │  backdrop-blur-xl, border-t line
│ $23.40                                   │  px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]
└──────────────────────────────────────────┘
```
Left: a context figure (MoneyText md) or step hint. Right: primary lg button. When there's no figure, the button runs full width. Add `pb-28` to scroll content so nothing hides under the bar. Requires `viewport: { viewportFit: "cover" }` in the `layout.tsx` viewport export.

### Bottom sheet (drawer)
Used for editing an item, adding a person, tip/tax editor, and payment handles. `rounded-t-3xl bg-elevated`, a 36×4px grab handle (`bg-line-strong`, centered, 8px from the top), max-height 90dvh, content `pb-[env(safe-area-inset-bottom)]`. Drag to dismiss; the backdrop is `bg-black/40`. On ≥640px it becomes a centered dialog (max-w-md). Focus is trapped and Esc closes.

### Stepper
Replace the numbered pills with a **4-segment progress bar** + label: `Step 2 of 4 · People`. Segments are 4px tall, `rounded-full`, gap 4px; done/current use `bg-brand`, upcoming use `bg-line`. The current segment fills with a 280ms width animation. Completed steps stay tappable (the header back chevron does the same). Header: back button (ghost icon 44px) | title (h3, centered) | overflow/help.

### Toast
Bottom-center, offset above the action bar (`bottom: calc(88px + env(safe-area-inset-bottom))`), `bg-fg text-bg rounded-full px-4 py-3 text-sm` with a leading icon, 3s auto-dismiss, one at a time. Examples: "Link copied", "Receipt scanned · 12 items". Errors stay until dismissed and include a "Retry" action.

### Receipt-paper item list
Keep `.receipt-paper` + `.paper-shadow`. Inside: merchant name centered (mono 13px uppercase, tracking 0.1em), date, then a dashed divider (`border-dashed border-paper-fg/20`).
```
2×  CHICKEN TIKKA ............ 31.00   ⟩ tap → edit sheet
    GARLIC NAAN .............. 4.50
⚠   MANGO LASSI .............. 5.50   [Check]  ← low-confidence: warning dot + chip
- - - - - - - - - - - - - - - - - - -
    SUBTOTAL                  41.00
    TAX                        3.69
    TIP 18%                    7.38
    TOTAL                     52.07   ✓ Matches receipt   (success chip; warning chip if off)
```
Rows are 44px min height. Dotted leaders use a flex spacer with `border-b border-dotted`. Price is right-aligned and tabular. "+ Add item" is a ghost row at the bottom.

### Totals card (Settle)
At the top, a muted caption "TOTAL BILL" with MoneyText hero beneath it and a meta line "4 people · tax & tip split proportionally". Below that, a per-person list: avatar md | name (16/500) + "3 items" muted | amount (md, right). Host row badge: `Host · paid the bill` (outline badge). Each non-host row expands (chevron) into item breakdown + tax/tip lines, then shows a pay-link row: three outline sm pill buttons labelled with the app name (no brand colors or logos), plus a "Mark paid" toggle.

### Empty states
Centered in the card: a 48px circle `bg-sunken` with a 24px lucide icon in muted, then h3 (one line) and one muted sentence, then one button. Examples:
- People, none added: icon `UserPlus` / "Who's at the table?" / "Add everyone who's splitting, including you." / [Add person]
- Claim, an item nobody has claimed: inline warning row "Nobody's claimed this yet" + [Split evenly].

### Success state (Settle)
When everyone is marked paid, or the host sends the summary, the totals card is replaced by: a 72px brand circle with a lucide `Check` stroke drawing in (pathLength 0→1, 400ms), scale 0.8→1 spring, and a single confetti burst (60 particles, avatar dot colors + brand, 900ms). Then h1 "All square." with a muted line "Everyone's paid Maya back." and two actions: [Share summary] (primary), [Start a new split] (ghost). Under reduced motion, show the static check and no confetti.

### Skeletons
Scanning: the receipt-paper shape with 6 shimmer rows (`bg-paper-fg/8`, widths 60–85%), plus the existing scan-line animation across a thumbnail of the photo, plus status text that rotates through "Reading items…", "Finding tax & tip…", "Checking the math…". Never show a skeleton on a final amount.

---

## 6. Motion

| Token | Duration | Easing | Used for |
|---|---|---|---|
| `fast` | 120ms | `ease-out` | Press scale, hover, chip toggle color |
| `base` | 200ms | `cubic-bezier(0.2,0.8,0.2,1)` | Expand/collapse rows, toasts, segmented indicator |
| `step` | 280ms | same | Step transition: outgoing fades + x −16px, incoming fades + x +16px→0 (direction-aware) |
| `sheet` | spring (stiffness 400, damping 40) | — | Bottom sheet enter/exit |
| `celebrate` | 400–900ms | spring | Success check, confetti |

What animates: step changes, chip on/off (scale 0.95→1 "pop" + color), avatar joining a stack (layout animation), totals counting up when values change (200ms, number tween), the progress bar fill, and sheets. What doesn't: page scroll, body text, prices on the receipt (they must look stable), the landing hero headline.

"Haptic-feeling" feedback: every tap gets a visual press (scale 0.97). Claim toggles also call `navigator.vibrate?.(8)` where supported (Android Chrome). iOS Safari has no vibrate API, so the visual press is the feedback there.

Reduced motion: wrap the app in `<MotionConfig reducedMotion="user">`. Keep the existing global CSS override. Confetti and count-up are skipped (render the final state). Opacity fades ≤150ms are still allowed.

---

## 7. Page blueprints

### Landing `/` (section order)
1. **Header** (sticky, 64px, `bg-bg/80 backdrop-blur`, border appears after 8px of scroll): logo | "How it works", "FAQ" (hidden <640px) | primary sm "Split a bill".
2. **Hero** (2-col ≥1024px, stacked on mobile, text first):
   - Eyebrow chip (outline badge): "Free · No sign-up · No app to download"
   - H1 display: **"Snap the receipt. Everyone pays their share."**
   - Sub (18px muted, max 36ch): "AI reads every item. Friends tap what they had. Tax and tip split fairly, and everyone pays you back on Venmo, PayPal or Cash App."
   - CTAs: primary lg "Split a bill, free →" + secondary lg "Try the demo"
   - Under the CTAs: muted 13px "Pay back with" + three small provider glyphs.
   - Right/below: `PhoneMockup` showing the **Claim** screen (real UI, not a drawing), tilted −4°, with two floating cards over the edges ("Maya owes **$23.40**" with avatar; "✓ Matches receipt"). No glow, no gradients.
3. **How it works:** 3 numbered cards in a row (stacked on mobile): Snap (camera icon) / Tap (hand-tap) / Get paid (banknote). Each has a one-line title, one sentence, and a cropped real-UI snippet.
4. **Feature bento** (6 cells, 3-col grid ≥1024px, 2-col tablet, 1-col mobile; `rounded-3xl`, mixed spans):
   - Large (2×1): "AI reads the whole receipt": receipt-paper snippet with the scan line.
   - "Tap what you had": the chip row animates on scroll-in.
   - "Fair tax & tip": a mini proportional bar.
   - "Pay links that prefill the amount": the three provider buttons.
   - "Shared items, handled": "Nachos ÷ 3 = $4.33 each".
   - Large (2×1): "No accounts. No app." Copy should match the privacy policy exactly. Have the owner confirm the claims.
5. **Comparison table:** SplitSnap vs "Calculator + group chat" vs "Typical split apps". Rows: itemized by person, AI receipt scan, tax/tip proportional, no sign-up, free, pay links. Use check/dash icons, and set the SplitSnap column in foreground text with checks (no colored fill). **Don't name competitors or state their pricing unless verified at publish time.**
6. **Social proof, honest version:** until real testimonials exist, use "product proof", not fake logos or quotes. That means an embedded interactive mini demo (claim 3 items, see totals update) or a "Real receipt, real math" worked example. Add real quotes and counts only once you have them.
7. **FAQ:** existing `Faq` component, styled as an accordion (lucide `Plus` rotating to `X`), max-w 720.
8. **Final CTA band:** `rounded-3xl bg-fg text-bg` (inverted), H2 "Dinner's over. Settle up in a minute.", primary button.
9. **Footer:** logo + one-line tagline | Product (Split a bill, Demo) | Legal (Privacy, Terms) | small muted "Not a bank. SplitSnap never holds or moves money."
- **Mobile sticky CTA:** after the hero CTA scrolls out of view (IntersectionObserver), slide up a bottom bar with "Split a bill, free" (lg, full width) that respects the safe area.

Premium vs template-y: one accent color only, real product UI in imagery (never stock or illustrations of phones), tight display tracking, generous whitespace, and no gradient text, glassmorphism stacks, or emoji bullets.

### `/split` (shell: header with back | step title | help; progress bar; content; bottom action bar)

**Step 1, Receipt**
```
┌ ‹   Receipt            ? ┐
│ ▬▬▬▬ ▭▭▭▭ ▭▭▭▭ ▭▭▭▭       │ Step 1 of 4
│ ┌──────────────────────┐ │
│ │   [camera icon 48]   │ │ Empty: big dashed drop zone, rounded-3xl
│ │ Snap or upload the   │ │ h2 + muted sentence
│ │ receipt              │ │
│ │ [ Take photo ] (pri) │ │ capture="environment"
│ │ [ Upload ] [Type it] │ │ secondary + ghost
│ └──────────────────────┘ │
│ after scan → receipt-paper list (section 5) + reconcile chip
├──────────────────────────┤
│ Total $52.07  [Continue →]│
└──────────────────────────┘
```
**Step 2, People**
```
┌ ‹   Who's splitting?   ? ┐
│ ▬▬▬▬ ▬▬▬▬ ▭▭▭▭ ▭▭▭▭       │
│ (A) Alex · You · Host    │ list rows 56px, avatar md, swipe/kebab → remove
│ (M) Maya                 │
│ (J) Jordan               │
│ [＋ Add person] (secondary, full width → sheet w/ name input, autofocus)
│ Quick-add: [+2] [+3] [+4] chips
├──────────────────────────┤
│ 3 people      [Continue →]│
└──────────────────────────┘
```
**Step 3, Claim**
```
┌ ‹   Tap what you had   ? ┐
│ ▬▬▬▬ ▬▬▬▬ ▬▬▬▬ ▭▭▭▭       │
│ Claiming as: (A)(M)(J)   │ sticky person switcher: segmented avatars, selected = ring 2px av-fg
│ ┌ Chicken tikka   $31.00 ┐│ item card per row; tap card = toggle for active person
│ │ (A✓)(M✓)( J )   ÷2 ea  ││ chips for everyone; "÷2" muted shows split
│ └────────────────────────┘│
│ ┌ Mango lassi      $5.50 ┐│ unclaimed → left border 3px warning
│ │ Nobody yet · [Split evenly]│
├──────────────────────────┤
│ Alex owes $23.40 [Next →]│ figure updates live (count-up)
└──────────────────────────┘
```
**Step 4, Settle**
```
┌ ‹   Settle up          ? ┐
│ ▬▬▬▬ ▬▬▬▬ ▬▬▬▬ ▬▬▬▬       │
│ TOTAL BILL               │
│ $52.07  (hero)           │
│ 3 people · tax & tip prop.│
│ ┌ (M) Maya   2 items $18.20 ⌄┐  totals card (section 5)
│ │  [Venmo][PayPal][Cash App] ○ Paid │
│ └ (J) Jordan ...          ┘│
│ Your handles ▸ (sheet)   │
├──────────────────────────┤
│ [ Share summary ↗ ] full │ navigator.share, fallback copy + toast
└──────────────────────────┘
→ all paid → success state (section 5)
```

### Privacy / Terms
Prose column `max-w-[42rem]`, body 17/28px, h2 22px with 48px top margin. At the top: a "Plain-English summary" card (bordered card, 3–5 bullets) and a muted "Last updated: <date>". ≥1024px: sticky left table of contents (13px, active section in accent). Links are accent, underlined.

### 404
Centered receipt-paper card, mono:
```
   SPLITSNAP
   ---------------------
   PAGE NOT FOUND   1×
   ---------------------
   TOTAL           $0.00
```
Under it: h1 "This page isn't on the bill." Then [Split a bill] (primary) and [Go home] (ghost).

---

## 8. Recommended libraries (**needs user approval to add**)

**Recommendation: shadcn/ui (copy-in components) + lucide-react + motion.** shadcn is not a runtime library. Its CLI copies component source into `src/components/ui`, so we own and restyle it with the tokens above. It fully supports Tailwind v4 (`@theme inline`, OKLCH) and React 19 (no `forwardRef`, `data-slot` attributes). In 2026 its CLI has `--dry-run`/`--diff`, and Base UI joined Radix as a primitive base. Its Drawer now uses Base UI in place of Vaul.

| Package | Why | Cost |
|---|---|---|
| `shadcn` (CLI, dev-time) | Generates Drawer (bottom sheet), Dialog, Toast, Accordion, ToggleGroup (segmented), Checkbox chips | No runtime |
| `@base-ui/react` | Accessible primitives behind the generated components (focus trap, drag-to-dismiss drawer, roving focus) | Tree-shaken per component |
| `class-variance-authority`, `cn` | Variant API for Button/Chip; `cn` replaces our `cx.ts` (keep `cx` or alias) | Tiny |
| `tw-animate-css` | Enter/exit utility classes the generated components expect (`@import "tw-animate-css"`) | CSS only |
| `lucide-react` | Icon set used by shadcn; tree-shakable, consistent 24px grid; replaces `ui/Icon.tsx` | Per-icon imports |
| `motion` (import from `motion/react`) | Step transitions, layout animation for chips/avatars, `layoutId` segmented indicator, success check, `MotionConfig reducedMotion`. Needs React ≥18.2; in App Router use `"use client"` or `motion/react-client` | Largest add; load only in `/split` client components |
| *(optional)* `canvas-confetti` | One-shot confetti on settle | Small; lazy `import()` on success only |

Install (after approval): `npx shadcn@latest init` (choose the Base UI base), then `npx shadcn@latest add drawer dialog toast accordion toggle-group --dry-run` to review, then without `--dry-run`, then `npm i motion`. **Before merging, check the exact dependency list the CLI writes to `package.json`.** shadcn's install docs changed in 2026 (`cn` package, Base UI drawer), so treat the table above as expected, not guaranteed.

Considered and rejected:
- **Radix Themes:** ships its own styled CSS and design tokens, which fight Tailwind v4 and our tokens.
- **Headless UI:** Tailwind Labs, solid, but no drawer/sheet or toast, which are our two most important mobile patterns.
- **Vaul:** shadcn's previous drawer; superseded by the Base UI drawer.
- **Full UI kits (MUI, Chakra):** too heavy, and their visual identity bleeds through.

---

## 9. Implementation order (suggested)
1. Token swap in `globals.css` (section 2), plus `viewportFit: "cover"`, plus the avatar variables.
2. `MoneyText`, `Button` (pill + sizes), `Chip`, `Avatar` tint palette, and `Stepper` (progress bar) restyles.
3. Bottom action bar + bottom sheet (needs library approval).
4. Receipt paper polish, totals card, success state.
5. Landing page sections in order. Use real UI screenshots from step 3 for the hero mockup.

---

## Sources
- shadcn/ui, Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- shadcn/ui, Tailwind v4 + React 19 changelog (Feb 2025): https://ui.shadcn.com/docs/changelog/2025-02-tailwind-v4
- shadcn/ui, React 19 guide: https://ui.shadcn.com/docs/react-19
- shadcn/ui, manual installation (cn, cva, lucide-react, tw-animate-css): https://ui.shadcn.com/docs/installation/manual
- shadcn/ui, Drawer (Base UI, replaces Vaul): https://ui.shadcn.com/docs/components/base/drawer
- shadcn/ui, Toast: https://ui.shadcn.com/docs/components/base/sonner
- shadcn/ui 2026 status overview (CLI v4, Base UI): https://ssojet.com/blog/what-is-shadcn-ui
- Motion for React, installation: https://motion.dev/docs/react-installation
- Cash App design references (single accent green, Cash Sans, dark canvas): https://www.shadcn.io/design/cashapp , https://www.webdesignhot.com/design.md/cash-app/ , https://tms-outsource.com/blog/posts/inside-the-cash-app-design-system/
- Monzo rebrand (hot coral lead color, new typefaces): https://monzo.com/blog/weve-had-a-little-makeover ; https://www.webdesignhot.com/design.md/monzo/
- Revolut design-system summary (pill buttons, near-black + one blue): https://open-design.ai/plugins/design-system-revolut/
- Wise design-system summary (lime fill with dark-green text, Wise Sans + Inter): https://open-design.ai/systems/wise/
- Mercury-style UI notes (Inter, 4px grid, editorial restraint): https://skills.cat/skills/ihlamury/design-skills/mercury-ui-skills ; https://www.shadcn.io/design/mercury/raw
- Copilot Money design review (Apple Design Award finalist, Swift Charts): https://blakecrosley.com/de/guides/design/copilot-money ; https://daringfireball.net/linked/2025/12/28/
- Fintech dashboards (Stripe tabular figures, Mercury typography): https://adminlte.io/blog/fintech-dashboard-design-examples/
- Financial UI patterns (tabular-nums, semantic color tokens, right-align): https://www.mdskills.ai/skills/financial-ui-patterns
- Fintech UI trust/clarity: https://www.thealien.design/insights/fintech-ui-design ; https://www.theskinsfactory.com/uiux-design-blog/fintech-ui-ux-design
- Inter tabular figures guidance (CoinGecko brand): https://brand.coingecko.com/visual-identity/typography/primary-typeface
- Splitwise UX critiques/redesigns: https://uxdesign.cc/splitwise-a-ux-case-study-dc2581971226 ; https://ixd.prattsi.org/2017/09/design-critique-splitwise-iphone-app/ ; https://uxplanet.org/splitwiser-the-all-new-splitwise-mobile-app-redesign-ui-ux-case-study-4d3c0313ae6f
- Tricount/Splitwise user sentiment: https://www.onclarity.com/leaderboard/insight/tricount
- Stripe / Linear / Vercel marketing design systems (one accent, restraint): https://opendesigner.io/blog/recreating-stripe-linear-vercel-design-systems-with-design-md
- Bento grid guidance 2026: https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide
- Touch targets (Apple 44pt, WCAG 2.2 2.5.8 24px AA / 2.5.5 44px AAA): https://frontendchecklist.io/rules/accessibility/touch-targets ; https://specification.website/spec/accessibility/touch-target-size/
- Safe-area insets and `viewport-fit=cover`: https://www.sizzy.co/blog/safe-area-insets ; https://mohammadshehadeh.com/css/safe-area-insets/
- Contrast ratios in this doc were computed with the WCAG 2.x relative-luminance formula.

Note: brand values for Cash App, Monzo, Revolut, Wise and Mercury come from third-party reverse-engineered summaries, not official brand guides. Use them as directional patterns, not exact specs.
