# The local NMA-028 image is built from its locked isolation.Dockerfile and notices.
# Supply its recorded immutable image ID as BASE_IMAGE; no floating upstream base.
ARG BASE_IMAGE=ngertiin-native-base:b81f1bf356adb3f4c
FROM ${BASE_IMAGE}
LABEL org.ngertiin.native.protocol="nma.native-tools.v1" \
      org.ngertiin.hermes.revision="7489b22af47ce91b366dde81d5831ea422577498"
USER root
RUN apt-get update && apt-get install -y --no-install-recommends nodejs poppler-utils && rm -rf /var/lib/apt/lists/*
COPY apps/engine/native-dependencies.json /opt/engine/native-dependencies.json
RUN /opt/native/bin/python -c "import base64,hashlib,io,json,tarfile,urllib.request; p=json.load(open('/opt/engine/native-dependencies.json'))['pyright']; data=urllib.request.urlopen(p['url']).read(); assert base64.b64encode(hashlib.sha512(data).digest()).decode()==p['sha512']; tarfile.open(fileobj=io.BytesIO(data)).extractall('/opt/lsp',filter='data')" \
    && printf '#!/bin/sh\nexec /usr/bin/node /opt/lsp/package/langserver.index.js "$@"\n' > /usr/local/bin/pyright-langserver \
    && chmod 755 /usr/local/bin/pyright-langserver && chmod -R a+rX /opt/lsp
COPY apps/engine/src/ngertiin_engine /opt/engine/ngertiin_engine
ENV PYTHONPATH=/opt/hermes:/opt/engine
USER probe
ENTRYPOINT ["/opt/native/bin/python", "/opt/engine/ngertiin_engine/native_worker.py", "serve"]
