FROM python:3.14.3-slim-bookworm@sha256:f21c0d5a44c56805654c15abccc1b2fd576c8d93aca0a3f74b4aba2dc92510e2
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git libatomic1 chromium && rm -rf /var/lib/apt/lists/*
COPY apps/engine/fetch_runtime.py /probe/fetch_runtime.py
COPY apps/engine/.runtime/source.tar.gz /probe/source.tar.gz
RUN python /probe/fetch_runtime.py /probe/source.tar.gz --extract /opt/hermes && rm /probe/source.tar.gz
COPY apps/engine/src/ngertiin_engine/runtime-pin.json /probe/runtime-pin.json
COPY scripts/spikes/nma028/packaging_resolve.py /probe/packaging_resolve.py
RUN python /probe/packaging_resolve.py --output /probe/packages
COPY scripts/spikes/nma028/build_isolated.py /probe/build_isolated.py
ENV HERMES_RUNTIME_DIR=/opt/hermes-pm HERMES_HOME=/tmp/build-home
RUN python /probe/build_isolated.py && rm -rf /tmp/build-home /root/.cache && chmod -R a+rX /opt
COPY scripts/spikes/nma028/isolated_tools.py /probe/isolated_tools.py
RUN useradd --uid 10001 --create-home probe && mkdir /work && chown probe:probe /work
USER probe
WORKDIR /work
ENV PYTHONPATH=/opt/hermes HERMES_HOME=/work/state HERMES_DISABLE_LAZY_INSTALLS=1 BU_CDP_URL=http://127.0.0.1:9222 BH_HOME=/work/harness
ENTRYPOINT ["/opt/native/bin/python", "/probe/isolated_tools.py", "serve"]
