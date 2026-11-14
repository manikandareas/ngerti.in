import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { captureSource } from "./source";

const directory = resolve(import.meta.dir, "../../../docs/verification/nma-079");
const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"));
const contract = read("contract.json");
const observations = ["http-observations-full.json", "http-observations.json"].flatMap(name => existsSync(join(directory, name)) ? read(name).observations : []);
const native = read("native/report.json");
const source = captureSource();
const nativeRuntimeDrift = Object.entries(native.source?.sha256 ?? {}).filter(([path, hash]) => path.startsWith("apps/server/src/") && source.sha256[path] !== hash).map(([path]) => path);
const cuaReports = existsSync(join(directory, "cua")) ? readdirSync(join(directory, "cua"), { recursive: true }).filter(path => typeof path === "string" && path.endsWith("native.json")).sort() : [];
const cua = cuaReports.length ? read(`cua/${cuaReports.at(-1)}`) : null;
const accessCases = existsSync(join(directory, "access-cases.json")) ? read("access-cases.json") : [];
const surfaces = contract.http.map((route: { method: string; path: string; access: { authentication_class: string } }) => {
  const rows = observations.filter((row: { method: string; path: string }) => row.method === route.method && row.path === route.path);
  const account = rows.filter((row: { mode: string }) => row.mode === "accounts");
  const explicit = accessCases.filter((entry: { method: string; path: string }) => entry.method === route.method && entry.path === route.path);
  const statuses = (values: { status: number }[]) => [...new Set(values.map(row => row.status))].sort();
  return { method: route.method, path: route.path, authentication_class: route.access.authentication_class,
    account_statuses: statuses(account), legacy_statuses: statuses(rows.filter((row: { mode: string }) => row.mode === "legacy")),
    account_positive: account.some((row: { status: number }) => row.status >= 200 && row.status < 300) || explicit.some((entry: { own_status: number }) => entry.own_status >= 200 && entry.own_status < 300),
    account_denial: account.some((row: { status: number }) => [401, 403, 404].includes(row.status)) || explicit.some((entry: { foreign_status: number | null }) => entry.foreign_status !== null),
    explicit_access_cases: explicit,
    authorized_policy_case: explicit.length > 0 || account.some((row: { status: number }) => row.status >= 200 && row.status < 300),
  };
});
const missing = surfaces.filter((surface: { authorized_policy_case: boolean }) => !surface.authorized_policy_case);
const authentication = read("authentication-matrix.json");
const report = { source, contract: contract.version, registered_surfaces: surfaces.length,
  authentication, entities: read("entity-matrix.json"),
  account_positive_surfaces: surfaces.filter((surface: { account_positive: boolean }) => surface.account_positive).length,
  authorized_policy_surfaces: surfaces.length - missing.length, account_positive_missing: missing.map((surface: { method: string; path: string }) => `${surface.method} ${surface.path}`),
  native_completed: native.completed, native_planned: native.planned_lanes, native_executed: native.lanes.length,
  native_runtime_drift: nativeRuntimeDrift,
  cua: cua ? { passed: cua.pass, planned: cua.planned_checks, executed: cua.executed_checks, report: `cua/${cuaReports.at(-1)}` } : null,
  complete: native.completed === true && native.lanes.length === 4 && nativeRuntimeDrift.length === 0 && missing.length === 0 && authentication.tested === authentication.results.length && authentication.results.every((row: { unauthenticated_status: number }) => [401, 403].includes(row.unauthenticated_status)) && cua?.pass === true && cua.executed_checks === cua.planned_checks,
  limitations: ["Recorded HTTP statuses distinguish account and legacy modes; unobserved positive account cases are not inferred from legacy tests.", "Native/provider evidence does not establish web/Tauri UI, deployed HTTPS, fresh-device installation or production capacity."], surfaces,
};
writeFileSync(join(directory, "surface-matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(directory, "manifest.json"), `${JSON.stringify(source, null, 2)}\n`);
console.log(JSON.stringify({ registered: report.registered_surfaces, account_positive: report.account_positive_surfaces,
  missing_positive: missing.length, native_completed: native.completed, complete: report.complete }));
if (!report.complete) process.exitCode = 1;
