---
name: qi-component
description: Adds or changes a component in TechCockpit's in-house AIA Qi component library (React + Tailwind 4 + Base UI behaviour primitives) following Qi usage rules from design.aia.com, Qi design tokens, all interaction states, light and dark themes, keyboard behaviour and accessibility tests. Use when creating or modifying anything in ReactTS_Frontend/src/components/qi.
argument-hint: <ComponentName>
---

# Qi component

The component name is what the user gave after `/qi-component` (ask for it if missing).

## Before coding

1. Read the Qi guidance for this component on design.aia.com (`/component/<name>`). The site blocks curl and plain page fetches; open it with the VS Code browser tools. Note variants, when to use / not use, content rules.
2. If Qi has no such component (data grid, side navigation, approval timeline, heatmap...), propose a design built from Qi tokens and get the user's agreement first.
3. Interactive (dialog, menu, select/dropdown, combobox, tabs, tooltip, popover, slider, switch, checkbox, radio, accordion, toast)? Build on the matching `@base-ui/react` primitive. Never hand-roll focus trapping or keyboard navigation.

## Structure

```
src/components/qi/<Name>/
  <Name>.tsx         component (named export), variants via a typed map, forwards ref and ...rest
  <Name>.test.tsx    behaviour + accessibility tests (written first)
  index.ts           re-export
```

Add it to `src/components/qi/index.ts` and to the design-system gallery page (`src/features/design-system`).

## Rules

- Styling: Tailwind classes mapped to Qi tokens only (generated `src/styles/qi-tokens.css`; radii `rounded-button|card|form|overlay|tag|chip`). No hex or arbitrary colour values.
- States: enabled, hover, focus-visible (Qi focus border `border-focus`), active/selected, disabled, error, loading where relevant — in light and dark.
- Radius/border from Qi shape tokens (buttons, inputs, cards 8 px; overlays 16 px; tags pill).
- Sizes: interactive targets ≥ 24×24 px (WCAG 2.2), comfortable default 40–48 px height for buttons and inputs.
- Props: typed variant unions (`variant: 'primary' | 'secondary' | 'tertiary'`), sensible defaults, no `any`.
- Text: never hard-coded inside the component; labels come from props.

## Tests (minimum)

- Renders each variant with the right accessible role and name.
- Keyboard: Tab focus, Enter/Space activation, Escape closes overlays, arrow keys in lists/menus/tabs.
- Disabled state is not interactive and is announced (`aria-disabled` or `disabled`).
- Error state links the message via `aria-describedby`.
- Dark theme renders without errors (theme attribute switch).
