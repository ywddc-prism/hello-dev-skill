# Design System Template

---

## System Overview

| Field | Value |
|-------|-------|
| Product | [Name] |
| System Version | [v1.0] |
| Last Updated | [YYYY-MM-DD] |
| Maintainer | [Agent / Team] |
| UI Spec Reference | [ui-design-template output path] |

---

## 1. Design Tokens

Design tokens are the atomic values that define the visual language. They are the single source of truth consumed by implementation.

### Color Tokens

```
[Token name format: --color-{category}-{variant}-{state}]

Base palette:
  --color-blue-50:    [#HEX]
  --color-blue-100:   [#HEX]
  ...
  --color-blue-900:   [#HEX]

Semantic mapping:
  --color-primary:       var(--color-blue-600)
  --color-primary-hover: var(--color-blue-700)
  --color-error:         var(--color-red-600)
  --color-success:       var(--color-green-600)
  --color-warning:       var(--color-amber-500)
```

### Typography Tokens

```
Font families:
  --font-heading: [family stack]
  --font-body:    [family stack]
  --font-mono:    [family stack]

Scale:
  --text-xs:   [size] / --text-xs-lh: [line-height]
  --text-sm:   [size] / --text-sm-lh: [line-height]
  --text-base: [size] / --text-base-lh: [line-height]
  --text-lg:   [size] / --text-lg-lh: [line-height]
  --text-xl:   [size] / --text-xl-lh: [line-height]
  --text-2xl:  [size] / --text-2xl-lh: [line-height]
  --text-3xl:  [size] / --text-3xl-lh: [line-height]
  --text-4xl:  [size] / --text-4xl-lh: [line-height]

Weights:
  --font-normal:   [400]
  --font-medium:   [500]
  --font-semibold: [600]
  --font-bold:     [700]
```

### Spacing Tokens

```
Base unit: [4px]

  --space-0:  0
  --space-1:  [4px]
  --space-2:  [8px]
  --space-3:  [12px]
  --space-4:  [16px]
  --space-5:  [20px]
  --space-6:  [24px]
  --space-8:  [32px]
  --space-10: [40px]
  --space-12: [48px]
  --space-16: [64px]
  --space-20: [80px]
```

### Shadow Tokens

```
  --shadow-xs:  [value]
  --shadow-sm:  [value]
  --shadow-md:  [value]
  --shadow-lg:  [value]
  --shadow-xl:  [value]
```

### Border Radius Tokens

```
  --radius-none: [0]
  --radius-sm:   [2px]
  --radius-md:   [4px]
  --radius-lg:   [8px]
  --radius-xl:   [12px]
  --radius-full: [9999px]
```

### Transition Tokens

```
  --duration-fast:   [100ms]
  --duration-normal: [200ms]
  --duration-slow:   [300ms]

  --ease-default:    [cubic-bezier(...)]
  --ease-in:         [cubic-bezier(...)]
  --ease-out:        [cubic-bezier(...)]
  --ease-in-out:     [cubic-bezier(...)]
```

### Z-Index Tokens

```
  --z-base:     [0]
  --z-dropdown: [100]
  --z-sticky:   [200]
  --z-modal:    [300]
  --z-popover:  [400]
  --z-toast:    [500]
```

---

## 2. Component Library Specification

### Component Inventory

| Component | Variants | States | Sizes | Spec Reference |
|-----------|----------|--------|-------|----------------|
| Button | Primary, Secondary, Ghost, Danger | Default, Hover, Focus, Active, Disabled | sm, md, lg | [ui-design-template Section 5] |
| Input | Text, Number, Password, Search | Default, Focus, Error, Disabled | sm, md, lg | [ui-design-template Section 5] |
| Select | Single, Multi | Default, Open, Error, Disabled | sm, md, lg | [ui-design-template Section 5] |
| Card | Default, Interactive, Media | Default, Hover, Active | Default | [ui-design-template Section 5] |
| Modal | Default, Full-screen, Drawer | Default, Opening, Closing | sm, md, lg | [ui-design-template Section 5] |
| Navigation | Sidebar, Top, Breadcrumb | Default, Active, Collapsed | Default | [ui-design-template Section 5] |
| Table | Default, Striped, Compact | Default, Sorted, Loading | sm, md, lg | [ui-design-template Section 5] |
| Toast | Success, Error, Warning, Info | Default, Entering, Exiting | Default | [ui-design-template Section 5] |

### Component Anatomy Convention

Every component specification includes:
1. **Anatomy diagram**: labeled parts (SVG reference)
2. **Token mapping**: which design tokens control which visual properties
3. **State matrix**: visual properties per state
4. **Usage guidelines**: when to use which variant
5. **Do/Don't examples**: common mistakes to avoid

---

## 3. Icon Specification

### Icon System

| Property | Value |
|----------|-------|
| Library | [e.g., Lucide / Heroicons / Custom] |
| Style | [Outlined / Filled / Duo-tone] |
| Grid | [24x24 / 16x16] |
| Stroke width | [1.5px / 2px] |
| Color | Inherits `currentColor` |

### Icon Naming Convention

```
Format: icon-[category]-[name]-[size]
Example: icon-action-edit-24, icon-nav-home-16

Categories:
  action   - Editable actions (edit, delete, save)
  nav      - Navigation elements (home, back, menu)
  status   - Status indicators (check, warning, error)
  media    - Media controls (play, pause, volume)
  social   - Social/sharing (share, like, comment)
  file     - File types (document, image, folder)
```

### Icon Sizing

| Context | Size | Stroke |
|---------|------|--------|
| Inline with body text | 16px | 1.5px |
| Button (small) | 16px | 1.5px |
| Button (medium) | 20px | 1.5px |
| Button (large) | 24px | 2px |
| Navigation item | 20px | 1.5px |
| Standalone / feature | 24px | 2px |
| Empty state illustration | 48px | 1.5px |

---

## 4. Theme Definitions

### Light Theme

```
Theme: light

Color overrides:
  --color-bg-primary:    [#HEX]
  --color-bg-secondary:  [#HEX]
  --color-bg-tertiary:   [#HEX]
  --color-text-primary:  [#HEX]
  --color-text-secondary:[#HEX]
  --color-border:        [#HEX]
  --color-border-strong: [#HEX]
```

### Dark Theme

```
Theme: dark

Color overrides:
  --color-bg-primary:    [#HEX]
  --color-bg-secondary:  [#HEX]
  --color-bg-tertiary:   [#HEX]
  --color-text-primary:  [#HEX]
  --color-text-secondary:[#HEX]
  --color-border:        [#HEX]
  --color-border-strong: [#HEX]

Notes:
  - Semantic colors (primary, error, success) remain consistent across themes
  - Background and text colors invert (light text on dark background)
  - Shadows become more subtle or replaced with borders
  - Images/icons may need brightness adjustment
```

### Theme Switching Mechanism

| Aspect | Approach |
|--------|---------|
| Storage | [localStorage / cookie / system preference] |
| Scope | [Full page / per-component] |
| Transition | [Instant / animated with --duration-normal] |
| Default | [System preference via prefers-color-scheme] |
| Override | [User toggle in settings / header] |

---

## 5. Usage Guidelines

### Token Usage Rules

1. **Never hardcode values**: Always use design tokens instead of raw values
2. **Semantic over primitive**: Use `--color-primary` not `--color-blue-600` in component code
3. **No new tokens without review**: Adding tokens requires updating this document
4. **Consistent naming**: Follow the established naming convention strictly

### Component Usage Rules

1. **Default variant first**: Use the default variant unless there's a specific reason
2. **State coverage**: Every interactive component must define all states
3. **Size consistency**: Use the same size for components serving the same function
4. **Accessibility**: Every component must meet the accessibility requirements in the UX spec

---

## 6. File Organization

```
design-system/
 tokens/
    colors.json          # Color token definitions
    typography.json      # Typography token definitions
    spacing.json         # Spacing token definitions
    shadows.json         # Shadow token definitions
 components/
    button.md            # Per-component specification
    input.md
    ...
 themes/
    light.md             # Light theme overrides
    dark.md              # Dark theme overrides
 icons/
    icon-catalog.md      # Icon naming and usage
 wireframes/              # SVG/HTML visual prototypes
     style-board.svg
     button-spec.svg
     ...
```

> The file organization above is a recommendation. Actual structure depends on the project's technology stack and tooling. The Markdown specification documents are always authoritative; implementation files are derived from them.

---

## 7. Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| v1.0 | [Date] | Initial version | [Agent] |
