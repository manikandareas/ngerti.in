import { useState } from "react";

export function AgentAvatar({
  name,
  url,
  className = "size-10 text-base",
}: {
  name: string;
  url?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [seenUrl, setSeenUrl] = useState(url);
  if (url !== seenUrl) {
    setSeenUrl(url);
    setFailed(false);
  }
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-secondary object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold ${className}`}
    >
      {name.slice(0, 1) || "·"}
    </div>
  );
}
