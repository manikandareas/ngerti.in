import { type CSSProperties, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { AvatarState } from "../engine/catalog";
import type { AvatarConfig } from "../engine/config";
import { type AvatarController, mountAvatar } from "../engine/controller";
import "./avatar.css";

export interface AgentAvatarProps {
  config: AvatarConfig;
  state?: AvatarState;
  loading?: boolean;
  size?: number | string;
  animated?: boolean;
  followPointer?: boolean;
  shadow?: boolean;
  label?: string;
  className?: string;
  deferred?: boolean;
  onReady?: () => void;
  ref?: React.Ref<AvatarController | null>;
}

export function AgentAvatar({
  config,
  state = "idle",
  loading = false,
  size = 64,
  animated = true,
  followPointer = false,
  shadow = false,
  label,
  className = "",
  deferred = false,
  onReady,
  ref,
}: AgentAvatarProps) {
  const host = useRef<HTMLSpanElement>(null);
  const controller = useRef<AvatarController | null>(null);
  const [visible, setVisible] = useState(!deferred);
  const initial = useRef({ config, state, loading, onReady });
  useImperativeHandle(
    ref,
    () => ({
      setConfig: (value) => controller.current?.setConfig(value),
      setLoading: (value) => controller.current?.setLoading(value),
      setState: (value) => controller.current?.setState(value),
      play: (action) => controller.current?.play(action),
      lookAt: (x, y) => controller.current?.lookAt(x, y),
      dispose: () => controller.current?.dispose(),
    }),
    [],
  );

  initial.current = { config, state, loading, onReady };
  useEffect(() => {
    if (!deferred) {
      setVisible(true);
      return;
    }
    if (!host.current) return;
    // Defer the first mount only; the shared clock suspends offscreen animation.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "80px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [deferred]);
  useEffect(() => {
    controller.current?.setConfig(config);
  }, [config]);
  useEffect(() => {
    controller.current?.setLoading(loading);
  }, [loading]);
  useEffect(() => {
    controller.current?.setState(state);
  }, [state]);

  useEffect(() => {
    if (!host.current || !visible) return;
    const instance = mountAvatar(host.current, initial.current.config, {
      state: initial.current.state,
      loading: initial.current.loading,
      animated,
      followPointer,
      shadow,
      onReady: () => initial.current.onReady?.(),
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
