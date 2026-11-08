# Product control verification

Date: 2026-11-08. Denominator: the 22 `product-used` controls in the frozen version-1 manifest. Catalog-only and transitive controls are excluded. Native build inputs are retained in the [component manifest](../nma-067/components/native-build-manifest.json).

Light/dark captures and accessibility observations verify the rendered examples. Keyboard checks below describe actual native input. Static content has no focus, press or disabled interaction; its child actions are checked through their owning control. Source-defined hover/pressed styles and observed activation are distinguished from a captured held mouse frame.

| Product control | Native presentation and name | Keyboard / focus / disabled evidence |
| --- | --- | --- |
| alert | Loading, empty and actionable error statuses; label and description in AX; both themes | Static status; no independent tab stop, press or disabled state. |
| alert-dialog | Confirmation heading, description, Cancel and OK | Tab/Enter opens; Escape and Cancel dismiss; trigger focus returns. Child buttons own disabled/press behavior. |
| badge | Four named tones in both themes | Static labels; interaction states not applicable. |
| bubble | Ordinary and emphasized content surfaces in both themes | Static paragraph; child actions have separate owners. |
| button | Seven variants, caller override, loading and disabled samples; Button role including text action | Tab/Shift+Tab, Return/Space and disabled skip observed. Native press/release dispatch observed. Hover/pressed tokens are explicitly mapped in `ui/controls.rs`; a screenshot requested during a held click completed after release and is not a held-frame visual proof. |
| dialog | Readable heading/description and Close in both themes | Enter opens, Escape dismisses, focus returns to trigger and subsequent Tab reaches the next trigger. |
| drawer | Bottom sheet with readable heading/description | Keyboard open/Escape/next focus observed. Trigger and Close buttons own interaction states. |
| dropdown-menu | Named Appearance menu and disabled entry | Space opens; arrows navigate past the disabled entry; Enter toggles the gallery theme; Escape dismissal. |
| input | Search field, label, hint, Unicode value and disabled field | Native editing/focus, keyboard traversal and disabled edit rejection observed. The local semantic adapter now exposes the disabled flag while the real native editor preserves its disabled engine and appearance. The maximum-choice Textarea adapter is also implemented; the [native multiple-choice AX capture](../nma-067/components/interaction-disabled-accessibility-v9.ax.txt) records the additional answer field disabled at the two-choice maximum. |
| input-group | Named group with leading icon, input and trailing label | Input owns editing, focus and disabled behavior; decorative adornments have no separate press state. |
| item | Named Conversation details button and disabled Unavailable details | Button keyboard activation/selection and disabled AX state; disabled item click leaves state unchanged. |
| label | Search label/hint and named group | Static copy; no separate keyboard or disabled state. |
| message | User/agent/file-only rows, attribution, timestamps, attachments and safe activity | Native attachment/question/retry controls exercised separately. Static row content has no independent press/disabled state. |
| popover | Named trigger/help and readable contextual heading/description | Return opens, Escape closes, Return reopens from the retained trigger focus. |
| scroll-area | Native scrolling galleries/source/table/PDF | Wheel scrolling and keyboard focus reveal exercised. The table has an explicit wheel-axis restriction; vertical scrolling retains Column 1. No separate disabled control contract. |
| separator | Native themed one-pixel separator | Decorative; no tab stop, name, press or disabled state. |
| sheet | Side sheet with readable heading/description | Keyboard open/Escape/next focus observed. Trigger and Close buttons own interaction states. |
| skeleton | Named Loading content status in both themes | Static loading placeholder; no independent focus/press/disabled state. |
| spinner | Native loading indicator beside named loading/status content | Noninteractive progress presentation; no independent keyboard/pressed/disabled state. |
| switch | Named Enable preview and disabled Unavailable preview | Tab/Space toggles enabled value; disabled flag/value observed and disabled click leaves it off. |
| tabs | Named selected/unselected native tabs | Controlled roving focus; one selected tab stop. Right/Left, Home/End and end-to-start wrap observed on the current host. The default pinned tab primitive did not supply this behavior. |
| tooltip | Trigger help text exposed through AX | Accessible help is observed. A standalone hover tooltip window has not yet been retained as a visual proof. |

Current captures include [light controls](controls-disabled-light-v6.jpg), [dark controls](controls-disabled-dark-v6.jpg), [dark compound controls](compounds-disabled-dark-v6.jpg), [dark dialog](dialog-accessibility-dark-v6.jpg), [keyboard tabs](tabs-keyboard-light-v6.jpg), [corrected disabled field](disabled-input-light-v9.jpg), [popover content](popover-accessibility-light-v5.jpg) and [popover focus return](popover-keyboard-return-light-v5.jpg). Earlier overlay/menu captures retain the remaining executed keyboard sequences.

The [2026-11-08 owner decision](../../development/nma-066-067-closure-2026-11-08.md) accepts the implemented controls with uncaptured held-press/standalone tooltip states and remaining affected keyboard reruns non-blocking. Present rows retain actual observations; they do not claim that every visual state passed.