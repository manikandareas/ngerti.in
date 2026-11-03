# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: work.spec.ts >> an unconfirmed human reply is restored verbatim and locked across reload
- Location: tests/work.spec.ts:1269:1

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 1
Received length: 2
Received array:  [{"agent_id": "57eff635-b9d7-4a8a-bb2e-c6cfe3a6aef8", "continuation_run_id": "b0b023a2-85d4-4ded-9821-6b22c5447fa5", "created_at": "2026-11-03T09:09:48.396Z", "id": "e2e83f0d-8943-4668-9338-7d1cd87d3d64", "kind": "human_request", "message_id": "c6d15bba-5183-47e6-8342-bfa46c564d38", "owner_id": "1863e1d7-a12b-4887-b0dd-e7cf714176f7", "purpose": "input", "response_message_id": "c88e95e3-6a38-462a-b4f2-d061ac57c85b", "revision": 3, "source_run_id": "b066d6c4-b71a-4497-bdaa-e65b0355702e", "state": "answered", "task_id": "6b63ab83-2df6-419f-adf8-8c955b2d32c3", "thread_id": "265982b3-8101-4622-82d0-1365b26b7b83", "updated_at": "2026-11-03T09:09:51.867Z"}, {"agent_id": "57eff635-b9d7-4a8a-bb2e-c6cfe3a6aef8", "continuation_run_id": null, "created_at": "2026-11-03T09:09:52.023Z", "id": "0b16212d-e5de-43bb-aca3-64e821316980", "kind": "human_request", "message_id": "4f48cc4c-e4a5-4aa1-bc17-f36f9ccde10a", "owner_id": "1863e1d7-a12b-4887-b0dd-e7cf714176f7", "purpose": "input", "response_message_id": null, "revision": 1, "source_run_id": "b0b023a2-85d4-4ded-9821-6b22c5447fa5", "state": "pending", "task_id": "6b63ab83-2df6-419f-adf8-8c955b2d32c3", "thread_id": "265982b3-8101-4622-82d0-1365b26b7b83", "updated_at": "2026-11-03T09:09:52.023Z"}]
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - generic [ref=f1e3]:
      - complementary [ref=f1e4]:
        - generic [ref=f1e5]:
          - generic [ref=f1e6]:
            - link "Ngertiin" [ref=f1e7] [cursor=pointer]:
              - /url: /
              - text: ngertiin.
            - button "Buat baru" [ref=f1e8] [cursor=pointer]
          - navigation "Percakapan" [ref=f1e9]:
            - button "Tobi Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation." [ref=f1e10] [cursor=pointer]:
              - generic [ref=f1e13]:
                - generic [ref=f1e14]: Tobi
                - generic "Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation." [ref=f1e15]
            - button "Inline files b636a2d9 Fixture ready" [ref=f1e16] [cursor=pointer]:
              - generic [ref=f1e19]:
                - generic [ref=f1e20]: Inline files b636a2d9
                - generic "Fixture ready" [ref=f1e21]
            - button "Inline files 066791be Fixture ready" [ref=f1e22] [cursor=pointer]:
              - generic [ref=f1e25]:
                - generic [ref=f1e26]: Inline files 066791be
                - generic "Fixture ready" [ref=f1e27]
            - button "Inline files 5c562c4b Fixture ready" [ref=f1e28] [cursor=pointer]:
              - generic [ref=f1e31]:
                - generic [ref=f1e32]: Inline files 5c562c4b
                - generic "Fixture ready" [ref=f1e33]
            - button "Inline files 6c52b357 Fixture ready" [ref=f1e34] [cursor=pointer]:
              - generic [ref=f1e37]:
                - generic [ref=f1e38]: Inline files 6c52b357
                - generic "Fixture ready" [ref=f1e39]
            - button "Inline files 336e6383 Fixture ready" [ref=f1e40] [cursor=pointer]:
              - generic [ref=f1e43]:
                - generic [ref=f1e44]: Inline files 336e6383
                - generic "Fixture ready" [ref=f1e45]
            - button "Inline files 2d9766f6 Fixture ready" [ref=f1e46] [cursor=pointer]:
              - generic [ref=f1e49]:
                - generic [ref=f1e50]: Inline files 2d9766f6
                - generic "Fixture ready" [ref=f1e51]
            - button "Inline files 19984106 Fixture ready" [ref=f1e52] [cursor=pointer]:
              - generic [ref=f1e55]:
                - generic [ref=f1e56]: Inline files 19984106
                - generic "Fixture ready" [ref=f1e57]
            - button "Inline files 67701dfc Fixture ready" [ref=f1e58] [cursor=pointer]:
              - generic [ref=f1e61]:
                - generic [ref=f1e62]: Inline files 67701dfc
                - generic "Fixture ready" [ref=f1e63]
            - button "Inline files 527b45c9 Fixture ready" [ref=f1e64] [cursor=pointer]:
              - generic [ref=f1e67]:
                - generic [ref=f1e68]: Inline files 527b45c9
                - generic "Fixture ready" [ref=f1e69]
            - button "Writer 7ea97c22 Fixture ready" [ref=f1e70] [cursor=pointer]:
              - generic [ref=f1e73]:
                - generic [ref=f1e74]: Writer 7ea97c22
                - generic "Fixture ready" [ref=f1e75]
            - button "Reviewer 12178299 Fixture ready" [ref=f1e76] [cursor=pointer]:
              - generic [ref=f1e79]:
                - generic [ref=f1e80]: Reviewer 12178299
                - generic "Fixture ready" [ref=f1e81]
            - 'button "Shared files a2cc4e2e Writer 7ea97c22: Fixture ready" [ref=f1e82] [cursor=pointer]':
              - generic [ref=f1e89]:
                - generic [ref=f1e90]: Shared files a2cc4e2e
                - 'generic "Writer 7ea97c22: Fixture ready" [ref=f1e91]'
            - button "Writer eeb2bf8a Fixture ready" [ref=f1e92] [cursor=pointer]:
              - generic [ref=f1e95]:
                - generic [ref=f1e96]: Writer eeb2bf8a
                - generic "Fixture ready" [ref=f1e97]
            - button "Reviewer 2faaf8d2 Fixture ready" [ref=f1e98] [cursor=pointer]:
              - generic [ref=f1e101]:
                - generic [ref=f1e102]: Reviewer 2faaf8d2
                - generic "Fixture ready" [ref=f1e103]
            - 'button "Shared files f51e8d91 Writer eeb2bf8a: Fixture ready" [ref=f1e104] [cursor=pointer]':
              - generic [ref=f1e111]:
                - generic [ref=f1e112]: Shared files f51e8d91
                - 'generic "Writer eeb2bf8a: Fixture ready" [ref=f1e113]'
            - button "Writer d808dfcf Fixture ready" [ref=f1e114] [cursor=pointer]:
              - generic [ref=f1e117]:
                - generic [ref=f1e118]: Writer d808dfcf
                - generic "Fixture ready" [ref=f1e119]
            - button "Reviewer edcda7e2 Fixture ready" [ref=f1e120] [cursor=pointer]:
              - generic [ref=f1e123]:
                - generic [ref=f1e124]: Reviewer edcda7e2
                - generic "Fixture ready" [ref=f1e125]
            - 'button "Shared files d4052469 Writer d808dfcf: Fixture ready" [ref=f1e126] [cursor=pointer]':
              - generic [ref=f1e133]:
                - generic [ref=f1e134]: Shared files d4052469
                - 'generic "Writer d808dfcf: Fixture ready" [ref=f1e135]'
            - button "Writer 31dde133 Fixture ready" [ref=f1e136] [cursor=pointer]:
              - generic [ref=f1e139]:
                - generic [ref=f1e140]: Writer 31dde133
                - generic "Fixture ready" [ref=f1e141]
            - button "Reviewer c8dcc7ce Fixture ready" [ref=f1e142] [cursor=pointer]:
              - generic [ref=f1e145]:
                - generic [ref=f1e146]: Reviewer c8dcc7ce
                - generic "Fixture ready" [ref=f1e147]
            - 'button "Shared files 41d9d6e8 Writer 31dde133: Fixture ready" [ref=f1e148] [cursor=pointer]':
              - generic [ref=f1e155]:
                - generic [ref=f1e156]: Shared files 41d9d6e8
                - 'generic "Writer 31dde133: Fixture ready" [ref=f1e157]'
            - button "Writer 711e80b5 Fixture ready" [ref=f1e158] [cursor=pointer]:
              - generic [ref=f1e161]:
                - generic [ref=f1e162]: Writer 711e80b5
                - generic "Fixture ready" [ref=f1e163]
            - button "Reviewer 25bb8548 Fixture ready" [ref=f1e164] [cursor=pointer]:
              - generic [ref=f1e167]:
                - generic [ref=f1e168]: Reviewer 25bb8548
                - generic "Fixture ready" [ref=f1e169]
            - 'button "Shared files 2f96acf8 Reviewer 25bb8548: Fixture ready" [ref=f1e170] [cursor=pointer]':
              - generic [ref=f1e177]:
                - generic [ref=f1e178]: Shared files 2f96acf8
                - 'generic "Reviewer 25bb8548: Fixture ready" [ref=f1e179]'
            - 'button "Campaign team 70896 Campaign reviewer 839ed: The reviewed example is ready. @user please check the file." [ref=f1e180] [cursor=pointer]':
              - generic [ref=f1e187]:
                - generic [ref=f1e188]: Campaign team 70896
                - 'generic "Campaign reviewer 839ed: The reviewed example is ready. @user please check the file." [ref=f1e189]'
            - button "Worldwide Clam Agent belum siap" [ref=f1e190] [cursor=pointer]:
              - generic [ref=f1e193]:
                - generic [ref=f1e194]: Worldwide Clam
                - generic "Agent belum siap" [ref=f1e195]
            - button "Broken Gayal Agent belum siap" [ref=f1e196] [cursor=pointer]:
              - generic [ref=f1e199]:
                - generic [ref=f1e200]: Broken Gayal
                - generic "Agent belum siap" [ref=f1e201]
            - button "Written Quail Agent belum siap" [ref=f1e202] [cursor=pointer]:
              - generic [ref=f1e205]:
                - generic [ref=f1e206]: Written Quail
                - generic "Agent belum siap" [ref=f1e207]
            - button "Marxist Elk Agent belum siap" [ref=f1e208] [cursor=pointer]:
              - generic [ref=f1e211]:
                - generic [ref=f1e212]: Marxist Elk
                - generic "Agent belum siap" [ref=f1e213]
            - button "Like Seahorse Agent belum siap" [ref=f1e214] [cursor=pointer]:
              - generic [ref=f1e217]:
                - generic [ref=f1e218]: Like Seahorse
                - generic "Agent belum siap" [ref=f1e219]
            - button "Yappy Cat Agent belum siap" [ref=f1e220] [cursor=pointer]:
              - generic [ref=f1e223]:
                - generic [ref=f1e224]: Yappy Cat
                - generic "Agent belum siap" [ref=f1e225]
            - 'button "Research circle Kamu: Find a useful research direction." [ref=f1e226] [cursor=pointer]':
              - generic [ref=f1e233]:
                - generic [ref=f1e234]: Research circle
                - 'generic "Kamu: Find a useful research direction." [ref=f1e235]'
            - button "Scattered Panther Agent belum siap" [ref=f1e236] [cursor=pointer]:
              - generic [ref=f1e239]:
                - generic [ref=f1e240]: Scattered Panther
                - generic "Agent belum siap" [ref=f1e241]
            - button "Clear Mollusk Agent belum siap" [ref=f1e242] [cursor=pointer]:
              - generic [ref=f1e245]:
                - generic [ref=f1e246]: Clear Mollusk
                - generic "Agent belum siap" [ref=f1e247]
            - button "Ok Bug Fixture ready" [ref=f1e248] [cursor=pointer]:
              - generic [ref=f1e251]:
                - generic [ref=f1e252]: Ok Bug
                - generic "Fixture ready" [ref=f1e253]
            - button "Wooden Porcupine Agent belum siap" [ref=f1e254] [cursor=pointer]:
              - generic [ref=f1e257]:
                - generic [ref=f1e258]: Wooden Porcupine
                - generic "Agent belum siap" [ref=f1e259]
            - button "Satisfied Leech Agent belum siap" [ref=f1e260] [cursor=pointer]:
              - generic [ref=f1e263]:
                - generic [ref=f1e264]: Satisfied Leech
                - generic "Agent belum siap" [ref=f1e265]
            - button "Adorable Rhinoceros Agent belum siap" [ref=f1e266] [cursor=pointer]:
              - generic [ref=f1e269]:
                - generic [ref=f1e270]: Adorable Rhinoceros
                - generic "Agent belum siap" [ref=f1e271]
            - button "Native tool activity 3c0a6124 Fixture ready" [ref=f1e272] [cursor=pointer]:
              - generic [ref=f1e275]:
                - generic [ref=f1e276]: Native tool activity 3c0a6124
                - generic "Fixture ready" [ref=f1e277]
            - button "Native fixture ea6e4bf9 Before the question. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This f" [ref=f1e278] [cursor=pointer]:
              - generic [ref=f1e281]:
                - generic [ref=f1e282]: Native fixture ea6e4bf9
                - generic "Before the question. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This f" [ref=f1e283]
            - 'button "Unknown acknowledgement 144234a4 Kamu: fixture interaction unknown" [ref=f1e284] [cursor=pointer]':
              - generic [ref=f1e287]:
                - generic [ref=f1e288]: Unknown acknowledgement 144234a4
                - 'generic "Kamu: fixture interaction unknown" [ref=f1e289]'
            - button "Markdown anchor boundary 09d7aaf3 Before the question. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This f" [ref=f1e290] [cursor=pointer]:
              - generic [ref=f1e293]:
                - generic [ref=f1e294]: Markdown anchor boundary 09d7aaf3
                - generic "Before the question. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This fixture introduction stays local and performs no external action. This f" [ref=f1e295]
            - button "Established Tapir Agent belum siap" [ref=f1e296] [cursor=pointer]:
              - generic [ref=f1e299]:
                - generic [ref=f1e300]: Established Tapir
                - generic "Agent belum siap" [ref=f1e301]
            - button "Xeric Shrimp Agent belum siap" [ref=f1e302] [cursor=pointer]:
              - generic [ref=f1e305]:
                - generic [ref=f1e306]: Xeric Shrimp
                - generic "Agent belum siap" [ref=f1e307]
            - 'button "Keep this group draft Kamu: Help me get started with what you can do. Ask one useful question if you need context." [ref=f1e308] [cursor=pointer]':
              - generic [ref=f1e313]:
                - generic [ref=f1e314]: Keep this group draft
                - 'generic "Kamu: Help me get started with what you can do. Ask one useful question if you need context." [ref=f1e315]'
            - button "Zeroth Owl Agent belum siap" [ref=f1e316] [cursor=pointer]:
              - generic [ref=f1e319]:
                - generic [ref=f1e320]: Zeroth Owl
                - generic "Agent belum siap" [ref=f1e321]
            - button "Warm Swan Agent belum siap" [ref=f1e322] [cursor=pointer]:
              - generic [ref=f1e325]:
                - generic [ref=f1e326]: Warm Swan
                - generic "Agent belum siap" [ref=f1e327]
            - 'button "Concurrent bede6104 Second lane 374a1be3: Fixture answer: Plain summary; approval: allow-once" [ref=f1e328] [cursor=pointer]':
              - generic [ref=f1e335]:
                - generic [ref=f1e336]: Concurrent bede6104
                - 'generic "Second lane 374a1be3: Fixture answer: Plain summary; approval: allow-once" [ref=f1e337]'
            - 'button "Human 29646005 Human request 51714eda: Menunggu kamu" [ref=f1e338] [cursor=pointer]':
              - generic [ref=f1e343]:
                - generic [ref=f1e344]: Human 29646005
                - 'generic "Human request 51714eda: Menunggu kamu" [ref=f1e345]'
          - generic [ref=f1e347]:
            - button "Pengaturan" [ref=f1e348] [cursor=pointer]
            - button "Hubungkan aplikasi" [ref=f1e349] [cursor=pointer]
      - main "Percakapan aktif" [ref=f1e350]:
        - generic:
          - button "Detail Human 29646005" [ref=f1e351] [cursor=pointer]:
            - generic [ref=f1e356]: Human 29646005
          - generic:
            - button "Routing otomatis" [ref=f1e357] [cursor=pointer]
            - button "Browser agent" [ref=f1e358] [cursor=pointer]
        - log [ref=f1e359]:
          - generic [ref=f1e361]:
            - generic [ref=f1e363]:
              - generic [ref=f1e364]: Kamu
              - generic [ref=f1e366]:
                - generic [ref=f1e367]: fixture human
                - time [ref=f1e368]: "17.09"
            - generic [ref=f1e369]:
              - button "Profil Human request 51714eda" [ref=f1e370] [cursor=pointer]
              - generic [ref=f1e388]:
                - generic [ref=f1e391]:
                  - button "Human request 51714eda" [ref=f1e392] [cursor=pointer]
                  - paragraph [ref=f1e394]: Which fixture report format?
                  - time [ref=f1e395]: "17.09"
                - paragraph [ref=f1e396]: Jawaban tersimpan untuk permintaan ini.
            - generic [ref=f1e399]:
              - button "Profil Human request 51714eda" [ref=f1e400] [cursor=pointer]
              - generic [ref=f1e421]:
                - button "Human request 51714eda" [ref=f1e422] [cursor=pointer]
                - paragraph [ref=f1e424]: Fixture ready
                - time [ref=f1e425]: "17.09"
            - generic [ref=f1e427]:
              - generic [ref=f1e428]: Kamu
              - generic [ref=f1e430]:
                - generic [ref=f1e431]: Keep this exact answer.
                - time [ref=f1e432]: "17.09"
            - generic [ref=f1e433]:
              - button "Profil Human request 51714eda" [ref=f1e434] [cursor=pointer]
              - generic [ref=f1e452]:
                - generic [ref=f1e455]:
                  - button "Human request 51714eda" [ref=f1e456] [cursor=pointer]
                  - paragraph [ref=f1e458]: Which fixture report format?
                  - time [ref=f1e459]: "17.09"
                - generic [ref=f1e460]:
                  - paragraph [ref=f1e461]:
                    - generic "Human request 51714eda" [ref=f1e462]
                    - text: · Menunggu jawaban kamu
                  - textbox "Jawaban untuk Human request 51714eda" [ref=f1e481]:
                    - /placeholder: Jawaban untuk pertanyaan ini…
                  - generic [ref=f1e482]:
                    - button "Kirim jawaban" [disabled]
            - generic [ref=f1e483]:
              - button "Profil Human request 51714eda" [ref=f1e484] [cursor=pointer]
              - generic [ref=f1e505]:
                - button "Human request 51714eda" [ref=f1e506] [cursor=pointer]
                - paragraph [ref=f1e508]: Fixture ready
                - time [ref=f1e509]: "17.09"
        - generic [ref=f1e510]:
          - button "Lampirkan file ke pesan" [ref=f1e511]
          - button "Tambah lampiran" [ref=f1e512] [cursor=pointer]
          - generic [ref=f1e513]:
            - textbox "Pesan" [ref=f1e514]:
              - paragraph [ref=f1e515]
            - generic [aria-hidden]: Pesan untuk Human request 51714eda…
          - generic [ref=f1e517]:
            - button "Kirim" [disabled]
    - region "Notifications alt+T"
  - listbox "Typeahead menu"
```

# Test source

```ts
  1195 |   return post(page, "/v1/agents", {
  1196 |     name: `${prefix} ${crypto.randomUUID().slice(0, 8)}`,
  1197 |     harness: "codex",
  1198 |     connection_id: connection.id,
  1199 |     model_id: "fixture",
  1200 |     billing_source: "subscription",
  1201 |   });
  1202 | }
  1203 | async function chooseGroup(page: Page, name: string) {
  1204 |   const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  1205 |   if (await open.isVisible()) await open.click();
  1206 |   await page
  1207 |     .getByRole("navigation", { name: "Percakapan", exact: true })
  1208 |     .getByRole("button")
  1209 |     .filter({ has: page.getByText(name, { exact: true }) })
  1210 |     .click();
  1211 |   await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
  1212 | }
  1213 | 
  1214 | test("group writers serialize native questions and free text uses one answer representation", async ({
  1215 |   page,
  1216 | }) => {
  1217 |   test.setTimeout(60000);
  1218 |   await page.goto("/");
  1219 |   await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  1220 |   const a = await fixtureAgent(page, "First lane");
  1221 |   const b = await fixtureAgent(page, "Second lane");
  1222 |   const group = await newGroup(page, `Concurrent ${crypto.randomUUID().slice(0, 8)}`, [a.id, b.id]);
  1223 |   await post(page, `/v1/groups/${group.id}/messages`, {
  1224 |     agent_id: a.id,
  1225 |     text: "fixture interaction",
  1226 |   });
  1227 |   await post(page, `/v1/groups/${group.id}/messages`, {
  1228 |     agent_id: b.id,
  1229 |     text: "fixture interaction multiple",
  1230 |   });
  1231 |   await chooseGroup(page, group.name);
  1232 |   const first = page.getByRole("region", { name: `Permintaan native ${a.name}`, exact: true });
  1233 |   const second = page.getByRole("region", { name: `Permintaan native ${b.name}`, exact: true });
  1234 |   await expect(
  1235 |     first.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  1236 |   ).toBeVisible({ timeout: 20000 });
  1237 |   await expect(
  1238 |     second.getByRole("checkbox", { name: "Markdown A concise report", exact: true }),
  1239 |   ).toHaveCount(0);
  1240 |   const held = await (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
  1241 |   expect(
  1242 |     held.runs.some(
  1243 |       (run: { agent_id: string; status: string }) =>
  1244 |         run.agent_id === b.id && run.status === "queued",
  1245 |     ),
  1246 |   ).toBeTruthy();
  1247 |   await page.getByRole("button", { name: `Stop ${a.name}`, exact: true }).click();
  1248 |   await expect(
  1249 |     first.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  1250 |   ).toHaveCount(0);
  1251 |   await expect(
  1252 |     page.getByText("Run dihentikan; jawaban native tidak tercatat", { exact: true }).first(),
  1253 |   ).toBeVisible();
  1254 |   await expect(
  1255 |     second.getByRole("checkbox", { name: "Markdown A concise report", exact: true }),
  1256 |   ).toBeVisible({ timeout: 20000 });
  1257 |   expect(
  1258 |     await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  1259 |   ).toBeTruthy();
  1260 |   await second.getByRole("checkbox", { name: "Markdown A concise report", exact: true }).click();
  1261 |   await second.getByRole("textbox", { name: "Jawaban: Format", exact: true }).fill("Plain summary");
  1262 |   await second.getByRole("button", { name: "Kirim jawaban ke harness", exact: true }).click();
  1263 |   await second.getByRole("button", { name: "Allow this read", exact: true }).click();
  1264 |   await expect(
  1265 |     page.getByText("Fixture answer: Plain summary; approval: allow-once", { exact: true }),
  1266 |   ).toBeVisible();
  1267 | });
  1268 | 
  1269 | test("an unconfirmed human reply is restored verbatim and locked across reload", async ({
  1270 |   page,
  1271 | }) => {
  1272 |   await page.goto("/");
  1273 |   await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  1274 |   const agent = await fixtureAgent(page, "Human request");
  1275 |   const group = await newGroup(page, `Human ${crypto.randomUUID().slice(0, 8)}`, [agent.id]);
  1276 |   await post(page, `/v1/groups/${group.id}/messages`, {
  1277 |     agent_id: agent.id,
  1278 |     text: "fixture human",
  1279 |   });
  1280 |   await chooseGroup(page, group.name);
  1281 |   const input = page.getByRole("textbox", { name: `Jawaban untuk ${agent.name}`, exact: true });
  1282 |   await input.fill("Keep this exact answer.");
  1283 |   await page.route("**/v1/human-requests/*/reply", (route) => route.abort("failed"));
  1284 |   await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  1285 |   await expect(page.getByRole("button", { name: "Periksa jawaban", exact: true })).toBeVisible();
  1286 |   await page.unroute("**/v1/human-requests/*/reply");
  1287 |   await page.reload();
  1288 |   await expect(input).toHaveValue("Keep this exact answer.");
  1289 |   await expect(input).not.toBeEditable();
  1290 |   await page.getByRole("button", { name: "Periksa jawaban", exact: true }).click();
  1291 |   await expect(
  1292 |     page.getByText("Jawaban tersimpan untuk permintaan ini.", { exact: true }),
  1293 |   ).toBeVisible();
  1294 |   const snapshot = await (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
> 1295 |   expect(snapshot.human_requests).toHaveLength(1);
       |                                   ^ Error: expect(received).toHaveLength(expected)
  1296 |   expect(snapshot.human_requests[0].state).toBe("answered");
  1297 |   expect(
  1298 |     snapshot.messages.filter(
  1299 |       (m: { purpose: string; text: string }) =>
  1300 |         m.purpose === "human_reply" && m.text === "Keep this exact answer.",
  1301 |     ),
  1302 |   ).toHaveLength(1);
  1303 | });
  1304 | 
  1305 | test("membership editing keeps its original revision and cannot overwrite a concurrent change", async ({
  1306 |   page,
  1307 | }) => {
  1308 |   const { a, b } = await start(page);
  1309 |   const group = await newGroup(page, `Membership ${crypto.randomUUID().slice(0, 8)}`, [
  1310 |     a.agent.id,
  1311 |     b.agent.id,
  1312 |   ]);
  1313 |   await chooseGroup(page, group.name);
  1314 |   await page.getByRole("button", { name: `Detail ${group.name}`, exact: true }).click();
  1315 |   await page.getByText("Kelola anggota", { exact: true }).click();
  1316 |   await post(page, `/v1/groups/${group.id}/membership`, {
  1317 |     expected_revision: group.revision,
  1318 |     member_agent_ids: [a.agent.id],
  1319 |   });
  1320 |   await expect(page.getByRole("heading", { name: "Anggota · 1", exact: true })).toBeVisible();
  1321 |   const response = page.waitForResponse(
  1322 |     (r) => r.url().endsWith(`/v1/groups/${group.id}/membership`) && r.request().method() === "POST",
  1323 |   );
  1324 |   await page.getByRole("button", { name: "Simpan anggota", exact: true }).click();
  1325 |   expect((await response).status()).toBe(409);
  1326 |   const snapshot = await (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
  1327 |   expect(snapshot.thread.member_agent_ids).toEqual([a.agent.id]);
  1328 |   await page.getByRole("button", { name: "Muat anggota terbaru", exact: true }).click();
  1329 |   await expect(
  1330 |     page.getByRole("checkbox", { name: `Anggota ${b.agent.name}`, exact: true }),
  1331 |   ).not.toBeChecked();
  1332 | });
  1333 | 
  1334 | test("four ordinary file attachments still allow a supported image", async ({ page }) => {
  1335 |   await page.goto("/");
  1336 |   await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  1337 |   const agent = await fixtureAgent(page, "Attachment count");
  1338 |   await post(page, `/v1/agents/${agent.id}/dm`, {});
  1339 |   await chooseAgent(page, agent.name);
  1340 |   await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("fixture warmup");
  1341 |   await page.getByRole("button", { name: "Kirim", exact: true }).click();
  1342 |   await expect(
  1343 |     page
  1344 |       .getByRole("main", { name: "Percakapan aktif" })
  1345 |       .getByText("Fixture ready", { exact: true }),
  1346 |   ).toBeVisible({ timeout: 20000 });
  1347 |   for (let i = 0; i < 4; i++) {
  1348 |     await expect(page.getByRole("button", { name: "Tambah lampiran", exact: true })).toBeEnabled();
  1349 |     await page.getByLabel("Lampirkan file ke pesan", { exact: true }).setInputFiles({
  1350 |       name: `notes-${i}.txt`,
  1351 |       mimeType: "text/plain",
  1352 |       buffer: Buffer.from(`Notes ${i}`),
  1353 |     });
  1354 |     await expect(
  1355 |       page.getByRole("button", { name: `Hapus lampiran notes-${i}.txt`, exact: true }),
  1356 |     ).toBeVisible();
  1357 |   }
  1358 |   await expect(page.getByRole("button", { name: "Tambah lampiran", exact: true })).toBeEnabled();
  1359 |   await page
  1360 |     .getByLabel("Lampirkan file ke pesan", { exact: true })
  1361 |     .setInputFiles("../../docs/verification/nma-059/visual-input.png");
  1362 |   await expect(
  1363 |     page.getByRole("button", { name: "Hapus lampiran visual-input.png", exact: true }),
  1364 |   ).toBeVisible();
  1365 | });
  1366 | 
  1367 | async function newGroup(page: Page, name: string, ids: string[]) {
  1368 |   const thread = await post(page, "/v1/threads", { type: "group", member_agent_ids: ids });
  1369 |   return post(page, `/v1/groups/${thread.id}/configuration`, {
  1370 |     expected_revision: thread.revision,
  1371 |     changes: { name },
  1372 |   });
  1373 | }
  1374 | 
```