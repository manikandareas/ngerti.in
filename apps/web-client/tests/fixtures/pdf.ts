/** Small, deterministic PDF with text/vector pages and no external resources. */
export function pdfFixture(pages = 2) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert\\("PDF action must stay inactive"\\)) >> >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let index = 0; index < pages; index++) {
    const title = index === 0 ? "October sales" : `Channel breakdown - page ${index + 1}`;
    const text = `q 0.95 0.96 0.98 rg 0 0 612 792 re f Q\nq 0.08 0.21 0.31 rg 36 528 540 168 re f Q\nBT /F1 28 Tf 1 0 0 1 48 720 Tm (${title}) Tj ET\nBT /F1 18 Tf 1 1 1 rg 1 0 0 1 56 640 Tm (Revenue grew by 18 percent.) Tj ET\nBT /F1 12 Tf 0 0 0 rg 1 0 0 1 48 72 Tm (PDF fixture page ${index + 1} of ${pages}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    );
  }
  let document = "%PDF-1.7\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const start = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(document);
}
