import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
type Snapshot = { prefix: string; revision: string; originalPrefix?: string };
const snapshots: Snapshot[] = JSON.parse(
  readFileSync(resolve(root, "docs/development/historical-links.json"), "utf8"),
);
const trees = new Map<string, Set<string>>();

function existsInSnapshot(path: string, snapshot: Snapshot): boolean {
  let tree = trees.get(snapshot.revision);
  if (!tree) {
    tree = new Set(
      execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", snapshot.revision], {
        cwd: root,
        encoding: "utf8",
      }).split("\0"),
    );
    trees.set(snapshot.revision, tree);
  }
  return tree.has(path) || [...tree].some((entry) => entry.startsWith(`${path}/`));
}

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split("\0")
  .filter((path) => path.endsWith(".md") && existsSync(resolve(root, path)));
const broken: string[] = [];
let localLinks = 0;
let historicalLinks = 0;

type Milestone = {
  ticket: string;
  title: string;
  plan: string;
  status: string;
  order: number;
  layer: string;
  depends_on: string[];
};
const milestones: Milestone[] = JSON.parse(
  readFileSync(resolve(root, "docs/backlog/status.json"), "utf8"),
);
const byTicket = new Map(milestones.map((entry) => [entry.ticket, entry]));
const backlog = readFileSync(resolve(root, "docs/backlog/README.md"), "utf8");
if (byTicket.size !== milestones.length) broken.push("Backlog: duplicate milestone identity");
for (const entry of milestones) {
  const path = `docs/backlog/${entry.ticket}.md`;
  if (!existsSync(resolve(root, path))) {
    broken.push(`Backlog: missing ${path}`);
    continue;
  }
  const text = readFileSync(resolve(root, path), "utf8");
  for (const [field, value] of Object.entries({
    Plan: entry.plan,
    Status: entry.status,
    Order: entry.order,
    Layer: entry.layer,
  })) {
    if (!text.includes(`| ${field} | ${value} |`)) {
      broken.push(`${path}: ${field} differs from status.json`);
    }
  }
  const expectedDependencies = entry.depends_on.map((id) => `[${id}](${id}.md)`).join(", ");
  if (!text.includes(`| Depends on | ${expectedDependencies || "None"} |`)) {
    broken.push(`${path}: dependencies differ from status.json`);
  }
  if (
    entry.plan === "Harness-first" &&
    !backlog.includes(
      `| ${entry.order} | [${entry.ticket} · ${entry.title}](${entry.ticket}.md) | ${entry.status} |`,
    )
  ) {
    broken.push(`Backlog index: missing or stale ${entry.ticket}`);
  }
  for (const id of entry.depends_on) {
    const dependency = byTicket.get(id);
    if (!dependency || dependency.order >= entry.order) {
      broken.push(`${path}: missing or unordered dependency ${id}`);
    } else if (entry.plan === "Harness-first" && dependency.plan !== "Harness-first") {
      broken.push(`${path}: active milestone depends on deferred scope ${id}`);
    } else if (["Ready", "Done"].includes(entry.status) && dependency.status !== "Done") {
      broken.push(`${path}: ${entry.status} milestone has incomplete dependency ${id}`);
    }
  }
}

function decisionIds(path: string): string[] {
  return [...readFileSync(resolve(root, path), "utf8").matchAll(/^\| ((?:[A-HX]|PR|T)\d{2}) \|/gm)]
    .map((match) => match[1])
    .sort();
}
const decisions = decisionIds("docs/product/feature-decisions.md");
const coverage = decisionIds("docs/backlog/feature-coverage.md");
if (new Set(decisions).size !== decisions.length || decisions.join() !== coverage.join()) {
  broken.push("Feature ownership must contain every decision exactly once");
}

const version = readFileSync(resolve(root, "apps/server/src/contracts.ts"), "utf8").match(
  /export const CONTRACT_VERSION = "([^"]+)"/,
)?.[1];
const exportPath = resolve(root, `docs/contracts/${version}.json`);
if (
  !version ||
  !existsSync(exportPath) ||
  JSON.parse(readFileSync(exportPath, "utf8")).version !== version
) {
  broken.push("The current backend contract requires a matching local schema export");
}

for (const path of new Set(files)) {
  const source = readFileSync(resolve(root, path), "utf8");
  const currentGuide =
    /^(?:AGENTS\.md|README\.md|PRODUCT\.md|docs\/README\.md|docs\/(?:product|backlog|development|architecture)\/|\.agents\/skills\/ngertiin-ticket\/)/.test(
      path,
    );
  if (currentGuide && /https?:\/\/(?:app\.)?notion\.(?:com|so)\//i.test(source)) {
    broken.push(`${path}: current guidance must link to local project records`);
  }
  const text = source.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "");
  let immutableSource: boolean | undefined;
  for (const match of text.matchAll(/\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || /^[a-zA-Z][\w+.-]*:/.test(target)) continue;
    localLinks++;
    const decoded = decodeURIComponent(target);
    if (existsSync(resolve(root, dirname(path), decoded))) continue;

    // Immutable evidence keeps its original links; current guides get no historical fallback.
    const snapshot = snapshots.find((entry) => path.startsWith(entry.prefix));
    if (snapshot) {
      const original = snapshot.originalPrefix
        ? snapshot.originalPrefix + path.slice(snapshot.prefix.length)
        : path;
      const historicalTarget = relative(root, resolve(root, dirname(original), decoded));
      if (immutableSource === undefined) {
        immutableSource =
          existsInSnapshot(original, snapshot) &&
          execFileSync("git", ["show", `${snapshot.revision}:${original}`], {
            cwd: root,
            encoding: "utf8",
          }) === source;
      }
      if (immutableSource && existsInSnapshot(historicalTarget, snapshot)) {
        historicalLinks++;
        continue;
      }
    }
    broken.push(`${path} -> ${target}`);
  }
}

if (broken.length) {
  console.error(`Broken local links:\n${broken.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Docs: ${new Set(files).size} Markdown files, ${localLinks} local links OK (${historicalLinks} verified in pinned historical Git trees); ${milestones.length} milestones, ${decisions.length} decisions, contract ${version}.`,
  );
}
