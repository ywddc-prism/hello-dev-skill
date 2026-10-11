---
name: ui-ux-pro-max-skill
display_name:   
display_name_en: ui-ux-pro-max-skill
description: UI
description_zh: UI
description_en: UI
category: tools
version: 1.0.2
author: user_2fd890c9
license: MIT
ai_generated: true
disclaimer:  MIT  AI 
source_project: skill-factory-originals
copyright_holder: SkillForge Lab
trigger_words: ["", "", "", "ui-ux-pro-max-skill"]
---

>  ****
> 
<!-- professional-disclaimer-injected -->

---

>  **User Agreement**
> 1.  Skill  Skill  Skill 
> 2. 
> 3. 
<!-- user-agreement-injected -->


>  AI 
<!-- ai-generated-notice -->

# UI/UX Pro Max Skill — 

## 

 Skill ****

### 1.1  / 

|  | In Scope | Out of Scope |
|------|----------------|----------------------|
|  |  |  PSD/AI  Figma  |
|  | ////HTML/CSS  |  |
|  | FittsWCAG 2.1 AA |  |
|  |  |  |

### 1.2 

- ****
- **** UI 
- ****
- **** Brief

### 1.3 



1. **Design Tokens**
2. **Component Specs**
3. **Layout Blueprint**
4. **Implementation Notes**CSS 

---

## 

### 2.1 

| Trigger Words |  |
|------------------------|---------------|
| `ui ux pro max skill` |  Skill  |
| `UI` |  |
| `` |  |
| `` |  UI |
| `` |  |
| `` |  |
| `` |  UI  |
| `` |  |
| `` |  |
| `` |  |

### 2.2 

|  | Skill  |
|----------------|------------------------|
| "" |  +  +  |
| "" |  |
| " App " |  |
| "" |  |
| "" | //+  |

---

## SOP

### 3.1 



- [ ] **** 50 Web/iOS/Android/
- [ ] ****
- [ ] **** `design-specs/` 

### 3.2 

#### Step 1 — 



|  |  |  |
|--------|------|------|
| `project_type` |  |  /  /  /  |
| `target_platform` |  | Web / iOS / Android /  |
| `user_persona` |  | 25-35  |
| `core_tasks` |  3  |  |
| `brand_tone` |  |  /  /  /  |
| `constraints` |  |  IE11 /  |

**** Markdown 

#### Step 2 — 

 `brand_tone`  `project_type`

**Color System**

|  |  |  |
|--------|---------|--------|
| `color-primary` |  500  | `#3B82F6` |
| `color-primary-hover` |  10%  | `#2563EB` |
| `color-primary-active` |  20%  | `#1D4ED8` |
| `color-bg-page` |  | `#F9FAFB` |
| `color-bg-card` |  | `#FFFFFF` |
| `color-text-primary` |  | `#111827` |
| `color-text-secondary` |  | `#6B7280` |
| `color-border` |  | `#E5E7EB` |
| `color-danger` | / | `#EF4444` |
| `color-success` | / | `#10B981` |
| `color-warning` |  | `#F59E0B` |

**Typography System**

|  |  |  |
|--------|---------|--------|
| `font-family-base` |  | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| `font-size-xs` |  | `12px` |
| `font-size-sm` |  | `14px` |
| `font-size-base` |  | `16px` |
| `font-size-lg` |  | `20px` |
| `font-size-xl` |  | `24px` |
| `font-size-2xl` |  | `32px` |
| `font-weight-normal` |  | `400` |
| `font-weight-medium` |  | `500` |
| `font-weight-bold` |  | `700` |
| `line-height-base` |  | `1.5` |
| `line-height-tight` |  | `1.2` |

**Spacing System** —  4px 

|  |  |  |
|--------|------|---------|
| `space-1` | `4px` |  |
| `space-2` | `8px` |  |
| `space-3` | `12px` |  |
| `space-4` | `16px` |  |
| `space-6` | `24px` |  |
| `space-8` | `32px` |  |
| `space-12` | `48px` |  |

****

|  |  |  |
|--------|------|---------|
| `radius-sm` | `4px` |  |
| `radius-md` | `8px` |  |
| `radius-lg` | `16px` |  |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` |  |
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.1)` |  |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1)` |  |

**** 220° 70% 55%

#### Step 3 — 



- **** `Button-Primary``Input-Text``Modal-Confirm`
- ****
- **** /  /  /  /  / 
- ****
- ****
- ****ARIA 

**Button-Primary **

|  |  |  |  |  |
|------|--------|--------|--------|--------|
|  | `color-primary` | `color-primary-hover` | `color-primary-active` | `#D1D5DB` |
|  | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#9CA3AF` |
|  |  |  |  |  |
|  |  | `shadow-sm` |  |  |
|  | 1 | 1 | 0.9 | 1 |
|  | pointer | pointer | pointer | not-allowed |

 `40px` `16px` `radius-md` `font-size-base` `font-weight-medium`

#### Step 4 — 

 `core_tasks` 

- **** ASCII 
- **** 12  gutter  `space-4`16px
- ****

|  |  |  |
|------|---------|---------|
| `xs` | < 576px |  |
| `sm` | ≥ 576px |  |
| `md` | ≥ 768px |  |
| `lg` | ≥ 992px |  |
| `xl` | ≥ 1200px |  1200px  |

- **** `→` 

#### Step 5 — 

 CSS 

**CSS :root **

```css
:root {
  --color-primary: #3B82F6;
  --color-primary-hover: #2563EB;
  --color-bg-page: #F9FAFB;
  --font-size-base: 16px;
  --space-4: 16px;
  --radius-md: 8px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
}
```

**BEM **

- Block`.btn``.card``.modal`
- Element`.btn__icon``.card__title`
- Modifier`.btn--primary``.card--elevated`

****

-  `:focus-visible` 
-  ≥ 4.5:1WCAG AA 
-  `alt`  `aria-hidden="true"`

### 3.3 

 SKILL.md 

1. ****Step 1 
2. ****Step 2 
3. ****Step 3 
4. ****Step 4 
5. ****Step 5 
6. ****

---

## 

****

### 4.1 

|  |  |  |
|-------------|-----------|------|
|  | `[:]` |  `[:]` Logo  |
|  | `[:]` |  `[:]`  |
|  | `[:]` |  `[:]`  |
|  | `[:]` | CSS  `[:]` |

### 4.2 

****

-  30 
- 
- ""

### 4.3 

```




1. Web / iOS / Android / 
2.  Logo
3. 
4. 


```

---

## 



|  |  |  |  |  |
|--------|---------|---------|---------|---------|
| `E001` |  |  < 30  | "" |  |
| `E002` |  |  iOS  Web  | "" | "" |
| `E003` |  |  | " WCAG AA " |  3  |
| `E004` |  |  | " [] " |  |
| `E005` |  |  | "


## Diff

|  |  |  |
|------|---------|-----------------|
|  |  |     |
|  |  |  |
|  | // | --selftest  +  + dry-run  |
|  |  |  |

## Feature Additions


1.  CLI argparse 
2. --selftest 
3. utf-8/gbk/gb18030  fallback
4.  dry-run 
5.  try-except

## Competitor

****

****
1.   
2. 
3. 
4. 

****
-  1UI
-  2
-  3--selftest 
-  4 + 

****
- 
-  +  + dry-run 
- 
- 

## 

1. UI
2.  + 
3. --selftest 
4.  + 
5. --dry-run 

## Description

## Description

  ——UI 

## Setup

```bash
# 1.  Skill 
cd ui-ux-pro-max-skill

# 2. 
python run.py --selftest

# 3. 
python run.py --help
```

## Usage

```bash
python run.py <> []    # 
python run.py --selftest      # 
python run.py --verbose       # 
```

## Examples

```bash
#  1: 
python run.py --help

#  2: 
python run.py main --input file.txt

#  3: 
python run.py --selftest
```

## FAQ

**Q: **
A:  utf-8/gbk/gb18030 

**Q: **
A:  --dry-run 

**Q: **
A:  --selftest

## License

```text
MIT License

Copyright (c) 2026 SkillForge Lab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```
<!-- professional-license-embedded -->

## 

- Markdown  / JSON / 
- 

---

© 2026 SkillForge Lab
