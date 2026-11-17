import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { isDesktop } from "./desktop-shell";

const PANEL_DURATION_MS = 200;

type SlidingPanelProps = {
  open: boolean;
  width: number;
  side?: "left" | "right";
  unmountOnClose?: boolean;
  children: ReactNode;
};

type PanelStyle = CSSProperties & {
  "--sliding-panel-width": string;
  "--sliding-panel-duration": string;
};

export function SlidingPanel(props: SlidingPanelProps) {
  const wide = useMediaQuery("(min-width: 768px)");
  return isDesktop || wide ? <AnimatedPanel {...props} /> : props.children;
}

function AnimatedPanel({
  open,
  width,
  side = "left",
  unmountOnClose = false,
  children,
}: SlidingPanelProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [retained, setRetained] = useState(open);
  const style: PanelStyle = {
    "--sliding-panel-width": `${width}px`,
    "--sliding-panel-duration": `${PANEL_DURATION_MS}ms`,
  };

  useEffect(() => {
    if (open || !unmountOnClose) {
      setRetained(true);
      return;
    }
    if (reducedMotion) {
      setRetained(false);
      return;
    }
    const timer = setTimeout(() => setRetained(false), PANEL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [open, unmountOnClose, reducedMotion]);

  return (
    <div
      className="sliding-panel"
      data-open={open}
      data-side={side}
      inert={!open}
      aria-hidden={!open}
      style={style}
    >
      <div className="sliding-panel-content">
        {(!unmountOnClose || open || retained) && children}
      </div>
    </div>
  );
}
