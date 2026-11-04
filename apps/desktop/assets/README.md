# Application artwork

`app-icon.png` is the original 1600 × 1600 image supplied by the user on 4 November 2026. It is preserved unchanged.

`app-icon-macos.png` is the generated macOS tile artwork, edited from that image with the built-in image generation tool, using the user's macOS application grid screenshot as the shape/material reference. The selected output was `exec-53c6c491-e0fd-42c8-b197-3054617f1f63.png`.

The build normalizes its inner tile, applies `macos-icon-mask.svg` for a consistent rounded-square silhouette and transparent safety margins, resizes to Retina/standard sizes, and converts them to `dist/app.icns` with Apple's `iconutil`. Generated pixels outside the platform tile are excluded. The final 1024px preview is `dist/app-icon.png`.

The Dock uses the same image during source development. The menu bar retains a small monochrome template icon for legibility in both system appearances.
