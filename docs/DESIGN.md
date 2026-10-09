# SplitSnap Design Brief

Status: proposal, v1 (2026-10-09). Covers the visual system, components, motion, a blueprint for each page, and the libraries we recommend. Token names match `src/app/globals.css`, so most of section 2 is a value swap plus a few new tokens, not a rewrite.

Diagnosis of "plain": the current UI is clean but flat. Every element has about the same visual weight. Nothing is big (money), nothing is bold (brand), nothing moves at the moments that matter (scan, claim, settle), and the landing page has no product imagery. Top consumer money apps fix this with four levers: **one loud brand color, huge tabular money figures, pill buttons on calm neutral surfaces, and small celebratory motion**. This brief applies those four levers.

---

## 1. Design principles

1. **The number is the hero.** Every screen has one dominant figure: the bill total, your share, or what each person owes. Show it big, in tabular figures, with smaller cents. This is the Cash App and Revolut home-screen pattern.
2. **One color means "go".** Snap Mint fills only primary actions, selected states and success. Everything else is neutral. Payment-provider colors appear only as small marks, never as large fills.
3. **Thumb-first.** The primary action sits in a bottom bar within thumb reach. Tap targets are at least 44px. Editing happens in bottom sheets, not modals.
4. **The receipt is real.** Extracted items are shown on a paper receipt (mono type, torn edges). People trust what looks like the thing they photographed.
5. **Celebrate settling up.** A check draws itself, a little confetti falls, and the tone is friendly. Keep the delight short (under 1s) and skip it entirely under reduced motion.

---

## 2. Brand

### Name treatment
- Wordmark: "Split" in `fg` weight 700 plus "Snap" in `brand-ink` weight 700. Geist Sans, tracking -0.03em, no space between the words.
- Mark: a 28px rounded square (radius 8) filled with `brand`, holding a 16px lucide `ScanLine` or `Receipt` icon in `brand-fg`. The same mark serves as favicon, apple-icon and OG image.

### Color tokens (replace current values; names stay the same)
Brand color **Snap Mint `#2ED47A`**. It is bright enough to be ownable among Venmo blue, PayPal navy and Cash App green, and it reads as "money / done". Because it is light, **text on a mint fill is dark ink, never white** (the Wise pattern: lime fill with dark green text).

| Token | Light | Dark | Use / contrast (WCAG) |
|---|---|---|---|
| `--brand` | `#2ED47A` | `#2ED47A` | Primary fills, selected chips, progress. Not for text on light backgrounds (1.9:1 on white) |
| `--brand-strong` (hover) | `#25C06C` | `#5BE39A` | Hover/pressed fill |
| `--brand-fg` | `#04210F` | `#04210F` | Text/icons on brand fill: **8.8:1** |
| `--brand-ink` (NEW) | `#0B7A43` | `#5BE39A` | Brand-colored text/links. 5.4:1 on white, 12:1 on `#0B0D0C` |
| `--brand-soft` | `#DDF8E8` | `rgb(46 212 122 / 0.14)` | Selected row background, badges |
| `--brand-soft-fg` | `#075E33` | `#7EEBB0` | Text on brand-soft |
| `--bg` | `#F7F8F6` | `#0B0D0C` | Page |
| `--surface` | `#FFFFFF` | `#121614` | Cards |
| `--elevated` | `#FFFFFF` | `#181D1A` | Sheets, popovers, bottom bar |
| `--sunken` | `#EEF1ED` | `#080A09` | Inputs, segmented-control track |
| `--line` | `#E3E7E2` | `#242B27` | Hairlines, card borders |
| `--line-strong` | `#CDD3CC` | `#343D38` | Input borders, dividers in dense lists |
| `--fg` | `#0F1411` | `#EEF2EF` | Body text: 17:1 in both modes |
| `--muted` | `#5E6862` | `#9AA59F` | Secondary text: 5.4:1 on bg (light), 7.2:1 on surface (dark) |
| `--success` (NEW) | `#15803D` | `#4ADE80` | "Paid", reconciled. 5.0:1 / 10.5:1 |
| `--warning` | `#B45309` | `#FBBF24` | Low-confidence items, mismatch. 5.0:1 / 10.9:1 |
| `--danger` | `#DC2626` | `#F87171` | Errors, delete. 4.8:1 / 6.6:1 |
| `--paper` / `--paper-fg` | `#FFFDF8` / `#1C1A17` | `#F4F1EA` / `#1C1A17` | Receipt paper stays light in dark mode (deliberate) |

Rules:
- Neutrals are slightly green-tinted, so they sit with the mint instead of fighting it. Never use pure `#000` or `#FFF` for page backgrounds.
- Soft semantic backgrounds: `--success-soft` `#DCFCE7` / `rgb(74 222 128 / .12)`, and the existing `warning-soft` and `danger-soft` stay.
- Color never carries meaning alone. Every state pairs color with an icon (check, alert-triangle) or text.

### Avatar palette (8 tones, tint style, works in both modes)
Assign by `joinOrder`, as the current `avatarTone` does. Light uses a 100-level background with 800-level text. Dark uses a deep tinted background with 300-level text. All pairs are 6.4:1 or better.

| # | Name | Light bg / text | Dark bg / text | Dot (stacks, chips) |
|---|---|---|---|---|
| 1 | Rose | `#FFE4E6` / `#9F1239` | `#3B1A20` / `#FDA4AF` | `#F43F5E` |
| 2 | Orange | `#FFEDD5` / `#9A3412` | `#3A2214` / `#FDBA74` | `#F97316` |
| 3 | Amber | `#FEF3C7` / `#92400E` | `#3A2D10` / `#FCD34D` | `#F59E0B` |
| 4 | Lime | `#ECFCCB` / `#3F6212` | `#26330F` / `#BEF264` | `#84CC16` |
| 5 | Teal | `#CCFBF1` / `#115E59` | `#0F302C` / `#5EEAD4` | `#14B8A6` |
| 6 | Sky | `#E0F2FE` / `#075985` | `#0E2A3A` / `#7DD3FC` | `#0EA5E9` |
| 7 | Indigo | `#E0E7FF` / `#3730A3` | `#1F2245` / `#A5B4FC` | `#6366F1` |
| 8 | Fuchsia | `#FAE8FF` / `#86198F` | `#341A3A` / `#F0ABFC` | `#D946EF` |

Implement as CSS variables `--av-{n}-bg`, `--av-{n}-fg`, `--av-{n}-dot` with a dark override, and expose them via `@theme inline`. Emerald is left out on purpose so no avatar looks like brand or success.

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
- "Split evenly" / "Everyone" chip: brand-soft when on.
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
At the top, a muted caption "TOTAL BILL" with MoneyText hero beneath it and a meta line "4 people · tax & tip split proportionally". Below that, a per-person list: avatar md | name (16/500) + "3 items" muted | amount (md, right). Host row badge: `Host · paid the bill` (brand-soft). Each non-host row expands (chevron) into item breakdown + tax/tip lines, then shows a pay-link row: three secondary sm buttons, each with a 16px provider glyph in its color (Venmo `#008CFF`, PayPal `#003087`, Cash App `#00D64F`) and label text in `fg`, plus a "Mark paid" toggle.

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
   - Eyebrow chip (brand-soft): "Free · No sign-up · No app to download"
   - H1 display: **"Snap the receipt. Everyone pays their share."**
   - Sub (18px muted, max 36ch): "AI reads every item. Friends tap what they had. Tax and tip split fairly, and everyone pays you back on Venmo, PayPal or Cash App."
   - CTAs: primary lg "Split a bill, free →" + secondary lg "Try the demo"
   - Under the CTAs: muted 13px "Pay back with" + three small provider glyphs.
   - Right/below: `PhoneMockup` showing the **Claim** screen (real UI, not a drawing), tilted −4°, with two floating cards over the edges ("Maya owes **$23.40**" with avatar; "✓ Matches receipt"). Behind it, a soft radial brand glow at 15% opacity. No other gradients.
3. **How it works:** 3 numbered cards in a row (stacked on mobile): Snap (camera icon) / Tap (hand-tap) / Get paid (banknote). Each has a one-line title, one sentence, and a cropped real-UI snippet.
4. **Feature bento** (6 cells, 3-col grid ≥1024px, 2-col tablet, 1-col mobile; `rounded-3xl`, mixed spans):
   - Large (2×1): "AI reads the whole receipt": receipt-paper snippet with the scan line.
   - "Tap what you had": the chip row animates on scroll-in.
   - "Fair tax & tip": a mini proportional bar.
   - "Pay links that prefill the amount": the three provider buttons.
   - "Shared items, handled": "Nachos ÷ 3 = $4.33 each".
   - Large (2×1): "No accounts. No app." Copy should match the privacy policy exactly. Have the owner confirm the claims.
5. **Comparison table:** SplitSnap vs "Calculator + group chat" vs "Typical split apps". Rows: itemized by person, AI receipt scan, tax/tip proportional, no sign-up, free, pay links. Use check/dash icons, and put the SplitSnap column on a brand-soft background. **Don't name competitors or state their pricing unless verified at publish time.**
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
Prose column `max-w-[42rem]`, body 17/28px, h2 22px with 48px top margin. At the top: a "Plain-English summary" card (brand-soft, 3–5 bullets) and a muted "Last updated: <date>". ≥1024px: sticky left table of contents (13px, active section in brand-ink). Links are underlined, `decoration-line-strong`, turning brand-ink on hover.

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
