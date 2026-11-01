import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
const state = '.dev/nma061-native';
const { token } = await Bun.file(`${state}/installation.json`).json();
async function api(path: string, body?: unknown) {
 const response = await fetch(`http://127.0.0.1:8312${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: body ? JSON.stringify(body) : undefined });
 const value = await response.json(); if (!response.ok) throw new Error(`${path}: ${value.error?.code}`); return value;
}
const setup = await api('/v1/setup', {});
const agents = await api('/v1/entities/agent');
const tobi = agents.find((a: { id: string }) => a.id === setup.agent_id);
const prior = await Bun.file('.dev/nma060-gate-proof.json').json();
const source = prior.lanes.codex.input.connection_id;
mkdirSync(`${state}/connections/${tobi.connection_id}/codex`, { recursive: true, mode: 0o700 });
copyFileSync(`.dev/nma049-native/connections/${source}/codex/auth.json`, `${state}/connections/${tobi.connection_id}/codex/auth.json`);
const codex = await api(`/v1/connections/${tobi.connection_id}/inspect`, {});
const proof: Record<string, unknown> = { setup, codex };
if (process.env.MUSE_API_KEY) {
 const ref = crypto.randomUUID(); mkdirSync(`${state}/credentials`, { recursive: true, mode: 0o700 });
 writeFileSync(`${state}/credentials/${ref}`, process.env.MUSE_API_KEY, { mode: 0o600, flag: 'wx' });
 const connection = await api('/v1/connections', { harness: 'muse', authentication: { method: 'api_key', billing_source: 'api_key', credential_ref: ref } });
 proof.muse = await api(`/v1/connections/${connection.id}/inspect`, {}); proof.credential_ref = ref;
}
await Bun.write(`${state}/proof.json`, JSON.stringify(proof));
console.log(JSON.stringify({ codex_login: codex.login, codex_billing: codex.effective_billing_source, muse_available: !!proof.muse }));
