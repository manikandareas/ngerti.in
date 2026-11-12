import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { ApplicationSkills, packageHash } from "../learning/application-skills";
import {
  type LearningContext,
  type NativeSkillMetadata,
  type SkillAsset,
  skillName,
  skillPackage,
} from "../learning/contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { canonicalDirectory, WorkspaceFiles } from "../workspaces/files";
import type { LaunchContext } from "./context";

/** Read-only discovery in the isolated connection home and the current workspace, never host HOME. */
export function inheritedSkills(context: LaunchContext, harness: "codex" | "muse" = "codex") {
  const roots = [
    ["home-agents", join(realpathSync(context.env.HOME), ".agents/skills")],
    ...(harness === "codex"
      ? [["codex", join(realpathSync(context.env.CODEX_HOME), "skills")]]
      : [["muse", join(realpathSync(context.env.HOME), ".muse/skills")]]),
    ...(context.workspace ? [["workspace", join(context.workspace.root, ".agents/skills")]] : []),
  ];
  const skills = [];
  let rejected = 0;
  let size = 0;
  for (const [origin, root] of roots) {
    if (!existsSync(root)) continue;
    try {
      const path = canonicalDirectory(root);
      const info = lstatSync(path);
      const files = new WorkspaceFiles(path, String(info.dev), String(info.ino));
      const directories = files
        .list("", "", 102)
        .entries.filter((item) => item.type === "directory")
        .map((item) => item.name);
      const system = directories.indexOf(".system");
      if (system >= 0)
        directories.splice(
          system,
          1,
          ...files
            .list(".system", "", 102)
            .entries.filter((item) => item.type === "directory")
            .map((item) => `.system/${item.name}`),
        );
      for (const directory of directories) {
        try {
          const document = new TextDecoder("utf-8", { fatal: true }).decode(
            files.read(`${directory}/SKILL.md`),
          );
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(document);
          if (!frontmatter || document.length > 64_000) throw new Error("Invalid skill document.");
          const header = Bun.YAML.parse(frontmatter[1]) as { name?: string; description?: string };
          const name = skillName.parse(header.name);
          const assets: SkillAsset[] = [];
          const walk = (path: string, depth = 0) => {
            if (depth > 5) throw new Error("Skill asset nesting limit.");
            const page = files.list(path, "", 100);
            if (page.next_after) throw new Error("Skill file count limit.");
            for (const item of page.entries) {
              const child = `${path}/${item.name}`;
              if (item.type === "directory") walk(child, depth + 1);
              else if (child !== `${directory}/SKILL.md`) {
                if (item.type !== "file" || assets.length >= 32)
                  throw new Error("Unsupported skill asset.");
                const bytes = files.read(child);
                const path = child.slice(directory.length + 1);
                try {
                  assets.push({
                    path,
                    text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
                  });
                } catch {
                  assets.push({ path, content_base64: bytes.toString("base64") });
                }
              }
            }
          };
          walk(directory);
          const value = skillPackage.parse({
            description: header.description,
            instructions: frontmatter[2],
            assets,
          });
          size += Buffer.byteLength(JSON.stringify(value));
          if (skills.length >= 100 || size > 1_000_000)
            throw new Error("Skill inventory size limit.");
          const sha256 = packageHash(value);
          skills.push({
            name,
            key: `harness:${name}:${sha256.slice(0, 16)}`,
            location: `${origin}/${directory}`,
            package: value,
            sha256,
          });
        } catch {
          rejected++;
        }
      }
    } catch {
      rejected++;
    }
  }
  return {
    state: rejected ? ("unknown" as const) : ("supported" as const),
    skills,
    rejected_packages: rejected,
  };
}

export async function persistInheritedSkills(
  lifecycle: Lifecycle,
  context: LaunchContext,
  bindingId: string,
  native: { native_catalog: NativeSkillMetadata[]; native_state: "supported" | "unknown" } = {
    native_catalog: [],
    native_state: "unknown",
  },
) {
  const binding = await lifecycle.store.get("binding", bindingId);
  const current = (await lifecycle.store.list("harness_inventory", { binding_id: bindingId })).find(
    (item) => item.binding_id === bindingId,
  );
  const inventory = inheritedSkills(context, binding.harness);
  const service = new ApplicationSkills(lifecycle);
  const fields = {
    ...inventory,
    ...native,
    agent_id: binding.agent_id,
    thread_id: binding.thread_id,
    connection_id: binding.connection_id,
    binding_id: binding.id,
    harness: binding.harness,
  };
  if (
    current &&
    Object.entries(fields).every(
      ([key, value]) => canonical(current[key as keyof typeof current]) === canonical(value),
    )
  )
    return current;
  return current
    ? await service.update(current, fields)
    : await lifecycle.store.put({ ...service.base(), ...fields, kind: "harness_inventory" });
}

/** Fresh per-turn state avoids caching private memory or app packages in a global profile. */
export async function skillInstructions(lifecycle: Lifecycle, context: LearningContext) {
  const inventory = await new ApplicationSkills(lifecycle).inventory(context);
  return `Skills have separate owners. Harness skill inventory: ${JSON.stringify({ bridge: inventory.harness, native: inventory.native_catalog, state: inventory.native_state })}. Assigned application skills: ${JSON.stringify(inventory.application.filter((item) => item.assignment?.enabled).map((item) => ({ key: item.key, name: item.name, skill_id: item.id, version: item.assignment?.version })))}. Collision names: ${JSON.stringify(inventory.collisions)}. Use qualified identities, never overwrite harness packages. Call ngertiin.read_harness_skill or ngertiin.read_skill for the instructions and assets when relevant. Application revisions remain pinned until explicitly reassigned. Skill assets are data, not additional filesystem grants.`;
}
