# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: work.spec.ts >> browser viewer connects to the managed browser and reconnects its view without replaying actions
- Location: tests/work.spec.ts:431:1

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: apiRequestContext.post: Test timeout of 180000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - complementary [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]:
            - link "Ngertiin" [ref=e7] [cursor=pointer]:
              - /url: /
              - text: ngertiin.
            - button "Buat baru" [ref=e8] [cursor=pointer]
          - navigation "Percakapan" [ref=e9]:
            - button "Tobi Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation." [ref=e10] [cursor=pointer]:
              - generic [ref=e13]:
                - generic [ref=e14]: Tobi
                - generic "Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation." [ref=e15]
            - button "Inline files 5afd9b6e Fixture ready" [ref=e16] [cursor=pointer]:
              - generic [ref=e19]:
                - generic [ref=e20]: Inline files 5afd9b6e
                - generic "Fixture ready" [ref=e21]
            - button "Inline files 27d0384f Fixture ready" [ref=e22] [cursor=pointer]:
              - generic [ref=e25]:
                - generic [ref=e26]: Inline files 27d0384f
                - generic "Fixture ready" [ref=e27]
            - button "Inline files dddced81 Fixture ready" [ref=e28] [cursor=pointer]:
              - generic [ref=e31]:
                - generic [ref=e32]: Inline files dddced81
                - generic "Fixture ready" [ref=e33]
            - button "Inline files 7a0987a1 Fixture ready" [ref=e34] [cursor=pointer]:
              - generic [ref=e37]:
                - generic [ref=e38]: Inline files 7a0987a1
                - generic "Fixture ready" [ref=e39]
            - button "Inline files 909b032d Fixture ready" [ref=e40] [cursor=pointer]:
              - generic [ref=e43]:
                - generic [ref=e44]: Inline files 909b032d
                - generic "Fixture ready" [ref=e45]
            - button "Inline files c9c5820c Fixture ready" [ref=e46] [cursor=pointer]:
              - generic [ref=e49]:
                - generic [ref=e50]: Inline files c9c5820c
                - generic "Fixture ready" [ref=e51]
            - button "Inline files 8c4d4701 Fixture ready" [ref=e52] [cursor=pointer]:
              - generic [ref=e55]:
                - generic [ref=e56]: Inline files 8c4d4701
                - generic "Fixture ready" [ref=e57]
            - button "Inline files 36feb4d1 Fixture ready" [ref=e58] [cursor=pointer]:
              - generic [ref=e61]:
                - generic [ref=e62]: Inline files 36feb4d1
                - generic "Fixture ready" [ref=e63]
            - button "Inline files f6f73c35 Fixture ready" [ref=e64] [cursor=pointer]:
              - generic [ref=e67]:
                - generic [ref=e68]: Inline files f6f73c35
                - generic "Fixture ready" [ref=e69]
            - button "Writer dc039e7c Fixture ready" [ref=e70] [cursor=pointer]:
              - generic [ref=e73]:
                - generic [ref=e74]: Writer dc039e7c
                - generic "Fixture ready" [ref=e75]
            - button "Reviewer a4115cbb Fixture ready" [ref=e76] [cursor=pointer]:
              - generic [ref=e79]:
                - generic [ref=e80]: Reviewer a4115cbb
                - generic "Fixture ready" [ref=e81]
            - 'button "Shared files d7bb5ab9 Writer dc039e7c: Fixture ready" [ref=e82] [cursor=pointer]':
              - generic [ref=e89]:
                - generic [ref=e90]: Shared files d7bb5ab9
                - 'generic "Writer dc039e7c: Fixture ready" [ref=e91]'
            - button "Writer 4ea34621 Fixture ready" [ref=e92] [cursor=pointer]:
              - generic [ref=e95]:
                - generic [ref=e96]: Writer 4ea34621
                - generic "Fixture ready" [ref=e97]
            - button "Reviewer 0efe8747 Fixture ready" [ref=e98] [cursor=pointer]:
              - generic [ref=e101]:
                - generic [ref=e102]: Reviewer 0efe8747
                - generic "Fixture ready" [ref=e103]
            - 'button "Shared files 0cbf4bf8 Writer 4ea34621: Fixture ready" [ref=e104] [cursor=pointer]':
              - generic [ref=e111]:
                - generic [ref=e112]: Shared files 0cbf4bf8
                - 'generic "Writer 4ea34621: Fixture ready" [ref=e113]'
            - button "Writer 2349b267 Fixture ready" [ref=e114] [cursor=pointer]:
              - generic [ref=e117]:
                - generic [ref=e118]: Writer 2349b267
                - generic "Fixture ready" [ref=e119]
            - button "Reviewer 19406a6d Fixture ready" [ref=e120] [cursor=pointer]:
              - generic [ref=e123]:
                - generic [ref=e124]: Reviewer 19406a6d
                - generic "Fixture ready" [ref=e125]
            - 'button "Shared files 785dea39 Writer 2349b267: Fixture ready" [ref=e126] [cursor=pointer]':
              - generic [ref=e133]:
                - generic [ref=e134]: Shared files 785dea39
                - 'generic "Writer 2349b267: Fixture ready" [ref=e135]'
            - button "Writer 14ec88db Fixture ready" [ref=e136] [cursor=pointer]:
              - generic [ref=e139]:
                - generic [ref=e140]: Writer 14ec88db
                - generic "Fixture ready" [ref=e141]
            - button "Reviewer 12ba4545 Fixture ready" [ref=e142] [cursor=pointer]:
              - generic [ref=e145]:
                - generic [ref=e146]: Reviewer 12ba4545
                - generic "Fixture ready" [ref=e147]
            - 'button "Shared files 7de0d906 Writer 14ec88db: Fixture ready" [ref=e148] [cursor=pointer]':
              - generic [ref=e155]:
                - generic [ref=e156]: Shared files 7de0d906
                - 'generic "Writer 14ec88db: Fixture ready" [ref=e157]'
            - button "Writer e8f731b0 Fixture ready" [ref=e158] [cursor=pointer]:
              - generic [ref=e161]:
                - generic [ref=e162]: Writer e8f731b0
                - generic "Fixture ready" [ref=e163]
            - button "Reviewer 70f3f0e6 Fixture ready" [ref=e164] [cursor=pointer]:
              - generic [ref=e167]:
                - generic [ref=e168]: Reviewer 70f3f0e6
                - generic "Fixture ready" [ref=e169]
            - 'button "Shared files 23d8ec18 Reviewer 70f3f0e6: Fixture ready" [ref=e170] [cursor=pointer]':
              - generic [ref=e177]:
                - generic [ref=e178]: Shared files 23d8ec18
                - 'generic "Reviewer 70f3f0e6: Fixture ready" [ref=e179]'
            - 'button "Campaign team 510b9 Campaign reviewer e02f9: The reviewed example is ready. @user please check the file." [ref=e180] [cursor=pointer]':
              - generic [ref=e187]:
                - generic [ref=e188]: Campaign team 510b9
                - 'generic "Campaign reviewer e02f9: The reviewed example is ready. @user please check the file." [ref=e189]'
            - button "Patient Krill Agent belum siap" [ref=e190] [cursor=pointer]:
              - generic [ref=e193]:
                - generic [ref=e194]: Patient Krill
                - generic "Agent belum siap" [ref=e195]
            - button "Intelligent Panther Agent belum siap" [ref=e196] [cursor=pointer]:
              - generic [ref=e199]:
                - generic [ref=e200]: Intelligent Panther
                - generic "Agent belum siap" [ref=e201]
            - button "Quaint Felidae Agent belum siap" [ref=e202] [cursor=pointer]:
              - generic [ref=e205]:
                - generic [ref=e206]: Quaint Felidae
                - generic "Agent belum siap" [ref=e207]
            - button "Willing Macaw Agent belum siap" [ref=e208] [cursor=pointer]:
              - generic [ref=e211]:
                - generic [ref=e212]: Willing Macaw
                - generic "Agent belum siap" [ref=e213]
            - button "Creepy Gopher Agent belum siap" [ref=e214] [cursor=pointer]:
              - generic [ref=e217]:
                - generic [ref=e218]: Creepy Gopher
                - generic "Agent belum siap" [ref=e219]
            - button "Structural Shrimp Agent belum siap" [ref=e220] [cursor=pointer]:
              - generic [ref=e223]:
                - generic [ref=e224]: Structural Shrimp
                - generic "Agent belum siap" [ref=e225]
            - 'button "Research circle Kamu: Find a useful research direction." [ref=e226] [cursor=pointer]':
              - generic [ref=e233]:
                - generic [ref=e234]: Research circle
                - 'generic "Kamu: Find a useful research direction." [ref=e235]'
            - button "Following Manatee Agent belum siap" [ref=e236] [cursor=pointer]:
              - generic [ref=e239]:
                - generic [ref=e240]: Following Manatee
                - generic "Agent belum siap" [ref=e241]
            - button "Delighted Goose Agent belum siap" [ref=e242] [cursor=pointer]:
              - generic [ref=e245]:
                - generic [ref=e246]: Delighted Goose
                - generic "Agent belum siap" [ref=e247]
          - generic [ref=e249]:
            - button "Pengaturan" [ref=e250] [cursor=pointer]
            - button "Hubungkan aplikasi" [ref=e251] [cursor=pointer]
      - main "Percakapan aktif" [ref=e252]:
        - generic:
          - button "Detail Following Manatee" [expanded] [ref=e253] [cursor=pointer]:
            - generic [ref=e256]: Following Manatee
          - generic:
            - button "Pilih model" [ref=e257] [cursor=pointer]
            - button "Browser agent" [ref=e262] [cursor=pointer]
        - log [ref=e263]:
          - generic [ref=e267]:
            - generic [ref=e268]: Kamu
            - generic [ref=e270]:
              - generic [ref=e271]: Help me get started with what you can do. Ask one useful question if you need context.
              - time [ref=e272]: "16.58"
            - generic [ref=e273]:
              - generic [ref=e274]: Agent belum siap
              - generic [ref=e276]:
                - paragraph [ref=e277]: Hasil pengiriman belum diketahui. Jangan kirim ulang; periksa status.
                - button "Coba hubungkan lagi" [ref=e278] [cursor=pointer]
                - button "Periksa pengaturan" [ref=e279] [cursor=pointer]
                - group [ref=e280]:
                  - generic "Detail masalah" [ref=e281] [cursor=pointer]
        - generic:
          - button "Siapkan koneksi agar Following Manatee bisa mulai bekerja →" [ref=e282] [cursor=pointer]
          - generic [ref=e283]:
            - button "Lampirkan file ke pesan" [ref=e284]
            - button "Tambah lampiran" [ref=e285] [cursor=pointer]
            - generic [ref=e286]:
              - textbox "Pesan" [ref=e287]:
                - paragraph [ref=e288]
              - generic [aria-hidden]: Pesan untuk Following Manatee…
            - generic [ref=e290]:
              - button "Kirim" [disabled]
      - complementary "Detail percakapan" [ref=e291]:
        - button "Tutup detail" [ref=e293] [cursor=pointer]
        - generic [ref=e294]:
          - generic [ref=e295]:
            - generic [ref=e296]:
              - button "Sapa Following Manatee" [ref=e297] [cursor=pointer]
              - heading "Following Manatee" [level=2] [ref=e314]
            - tablist "Detail sesuai konteks" [ref=e315]:
              - tab "Detail" [ref=e316] [cursor=pointer]
              - tab "Library" [ref=e317] [cursor=pointer]
              - tab "Computer" [selected] [ref=e318] [cursor=pointer]
          - tabpanel "Computer" [ref=e319]:
            - generic [ref=e321]:
              - generic [ref=e322]:
                - button "Lihat tampilan browser Following Manatee" [ref=e323] [cursor=pointer]:
                  - generic [ref=e342]: Browser belum dibuka
                  - generic [aria-hidden] [ref=e343]: Lihat
                - paragraph [ref=e347]: Buka tampilan untuk melihat browser agent
              - generic [ref=e348]:
                - heading "Profil browser" [level=3] [ref=e350]
                - generic [ref=e352]:
                  - generic [ref=e356]:
                    - paragraph [ref=e357]: Browser percakapan
                    - paragraph [ref=e358]: Belum dibuka
                  - button "Lihat browser" [ref=e359] [cursor=pointer]
    - region "Notifications alt+T"
  - listbox "Typeahead menu"
```

# Test source

```ts
  1   | import { createHash } from "node:crypto";
  2   | import { expect, type Page, test } from "@playwright/test";
  3   | 
  4   | async function post(page: Page, path: string, data: unknown) {
> 5   |   const response = await page.request.post(path, {
      |                                       ^ Error: apiRequestContext.post: Test timeout of 180000ms exceeded.
  6   |     headers: { "Idempotency-Key": crypto.randomUUID() },
  7   |     data,
  8   |   });
  9   |   expect(response.ok(), await response.text()).toBeTruthy();
  10  |   return response.json();
  11  | }
  12  | async function capture(page: Page, path: string) {
  13  |   await page
  14  |     .locator('[data-slot="sheet-content"], [data-slot="dialog-content"]')
  15  |     .evaluateAll(async (surfaces) => {
  16  |       const animations = surfaces
  17  |         .flatMap((surface) => surface.getAnimations())
  18  |         .filter((animation) =>
  19  |           Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
  20  |         );
  21  |       await Promise.allSettled(animations.map((animation) => animation.finished));
  22  |     });
  23  |   await page.screenshot({ path });
  24  | }
  25  | async function expectNativeReceiptOrder(page: Page, ids: string[]) {
  26  |   expect(
  27  |     await page.evaluate((expected) => {
  28  |       const user = [...document.querySelectorAll(".chat-user-bubble [data-message-text]")].find(
  29  |         (element) => element.textContent?.trim() === "fixture interaction preface",
  30  |       );
  31  |       const preface = [...document.querySelectorAll("p")].find(
  32  |         (element) => element.textContent === "Before the question.",
  33  |       );
  34  |       const reply = [...document.querySelectorAll("p")].find(
  35  |         (element) => element.textContent === "Fixture answer: Markdown; approval: allow-once",
  36  |       );
  37  |       return expected.every((id) => {
  38  |         const card = document.querySelector(`[data-native-interaction="${id}"]`);
  39  |         return (
  40  |           user &&
  41  |           preface &&
  42  |           reply &&
  43  |           card &&
  44  |           !!(user.compareDocumentPosition(preface) & Node.DOCUMENT_POSITION_FOLLOWING) &&
  45  |           !!(preface.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) &&
  46  |           !!(card.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING)
  47  |         );
  48  |       });
  49  |     }, ids),
  50  |   ).toBeTruthy();
  51  | }
  52  | async function start(page: Page) {
  53  |   await page.goto("/");
  54  |   await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  55  |   const a = await post(page, "/v1/creation/agents", {
  56  |     connection_id: null,
  57  |     harness: "codex",
  58  |     model_id: null,
  59  |     billing_source: "subscription",
  60  |   });
  61  |   const b = await post(page, "/v1/creation/agents", {
  62  |     connection_id: null,
  63  |     harness: "codex",
  64  |     model_id: null,
  65  |     billing_source: "subscription",
  66  |   });
  67  |   return { a, b };
  68  | }
  69  | async function menu(page: Page) {
  70  |   const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  71  |   if (await open.isVisible()) await open.click();
  72  |   await page.getByRole("button", { name: "Buat baru", exact: true }).click();
  73  |   await page.getByRole("button", { name: "Create group", exact: true }).click();
  74  | }
  75  | async function chooseAgent(page: Page, name: string) {
  76  |   const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  77  |   if (await open.isVisible()) await open.click();
  78  |   await page
  79  |     .getByRole("navigation", { name: "Percakapan", exact: true })
  80  |     .getByRole("button")
  81  |     .filter({ has: page.getByText(name, { exact: true }) })
  82  |     .click();
  83  |   await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
  84  | }
  85  | async function revokeFixtureApps(page: Page, toolkit: string) {
  86  |   const connections = await (await page.request.get("/v1/apps/connections")).json();
  87  |   for (const connection of connections)
  88  |     if (connection.toolkit === toolkit && connection.state !== "revoked")
  89  |       await post(page, `/v1/apps/connections/${connection.id}/revoke`, {});
  90  | }
  91  | 
  92  | test("contextual goals, Routine and files use real scoped state and keep stop responsibility distinct from stop run", async ({
  93  |   page,
  94  | }, testInfo) => {
  95  |   test.setTimeout(60000);
  96  |   const { a } = await start(page);
  97  |   const goal = await post(page, "/v1/goals", {
  98  |     thread_id: a.thread.id,
  99  |     agent_id: a.agent.id,
  100 |     title: "Research progress",
  101 |   });
  102 |   const routine = await post(page, "/v1/routines", {
  103 |     thread_id: a.thread.id,
  104 |     agent_id: a.agent.id,
  105 |     instruction: "Check research progress",
```