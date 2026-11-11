# Marketplace category navigation and stable reveal

Date: 2026-11-11. Scope: the owner's six-item category preview, clickable category label and smooth loading refinement. This report follows the [catalog/authorization amendment](../catalog-and-authorization/README.md); its earlier presentation and source hashes remain historical.

## Delivered behavior

Plugin category names use Title Case, preserving common acronyms such as AI, API and CRM. Overview sections show at most six apps each. Every plugin section heading/chevron opens its full category screen, following the supplied references. The category screen uses the same sidebar and search-only toolbar, with a breadcrumb and unrestricted category list. Provider slugs back the `category` page parameter, including detail return, reload and browser Back. Category membership includes secondary tags. Global search still searches the whole catalog; category search stays within its category. Available Skills keep their existing full scoped list.

The browser resource stages provider pages instead of adding rows after each response. A settled attempt is published once, after preparing the first six provider logo URLs per category. Successful catalog metadata is shared in memory for five minutes; in-flight work finishes across closing/reopening Marketplace. Partial failures retain data for explicit retry and preserve the failed cursor. Installation/account status remains a separate live resource. No backend/API contract change was introduced.

Logo loading is eager and row content-visibility deferral is removed. Category pages prepare their visible batch before reveal as well. Image preparation is bounded to 1.5 seconds: an unavailable or slow image cannot block the page indefinitely. Missing/broken images retain the existing generic glyph fallback; no static vendor asset is used. Initial network discovery still requires skeletons. This improves coherent reveal and warm navigation, rather than claiming an instantaneous cold network load.

## Verification

| Check | Result |
| --- | --- |
| Web build / TypeScript and lint | Pass; existing bundle-size advisories remain |
| Marketplace Playwright | 28/28 desktop/mobile cases |
| Real-API app workflows | 4/4; installation, authorization recovery, scoped grants and effective revocation retained |
| Affected Settings journeys | 6/6; conversation/draft continuity and old Apps URL behavior retained |
| Category fixtures | Lowercase category names become Developer Tools, AI Agents and CRM & Sales; previews are 6/6/1; the full Developer Tools page includes nine matches, including a secondary-category app |
| Navigation/cache | Keyboard activation, scoped search, detail breadcrumb, reload, Back, a warm reopen without another catalog request, and refresh after five-minute expiry |
| Delayed data/images | Held provider page leaves zero rows; a held preview logo keeps the initial skeleton; all six previews reveal together; close/reopen shares the original two catalog requests and the full category contains all twelve items |
| Provider pagination/retry | 215 deduplicated items remain reachable in the category view after a partial-page failure/retry; overview stays at six |
| Visual review | Desktop/mobile in both themes; 100 live provider apps produce 94 overview rows with 94 decoded logo URLs, all section sizes at most six, and a full 12-app sample category. No horizontal overflow. Fixture screenshots cover six-preview/nine-category navigation and delayed batches. |
| Documentation links | Same eight pre-existing GPUI skill links; no new broken links |

Exact commands, source hashes and screenshot hashes are in manifest.json. Automated provider/authorization data is fixture-controlled while application HTTP, SQLite, revisions and grants are real. The live visual sample uses public Composio catalog metadata with fixture app state and no installed accounts. Account login, OAuth approval, MCP execution, native packaging and product/distribution gates were not exercised or promoted. Existing API/native proof is reused only for unchanged source scope.
