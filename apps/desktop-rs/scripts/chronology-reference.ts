// Development-only vectors from the current publication clock/day formatter.

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  conversationDateLabel,
  conversationDay,
  conversationTime,
  conversationTimeZone,
} from "../../web-client/src/features/conversation/lib/conversation-time";

const cases = [
  "2026-01-01T00:00:00Z",
  "2026-02-17T23:59:59Z",
  "2026-05-06T17:05:00Z",
  "2026-08-10T15:59:59Z",
  "2026-10-31T16:00:00Z",
  "2026-11-06T17:05:00Z",
  "2026-11-07T04:00:00Z",
  "2026-12-31T15:59:59Z",
  "2026-12-31T16:00:00Z",
].map((at) => ({
  at,
  day: conversationDay(at),
  label: conversationDateLabel(at),
  ...conversationTime(at),
}));
if (conversationTimeZone !== "Asia/Makassar")
  throw new Error("Run this reference on the specified Asia/Makassar host.");
await writeFile(
  resolve(import.meta.dir, "../verification/nma-067/chronology-reference.json"),
  `${JSON.stringify(
    { version: 1, time_zone: conversationTimeZone, offset_seconds: 28800, cases },
    null,
    2,
  )}\n`,
);
