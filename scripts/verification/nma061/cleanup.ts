import { unlinkSync } from 'node:fs';
const state = '.dev/nma061-native';
const proof = await Bun.file(`${state}/proof.json`).json();
const { token } = await Bun.file(`${state}/installation.json`).json();
const results = [];
for (const connection of [proof.codex, proof.muse].filter(Boolean)) {
 const response = await fetch(`http://127.0.0.1:8312/v1/connections/${connection.id}/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() } });
 if (!response.ok) throw new Error('Proof connection revocation failed.');
 results.push({ harness: connection.harness, revoked: true });
}
if (proof.credential_ref) unlinkSync(`${state}/credentials/${proof.credential_ref}`);
unlinkSync(`${state}/connections/${proof.codex.id}/codex/auth.json`);
await Bun.write('docs/verification/nma-061/cleanup.json', JSON.stringify({ connections: results, copied_credentials_removed: true, original_credentials_untouched: true }, null, 2));
console.log('Revoked only the two proof connections and removed their credential copies.');
