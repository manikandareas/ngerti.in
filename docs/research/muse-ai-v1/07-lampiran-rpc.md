# 07 · Lampiran 338 RPC & Jejak Sumber

Sumber: [Notion](https://app.notion.com/p/3fdabdd6187381a496a1f4d88d7d68bf) · Readback: 2026-10-18T06:04:56.780944+00:00

<!-- notion-content:start -->
<table_of_contents/>
**Observed static, bukan daftar endpoint yang telah dipanggil.** Registry literal memuat 338 method unik. Satu callback memakai variable lokal sehingga tidak masuk extractor literal. Route adalah HTTP-shaped operation dalam transport gateway; `noiseOnly` bukan tanda endpoint dapat dipanggil tanpa login melalui HTTP publik.
Sumber: `147crb07jgq_3.js`, SHA-256 `73db96d786ff3a16f360a61624302c1f98f71c45133d1bf27eff44b88ce18900`. REA parent `ev_1be87df5702e20626a0a9f7c6c743fc2c1ea4c6da588e5deed8be9f5df49c078`. Build `dpl_13w2XhxKwKs7oW6RrPKNJxMESSbw`.
Kolom service/channel memakai nilai yang tertulis; “default” berarti registry tidak menentukannya dan transport memiliki default `daemon`/`main`. Flag absent tidak diubah menjadi klaim kemampuan fallback HTTP.
Nama developer/internal yang ikut dikirim frontend tidak otomatis aktif, tidak menjadi scope V1 dan tidak pernah dipanggil pada audit ini.

## ac_oauth (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `ac_oauth.callback` | `POST /ac_oauth/callback` | `default / default` | absent | `7485:7557` |

## activity (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `activity.list` | `GET /activity` | `default / default` | absent | `13090:13148` |
| `activity.get` | `GET /activity/{id}` | `default / default` | absent | `13149:13211` |
| `activity.subscribe` | `POST /activity/subscribe` | `default / default` | noiseOnly=True | `34640:34753` |

## ads (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `ads.details` | `GET /api/ads/details` | `default / default` | absent | `25033:25096` |

## api (8)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `api.idea-cards.list` | `GET /api/idea-cards` | `default / default` | absent | `24149:24219` |
| `api.ideas.reset` | `POST /api/ideas/reset` | `default / default` | absent | `24220:24288` |
| `api.ideas.engagement` | `POST /api/ideas/{id}/engagement` | `default / default` | absent | `24289:24372` |
| `api.ideas.feedback` | `POST /api/ideas/{id}/feedback` | `default / default` | absent | `24373:24452` |
| `api.idea-cards.detail` | `GET /api/idea-cards/{ideaCardId}` | `default / default` | absent | `24453:24538` |
| `api.idea-cards.execute` | `POST /api/idea-cards/{ideaCardId}/execute` | `default / default` | absent | `24539:24634` |
| `api.idea-cards.share` | `POST /api/idea-cards/{ideaCardId}/share` | `default / default` | absent | `24635:24726` |
| `api.idea-cards.debug` | `GET /api/idea-cards/{ideaCardId}/debug` | `default / default` | absent | `24727:24817` |

## api_key_auth (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `api_key_auth.callback` | `POST /api_key_auth/callback` | `authd / default` | absent | `18665:18761` |

## artifacts (7)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `artifacts.share` | `POST /artifacts/share` | `default / default` | absent | `22328:22396` |
| `artifacts.remove` | `POST /artifacts/remove` | `default / default` | absent | `22397:22467` |
| `artifacts.fetch_url` | `GET /artifacts/fetch_url` | `default / default` | absent | `22468:22543` |
| `artifacts.list` | `GET /api/artifacts` | `default / default` | absent | `22544:22608` |
| `artifacts.pin` | `POST /api/artifacts/pin` | `default / default` | noiseOnly=True | `22609:22690` |
| `artifacts.slides.rebuild` | `POST /api/artifacts/slides/rebuild` | `default / default` | noiseOnly=True | `22691:22816` |
| `artifacts.subscribe` | `POST /api/artifacts/subscribe` | `default / default` | noiseOnly=True | `35084:35203` |

## bootstrap (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `bootstrap.reset` | `POST /bootstrap/reset` | `default / default` | absent | `18225:18293` |

## browser (7)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `browser.debug_access.get` | `GET /api/browser/debug-access` | `default / default` | noiseOnly=True | `10676:10774` |
| `browser.lease_overrides.get` | `GET /api/browser/lease-overrides` | `default / default` | noiseOnly=True | `10775:10879` |
| `browser.lease_overrides.set` | `PATCH /api/browser/lease-overrides` | `default / default` | noiseOnly=True | `10880:10986` |
| `browser.lease_overrides.release` | `POST /api/browser/lease-overrides/release` | `default / default` | noiseOnly=True | `10987:11126` |
| `browser.lease` | `POST /api/browser/lease` | `default / default` | absent | `21469:21559` |
| `browser.local_testing.get` | `GET /api/browser/local-testing` | `default / default` | noiseOnly=True | `21766:21887` |
| `browser.local_testing.set` | `PATCH /api/browser/local-testing` | `default / default` | noiseOnly=True | `21888:22011` |

## browser_activity (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `browser_activity.snapshot` | `GET /api/browser-activity/actions/{action_id}/snapshot` | `default / media` | absent | `20399:20548` |

## browser_stream (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `browser_stream.attach` | `POST /api/browser-task/{task_id}/websockify?mode=attach` | `default / default` | noiseOnly=True | `20277:20398` |

## browser_task (14)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `browser_task.clipboard.readiness` | `POST /api/browser-task/{task_id}/clipboard/readiness` | `default / default` | noiseOnly=True | `8052:8203` |
| `browser_task.clipboard.copy` | `POST /api/browser-task/{task_id}/clipboard/copy` | `default / default` | noiseOnly=True | `8204:8347` |
| `browser_task.clipboard.paste` | `POST /api/browser-task/{task_id}/clipboard/paste` | `default / default` | noiseOnly=True | `8348:8491` |
| `browser_task.refresh_environment` | `POST /api/browser-task/{task_id}/refresh-environment` | `default / default` | absent | `10313:10451` |
| `browser_task.end_and_release` | `POST /api/browser-task/{task_id}/end-and-release` | `default / default` | absent | `10452:10582` |
| `browser_task.lease_info` | `GET /api/browser-task/{task_id}/lease` | `default / default` | absent | `10583:10675` |
| `browser_task.get` | `GET /api/browser-task/{task_id}` | `default / default` | absent | `20667:20746` |
| `browser_task.takeover` | `POST /api/browser-task/{task_id}/takeover` | `default / default` | absent | `20759:20853` |
| `browser_task.present` | `POST /api/browser-task/{task_id}/present` | `default / default` | absent | `20854:20946` |
| `browser_task.viewer` | `PATCH /api/browser-task/{task_id}/viewer` | `daemon / default` | noiseOnly=True | `20947:21068` |
| `browser_task.heartbeat` | `POST /api/browser-task/{task_id}/heartbeat` | `default / default` | absent | `21069:21165` |
| `browser_task.close` | `POST /api/browser-task/{task_id}/close` | `default / default` | absent | `21166:21254` |
| `browser_task.release` | `POST /api/browser-task/{task_id}/release` | `default / default` | absent | `21255:21347` |
| `browser_task.stop` | `POST /api/browser-task/{task_id}/stop` | `default / default` | absent | `21348:21434` |

## bug_report_logs (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `bug_report_logs.create` | `POST /api/debug/bug-report-logs` | `default / default` | noiseOnly=True | `13879:13998` |
| `bug_report_logs.download` | `GET /api/debug/bug-report-logs/{file_id}` | `default / media` | noiseOnly=True | `13999:14193` |

## channels (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `channels.status` | `GET /channels/status` | `default / default` | absent | `16138:16205` |
| `channels.link` | `POST /channels/link` | `default / default` | absent | `16206:16270` |
| `channels.unlink` | `POST /channels/unlink` | `default / default` | absent | `16271:16339` |

## chat (15)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `chat.history` | `GET /chat/history` | `default / default` | absent | `12750:12811` |
| `chat.mark_seen` | `POST /api/chat/{thread_id}/seen` | `default / default` | absent | `12909:12986` |
| `chat.sxs.select` | `POST /api/chat/sxs/select` | `default / default` | absent | `12987:13059` |
| `chat.themes` | `GET /api/chat/themes` | `default / default` | absent | `22066:22129` |
| `chat.themes.set` | `POST /api/chat/themes/set` | `default / default` | absent | `22130:22202` |
| `chat.unread_count` | `GET /chat/unread-count` | `default / default` | absent | `27217:27288` |
| `chat.poke` | `POST /chat/poke` | `default / default` | absent | `27289:27345` |
| `chat.history_window` | `GET /chat/history-window` | `default / default` | noiseOnly=True | `33006:33094` |
| `chat.cancel` | `POST /chat/cancel` | `default / default` | noiseOnly=True | `33095:33168` |
| `chat.delete_turn` | `POST /api/chat/delete-turn` | `default / default` | noiseOnly=True | `33169:33256` |
| `chat.message_get` | `GET /chat/message` | `default / default` | noiseOnly=True | `33257:33335` |
| `chat.search` | `GET /chat/search` | `default / default` | noiseOnly=True | `33336:33408` |
| `chat.stream` | `POST /chat/stream` | `default / default` | noiseOnly=True | `34299:34398` |
| `chat.stream_events` | `POST /chat/stream-events` | `default / default` | noiseOnly=True | `34399:34512` |
| `chat.subscribe` | `POST /chat/subscribe` | `default / default` | noiseOnly=True | `34513:34639` |

## check (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `check` | `GET /check` | `default / default` | absent | `26702:26749` |

## client (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `client.runtime_state` | `POST /api/client/runtime-state` | `default / default` | noiseOnly=True | `7017:7112` |
| `client.register_capabilities` | `POST /client/register-capabilities` | `default / default` | noiseOnly=True | `33409:33516` |
| `client.invoke.result` | `POST /client/invoke-result` | `default / default` | noiseOnly=True | `33517:33608` |

## computer (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `computer.context` | `GET /api/computer/context` | `default / default` | absent | `21560:21633` |
| `computer.preview` | `GET /api/computer/previews/{task_id}/{sha256}` | `default / media` | absent | `21634:21765` |
| `computer.subscribe` | `POST /api/computer/subscribe` | `default / default` | noiseOnly=True | `35421:35538` |

## config (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `config.get` | `GET /config` | `default / default` | absent | `13713:13766` |
| `config.update` | `PATCH /config` | `default / default` | absent | `13767:13825` |

## connection (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `connection.ping` | `POST /api/ping` | `default / default` | noiseOnly=True | `33609:33683` |

## connectors (11)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `connectors.accounts` | `GET /connectors/{id}/accounts` | `default / default` | absent | `15763:15843` |
| `connectors.accounts_unlink` | `POST /connectors/{id}/accounts/{account_id}/unlink` | `default / default` | absent | `15844:15952` |
| `connectors.accounts_link` | `POST /connectors/{id}/accounts/link` | `default / default` | absent | `15953:16044` |
| `connectors.list` | `GET /connectors` | `default / default` | absent | `19124:19186` |
| `connectors.homepage` | `GET /connectors/homepage` | `default / default` | absent | `19187:19262` |
| `connectors.get` | `GET /connectors/{id}` | `default / default` | absent | `19263:19329` |
| `connectors.connect_info` | `GET /connectors/{id}/connect/info` | `default / default` | absent | `19330:19418` |
| `connectors.connect` | `POST /connectors/{id}/connect` | `default / default` | absent | `19419:19498` |
| `connectors.permissions` | `GET /connectors/{id}/permissions` | `default / default` | absent | `19499:19585` |
| `connectors.scope_link` | `POST /connectors/{id}/scopes/{method}/link` | `default / default` | absent | `19586:19681` |
| `connectors.disconnect` | `POST /connectors/{id}/disconnect` | `default / default` | absent | `19682:19767` |

## consent_auth (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `consent_auth.callback` | `POST /consent_auth/callback` | `default / default` | absent | `19768:19848` |

## credentials (10)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `credentials.list` | `GET /v1/credentials/list` | `authd / default` | absent | `9074:9162` |
| `credentials.catalog` | `GET /v1/credentials/catalog` | `authd / default` | noiseOnly=True | `9163:9270` |
| `credentials.catalog.details` | `GET /v1/credentials/catalog/details` | `authd / default` | noiseOnly=True | `9271:9394` |
| `credentials.catalog.update` | `POST /v1/credentials/catalog/update` | `authd / default` | noiseOnly=True | `9395:9517` |
| `credentials.catalog.delete` | `POST /v1/credentials/catalog/delete` | `authd / default` | noiseOnly=True | `9518:9640` |
| `credentials.register` | `POST /v1/credentials/register` | `authd / default` | absent | `9641:9738` |
| `credentials.capture` | `POST /v1/credentials/capture` | `authd / default` | noiseOnly=True | `9739:9847` |
| `credentials.capture.external_provider.request` | `POST /v1/credentials/capture/external-provider/request` | `authd / default` | noiseOnly=True | `9848:10008` |
| `credentials.capture.external_provider.fulfill` | `POST /v1/credentials/capture/external-provider/fulfill` | `authd / default` | noiseOnly=True | `10009:10169` |
| `credentials.delete` | `POST /v1/credentials/delete` | `authd / default` | absent | `10170:10263` |

## custom_connectors (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `custom_connectors.register` | `POST /v1/custom-connectors/register` | `authd / default` | absent | `18762:18915` |
| `custom_connectors.list` | `POST /v1/custom-connectors/list` | `authd / default` | absent | `18916:19017` |
| `custom_connectors.delete` | `POST /v1/custom-connectors/delete` | `authd / default` | absent | `19018:19123` |

## dyi (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `dyi.export` | `POST /api/dyi/export` | `daemon / media` | noiseOnly=True, requestBody=empty | `14348:14568` |

## egress (21)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `egress.approvals` | `GET /approvals` | `sentinel / default` | absent | `11691:11772` |
| `egress.approval` | `GET /approvals/{approval_id}` | `sentinel / default` | absent | `11773:11867` |
| `egress.approval.editable_message` | `GET /approvals/{approval_id}/editable-message` | `sentinel / default` | absent | `11868:11996` |
| `egress.approval.decide` | `POST /approvals/{approval_id}/decide` | `sentinel / default` | absent | `11997:12106` |
| `egress.approval.edit_message` | `POST /approvals/{approval_id}/edit-message` | `sentinel / default` | absent | `12107:12228` |
| `egress.approval.history` | `GET /approvals/history` | `sentinel / default` | absent | `12229:12325` |
| `egress.permissions` | `GET /permissions` | `sentinel / default` | absent | `31026:31111` |
| `egress.permissions.hitl` | `PATCH /permissions/hitl` | `sentinel / default` | absent | `31412:31509` |
| `egress.permissions.hitl.snooze.delete` | `DELETE /permissions/hitl/snooze` | `sentinel / default` | absent | `31510:31629` |
| `egress.permissions.tproxy` | `PATCH /permissions/tproxy` | `sentinel / default` | absent | `31630:31731` |
| `egress.permissions.mitm` | `PATCH /permissions/mitm` | `sentinel / default` | absent | `31732:31829` |
| `egress.permissions.sni_rejection` | `PATCH /permissions/sni-rejection` | `sentinel / default` | absent | `31830:31945` |
| `egress.permissions.active` | `GET /permissions/active` | `sentinel / default` | absent | `31946:32045` |
| `egress.permissions.active.update` | `PATCH /permissions/active` | `sentinel / default` | absent | `32046:32154` |
| `egress.permissions.scoped` | `GET /permissions/scopes/{scope_type}/{scope_id}` | `sentinel / default` | absent | `32155:32278` |
| `egress.permissions.scoped.update` | `PATCH /permissions/scopes/{scope_type}/{scope_id}` | `sentinel / default` | absent | `32279:32411` |
| `egress.permissions.revoke` | `POST /permissions/revoke` | `sentinel / default` | absent | `32412:32512` |
| `egress.permissions.reset` | `POST /permissions/reset` | `sentinel / default` | absent | `32513:32611` |
| `egress.permissions.network_rules` | `PATCH /permissions/network-rules` | `sentinel / default` | absent | `32612:32727` |
| `egress.permissions.connector` | `PATCH /permissions/connectors/{connector}` | `sentinel / default` | absent | `32728:32848` |
| `egress.permissions.connector.reset` | `DELETE /permissions/connectors/{connector}` | `sentinel / default` | absent | `32849:32976` |

## email (9)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `email.mailbox.get` | `GET /api/email/mailbox` | `daemon / default` | noiseOnly=True | `4725:4826` |
| `email.mailbox.setup` | `GET /api/email/mailbox/setup` | `daemon / default` | noiseOnly=True | `4827:4936` |
| `email.mailbox.create` | `POST /api/email/mailbox` | `daemon / default` | noiseOnly=True | `4937:5042` |
| `email.mailbox.delete` | `DELETE /api/email/mailbox` | `daemon / default` | noiseOnly=True, requestBody=empty | `5043:5170` |
| `email.messages.get` | `GET /api/email/messages/{message_id}` | `daemon / default` | noiseOnly=True | `5171:5287` |
| `email.attachment.get` | `GET /api/email/messages/{message_id}/attachments/{index}` | `daemon / default` | noiseOnly=True | `5288:5426` |
| `email.threads.list` | `GET /api/email/threads` | `daemon / default` | noiseOnly=True | `5427:5529` |
| `email.threads.get` | `GET /api/email/threads/{thread_id}` | `daemon / default` | noiseOnly=True | `5530:5643` |
| `email.test_message` | `POST /api/email/test-message` | `daemon / default` | noiseOnly=True | `5644:5752` |

## feed (16)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `feed.list` | `GET /api/feed` | `default / default` | absent | `25097:25151` |
| `feed.infinite` | `GET /api/feed/infinite` | `default / default` | noiseOnly=True | `25152:25253` |
| `feed.status` | `GET /api/feed/status` | `default / default` | absent | `25254:25317` |
| `feed.search` | `GET /api/feed/search` | `default / default` | absent | `25318:25381` |
| `feed.unit` | `GET /api/feed/units/{unit_id}` | `default / default` | absent | `25382:25452` |
| `feed.unit.delete` | `DELETE /api/feed/units/{unit_id}` | `default / default` | absent | `25453:25533` |
| `feed.unit.reaction` | `POST /api/feed/units/{unit_id}/reaction` | `default / default` | absent | `25534:25623` |
| `feed.unit.tap` | `POST /api/feed/units/{unit_id}/tap` | `default / default` | absent | `25624:25703` |
| `feed.units.seen` | `POST /api/feed/units/seen` | `default / default` | absent | `25704:25776` |
| `feed.reorder` | `POST /api/feed/reorder` | `default / default` | absent | `25777:25843` |
| `feed.regenerate` | `POST /api/feed/regenerate` | `default / default` | absent | `25844:25916` |
| `feed.prompt.get` | `GET /api/feed/prompt` | `default / default` | absent | `25917:25984` |
| `feed.prompt.update` | `PATCH /api/feed/prompt` | `default / default` | absent | `25985:26057` |
| `feed.prompts.delete` | `DELETE /api/feed/prompts/{prompt_id}` | `default / default` | absent | `26058:26145` |
| `feed.social_source_icon` | `GET /api/feed/social-source-icon/{source}` | `default / media` | absent | `26146:26280` |
| `feed.unit.media` | `GET /api/feed/units/{unit_id}/media/{handle}` | `default / media` | absent | `26281:26410` |

## foa (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `foa.accounts` | `GET /api/foa/accounts` | `default / default` | absent | `15697:15762` |

## foa_auth (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `foa_auth.callback` | `POST /api/foa_auth/callback` | `authd / default` | absent | `16045:16137` |

## fs (14)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `fs.stats` | `POST /fs/stats` | `default / default` | absent | `28999:29053` |
| `fs.list` | `POST /fs/list` | `default / default` | absent | `29054:29106` |
| `fs.stat` | `POST /fs/stat` | `default / default` | absent | `29107:29159` |
| `fs.read` | `POST /fs/read` | `default / default` | absent | `29160:29212` |
| `fs.reads` | `POST /fs/reads` | `default / default` | absent | `29213:29267` |
| `fs.write` | `POST /fs/write` | `default / default` | absent | `29268:29322` |
| `fs.delete` | `POST /fs/delete` | `default / default` | absent | `29323:29379` |
| `fs.rename` | `POST /fs/rename` | `default / default` | absent | `29380:29436` |
| `fs.mkdir` | `POST /fs/mkdir` | `default / default` | absent | `29437:29491` |
| `fs.library` | `POST /fs/library` | `default / default` | absent | `29492:29550` |
| `fs.export` | `POST /fs/export` | `default / default` | absent | `29551:29629` |
| `fs.raw` | `GET /fs/raw/{*path}` | `default / media` | absent | `29630:29746` |
| `fs.search` | `POST /fs/search` | `default / default` | absent | `29868:29924` |
| `fs.subscribe` | `POST /api/fs/subscribe` | `default / default` | noiseOnly=True | `34754:34859` |

## git (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `git.log` | `POST /git/log` | `default / default` | absent | `29925:29977` |
| `git.show_file` | `POST /git/show_file` | `default / default` | absent | `29978:30042` |

## github (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `github.installation.callback` | `POST /api/github/installation/callback` | `default / default` | absent | `7558:7656` |

## goal_prompt (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `goal_prompt` | `POST /goal_prompt` | `default / default` | absent | `23349:23409` |

## goals (6)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `goals.list` | `GET /goals` | `default / default` | absent | `23410:23462` |
| `goals.get` | `GET /goals/{id}` | `default / default` | absent | `23463:23519` |
| `goals.update` | `PATCH /goals/{id}` | `default / default` | absent | `23520:23581` |
| `goals.reorder` | `PATCH /goals/{id}/order` | `default / default` | absent | `23582:23650` |
| `goals.delete` | `DELETE /goals/{id}` | `default / default` | absent | `23651:23713` |
| `goals.suggestions.decide` | `POST /goals/{goal_id}/suggestions/{suggestion_id}/decision` | `default / default` | absent | `24034:24148` |

## grants (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `grants.list` | `GET /grants` | `daemon / default` | noiseOnly=True | `15064:15148` |

## home_link_bug_reports (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `home_link_bug_reports.collect` | `POST /api/debug/home-link-bug-reports` | `default / default` | noiseOnly=True, requestBody=empty | `14194:14347` |

## idea-cards (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `idea-cards.media` | `GET /api/idea-cards/media/{handle}` | `default / media` | absent | `29747:29867` |

## identity (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `identity` | `GET /identity` | `default / default` | absent | `22012:22065` |
| `identity.subscribe` | `POST /identity/subscribe` | `default / default` | noiseOnly=True | `34860:34973` |

## iframe (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `iframe.call` | `POST /call` | `default / default` | absent | `22203:22256` |

## invite (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `invite.badge.get` | `GET /api/invite/badge` | `daemon / default` | noiseOnly=True | `14830:14929` |
| `invite.badge.seen` | `POST /api/invite/badge/seen` | `daemon / default` | noiseOnly=True | `14930:15036` |

## memory (4)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `memory.search` | `POST /memory/search` | `default / default` | absent | `17959:18023` |
| `memory.get` | `POST /memory/get` | `default / default` | absent | `18024:18082` |
| `memory.consolidate` | `POST /memory/consolidate` | `default / default` | absent | `18083:18157` |
| `memory.reindex` | `POST /memory/reindex` | `default / default` | absent | `18158:18224` |

## messenger (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `messenger.fb-check` | `GET /api/messenger/fb-check` | `default / default` | absent | `15347:15424` |
| `messenger.pin_status` | `GET /api/messenger_companion/pin-status` | `default / default` | absent | `15425:15516` |

## messenger-read (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `messenger-read.unlock` | `POST /api/messenger-read/unlock` | `default / default` | absent | `15612:15696` |

## messenger_companion (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `messenger_companion.unlock` | `POST /api/messenger_companion/unlock` | `default / default` | absent | `15517:15611` |

## model (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `model.get` | `GET /model` | `default / default` | noiseOnly=True | `33684:33748` |
| `model.set` | `POST /model` | `default / default` | noiseOnly=True | `33749:33814` |

## navigation (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `navigation.subscribe` | `POST /navigation/subscribe` | `default / default` | noiseOnly=True | `33987:34104` |
| `navigation.recents.touch` | `POST /navigation/recents/touch` | `default / default` | noiseOnly=True | `34105:34204` |
| `navigation.pinned.set` | `POST /navigation/pinned/set` | `default / default` | noiseOnly=True | `34205:34298` |

## node (5)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `node.list` | `POST /api/nodes/list` | `default / default` | absent | `30250:30335` |
| `node.register` | `POST /api/nodes/register` | `default / default` | absent | `30336:30433` |
| `node.heartbeat` | `POST /api/nodes/heartbeat` | `default / default` | absent | `30434:30534` |
| `node.unpair` | `POST /api/nodes/unpair` | `default / default` | absent | `30535:30626` |
| `node.disconnect` | `POST /api/nodes/disconnect` | `default / default` | absent | `30627:30730` |

## nodes (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `nodes.invoke_result` | `POST /nodes/invoke-result` | `default / default` | absent | `30043:30119` |
| `nodes.invoke_ack` | `POST /nodes/invoke-ack` | `default / default` | absent | `30120:30190` |
| `nodes.sync` | `POST /nodes/sync` | `default / default` | absent | `30191:30249` |

## oauth (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `oauth.callback` | `POST /oauth/callback` | `authd / default` | absent | `7402:7484` |

## onboarding (9)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `onboarding.variants` | `GET /api/onboarding/variants` | `default / default` | absent | `22817:22896` |
| `onboarding.pages.start` | `POST /onboarding/pages` | `default / default` | absent | `22897:22973` |
| `onboarding.complete` | `POST /onboarding/complete` | `default / default` | absent | `22974:23050` |
| `onboarding.reset` | `POST /onboarding/reset` | `default / default` | absent | `23051:23121` |
| `onboarding.tasks` | `GET /onboarding/tasks` | `default / default` | absent | `23122:23191` |
| `onboarding.identity` | `GET /onboarding/identity` | `default / default` | absent | `23192:23267` |
| `onboarding.identity.set` | `POST /onboarding/identity` | `default / default` | absent | `23268:23348` |
| `onboarding.state` | `GET /onboarding` | `default / default` | absent | `27346:27409` |
| `onboarding.questions` | `GET /onboarding/questions` | `default / default` | absent | `27410:27487` |

## peers (15)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `peers.status` | `GET /peers/status` | `daemon / default` | noiseOnly=True | `36797:36888` |
| `peers.list` | `GET /peers` | `daemon / default` | noiseOnly=True | `36889:36971` |
| `peers.invites.list` | `GET /peers/invites` | `daemon / default` | noiseOnly=True | `36972:37070` |
| `peers.disconnect` | `DELETE /peers/{muse_id}?relationship_generation_id={relationship_generation_id}&relationship_revision={relationship_revision}&relationship_started_at_ms={relationship_started_at_ms}&request_expires_at_ms={request_expires_at_ms}` | `daemon / default` | noiseOnly=True, requestBody=empty | `37071:37396` |
| `peers.update` | `PATCH /peers/{muse_id}` | `daemon / default` | noiseOnly=True | `37397:37493` |
| `peers.requests.list` | `GET /peers/requests` | `daemon / default` | noiseOnly=True | `37494:37594` |
| `peers.invites.create` | `POST /peers/invites` | `daemon / default` | noiseOnly=True | `37595:37696` |
| `peers.invites.accept` | `POST /peers/invites/accept` | `daemon / default` | noiseOnly=True | `37697:37805` |
| `peers.invites.open` | `POST /peers/invites/open` | `daemon / default` | noiseOnly=True | `37806:37910` |
| `peers.invites.revoke` | `DELETE /peers/invites/{invite_id}` | `daemon / default` | noiseOnly=True, requestBody=empty | `37911:38046` |
| `peers.requests.sas` | `GET /peers/requests/{relationship_generation_id}/sas` | `daemon / default` | noiseOnly=True | `38047:38179` |
| `peers.requests.sas.confirm` | `POST /peers/requests/{relationship_generation_id}/sas/confirm` | `daemon / default` | noiseOnly=True | `38180:38329` |
| `peers.discretion.write` | `POST /fs/write` | `default / default` | noiseOnly=True | `38330:38433` |
| `peers.photo` | `GET /peers/{muse_id}/photo/{sha256}` | `daemon / media` | noiseOnly=True | `38434:38603` |
| `peers.avatar` | `GET /peers/{muse_id}/avatar/{sha256}` | `daemon / media` | noiseOnly=True | `38604:38776` |

## permissions (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `permissions.settings` | `GET /permissions/settings` | `sentinel / default` | absent | `31112:31208` |
| `permissions.inventory` | `GET /permissions/inventory` | `daemon / default` | absent | `31209:31305` |
| `permissions.settings.update` | `PATCH /permissions/settings` | `sentinel / default` | absent | `31306:31411` |

## pin (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `pin.update` | `POST /api/pin-reminder/update` | `default / default` | absent | `30731:30802` |
| `pin.reminder_confirm` | `POST /api/pin-reminder/confirm` | `default / default` | absent | `30803:30885` |

## podcasts (4)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `podcasts.episodes.list` | `GET /api/podcasts/episodes` | `default / default` | absent | `23714:23794` |
| `podcasts.feed.get` | `GET /api/podcasts/feed` | `default / default` | absent | `23795:23866` |
| `podcasts.feeds.list` | `GET /api/podcasts/feeds` | `default / default` | absent | `23867:23941` |
| `podcasts.episode.delete` | `DELETE /api/podcasts/episodes/{slug}` | `default / default` | absent | `23942:24033` |

## product_improvements (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `product_improvements.get` | `GET /api/product-improvements` | `daemon / default` | noiseOnly=True | `14569:14684` |
| `product_improvements.set` | `POST /api/product-improvements` | `daemon / default` | noiseOnly=True | `14685:14801` |

## professional_consent (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `professional_consent.resume` | `POST /api/professional-consent/resume` | `default / default` | absent | `12812:12908` |

## reactions (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `reactions.toggle` | `POST /reactions/toggle` | `default / default` | absent | `18501:18571` |

## redteam (4)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `redteam.mocks.apply` | `POST /redteam/mocks` | `default / default` | absent | `26411:26481` |
| `redteam.mocks.clear` | `DELETE /redteam/mocks` | `default / default` | absent | `26482:26554` |
| `redteam.mocks.get` | `GET /redteam/mocks` | `default / default` | absent | `26555:26622` |
| `redteam.sidecar.tail` | `GET /redteam/mocks/sidecar` | `default / default` | absent | `26623:26701` |

## search (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `search.debug_overrides.get` | `GET /api/search/debug-overrides` | `default / default` | noiseOnly=True | `11127:11229` |
| `search.debug_overrides.set` | `PATCH /api/search/debug-overrides` | `default / default` | noiseOnly=True | `11230:11334` |

## session (7)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `session.start` | `POST /session/start` | `default / default` | absent | `26750:26814` |
| `session.archive` | `POST /session/archive` | `default / default` | absent | `26815:26883` |
| `session.unarchive` | `POST /session/unarchive` | `default / default` | absent | `26884:26956` |
| `session.pin` | `POST /session/pin` | `default / default` | absent | `26957:27017` |
| `session.unpin` | `POST /session/unpin` | `default / default` | absent | `27018:27082` |
| `session.rename` | `POST /session/rename` | `default / default` | absent | `27083:27149` |
| `session.delete` | `POST /session/delete` | `default / default` | absent | `27150:27216` |

## sessions (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `sessions.list` | `GET /api/session/list` | `default / default` | absent | `13239:13305` |
| `sessions.get` | `GET /api/session/list/{id}` | `default / default` | absent | `13306:13376` |

## shared_agents (15)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `shared_agents.list` | `GET /shared-agents` | `default / default` | absent | `16340:16408` |
| `shared_agents.capabilities` | `GET /shared-agents/capabilities` | `default / default` | absent | `16409:16498` |
| `shared_agents.detail` | `GET /shared-agents/{shared_agent_id}` | `default / default` | absent | `16499:16587` |
| `shared_agents.delete` | `DELETE /shared-agents/{shared_agent_id}` | `default / default` | absent | `16588:16679` |
| `shared_agents.state.update` | `PATCH /shared-agents/{shared_agent_id}/state` | `default / default` | absent | `16680:16782` |
| `shared_agents.identity.update` | `PATCH /shared-agents/{shared_agent_id}/identity` | `default / default` | absent | `16783:16891` |
| `shared_agents.definition` | `GET /shared-agents/{shared_agent_id}/definition` | `default / default` | absent | `16892:16995` |
| `shared_agents.create` | `POST /shared-agents/create-idempotent` | `default / default` | absent | `16996:17085` |
| `shared_agents.definition.update` | `PATCH /shared-agents/{shared_agent_id}/definition` | `default / default` | absent | `17086:17198` |
| `shared_agents.shares.list` | `GET /shared-agents/{shared_agent_id}/shares` | `default / default` | absent | `17199:17299` |
| `shared_agents.shares.create` | `POST /shared-agents/{shared_agent_id}/shares` | `default / default` | absent | `17300:17403` |
| `shared_agents.shares.conversation` | `GET /shared-agents/{shared_agent_id}/shares/{share_id}/conversation` | `default / default` | absent | `17404:17536` |
| `shared_agents.shares.revoke` | `POST /shared-agents/{shared_agent_id}/shares/{share_id}/revoke` | `default / default` | absent | `17537:17658` |
| `shared_agents.remote.open` | `POST /api/shared-agents/remote/open` | `default / default` | noiseOnly=True | `17659:17821` |
| `shared_agents.remote.send` | `POST /api/shared-agents/remote/send` | `default / default` | noiseOnly=True | `17822:17958` |

## sharing (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `sharing.eligibility` | `GET /api/sharing/eligibility` | `daemon / default` | noiseOnly=True | `7701:7832` |
| `sharing.attempt` | `POST /api/sharing/attempt` | `daemon / default` | noiseOnly=True | `7833:7957` |

## shopping (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `shopping.product_details` | `GET /api/shopping` | `default / default` | absent | `24818:24891` |
| `shopping.cart` | `GET /api/shopping/cart` | `default / default` | absent | `24892:24959` |
| `shopping.events` | `POST /api/shopping/events` | `default / default` | absent | `24960:25032` |

## skills (3)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `skills.list` | `GET /skills` | `default / default` | absent | `13377:13431` |
| `skills.disconnect` | `POST /skills/disconnect` | `default / default` | absent | `13432:13504` |
| `skills.set_disabled` | `POST /skills/set-disabled` | `default / default` | absent | `13505:13581` |

## spaces (18)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `spaces.list` | `GET /spaces/v2` | `default / default` | absent | `27488:27545` |
| `spaces.delete` | `DELETE /spaces/v2/{slug}` | `default / default` | absent | `27546:27615` |
| `spaces.saved.delete` | `DELETE /spaces/v2/{slug}?source=saved_space` | `default / default` | absent | `27616:27710` |
| `spaces.save` | `POST /spaces/v2/{slug}/save` | `default / default` | absent | `27711:27781` |
| `spaces.share.review` | `GET /spaces/share/{slug}/review` | `default / default` | absent | `27782:27864` |
| `spaces.share` | `POST /spaces/share/{slug}` | `default / default` | absent | `27865:27955` |
| `spaces.share.status` | `GET /spaces/share/{slug}` | `default / default` | absent | `27956:28031` |
| `spaces.unshare` | `DELETE /spaces/share/{slug}` | `default / default` | absent | `28032:28105` |
| `spaces.share.fix` | `POST /spaces/share/{slug}/fix` | `default / default` | absent | `28106:28183` |
| `spaces.debug.summary` | `GET /spaces/{slug}/debug/summary` | `default / default` | absent | `28184:28268` |
| `spaces.debug.invocations` | `GET /spaces/{slug}/debug/invocations` | `default / default` | absent | `28269:28361` |
| `spaces.debug.invocation` | `GET /spaces/{slug}/debug/invocations/{invocation_id}` | `default / default` | absent | `28362:28469` |
| `spaces.debug.log` | `GET /spaces/{slug}/debug/log` | `default / default` | absent | `28470:28546` |
| `spaces.export_html` | `GET /spaces/{slug}/export.html` | `default / media` | absent | `28547:28665` |
| `spaces.cvm.render` | `GET /spaces/cvm/{slug}/` | `default / media` | absent | `28666:28776` |
| `spaces.cvm.get` | `GET /spaces/cvm/{slug}/{*subpath}` | `default / media` | absent | `28777:28894` |
| `spaces.cvm.post` | `POST /spaces/cvm/{slug}/{*subpath}` | `default / default` | absent | `28895:28998` |
| `spaces.subscribe` | `POST /spaces/subscribe` | `default / default` | noiseOnly=True | `34974:35083` |

## ssh (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `ssh.operator.enable` | `POST /v1/ssh/operator/enable` | `ssh_access / default` | noiseOnly=True, requestBody=empty | `8804:8937` |
| `ssh.operator.disable` | `POST /v1/ssh/operator/disable` | `ssh_access / default` | noiseOnly=True, requestBody=empty | `8938:9073` |

## subagents (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `subagents.list` | `GET /subagents` | `default / default` | absent | `13582:13642` |
| `subagents.status` | `GET /subagents/status` | `default / default` | absent | `13643:13712` |

## subscription (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `subscription.callback` | `POST /subscription/callback` | `default / default` | absent | `18294:18374` |
| `subscription.redeem_complimentary` | `POST /subscription/redeem-complimentary` | `default / default` | absent | `18375:18500` |

## tasks (5)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `tasks.list` | `GET /tasks` | `default / default` | absent | `11377:11429` |
| `tasks.runs` | `GET /tasks/runs` | `default / default` | absent | `11430:11487` |
| `tasks.run` | `POST /tasks/{job_id}/run` | `default / default` | absent | `11488:11553` |
| `tasks.delete` | `DELETE /api/tasks/{job_id}` | `default / default` | requestBody=empty | `11554:11644` |
| `tasks.subscribe` | `POST /tasks/subscribe` | `default / default` | noiseOnly=True | `35204:35311` |

## theme (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `theme.subscribe` | `POST /themes/subscribe` | `default / default` | noiseOnly=True | `35312:35420` |

## username_password_auth (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `username_password_auth.callback` | `POST /username_password_auth/callback` | `authd / default` | absent | `19849:19965` |

## vault (1)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `vault.luks_status` | `GET /luks/status` | `vault / default` | noiseOnly=True | `15224:15318` |

## vm (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `vm.health` | `GET /health` | `default / default` | absent | `13826:13878` |
| `vm.enrollment_health` | `GET /health/enrollment` | `default / default` | absent | `15149:15223` |

## voice (18)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `voice.user_speech_started` | `POST /api/voice/user-speech-started` | `default / default` | absent | `5796:5888` |
| `voice.calls.user_speech` | `POST /api/voice/calls/user-speech` | `default / default` | absent | `5889:5977` |
| `voice.active_voice` | `GET /api/voice/active-voice` | `default / default` | absent | `5978:6055` |
| `voice.calls.media_endpoint` | `GET /api/voice/calls/media-endpoint` | `default / default` | absent | `6056:6149` |
| `voice.available_voices` | `GET /api/voice/available-voices` | `default / default` | absent | `6150:6235` |
| `voice.catalog` | `GET /api/voice/catalog` | `default / default` | absent | `6236:6303` |
| `voice.catalog_filters` | `GET /api/voice/catalog/filters` | `default / default` | absent | `6304:6387` |
| `voice.custom_voices.list` | `GET /api/voice/custom-voices` | `default / default` | absent | `6388:6472` |
| `voice.custom_voices.rename` | `PATCH /api/voice/custom-voices/{saved_voice_id}` | `default / default` | absent | `6473:6578` |
| `voice.custom_voices.delete` | `DELETE /api/voice/custom-voices/{saved_voice_id}` | `default / default` | requestBody=empty | `6579:6705` |
| `voice.pipeline_profiles` | `GET /api/voice/pipeline-profiles` | `default / default` | absent | `6706:6793` |
| `voice.select_pipeline_profile` | `POST /api/voice/pipeline-profile` | `default / default` | absent | `6794:6887` |
| `voice.avatar_video.prepare` | `POST /api/voice/avatar-video/prepare` | `default / default` | noiseOnly=True | `6888:7016` |
| `voice.start_call` | `POST /api/voice/start-call` | `default / default` | absent | `7113:7187` |
| `voice.end_call` | `POST /api/voice/end-call` | `default / default` | absent | `7188:7258` |
| `voice.onboarding.reset` | `POST /api/voice/onboarding/reset` | `default / default` | absent | `7259:7345` |
| `voice.dictation` | `POST /api/voice/dictation?sample_rate_hz={sample_rate_hz}` | `default / default` | noiseOnly=True | `20549:20666` |
| `voice.calls.join` | `POST /voice/calls/join` | `default / default` | absent | `22257:22327` |

## wallet (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `wallet.get` | `GET /wallet` | `default / default` | absent | `30886:30939` |
| `wallet.set` | `POST /wallet` | `default / default` | absent | `30940:30994` |

## whatsapp (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `whatsapp.login` | `POST /whatsapp/login` | `default / default` | absent | `19966:20032` |
| `whatsapp.install` | `POST /whatsapp/install` | `default / default` | absent | `20033:20103` |

## whatsapp_companion (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `whatsapp_companion.link` | `POST /whatsapp_companion/link` | `default / default` | absent | `20104:20188` |
| `whatsapp_companion.status` | `GET /whatsapp_companion/status` | `default / default` | absent | `20189:20276` |

## widgets (2)

| Operation | Verb dan route | Service / channel | Flag | Byte range |
| --- | --- | --- | --- | --- |
| `widgets.state.set` | `POST /widgets/state` | `default / default` | noiseOnly=True | `33815:33896` |
| `widgets.state.patch` | `POST /widgets/state/patch` | `default / default` | noiseOnly=True | `33897:33986` |

## Cara membaca byte range

Range memakai UTF-8 byte offsets `[start,end)`, bukan nomor baris source original. Public minified chunk beserta hash dan URL tersedia di manifest lokal. Exact source-map/module reconstruction tidak dilakukan.
Ledger `frontend-source-evidence.json` menyimpan 32 potongan terverifikasi untuk kontrak yang dibahas, sedangkan tiga summary REA mencatat parse/semantic limits. Mirror repo menyimpan indeks/hash/range dan registry; raw bundle/excerpts tetap pada scratch evidence lokal.
<!-- notion-content:end -->
