# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: composer.spec.ts >> Focus table feedback sends the filtered CSV and keeps one attachment after a rejected send
- Location: tests/composer.spec.ts:576:1

# Error details

```
Error: apiResponse.json: Response has been disposed
```

# Page snapshot

```yaml
- generic [ref=f2e1]:
  - generic [ref=f2e2]:
    - generic [ref=f2e3]:
      - complementary [ref=f2e4]:
        - generic [ref=f2e5]:
          - generic [ref=f2e6]:
            - link "Ngertiin" [ref=f2e7] [cursor=pointer]:
              - /url: /
              - text: ngertiin.
            - button "Search conversations" [ref=f2e9] [cursor=pointer]
            - button "Buat baru" [ref=f2e10] [cursor=pointer]
          - navigation "Percakapan" [ref=f2e11]:
            - generic [ref=f2e13]:
              - button "Tobi Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation." [ref=f2e15] [cursor=pointer]:
                - generic [ref=f2e18]:
                  - generic [ref=f2e19]: Tobi
                  - generic "Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation." [ref=f2e20]
              - button "Inline files ac3c1b7c Fixture ready" [ref=f2e22] [cursor=pointer]:
                - generic [ref=f2e25]:
                  - generic [ref=f2e26]: Inline files ac3c1b7c
                  - generic "Fixture ready" [ref=f2e27]
              - button "Inline files 3efceea5 Fixture ready" [ref=f2e29] [cursor=pointer]:
                - generic [ref=f2e32]:
                  - generic [ref=f2e33]: Inline files 3efceea5
                  - generic "Fixture ready" [ref=f2e34]
              - button "Inline files 75a79a31 Fixture ready" [ref=f2e36] [cursor=pointer]:
                - generic [ref=f2e39]:
                  - generic [ref=f2e40]: Inline files 75a79a31
                  - generic "Fixture ready" [ref=f2e41]
              - button "Inline files 16f48ae3 Fixture ready" [ref=f2e43] [cursor=pointer]:
                - generic [ref=f2e46]:
                  - generic [ref=f2e47]: Inline files 16f48ae3
                  - generic "Fixture ready" [ref=f2e48]
          - generic [ref=f2e50]:
            - button "Pengaturan" [ref=f2e51] [cursor=pointer]
            - button "Hubungkan aplikasi" [ref=f2e52] [cursor=pointer]
      - main "Percakapan aktif" [ref=f2e53]:
        - generic:
          - button "Detail Inline files 16f48ae3" [ref=f2e54] [cursor=pointer]:
            - generic [ref=f2e57]: Inline files 16f48ae3
          - generic:
            - button "Pilih model" [ref=f2e58] [cursor=pointer]:
              - generic [ref=f2e64]: fixture
            - button "Browser agent" [ref=f2e65] [cursor=pointer]
        - log [ref=f2e66]:
          - generic [ref=f2e68]:
            - time [ref=f2e70]: 7 November 2026
            - generic [ref=f2e72]:
              - generic [ref=f2e73]: Kamu
              - generic [ref=f2e74]:
                - generic [ref=f2e76]:
                  - generic [ref=f2e77]: fixture warmup
                  - time [ref=f2e78]: "16.19"
                - group "Aksi pesan":
                  - button "Salin pesan"
            - generic [ref=f2e80]:
              - generic [ref=f2e81]: Inline files 16f48ae3
              - generic [ref=f2e83]:
                - generic [ref=f2e86]:
                  - generic [ref=f2e87]:
                    - button "Salin tabel" [ref=f2e88] [cursor=pointer]
                    - button "Unduh tabel" [ref=f2e92] [cursor=pointer]
                    - button "Perbesar tabel" [ref=f2e95] [cursor=pointer]
                  - region "Tabel" [ref=f2e99]:
                    - table "Tabel" [ref=f2e100]:
                      - rowgroup [ref=f2e101]:
                        - row [ref=f2e102]:
                          - columnheader [ref=f2e103]:
                            - button "Urutkan Item" [ref=f2e105] [cursor=pointer]:
                              - generic [ref=f2e106]: Item
                          - columnheader [ref=f2e109]:
                            - button "Urutkan Revenue" [ref=f2e111] [cursor=pointer]:
                              - generic [ref=f2e112]: Revenue
                      - rowgroup [ref=f2e115]:
                        - row [ref=f2e116]:
                          - cell "Beta" [ref=f2e117]
                          - cell "30" [ref=f2e119]
                - time [ref=f2e121]: "16.19"
            - generic [ref=f2e123]:
              - generic [ref=f2e124]: Kamu
              - generic [ref=f2e125]:
                - generic [ref=f2e127]:
                  - generic [ref=f2e128]:
                    - text: Explain this row.
                    - button "Pratinjau Tabel.csv" [ref=f2e130] [cursor=pointer]:
                      - img [aria-hidden] [ref=f2e131]:
                        - generic [ref=f2e134]: CSV
                      - generic [ref=f2e135]: Tabel.csv
                  - time [ref=f2e138]: "16.19"
                - group "Aksi pesan":
                  - button "Salin pesan"
            - generic [ref=f2e140]:
              - generic [ref=f2e141]: Inline files 16f48ae3
              - generic [ref=f2e143]:
                - generic [ref=f2e146]:
                  - generic [ref=f2e147]:
                    - button "Salin tabel" [ref=f2e148] [cursor=pointer]
                    - button "Unduh tabel" [ref=f2e152] [cursor=pointer]
                    - button "Perbesar tabel" [ref=f2e155] [cursor=pointer]
                  - region "Tabel" [ref=f2e159]:
                    - table "Tabel" [ref=f2e160]:
                      - rowgroup [ref=f2e161]:
                        - row [ref=f2e162]:
                          - columnheader [ref=f2e163]:
                            - button "Urutkan Item" [ref=f2e165] [cursor=pointer]:
                              - generic [ref=f2e166]: Item
                          - columnheader [ref=f2e169]:
                            - button "Urutkan Revenue" [ref=f2e171] [cursor=pointer]:
                              - generic [ref=f2e172]: Revenue
                      - rowgroup [ref=f2e175]:
                        - row [ref=f2e176]:
                          - cell "Alpha" [ref=f2e177]
                          - cell "20" [ref=f2e179]
                        - row [ref=f2e181]:
                          - cell "Beta" [ref=f2e182]
                          - cell "30" [ref=f2e184]
                - time [ref=f2e186]: "16.19"
        - generic [ref=f2e187]:
          - button "Lampirkan file ke pesan" [ref=f2e188]
          - button "Tambah lampiran" [ref=f2e189] [cursor=pointer]
          - generic [ref=f2e190]:
            - textbox "Pesan" [active] [ref=f2e191]:
              - paragraph [ref=f2e192]
            - generic [aria-hidden]: Pesan untuk Inline files 16f48ae3…
          - generic [ref=f2e194]:
            - button "Kirim" [disabled]
    - region "Notifications alt+T"
  - listbox "Typeahead menu"
```

# Test source

```ts
  482 |   await expect(composer.locator('[data-upload-state="local"]')).toHaveCount(1);
  483 |   await expect(composer).not.toBeEditable();
  484 |   await expect(
  485 |     composer.getByRole("button", { name: "Hapus lampiran pending.txt", exact: true }),
  486 |   ).toHaveCount(0);
  487 |   await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  488 |   await expect(composer).toHaveText("");
  489 |   expect(operations).toHaveLength(1);
  490 |   const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  491 |   expect(snapshot.runs).toHaveLength(2);
  492 |   expect(snapshot.artifacts).toHaveLength(1);
  493 | });
  494 | 
  495 | test("Focus feedback retains the draft, references real file bytes and returns to the same chat", async ({
  496 |   page,
  497 | }, info) => {
  498 |   const { agent, thread, composer } = await setup(page);
  499 |   const workspace = await post(page, "/v1/workspaces", {
  500 |     thread_id: thread.id,
  501 |     agent_id: agent.id,
  502 |   });
  503 |   const name = "Sales dashboard with a long filename for centered mobile headers.html";
  504 |   const text =
  505 |     "<!doctype html><style>body{font:16px system-ui;padding:24px;background:#f8f7f4}h1{font-size:32px}</style><h1>October sales</h1><p>Revenue grew by 18%.</p>";
  506 |   const artifact = await post(page, `/v1/workspaces/${workspace.id}/uploads`, {
  507 |     name,
  508 |     media_type: "text/html",
  509 |     content_base64: Buffer.from(text).toString("base64"),
  510 |   });
  511 |   await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
  512 |     const response = await route.fetch();
  513 |     const snapshot = await response.json();
  514 |     snapshot.artifacts.forEach((file: { origin: string }) => {
  515 |       file.origin = "native_output";
  516 |     });
  517 |     await route.fulfill({ response, json: snapshot });
  518 |   });
  519 |   await page.reload();
  520 |   await composer.fill("Change the heading to October summary.");
  521 |   await page.getByRole("button", { name: `Detail ${agent.name}`, exact: true }).click();
  522 |   await page.getByRole("tab", { name: "Library", exact: true }).click();
  523 |   const fileButton = page.getByRole("button", { name: `File ${name}`, exact: true });
  524 |   await fileButton.click();
  525 |   const viewer = page.locator("[data-content-viewer]");
  526 |   await expect(
  527 |     viewer.frameLocator("iframe").getByRole("heading", { name: "October sales" }),
  528 |   ).toBeVisible();
  529 |   await expect(composer).toHaveText("Change the heading to October summary.");
  530 |   await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveCount(1);
  531 |   const centered = await viewer.locator(".content-viewer-header").evaluate((element) => {
  532 |     const a = element.getBoundingClientRect();
  533 |     const b = element.querySelector("h2")?.getBoundingClientRect();
  534 |     return b ? Math.abs((a.left + a.right - b.left - b.right) / 2) : 999;
  535 |   });
  536 |   expect(centered).toBeLessThan(1);
  537 |   await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  538 |   await expect(fileButton).toBeVisible();
  539 |   await expect(fileButton).toBeFocused();
  540 |   await fileButton.click();
  541 |   await expect(composer).toHaveText("Change the heading to October summary.");
  542 |   await page.screenshot({ path: info.outputPath("focus-context.png") });
  543 |   const sent = page.waitForRequest(
  544 |     (request) => request.url().endsWith("/v1/runs") && request.method() === "POST",
  545 |   );
  546 |   await page.getByRole("button", { name: "Kirim", exact: true }).click();
  547 |   const body = (await sent).postDataJSON();
  548 |   expect(body.thread_id).toBe(thread.id);
  549 |   expect(body.artifact_ids).toEqual([artifact.id]);
  550 |   expect(body.text).toContain(`ngertiin://file/${artifact.id}`);
  551 |   await expect(viewer).toHaveCount(0);
  552 |   await expect(composer).toHaveText("");
  553 |   const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  554 |   expect(
  555 |     snapshot.messages.find((message: { text: string }) => message.text === body.text).artifact_ids,
  556 |   ).toEqual([artifact.id]);
  557 |   await page
  558 |     .getByRole("button", { name: `Pratinjau ${name}`, exact: true })
  559 |     .first()
  560 |     .click();
  561 |   await expect(viewer).toBeVisible();
  562 |   await page.getByRole("button", { name: "Lepas konteks file", exact: true }).click();
  563 |   await expect(page.locator("[data-viewer-context]")).toHaveCount(0);
  564 |   await composer.fill("A separate question.");
  565 |   const ordinary = page.waitForRequest(
  566 |     (request) => request.url().endsWith("/v1/runs") && request.method() === "POST",
  567 |   );
  568 |   await page.getByRole("button", { name: "Kirim", exact: true }).click();
  569 |   expect((await ordinary).postDataJSON().artifact_ids).toEqual([]);
  570 |   await expect(viewer).toHaveCount(0);
  571 |   await expect(composer).toHaveText("");
  572 |   await expect(composer).toBeEditable();
  573 |   await page.unrouteAll({ behavior: "wait" });
  574 | });
  575 | 
  576 | test("Focus table feedback sends the filtered CSV and keeps one attachment after a rejected send", async ({
  577 |   page,
  578 | }) => {
  579 |   const { thread, composer } = await setup(page);
  580 |   await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
  581 |     const response = await route.fetch();
> 582 |     const snapshot = await response.json();
      |                                     ^ Error: apiResponse.json: Response has been disposed
  583 |     snapshot.messages.forEach((message: { author: string; text: string }) => {
  584 |       if (message.author === "agent")
  585 |         message.text = "| Item | Revenue |\n|---|---:|\n| Alpha | 20 |\n| Beta | 30 |";
  586 |     });
  587 |     await route.fulfill({ response, json: snapshot });
  588 |   });
  589 |   await page.reload();
  590 |   await page.getByRole("button", { name: "Perbesar tabel", exact: true }).first().click();
  591 |   const viewer = page.locator("[data-content-viewer]");
  592 |   await viewer.getByRole("textbox", { name: "Cari dalam tabel", exact: true }).fill("Beta");
  593 |   await expect(viewer.getByRole("table").locator("tbody tr")).toHaveCount(1);
  594 |   await composer.fill("Explain this row.");
  595 |   let rejected = false;
  596 |   await page.route("**/v1/runs", async (route) => {
  597 |     if (!rejected && route.request().method() === "POST") {
  598 |       rejected = true;
  599 |       await route.fulfill({
  600 |         status: 422,
  601 |         json: { error: { code: "INVALID_REQUEST", message: "Fixture rejection." } },
  602 |       });
  603 |     } else await route.continue();
  604 |   });
  605 |   await page.getByRole("button", { name: "Kirim", exact: true }).click();
  606 |   await expect(page.locator(".workspace-error")).toBeVisible();
  607 |   await expect(composer.locator("[data-attachment-chip]")).toHaveCount(1);
  608 |   await expect(page.locator("[data-viewer-context]")).toHaveCount(0);
  609 |   await expect(composer).toBeEditable();
  610 |   const sent = page.waitForRequest(
  611 |     (request) => request.url().endsWith("/v1/runs") && request.method() === "POST",
  612 |   );
  613 |   await page.getByRole("button", { name: "Kirim", exact: true }).click();
  614 |   const body = (await sent).postDataJSON();
  615 |   expect(body.artifact_ids).toHaveLength(1);
  616 |   await expect(viewer).toHaveCount(0);
  617 |   const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  618 |   const file = snapshot.artifacts.find(
  619 |     (artifact: { id: string }) => artifact.id === body.artifact_ids[0],
  620 |   );
  621 |   const response = await page.request.get(
  622 |     `/v1/artifacts/${file.id}/content?workspace_id=${file.workspace_id}`,
  623 |   );
  624 |   const csv = await response.text();
  625 |   expect(csv).toContain("Beta,30");
  626 |   expect(csv).not.toContain("Alpha");
  627 | });
  628 | 
  629 | test("Focus working files retain their folder, retry reads and upload context only on Send", async ({
  630 |   page,
  631 | }) => {
  632 |   const { agent, thread, composer } = await setup(page);
  633 |   let reads = 0;
  634 |   let uploads = 0;
  635 |   page.on("request", (request) => {
  636 |     if (request.url().endsWith("/v1/message-uploads")) uploads++;
  637 |   });
  638 |   // The machine transport is a fixture; admission, staging and stored content use the real API.
  639 |   await page.route("**/v1/machine/files?**", async (route) => {
  640 |     const nested = new URL(route.request().url()).searchParams.get("path") === "reports";
  641 |     await route.fulfill({
  642 |       json: {
  643 |         entries: nested
  644 |           ? [{ name: "working-note.txt", path: "reports/working-note.txt", type: "file" }]
  645 |           : [{ name: "reports", path: "reports", type: "directory" }],
  646 |         next_after: null,
  647 |       },
  648 |     });
  649 |   });
  650 |   await page.route("**/v1/machine/file?**", async (route) => {
  651 |     reads++;
  652 |     await route.fulfill(
  653 |       reads === 1
  654 |         ? { status: 403, body: "Unavailable" }
  655 |         : { contentType: "text/plain", body: "A current working-file snapshot." },
  656 |     );
  657 |   });
  658 |   await page.getByRole("button", { name: `Detail ${agent.name}`, exact: true }).click();
  659 |   await page.getByRole("tab", { name: "Library", exact: true }).click();
  660 |   await page.getByRole("button", { name: "reports", exact: true }).click();
  661 |   const fileButton = page.getByRole("button", { name: "working-note.txt", exact: true });
  662 |   await fileButton.click();
  663 |   const viewer = page.locator("[data-content-viewer]");
  664 |   await expect(viewer.getByRole("alert")).toBeVisible();
  665 |   await viewer.getByRole("button", { name: "Coba buka lagi", exact: true }).click();
  666 |   await expect(viewer).toContainText("A current working-file snapshot.");
  667 |   expect(uploads).toBe(0);
  668 |   await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
  669 |   await expect(fileButton).toBeVisible();
  670 |   await fileButton.click();
  671 |   await composer.fill("Review this working file.");
  672 |   await page.getByRole("button", { name: "Kirim", exact: true }).click();
  673 |   await expect(composer).toHaveText("");
  674 |   await expect(composer).toBeEditable();
  675 |   expect(uploads).toBe(1);
  676 |   const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  677 |   const artifact = snapshot.artifacts.find(
  678 |     (file: { name: string }) => file.name === "working-note.txt",
  679 |   );
  680 |   const response = await page.request.get(
  681 |     `/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
  682 |   );
```