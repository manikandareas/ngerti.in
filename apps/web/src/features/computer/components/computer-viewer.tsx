import type RFB from "@novnc/novnc/lib/rfb";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ComputerViewer({ url, human }: { url: string; human: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const connection = useRef<RFB | null>(null);
  const [status, setStatus] = useState("Menghubungkan layar…");
  const [text, setText] = useState("");
  useEffect(() => {
    let disposed = false;
    import("@novnc/novnc/lib/rfb")
      .then((module) => {
        if (disposed || !container.current) return;
        const exported: unknown = module.default;
        const Client = (
          typeof exported === "function" ? exported : (exported as { default: typeof RFB }).default
        ) as typeof RFB;
        const rfb = new Client(container.current, url, { shared: true, wsProtocols: ["binary"] });
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.viewOnly = !human;
        rfb.addEventListener("connect", () => setStatus("Layar tersambung."));
        rfb.addEventListener("disconnect", () =>
          setStatus("Koneksi berakhir. Tutup lalu sambungkan layar kembali."),
        );
        connection.current = rfb;
      })
      .catch(() => setStatus("Layar belum dapat dimuat. Coba sambungkan kembali."));
    return () => {
      disposed = true;
      connection.current?.disconnect();
      connection.current = null;
    };
  }, [url, human]);

  function send() {
    if (!human || !connection.current) return;
    for (const character of text) {
      const point = character.codePointAt(0) ?? 0;
      connection.current.sendKey(point > 255 ? 0x01000000 + point : point, null);
    }
    setText("");
  }

  return (
    <section aria-label="Layar komputer pribadi" className="space-y-3">
      <p className="text-xs text-muted-foreground" role="status">
        {status}
      </p>
      <div
        ref={container}
        className="aspect-video min-h-48 w-full overflow-hidden rounded-xl bg-black"
      />
      {human ? (
        <div className="flex gap-2 min-[701px]:hidden">
          <Input
            type="password"
            autoComplete="off"
            aria-label="Teks privat untuk komputer"
            placeholder="Ketuk kolom pada layar, lalu ketik di sini"
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="button" variant="outline" onClick={send}>
            Ketik
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => connection.current?.sendKey(0xff0d, null)}
          >
            Enter
          </Button>
        </div>
      ) : null}
    </section>
  );
}
