# Office and PDF workflow provenance

The DOCX, XLSX, PowerPoint and PDF workflows and their complete assets originate
from NousResearch/hermes-agent revision
`7489b22af47ce91b366dde81d5831ea422577498` (MIT). The generated skill catalog records
the SHA-256 of each upstream file and each catalog entry's own license metadata.
The upstream source remains unchanged.

`ngertiin_engine/skill_overrides/docx_common.py` retains the upstream MIT helper
and replaces only its text-replacement algorithm. Original text spans are applied
once, from right to left, to prevent an infinite loop when replacement text
contains the search text. Installed skill revisions record the effective hash.

`document-requirements.lock` pins every Python document dependency with hashes.
Installed distributions retain their upstream metadata and license files inside
the execution image. This includes python-docx, python-pptx, openpyxl, pypdf,
reportlab, pdfplumber, pypdfium2 and their transitive dependencies.

LibreOffice, Poppler and fonts are Debian packages. Their source/license notices
remain under `/usr/share/doc` in the image. The image retains LibreOffice's
MPL/LGPL notices, Poppler's GPL notice and font licenses. The installation log and
package-version inventory are retained with acceptance evidence; this notice is
not a substitute for the distributions' actual license texts.

The optional Hindsight service is pinned separately by OCI digest in
`infra/memory.compose.yaml`. Its source is https://github.com/vectorize-io/hindsight
(MIT). The Hermes catalog at the selected pin references its native provider
plugin at `d952b6e655fccab4581ee0722b51c5f103873d12`, version 1.2.3. Ngertiin's adapter
implements the pinned native `MemoryProvider` interface and calls the self-hosted
service; it does not install the standalone plugin's independent background
capture/daemon lifecycle.

The web PDF preview uses pdfjs-dist 6.4.299 (Apache-2.0), loaded only in the browser
with a separate worker bundle. Its unmodified license is shipped at
`apps/web/public/licenses/pdfjs-dist-6.4.299.txt`. Integration follows the upstream
[PDF.js document/page/canvas examples](https://mozilla.github.io/pdf.js/examples/).
