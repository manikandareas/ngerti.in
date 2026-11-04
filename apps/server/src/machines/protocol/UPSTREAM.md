# Cua viewer protocol provenance

Copied without changes from `trycua/cua` commit `33db0d554751b5f8b816d9c7deb7449d84278346`, under `libs/cua/crates/cua-spacesd-html5/web/src/gen/cua/env/v1/`:

- `common_pb.ts`: `15bf8dfdf089a209565670fba57cc73c44ba0ebcfca2e3ee5d479eba4e8051d7`
- `windows_pb.ts`: `ee799e4b6baf85a9ff4399f225d4136868a80d74e17d736c1fab04a30a477edf`
- `stream_pb.ts`: `d598b1250f6014eb51397fa0b4a178de4b0c82dbbbb0947526160356b6deb9a7`

Component license: `LICENSE.viewer` (FSL-1.1-MIT). Dependency: pinned `@bufbuild/protobuf@2.15.0`. These files decode/re-encode OpenMedia responses so the stock Cua viewer uses Ngertiin's revision-fenced media endpoint. Other viewer assets are served from the pinned machine image.

Upgrade all three files together from a reviewed revision, preserve the license, check hashes/framing, then run backend and native iframe/takeover/revocation/restart verification. Measure the image service version independently of the SDK release.
