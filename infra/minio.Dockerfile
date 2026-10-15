# Archived official release, verified with its published checksum.
# This avoids depending on the now-unavailable official container registry.
FROM alpine:3.22 AS download
ARG TARGETARCH
RUN apk add --no-cache curl libarchive-tools
WORKDIR /release
RUN case "$TARGETARCH" in arm64) ARCH=aarch64;; amd64) ARCH=x86_64;; *) exit 1;; esac; \
    FILE="minio-20250907161309.0.0-1.${ARCH}.rpm"; \
    BASE="https://github.com/minio/minio/releases/download/RELEASE.2025-09-07T16-13-09Z"; \
    curl --fail --location --retry 3 "$BASE/$FILE" -o "$FILE" && \
    curl --fail --location --retry 3 "$BASE/$FILE.sha256sum" -o checksum && \
    sha256sum -c checksum && mkdir /extracted && bsdtar -xf "$FILE" -C /extracted

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl && adduser -D -u 1000 minio && mkdir /data && chown minio /data
COPY --from=download /extracted/usr/local/bin/minio /usr/local/bin/minio
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
