# Brave real-case verification log excerpts — 2026-11-04

Initial failing regressions are recorded separately from the final passing checks.

## ngertiin-brave-creation-before.log

```text
402 |       throw new DomainError("ROUTING_STALE");
                  ^
error: ROUTING_STALE
 status: 409,
   code: "ROUTING_STALE"

      at routingPacket (/Users/vitoandareasmanik/Development/project/ngertiin/apps/server/src/groups/service.ts:402:13)
      at <anonymous> (/Users/vitoandareasmanik/Development/project/ngertiin/apps/server/tests/creation.test.ts:191:17)
(fail) Jev group creation routes the final annotated opener and retains stale-content fencing [27.89ms]

 7 pass
 1 fail
 38 expect() calls
Ran 8 tests across 1 file. [1236.00ms]
```

## ngertiin-brave-creation-after.log

```text
apps/server/tests/creation.test.ts:
(pass) creation collision handling and restart replay preserve one human opener and admission [108.20ms]
(pass) billing mismatch rolls back creation without fallback [19.25ms]
(pass) group creation admits one router and scoped configuration never edits member profiles [32.19ms]
(pass) missing connection persists the identity and opener until explicitly configured [36.58ms]
(pass) failed opening retries reuse input; unknown outcomes never admit replacements [27.93ms]
(pass) HTTP concurrent retries share creation and distinct actions avoid name collisions [157.99ms]
(pass) group tool lease cannot rewrite global profiles and can update only its group [74.34ms]
(pass) Jev group creation routes the final annotated opener and retains stale-content fencing [45.61ms]

 8 pass
 0 fail
 43 expect() calls
Ran 8 tests across 1 file. [1242.00ms]
```

## ngertiin-brave-event-before.log

```text
                       ^
error: expect(received).toBe(expected)

Expected: "Event connection lost. Reconnecting…"
Received: "stalled"

      at <anonymous> (/Users/vitoandareasmanik/Development/project/ngertiin/apps/web-client/verification/event-connection.test.ts:39:19)
(fail) a stalled open event connection is aborted so its caller can reconcile and reconnect [116.46ms]
(pass) heartbeats keep an idle event stream alive beyond one inactivity window [71.03ms]

 1 pass
 1 fail
 3 expect() calls
Ran 2 tests across 1 file. [427.00ms]
```

## ngertiin-brave-event-after.log

```text
bun test v1.3.10 (30e609e0)

apps/web-client/verification/event-connection.test.ts:
(pass) a stalled open event connection is aborted so its caller can reconcile and reconnect [24.10ms]
(pass) heartbeats keep an idle event stream alive beyond one inactivity window [70.78ms]

 2 pass
 0 fail
 4 expect() calls
Ran 2 tests across 1 file. [127.00ms]
```

## ngertiin-brave-all-tests.log

```text
@ngertiin/server test: tests/machines/domain.test.ts:
@ngertiin/server test: (pass) DM and group contexts bind one machine while retaining distinct logical workspaces [50.87ms]
@ngertiin/server test: (pass) multi-step input has one owner; human takeover waits for in-flight input and fences agents [170.61ms]
@ngertiin/server test: (pass) unknown input survives restart, cannot replay, and can be reconciled by a fresh observation [102.22ms]
@ngertiin/server test: (pass) server-owned session identity and current grants cannot be supplied or bypassed by tool arguments [64.24ms]
@ngertiin/server test: (pass) async file commands commit independently while I/O waits and coalesce exact concurrent retries [27.03ms]
@ngertiin/server test: (pass) interrupted file projection retains its reservation across restart and rechecks scope before commit [31.89ms]
@ngertiin/server test: (pass) human handback waits for media quiescence and disconnected control expires [105.18ms]
@ngertiin/server test: 
@ngertiin/server test:  369 pass
@ngertiin/server test:  0 fail
@ngertiin/server test:  2314 expect() calls
@ngertiin/server test: Ran 369 tests across 40 files. [50.88s]
@ngertiin/server test: Exited with code 0
```

## ngertiin-brave-web-tests.log

```text
apps/web-client/verification/avatar-engine.test.ts:
(pass) Ngertiin avatar engine > seeded identities and persisted recipes reproduce exactly [21.40ms]
(pass) Ngertiin avatar engine > rejects unsupported versions and malformed recipes at import boundaries [2.49ms]
(pass) Ngertiin avatar engine > renders all 1280 shape/color/face combinations without invalid coordinates [4938.31ms]
(pass) Ngertiin avatar engine > arbitrary seeds stay outside markup and rendering can use unique gradient IDs [17.08ms]
(pass) Ngertiin avatar engine > default portraits use mouthless eyes and reject untrusted texture markup [15.69ms]
(pass) Ngertiin avatar engine > all states and actions have finite poses and honor reduced motion [2.67ms]
(pass) Gravity overthinking loading > one local timeline coordinates calm, intensity, recovery and reduced motion [0.34ms]
(pass) Gravity overthinking loading > loading SVG includes both depth layers and veins without modifying the recipe [18.25ms]

 30 pass
 0 fail
 8806 expect() calls
Ran 30 tests across 8 files. [5.28s]
```

## ngertiin-brave-lint.log

```text
@ngertiin/server lint: Checked 181 files in 668ms. No fixes applied.
@ngertiin/server lint: Exited with code 0
```

## ngertiin-brave-typecheck.log

```text
@ngertiin/server typecheck: Exited with code 0
```

## ngertiin-brave-web-lint.log

```text
$ biome check .
Checked 266 files in 390ms. No fixes applied.
```

## ngertiin-brave-web-typecheck.log

```text
$ tsc -b --noEmit
```

## ngertiin-brave-web-build.log

```text
@ngertiin/web-client build: dist/assets/typescript-j_1H8WHN.js                              181.06 kB │ gzip:  16.23 kB
@ngertiin/web-client build: dist/assets/forms-CB6rzDuz.js                                   214.59 kB │ gzip:  69.24 kB
@ngertiin/web-client build: dist/assets/index-3un-83M2.js                                   384.01 kB │ gzip: 123.57 kB
@ngertiin/web-client build: dist/assets/display-niSZfTDo.js                                 427.15 kB │ gzip: 129.74 kB
@ngertiin/web-client build: dist/assets/workspace-layout-B9OcInyx.js                        673.08 kB │ gzip: 209.93 kB
@ngertiin/web-client build: dist/assets/cpp-Cts1PyIS.js                                     796.95 kB │ gzip:  60.65 kB
@ngertiin/web-client build: 
@ngertiin/web-client build: [plugin builtin:vite-reporter] 
@ngertiin/web-client build: (!) Some chunks are larger than 500 kB after minification. Consider:
@ngertiin/web-client build: - Using dynamic import() to code-split the application
@ngertiin/web-client build: - Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
@ngertiin/web-client build: - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
@ngertiin/web-client build: ✓ built in 3.74s
@ngertiin/web-client build: Exited with code 0
```
