# Page 1 theme mapping

Source: the **design** Wonder file, **Page 1**, read on 2026-11-01. Both the original light library and the new dark library are authoritative for this app's visual tokens. [Dark AccessGrid Design Guide](https://app.wonder.so/manik/files/01a18cb6-c994-74d9-89eb-8d765dcbc3cd/branches/main/pages/01a18cb6-c995-7d94-819a-7fcc2fe7748e?nodeId=a2a45b18-48bc-574e-b1c1-099776338969).

This is a local adaptation of the Page 1 library, not an official AccessGrid theme. Existing `apps/web` tokens and components are untouched.

## Colors

`src/styles/theme.css` owns the values. Components consume standard shadcn/Tailwind semantics, not canvas-specific CSS variables.

| App token | Page 1 role | Light | Dark |
| --- | --- | --- | --- |
| `background` | Canvas | `#F7F7F8` | `#111114` |
| `foreground` | Primary content | `#26262B` | `#F7F7F8` |
| `card` | Surface | `#FFFFFF` | `#1B1B1E` |
| `popover` | Floating/raised surface | `#FFFFFF` | `#303036` |
| `secondary`, `muted` | Subtle surface | `#EEEEF0` | `#26262B` |
| `muted-foreground` | Secondary content | `#5E5F6B` | `#B8B9C1` |
| `text-tertiary` | Tertiary content | `#4D4E57` | `#92939E` |
| `primary` | Primary action | `#285DF5` | `#285DF5` |
| `primary-start` | Gradient top | `#3275FF` | `#285AE8` |
| `primary-hover` | Hover action | `#285AE8` | `#285AE8` |
| `primary-pressed` | Pressed action | `#2658E9` | `#2658E9` |
| `primary-foreground` | On-primary label | `#FFFFFF` | `#FFFFFF` |
| `link` | Readable blue text | `#285DF5` | `#8FAFFF` |
| `accent` | Soft blue surface | `#EEF5FF` | `#192847` |
| `border` | Default boundary | `#D9D9DE` | `#42424A` |
| `input` | Control boundary | `#92939E` | `#747583` |
| `ring` | Focus | `#285DF5` | `#8FAFFF` |
| `success` / `success-foreground` | Success surface / text | `#F0FDF4` / `#166534` | `#142E21` / `#86EFAC` |
| `warning` / `warning-foreground` | Warning surface / text | `#FFFBEB` / `#92400E` | `#352811` / `#FCD34D` |
| `danger-soft` / `destructive` | Danger surface / text | `#FEF2F2` / `#B91C1C` | `#381C22` / `#FCA5A5` |
| `danger-action` | Filled destructive action | `#B91C1C` | `#B91C1C` |
| `disabled-surface` / `disabled-foreground` | Disabled action | `#EEEEF0` / `#92939E` | `#303036` / `#B8B9C1` |
| `overlay` | Scrim | `#26262B66` | `#000000B3` |

The destructive text token and filled action token are deliberately separate. Dark error text stays pale pink; a destructive button keeps the source red fill with a white label. Dark disabled actions use the explicit muted treatment documented on the dark artboard instead of opacity. Light disabled actions use the same canvas disabled color role; the original light canvas opacity expression is not copied into code.

Sidebar tokens alias the same surfaces/actions. Chart series reuse the existing Page 1 blue, teal, violet, amber, and indigo palette; the dark first series uses the readable blue link token. There was no separate chart palette on Page 1, so this is a semantic extension using existing colors.

## Typography, spacing, and shape

- Inter Variable for display, headings, body, and UI; Geist Mono Variable for code and technical labels. Both are self-hosted. Page 1 already substitutes Inter for the source site's ABC Diatype display face.
- Body 16/24, UI 15/24, label 14/24, caption 13/20, title 24/32, heading 36/40 (30/34 on mobile), display 64/64 (38/44 on mobile).
- Tailwind's 4px spacing scale maps to Page 1's existing spacing tokens. Content max-width is 1216px; page width is 1440px.
- Control radius 5px, small surface 8px, card 16px, dialog 20px, navigation 13px, badge/pill 999px.
- Control heights: small 32px, default 36px, large 44px. Inputs keep a 16px font on mobile to avoid browser zoom; desktop labels use 14px.
- Focus ring 2px with 3px offset; fast transitions 160ms. Reduced-motion preferences override decorative transitions and animations.

## Shared component adjustments

Installed primitives retain upstream APIs and behavior. Their local visual changes are:

- `Button`: source gradient, explicit hover/pressed colors, filled destructive action, readable blue links, disabled states, and control dimensions.
- `Input`, `Textarea`, `Select`, native select, and input groups: source control surfaces/borders/radii; no generic translucent gray input fill in dark mode.
- `Card`, dialog/alert dialog, and floating menus: source radii, border tokens, spacing, shadows, and scrims.
- `Badge` and `Alert`: semantic success/warning/destructive variants and paired foreground colors.
- `Switch` and `Slider`: semantic light thumb instead of a hard-coded color.
- `Tooltip`: inverse surface and content pair in either mode.
- `CodeBlock`: always uses the dark surface, matching the API code specimen on Page 1.
- All applicable primitives: tokenized focus, borders, and transition duration. Syntax-highlighting colors remain the upstream Shiki code palette; Page 1 does not define a complete syntax-token palette.
- `Spinner`: props use Hugeicons' actual component type so its numeric `strokeWidth` is not widened by React's generic SVG props.

The progress primitive also forwards its value to the accessible Radix root. Minor upstream lint compatibility fixes remove redundant breadcrumb/pagination roles, use stable chart/error keys, render chart CSS as style text children, and remove redundant React state-setter dependencies. These preserve the public component API.

Biome exceptions are limited to upstream ARIA grouping wrappers, position-based source/slider keys, keyboard-scrollable code blocks, input add-on click-to-focus behavior (the input remains keyboard focusable), and the reduced-motion override. All other repository lint rules remain enabled.
