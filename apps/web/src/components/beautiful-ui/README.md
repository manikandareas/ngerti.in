# Beautiful UI conversation components

Adapted from https://github.com/slev12397/beautiful-ui at
`44a274e598395ab61e7c96c26fda2758780253b7` (MIT, Shane Levine, 2026).
Sources: `components/primitives/LoadingState.tsx`, `TaskRows.tsx`,
`ChatComposer.tsx`, and `PromptBar.tsx`; https://www.beautifului.dev/.

The pixel grid, expandable task row, message section and composer structure use
Ngertiin's shared shadcn Button and agent.pen semantic tokens. Demo timers,
scripted replies, simulated progress/retries, marketing labels and unconnected
model/dictation controls are removed. Status is supplied by the existing runtime.
Reduced motion disables the loader animation. Expandable content is removed from
the focus order while closed. No second component theme or runtime is installed.

The composer follows the Prompt Bar pill variant: inline controls, a full-width
input row for longer drafts, and a round send button. Group @ suggestions use
active thread members, filter display names/handles, and insert the canonical
handle at the caret. The shadcn/Radix popover is portalled to avoid clipping;
Arrow keys, Enter/Tab, Escape and pointer selection preserve textarea focus.
Model selection remains in agent settings, matching persistent agent identity.
