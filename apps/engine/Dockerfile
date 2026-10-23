FROM python:3.14.3-slim-bookworm@sha256:f21c0d5a44c56805654c15abccc1b2fd576c8d93aca0a3f74b4aba2dc92510e2 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git libatomic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/hermes
COPY fetch_runtime.py /tmp/fetch_runtime.py
RUN --mount=type=bind,source=.runtime/source.tar.gz,target=/tmp/hermes.tar.gz python /tmp/fetch_runtime.py /tmp/hermes.tar.gz --extract /opt/hermes
ENV HERMES_RUNTIME_DIR=/opt/hermes-pm HERMES_HOME=/tmp/build-home
COPY build_runtime.py /opt/ngertiin/build_runtime.py
COPY src/ngertiin_engine/runtime-pin.json /opt/ngertiin/src/ngertiin_engine/runtime-pin.json
RUN python /opt/ngertiin/build_runtime.py --source /opt/hermes --out /opt/runtime && rm -rf /tmp/build-home /root/.cache
COPY src /opt/ngertiin/src
COPY pyproject.toml /opt/ngertiin/pyproject.toml
COPY collect_inventory.py /opt/ngertiin/collect_inventory.py
COPY notices /opt/ngertiin/notices
RUN /opt/runtime/bin/python /opt/ngertiin/collect_inventory.py --verify-foundation > /opt/ngertiin/runtime-inventory.json
ENV PYTHONPATH=/opt/ngertiin/src:/opt/hermes HERMES_SOURCE=/opt/hermes HERMES_HOME=/state PYTHONUNBUFFERED=1 HERMES_DISABLE_LAZY_INSTALLS=1
RUN useradd --uid 10001 --create-home engine && mkdir /state && chown engine:engine /state
USER engine
ENTRYPOINT ["/opt/runtime/bin/python", "-m", "ngertiin_engine.service"]


FROM runtime AS verify
USER root
RUN HERMES_HOME=/tmp/build-home python /opt/ngertiin/build_runtime.py --source /opt/hermes --out /opt/test-runtime --tests && rm -rf /tmp/build-home /root/.cache
COPY tests /opt/ngertiin/tests
USER engine
RUN NMA_TEST_RUNTIME_PYTHON=/opt/runtime/bin/python /opt/test-runtime/bin/python -m pytest /opt/ngertiin/tests -q -s > /tmp/runtime-tests.log || (cat /tmp/runtime-tests.log && exit 1)
RUN /opt/test-runtime/bin/python /opt/ngertiin/collect_inventory.py --verify-foundation > /tmp/test-inventory.json

FROM scratch AS evidence
COPY --from=verify /tmp/runtime-tests.log /runtime-tests.log
COPY --from=verify /opt/ngertiin/runtime-inventory.json /runtime-inventory.json
COPY --from=verify /tmp/test-inventory.json /test-inventory.json
COPY --from=verify /opt/runtime/foundation-profile.json /foundation-profile.json

FROM runtime AS foundation
