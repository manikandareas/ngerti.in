# Task cleanup check excerpts — 2026-11-04

Native verifier iterations and boundaries are recorded in [the report](cleanup-2026-11-04.md).

## ngertiin-cleanup-all-tests.log

```text
@ngertiin/server test: (pass) window commands reject missing mutation identities and unsupported URL schemes [92.56ms]
@ngertiin/server test: (pass) existing native sessions receive current cleanup policy in every turn context [52.11ms]
@ngertiin/server test: (pass) observations made during cleanup cannot authorize a subsequent agent click [226.44ms]
@ngertiin/server test: 
@ngertiin/server test:  392 pass
@ngertiin/server test:  0 fail
@ngertiin/server test:  2409 expect() calls
@ngertiin/server test: Ran 392 tests across 42 files. [68.51s]
@ngertiin/server test: Exited with code 0
```

## ngertiin-cleanup-tests.log

```text
(pass) window commands reject missing mutation identities and unsupported URL schemes [41.63ms]
(pass) existing native sessions receive current cleanup policy in every turn context [42.53ms]
(pass) observations made during cleanup cannot authorize a subsequent agent click [132.72ms]

 22 pass
 0 fail
 94 expect() calls
Ran 22 tests across 2 files. [3.20s]
```

## ngertiin-cleanup-typecheck.log

```text
@ngertiin/server typecheck: Exited with code 0
```

## ngertiin-cleanup-lint.log

```text
@ngertiin/server lint: Checked 186 files in 1561ms. No fixes applied.
@ngertiin/server lint: Exited with code 0
```

## ngertiin-cleanup-native.log

```text
{"check":"owned_browser_window_with_multiple_native_tabs","passed":true}
{"check":"parent_settlement_does_not_close_peer_resources","passed":true}
{"check":"successful_chain_closes_owned_browser_tabs_and_terminal_only","passed":true}
{"check":"working_file_and_immutable_artifact_survive_cleanup","passed":true}
{"check":"explicit_result_preview_remains_open","passed":true}
{"check":"versioned_api_and_product_tool_export","passed":true}
```
