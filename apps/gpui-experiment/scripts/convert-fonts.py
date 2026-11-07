"""Convert the client's exact WOFF2 font bytes for native font registration."""
from pathlib import Path
from fontTools.ttLib import TTFont

directory = Path(__file__).resolve().parent.parent / "assets" / "fonts"
for name in ("Geist", "GeistMono"):
    font = TTFont(directory / f"{name}.woff2")
    font.flavor = None
    font.save(directory / f"{name}.ttf")
    print(name, "families:", sorted({entry.toUnicode() for entry in font["name"].names if entry.nameID in (1, 16)}))
