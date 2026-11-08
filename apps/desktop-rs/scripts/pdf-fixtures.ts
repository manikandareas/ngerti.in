// Development-only, compact selectable fixtures based on the retained probe PDF.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(import.meta.dir, "../verification/nma-067/pdf");
await mkdir(directory, { recursive: true });
function pdf(pages: number): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let page = 1; page <= pages; page++) {
    const stream = `q 0.95 0.96 0.98 rg 0 0 612 792 re f Q\nq 0.08 0.21 0.31 rg 36 528 540 168 re f Q\nBT /F1 28 Tf 1 0 0 1 48 720 Tm (Selectable page ${page}) Tj ET\nBT /F1 18 Tf 1 1 1 rg 1 0 0 1 56 640 Tm (Native PDF workload.) Tj ET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (page - 1) * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    );
  }
  let text = "%PDF-1.7\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}
for (const [name, count] of [
  ["long", 200],
  ["page-limit", 501],
] as const)
  await writeFile(resolve(directory, `${name}.pdf`), pdf(count));
