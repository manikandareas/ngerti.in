"""Compare independent MCP viewport and RFB framebuffer captures of the same fixture."""
import json
from pathlib import Path
from PIL import Image

root = Path('.dev/verification/nma-058')
report = {}
for harness in ('codex', 'muse'):
    dom = Image.open(root / f'start-{harness}-dom.png').convert('RGB')
    vnc = Image.open(root / f'start-{harness}-vnc.png').convert('RGB')

    def bounds(image, color):
        points = [(x, y) for y in range(image.height) for x in range(image.width) if image.getpixel((x, y)) == color]
        return [min(x for x, _ in points), min(y for _, y in points), max(x for x, _ in points), max(y for _, y in points)]

    first, second = bounds(dom, (17, 173, 129)), bounds(vnc, (17, 173, 129))
    offset = second[1] - first[1]
    crop = vnc.crop((0, offset, dom.width, offset + dom.height))
    pixels = dom.width * dom.height
    matching = sum(left == right for left, right in zip(dom.getdata(), crop.getdata()))
    assert matching / pixels > .98
    report[harness] = {'dom_size': dom.size, 'vnc_size': vnc.size, 'dom_marker_bounds': first, 'vnc_marker_bounds': second, 'browser_chrome_offset_y': offset, 'matching_pixels': matching, 'pixels': pixels, 'matching_fraction': matching / pixels}
(root / 'visual-binding.json').write_text(json.dumps(report, indent=2))
