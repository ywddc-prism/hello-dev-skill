# UI Design Specification Template

---

## Design Overview

| Field | Value |
|-------|-------|
| Product/Feature | [Name] |
| Design Date | [YYYY-MM-DD] |
| Designer | [Agent / Team] |
| Version | [v1.0] |
| UX Spec Reference | [ux-research-template output path] |

---

## 1. Visual Style Direction

### Style Keywords

[3-5 keywords that define the visual tone: e.g., "minimal, professional, clean, modern, trustworthy"]

### Mood & Tone

[1-2 sentences describing the emotional feel of the design]

### Reference Board

| Reference | What we take from it |
|-----------|---------------------|
| [Brand/design URL or description] | [Specific element we admire] |

> **Visual prototype**: Reference `wireframes/style-board.svg` for the mood board.

---

## 2. Color System

### Primary Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | [#HEX] | Primary actions, links, active states |
| `--color-primary-hover` | [#HEX] | Hover state for primary elements |
| `--color-primary-active` | [#HEX] | Active/pressed state |

### Secondary / Accent Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-secondary` | [#HEX] | Secondary actions, highlights |
| `--color-accent` | [#HEX] | Special callouts, badges |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-success` | [#HEX] | Success messages, positive indicators |
| `--color-warning` | [#HEX] | Warning messages, caution indicators |
| `--color-error` | [#HEX] | Error messages, destructive actions |
| `--color-info` | [#HEX] | Informational messages, tips |

### Neutral Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-text-primary` | [#HEX] | Primary body text |
| `--color-text-secondary` | [#HEX] | Secondary text, captions |
| `--color-text-disabled` | [#HEX] | Disabled text |
| `--color-border` | [#HEX] | Borders, dividers |
| `--color-bg-primary` | [#HEX] | Primary background |
| `--color-bg-secondary` | [#HEX] | Secondary background (cards, panels) |
| `--color-bg-tertiary` | [#HEX] | Tertiary background (inputs, code blocks) |

### Contrast Ratios

| Pair | Ratio | WCAG Level |
|------|-------|------------|
| Primary text on primary bg | [X:1] | [AA/AAA] |
| Secondary text on primary bg | [X:1] | [AA/AAA] |

---

## 3. Typography Scale

### Font Families

| Role | Family | Fallback | Source |
|------|--------|----------|--------|
| Heading | [Font name] | [fallback] | [Google Fonts / system / custom] |
| Body | [Font name] | [fallback] | [source] |
| Monospace | [Font name] | [fallback] | [source] |

### Type Scale

| Token | Size | Line Height | Letter Spacing | Weight | Usage |
|-------|------|-------------|----------------|--------|-------|
| `--text-display` | [px/rem] | [value] | [value] | [weight] | Page titles |
| `--text-h1` | [px/rem] | [value] | [value] | [weight] | Section headings |
| `--text-h2` | [px/rem] | [value] | [value] | [weight] | Subsection headings |
| `--text-h3` | [px/rem] | [value] | [value] | [weight] | Card titles |
| `--text-body-lg` | [px/rem] | [value] | [value] | [weight] | Lead text |
| `--text-body` | [px/rem] | [value] | [value] | [weight] | Body text |
| `--text-body-sm` | [px/rem] | [value] | [value] | [weight] | Small text |
| `--text-caption` | [px/rem] | [value] | [value] | [weight] | Captions, labels |
| `--text-overline` | [px/rem] | [value] | [value] | [weight] | Overlines, tags |

### Responsive Type

| Breakpoint | Adjustment |
|------------|-----------|
| Mobile | [e.g., "Base size 16px, scale ratio 1.2"] |
| Desktop | [e.g., "Base size 16px, scale ratio 1.25"] |

---

## 4. Spacing & Layout Grid

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | [4px] | Tight spacing (icon-to-text) |
| `--space-2` | [8px] | Compact spacing (form field gaps) |
| `--space-3` | [12px] | Default inner spacing |
| `--space-4` | [16px] | Default component padding |
| `--space-5` | [20px] | Comfortable spacing |
| `--space-6` | [24px] | Section padding |
| `--space-8` | [32px] | Large section gaps |
| `--space-10` | [40px] | Page section separation |
| `--space-12` | [48px] | Major section breaks |

### Layout Grid

| Property | Mobile | Tablet | Desktop | Wide |
|----------|--------|--------|---------|------|
| Columns | [4] | [8] | [12] | [12] |
| Gutter | [16px] | [20px] | [24px] | [24px] |
| Margin | [16px] | [24px] | [32px] | [auto] |
| Max content width | [100%] | [100%] | [960px] | [1200px] |

### Container Rules

| Container | Max Width | Padding | Notes |
|-----------|-----------|---------|-------|
| Page | [value] | [value] | [Notes] |
| Section | [value] | [value] | [Notes] |
| Card | [value] | [value] | [Notes] |

---

## 5. Component Visual Specifications

### Button

| Variant | Background | Text | Border | Radius | Shadow |
|---------|-----------|------|--------|--------|--------|
| Primary | [color] | [color] | [none/color] | [px] | [none/value] |
| Secondary | [color] | [color] | [color] | [px] | [none/value] |
| Ghost | [transparent] | [color] | [none] | [px] | [none] |
| Danger | [color] | [color] | [none] | [px] | [none/value] |

**States:**

| State | Primary | Secondary | Ghost |
|-------|---------|-----------|-------|
| Default | [spec] | [spec] | [spec] |
| Hover | [spec] | [spec] | [spec] |
| Focus | [spec] | [spec] | [spec] |
| Active | [spec] | [spec] | [spec] |
| Disabled | [spec] | [spec] | [spec] |

**Sizes:**

| Size | Height | Padding H | Font | Icon Size |
|------|--------|-----------|------|-----------|
| Small | [px] | [px] | [token] | [px] |
| Medium | [px] | [px] | [token] | [px] |
| Large | [px] | [px] | [token] | [px] |

> **Visual prototype**: Reference `wireframes/button-spec.svg` for the component specification sheet.

### Input / Form Controls

[Same structure as Button: variants, states, sizes]

### Card

[Same structure: variants, states, sizes]

### Navigation

[Same structure: variants, states, sizes]

### Modal / Dialog

[Same structure: variants, states, sizes]

---

## 6. Responsive Strategy

### Breakpoints

| Name | Min Width | Max Width | Target Device |
|------|-----------|-----------|---------------|
| `xs` | 0 | [575px] | Small mobile |
| `sm` | [576px] | [767px] | Large mobile |
| `md` | [768px] | [991px] | Tablet |
| `lg` | [992px] | [1199px] | Desktop |
| `xl` | [1200px] | - | Wide desktop |

### Layout Changes per Breakpoint

| Component | xs-sm | md | lg-xl |
|-----------|-------|-----|-------|
| Navigation | [Hamburger menu] | [Sidebar] | [Sidebar] |
| Content | [Single column] | [Two columns] | [Two columns] |
| Cards | [Stacked] | [2-col grid] | [3-col grid] |

### Touch Target Rules

| Element | Minimum Size | Recommended |
|---------|-------------|-------------|
| Button | [44x44px] | [48x48px] |
| Link | [44px height] | [48px height] |
| Icon button | [44x44px] | [48x48px] |

---

## 7. Icon & Image Specifications

### Icon Style

| Property | Value |
|----------|-------|
| Style | [Outlined / Filled / Duo-tone] |
| Grid size | [24x24 / 16x16] |
| Stroke width | [1.5px / 2px] |
| Corner radius | [Rounded / Sharp] |

### Image Treatment

| Context | Aspect Ratio | Border Radius | Shadow |
|---------|-------------|---------------|--------|
| Avatar | [1:1] | [50%] | [none/value] |
| Card hero | [16:9] | [8px] | [none/value] |
| Thumbnail | [1:1] | [4px] | [none/value] |

---

## 8. Motion & Transitions

| Interaction | Duration | Easing | Notes |
|-------------|----------|--------|-------|
| Page transition | [ms] | [curve] | [Notes] |
| Modal open/close | [ms] | [curve] | [Notes] |
| Hover effect | [ms] | [curve] | [Notes] |
| Accordion expand | [ms] | [curve] | [Notes] |

---

## 9. Visual Prototype References

| Prototype | File Path | Description |
|-----------|-----------|-------------|
| [Name] | `wireframes/[name].svg` | [What it shows] |

> Prototypes are generated as supplementary SVG/HTML artifacts. The Markdown document is the authoritative specification; prototypes are visual aids.

---

## 10. Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| v1.0 | [Date] | Initial version | [Agent] |
