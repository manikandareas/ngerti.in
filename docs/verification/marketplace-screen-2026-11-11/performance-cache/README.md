# Marketplace catalog performance and persistent cache

Date: 2026-11-11. Scope: the owner's request to reduce Marketplace page weight and retain slow-changing catalog data. This supersedes the five-minute memory cache and global image preparation described in the earlier [category-navigation cohort](../category-navigation/README.md). The API contract remains 1.32.0.

## Delivered behavior

Public catalog metadata is projected into a versioned IndexedDB envelope and reused for seven days at the same application origin, including after document reload or application restart. Metadata under thirty days old can appear immediately while stale discovery revalidates in the background. Provider-connected flags, local account status and grants are excluded. Cache shape, age, public URLs and fields are checked on read; incompatible, expired or restricted storage falls back to discovery. A failed background refresh preserves the full retained catalog instead of publishing a partial replacement. Initial uncached discovery still stages cursor pages atomically and uses row skeletons.

The renderer mounts whole sections near the viewport, with at most six preview rows, and full categories in 24-item batches. It reserves offscreen space and starts mounting 600px ahead of the scroll viewport. Heading focus activates its group; category row focus prepares the next batch so Tab can continue. Mounted groups remain available while scrolling back. Search indexes the complete catalog, including unmounted apps and secondary categories. Catalog grouping/indexing and connection-derived arrays are memoized across unrelated conversation updates.

Logos remain exclusively Composio URLs. Only mounted rows request their images; a reserved icon skeleton covers loading and a generic glyph covers failure. The old global image-preparation barrier and its all-category preloads are removed, so a slow logo cannot delay readable catalog rows.

Connection status is independent of the metadata cache. It reads on entry and refreshes for app-connection events, local mutation/authorization receipts, focus/visibility/online return and every thirty seconds while visible and online. Conversation or agent updates no longer trigger catalog/account reads solely because the global conversation cursor advanced. Install, verification, scoped grants and uninstall retain their existing authority and controls.

## Evidence

The red feedback loops used the actual routed Marketplace and application API:

- Reload-cache regression: cached rows disappeared after a new document and catalog discovery was requested again.
- Rendering regression: all 600 fixture entries mounted on entry; the bounded-render assertion failed at 600 versus the 60-row budget.
- Status invalidation regression: an unrelated real agent configuration event increased connection reads from two to three.

After the fixes, a 600-app/100-category fixture mounts 30 rows and requests 30 logos on initial desktop entry, and 12 rows/logos on mobile. This is a 95%/98% reduction in initial mounted rows compared with 600. Recorded fixture navigation-to-first-row times are diagnostic single samples, not live Composio latency or a production SLO. Complete-catalog search still finds app 599, scrolling reaches it, and the 215-item category test reaches item 214 and traverses the 24-row keyboard batch boundary.

The cache test advances time by six hours, reloads twice with catalog discovery blocked, and reads changed active/revoked connections from the API without another catalog request. Other tests cover eight-day background refresh, a failed partial refresh retaining stale data, schema-version rejection, thirty-one-day expiry and disabled IndexedDB. Provider-connected metadata never establishes installation. A held catalog page keeps rows staged; a held logo leaves readable rows and an icon skeleton.

Validation: 40/40 Marketplace desktop/mobile cases, four real-API application-workflow cases and six affected Settings cases; web build/TypeScript and lint pass. The docs check retains its eight pre-existing broken GPUI skill links and no new broken links. Exact logs, source hashes and artifact hashes are in manifest.json.

The retained [WebKit visual probe](capture.ts) reads a live 100-app Composio sample, then serves that public metadata to isolated real-API application fixtures with controlled connection state. It verifies a single catalog request across reload and fresh installation status, and captures overview/category screens in both themes at 1440×1000 and 390×844. All eight captures have no horizontal overflow or browser page errors. The visual sample does not claim to enumerate every live provider app; full live discovery remains the earlier 1,724-app evidence cohort. WebKit is browser-engine evidence, not a new native Tauri package launch or real OAuth approval. Inference, live account authorization and MCP execution were not performed.

No server/native API implementation, provider credential, contract export, milestone status or dependency was changed for this performance refinement. Historical evidence stays scoped to its original source cohort.
