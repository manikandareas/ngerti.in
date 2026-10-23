import { useEffect, useState } from "react";

export function useExpired(expiresAt: string) {
  const deadline = Date.parse(expiresAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return !Number.isFinite(deadline) || deadline <= now;
}
