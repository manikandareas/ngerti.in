# Local-CDP browser distribution profile

Date: 2026-10-25. This closes the browser package dependency boundary for the
**selected local Chromium/CDP backend** in NMA-028. It does not assert acceptance
of every Browser Use hosted service, a new Hermes runtime pin, or a production
deployment. Native browser interaction and worker isolation still require the
companion live evidence.

## Decision and source basis

Build a deterministic, locally versioned **metadata-only** Browser Harness wheel:
`browser-harness==0.1.13+ngertiin.localcdp.1`. Preserve every upstream Python
module, resource, entry point and the exact MIT notice. Move the dependency on
`fetch-use==0.4.0` from the unconditional requirements to an **unselected optional
`fetch-proxy` extra**. Resolve and validate all selected dependencies normally.
The distribution name remains compatible with native imports and metadata lookups;
the local version identifies the reviewed adaptation rather than masquerading
as the unmodified upstream release.

The exact Browser Harness 0.1.13 source contains a single lazy `fetch_use` import,
inside `helpers.http_get` (lines 628–641). It is conditioned on
`BROWSER_USE_API_KEY`; upstream explicitly catches `ImportError` and performs a
local urllib request instead. Its own docstring calls this helper pure HTTP,
not a browser operation. Native navigation, form interaction, screenshot,
upload, raw CDP and browser downloads use the independent CDP helpers. Hermes's
`browser_exec` launches this same package through `python -m browser_harness.run`;
its dispatcher and model-visible browser schema do not change.

This follows the optional behavior already implemented in source. It is an
explicit dependency/backend profile with an auditable metadata delta and an
ordinary resolver-compatible installed set. Simply ignoring declared dependencies
with `--no-deps` would leave inconsistent metadata and would not establish this
boundary. No copyrighted file from fetch-use is copied, no missing notice is
invented and no existing notice is relabelled as a fetch-use notice.

Sources: [exact Browser Harness release metadata](https://pypi.org/pypi/browser-harness/0.1.13/json),
[exact source wheel](https://files.pythonhosted.org/packages/4a/bd/f166cf9a465eff436048d25851ab28b0d798af02b56998127a4165227fc4/browser_harness-0.1.13-py3-none-any.whl),
[Hermes browser dispatcher at the retained pin](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/browser_use_cli.py#L252-L270).
The wheel bytes and extracted helper/module hashes, rather than mutable `main`,
are the source of the compatibility finding.

## Exact provenance and patch

- Hermes source pin stays `7489b22af47ce91b366dde81d5831ea422577498`; no Hermes
  source patch is introduced by this package profile.
- Upstream wheel SHA-256:
  `2491459e4bfc0ee8aea22dc6c4680fc0f791b7ba553446323c50d2883449d769`.
- Original MIT notice SHA-256:
  `5afa3d97bf1e6f998d587fa101e3fe0d0c416840b7fe77bcd6ae97690a334631`.
- Derived wheel SHA-256:
  `49c26eb458f31b2e58af3334821d721b1bddf892be109a74b29ea191c0f0a0ea`.
- The patch changes only `METADATA` version/extra requirements, the renamed
  dist-info directory, a new `NGERTIIN-PROFILE.json` provenance record and rebuilt
  wheel `RECORD` checksums. Module/resource bytes and existing entry-point/notice
  bytes remain identical. Zip member order, timestamps and storage are fixed;
  two independent in-process builds produce identical bytes.
- The profile keeps exact `cdp-use==1.4.5`, `pillow==12.3.0` and
  `websockets==15.0.1`. The existing unselected MCP extra stays unchanged.
  Final Hermes packaging must retain the source lock's exact transitive versions.

[The builder](../../scripts/spikes/nma028/packaging_resolve.py) refuses changed
upstream bytes, changed notice bytes, a changed lazy-import/fallback block or
additional `fetch_use` imports. It verifies all upstream modules/resources and
the notice after producing the wheel. This deliberately pins a narrow adaptation;
an upstream update requires review rather than silently inheriting this rule.

[The machine-readable profile and verification](evidence/nma-028-closure/packaging-local-cdp.json)
contains every retained source hash, supported operation list, provider boundary,
clean installed-package versions and notice hashes.

## Supported configuration and unresolved variant

| Operation or provider | Profile disposition |
| --- | --- |
| Native `browser_exec`, local Chromium or an explicitly bound CDP endpoint | Included, with unchanged native Python and CDP helper semantics. Real task evidence belongs in the companion closure suite. |
| Navigation, inspection, forms, screenshot, upload, raw CDP and browser-managed download | Included; no helper source is removed or rewritten. Each operation still needs its live task oracle. |
| `http_get` without hosted Fetch credentials | Included; upstream urllib path passes the synthetic local HTTP oracle. |
| Browser Use hosted Fetch proxy through `http_get` | Unselected provider variant. Its optional extra is not installed, accepted or counted as satisfied. Exact fetch-use notice gap remains recorded. |
| Other native web extraction/search implementations | Unchanged; NMA-033 owns their selected provider/operation manifests and verification. |
| Browser Use cloud-browser/CDP provider | Not selected by this local-CDP configuration. Cloud browser selection is separate from the optional HTTP Fetch proxy; this profile makes no cloud entitlement/reliability claim. |

The product plan requires a supported-configuration manifest rather than
simultaneous deployment of every vendor. Choosing local Chromium/CDP therefore
does not remove the browser capability or approve a feature exclusion. It leaves
the optional hosted HTTP service unselected with a visible prerequisite gap.
If that variant is selected later, NMA-030/033 must resolve its exact dependency
notices and configuration before enabling the extra. Do not pass its service key
to this selected local-CDP configuration as an implied entitlement.

The [fetch-use 0.4.0 metadata](https://pypi.org/pypi/fetch-use/0.4.0/json) still
declares MIT while its exact wheel/sdist lack notice files; prior archive hashes
and repository 404 checks remain in the original packaging evidence. No claim
that the missing original notice was recovered is made. Browser Harness
0.1.10–0.1.12 metadata was also checked: each still declares the same Fetch
dependency. Downgrading to one of those releases would not resolve the dependency
boundary and would add source behavior changes unnecessarily. Current release
metadata still reports 0.1.13 and 0.4.0; no alternate Hermes pin is required or
silently selected for this profile.

## Reproduction and measured verification

From the repository root:

```bash
.dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/packaging_resolve.py \
  --output .dev/nma-028-closure/packages
uv venv --python .dev/nma-006-closure/runtime/bin/python \
  .dev/nma-028-closure/local-cdp-env
uv pip install --python .dev/nma-028-closure/local-cdp-env/bin/python \
  .dev/nma-028-closure/packages/browser_harness-0.1.13+ngertiin.localcdp.1-py3-none-any.whl
uv pip check --python .dev/nma-028-closure/local-cdp-env/bin/python
```

A fresh CPython 3.14.9 environment resolved and installed 11 packages normally.
`uv pip check` confirms all installed requirements are compatible; `fetch_use`
is absent. Importing native Browser Harness helpers succeeds, and the unmodified
`http_get` returns `NMA028_LOCAL_HTTP` from a real loopback fixture. Every one of
the 11 installed distributions has an installed notice file; their exact hashes
are recorded. No service credentials, user account or user state were read.

That standalone check resolves transitive packages from PyPI and is **not** a
claim that those versions equal the full Hermes lock. The final image builder
must use the normal exact pinned Hermes requirement list, replace its upstream
Browser Harness requirement with this local wheel, omit the unselected Fetch
service requirement and run an installed-package consistency/notice check.
The companion container/native live corpus must prove browser-managed downloads
and the rest of the chosen browser contract before NMA-028 closes.

The only output wheel built during this research is under the ignored
`.dev/nma-028-closure/packages` directory. Reproduction downloads the immutable
hash-verified upstream wheel; no compiled binary is checked into product source.
Ruff lint/format and owned-file whitespace checks pass. Existing evidence and
production package files are preserved.
