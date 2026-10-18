function csvRows(text: string) {
  const rows: Array<{ id: number; cells: Array<{ id: number; text: string }> }> = [];
  let cells: Array<{ id: number; text: string }> = [];
  let current = "";
  let quoted = false;
  let start = 0;
  let rowStart = 0;
  for (let i = 0; i <= text.length && rows.length < 200; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n" || char === undefined)) {
      cells.push({ id: start, text: current.replace(/\r$/, "") });
      current = "";
      start = i + 1;
      if (char !== ",") {
        if (cells.some((cell) => cell.text))
          rows.push({ id: rowStart, cells: cells.slice(0, 100) });
        cells = [];
        rowStart = i + 1;
      }
    } else if (char !== undefined) current += char;
  }
  return rows;
}

export function TextPreview({ body, type }: { body: string; type: string }) {
  const limited = body.length > 200000;
  let text = body.slice(0, 200000);
  if (type === "application/json" && !limited) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* Preserve original text. */
    }
  }
  return (
    <div className="space-y-3">
      {limited ? (
        <p className="text-xs text-muted-foreground">
          Preview dibatasi 200.000 karakter. Unduh file untuk membaca seluruh isi.
        </p>
      ) : null}
      {type === "text/csv" ? (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="mb-2 text-left text-xs text-muted-foreground">
              Preview maksimal 200 baris dan 100 kolom.
            </caption>
            <tbody>
              {csvRows(text).map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell) => (
                    <td key={cell.id} className="whitespace-pre-wrap border p-2 align-top">
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words rounded-xl bg-background p-4 text-sm leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}
