import { randomInt } from "node:crypto";
import { names, uniqueNamesGenerator } from "unique-names-generator";

// A curated subset of the pinned library dictionary with unambiguous single-syllable names.
const preferred = new Set([
  "Ash",
  "Beau",
  "Blair",
  "Blake",
  "Brett",
  "Bruce",
  "Chad",
  "Chase",
  "Claire",
  "Clark",
  "Cole",
  "Craig",
  "Dale",
  "Dean",
  "Drew",
  "Faith",
  "Finn",
  "Flynn",
  "Gail",
  "Glenn",
  "Grace",
  "Grant",
  "Guy",
  "Hope",
  "Jack",
  "James",
  "Jane",
  "Jean",
  "Jill",
  "Joan",
  "John",
  "Joy",
  "Jude",
  "June",
  "Kai",
  "Keith",
  "Kent",
  "Kirk",
  "Kyle",
  "Lance",
  "Lee",
  "Luke",
  "Lynn",
  "Mark",
  "Max",
  "Neil",
  "Nick",
  "Paige",
  "Paul",
  "Pearl",
  "Quinn",
  "Ralph",
  "Ray",
  "Reed",
  "Rex",
  "Rose",
  "Ruth",
  "Sam",
  "Scott",
  "Seth",
  "Shane",
  "Shawn",
  "Sky",
  "Tess",
  "Todd",
  "Troy",
  "Wade",
  "Wayne",
  "Will",
]);
export const defaultAgentNames = names.filter((name) => preferred.has(name));
if (!defaultAgentNames.length) throw new Error("The agent-name library has no preferred names.");

/** Try every unused single-syllable library name before adding a collision suffix. */
export function randomAgentName(existing: Iterable<string> = []) {
  const used = new Set([...existing].map((name) => name.toLowerCase()));
  const available = defaultAgentNames.filter((name) => !used.has(name.toLowerCase()));
  const base = uniqueNamesGenerator({
    dictionaries: [available.length ? available : defaultAgentNames],
    length: 1,
    seed: randomInt(0x7fffffff),
    style: "capital",
  });
  let name = base;
  for (let suffix = 2; used.has(name.toLowerCase()); suffix++) name = `${base} ${suffix}`;
  return name;
}
