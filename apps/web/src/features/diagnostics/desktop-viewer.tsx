import type RFB from "@novnc/novnc/lib/rfb";
import { useEffect, useRef, useState } from "react";

export function DesktopViewer({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Menghubungkan desktop…");

  useEffect(() => {
    let cancelled = false;
    let connection: RFB | undefined;
    import("@novnc/novnc/lib/rfb")
      .then((module) => {
        if (cancelled || !container.current) return;
        const exported: unknown = module.default;
        const Client = (
          typeof exported === "function" ? exported : (exported as { default: typeof RFB }).default
        ) as typeof RFB;
        connection = new Client(container.current, url, { shared: true, wsProtocols: ["binary"] });
        connection.scaleViewport = true;
        connection.resizeSession = false;
        // Keep client input enabled to exercise enforcement at the gateway.
        connection.viewOnly = false;
        connection.addEventListener("connect", () => setStatus("Desktop tersambung."));
        connection.addEventListener("disconnect", () =>
          setStatus("Koneksi berakhir. Perbarui viewer untuk menyambungkan kembali."),
        );
      })
      .catch((error: unknown) => {
        console.error("Daytona viewer module", error);
        setStatus("Viewer belum dapat dimuat.");
      });
    return () => {
      cancelled = true;
      connection?.disconnect();
    };
  }, [url]);

  return (
    <section aria-label="Desktop Daytona bersama">
      <p role="status" className="mb-3 text-sm">
        {status}
      </p>
      <div ref={container} className="h-[720px] w-full overflow-hidden rounded-xl bg-black" />
    </section>
  );
}
