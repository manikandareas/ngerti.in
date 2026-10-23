FROM python:3.14.3-slim-bookworm@sha256:f21c0d5a44c56805654c15abccc1b2fd576c8d93aca0a3f74b4aba2dc92510e2 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git libatomic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/hermes
COPY fetch_runtime.py /tmp/fetch_runtime.py
RUN --mount=type=bind,source=.runtime/source.tar.gz,target=/tmp/hermes.tar.gz python /tmp/fetch_runtime.py /tmp/hermes.tar.gz --extract /opt/hermes
ENV HERMES_RUNTIME_DIR=/opt/hermes-pm HERMES_HOME=/tmp/build-home
RUN python -m pm.build_env --source /opt/hermes --out /opt/runtime --group dev --group test && rm -rf /tmp/build-home /root/.cache
COPY src /opt/ngertiin/src
COPY tests /opt/ngertiin/tests
COPY pyproject.toml /opt/ngertiin/pyproject.toml
COPY collect_inventory.py /opt/ngertiin/collect_inventory.py
ENV PYTHONPATH=/opt/ngertiin/src:/opt/hermes HERMES_SOURCE=/opt/hermes HERMES_HOME=/state PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --create-home engine && mkdir /state && chown engine:engine /state
USER engine
ENTRYPOINT ["/opt/runtime/bin/python", "-m", "ngertiin_engine.service"]


FROM runtime AS verify
RUN /opt/runtime/bin/python -m pytest /opt/ngertiin/tests -q -s > /tmp/runtime-tests.log || (cat /tmp/runtime-tests.log && exit 1)
RUN /opt/runtime/bin/python /opt/ngertiin/collect_inventory.py > /tmp/runtime-inventory.json

FROM scratch AS evidence
COPY --from=verify /tmp/runtime-tests.log /runtime-tests.log
COPY --from=verify /tmp/runtime-inventory.json /runtime-inventory.json
