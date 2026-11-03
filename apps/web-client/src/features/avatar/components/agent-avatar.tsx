import { type CSSProperties, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AvatarState } from "../engine/catalog";
import type { AvatarConfig } from "../engine/config";
import { type AvatarController, mountAvatar } from "../engine/controller";
import "./avatar.css";

export interface AgentAvatarProps {
  config: AvatarConfig;
  state?: AvatarState;
  size?: number | string;
  animated?: boolean;
  followPointer?: boolean;
  shadow?: boolean;
  label?: string;
  className?: string;
  deferred?: boolean;
  ref?: React.Ref<AvatarController | null>;
}

export function AgentAvatar({
  config,
  state = "idle",
  size = 64,
  animated = true,
  followPointer = false,
  shadow = false,
  label,
  className = "",
  deferred = false,
  ref,
}: AgentAvatarProps) {
  const host = useRef<HTMLSpanElement>(null);
  const controller = useRef<AvatarController | null>(null);
  const [visible, setVisible] = useState(!deferred);
  const initial = useRef({ config, state });
  useImperativeHandle(
    ref,
    () => ({
      setConfig: (value) => controller.current?.setConfig(value),
      setState: (value) => controller.current?.setState(value),
      play: (action) => controller.current?.play(action),
      lookAt: (x, y) => controller.current?.lookAt(x, y),
      dispose: () => controller.current?.dispose(),
    }),
    [],
  );

  initial.current = { config, state };
  useEffect(() => {
    if (!deferred) {
      setVisible(true);
      return;
    }
    if (!host.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "80px",
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [deferred]);
  useEffect(() => {
    controller.current?.setConfig(config);
  }, [config]);
  useEffect(() => {
    controller.current?.setState(state);
  }, [state]);

  useEffect(() => {
    if (!host.current || !visible) return;
    const instance = mountAvatar(host.current, initial.current.config, {
      state: initial.current.state,
      animated,
      followPointer,
      shadow,
    });
    controller.current = instance;
    return () => {
      instance.dispose();
      controller.current = null;
    };
  }, [animated, followPointer, shadow, visible]);

  return (
    <span
      ref={host}
      className={`ngertiin-avatar ${className}`}
      style={{ "--avatar-size": typeof size === "number" ? `${size}px` : size } as CSSProperties}
      role="img"
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
