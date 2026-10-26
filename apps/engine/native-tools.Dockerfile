# The local NMA-028 image is built from its locked isolation.Dockerfile and notices.
# Supply its recorded immutable image ID as BASE_IMAGE; no floating upstream base.
ARG BASE_IMAGE=ngertiin-native-base:b81f1bf356adb3f4c
FROM ${BASE_IMAGE}
LABEL org.ngertiin.native.protocol="nma.native-tools.v1" \
      org.ngertiin.hermes.revision="7489b22af47ce91b366dde81d5831ea422577498"
COPY apps/engine/src/ngertiin_engine/native_worker.py /opt/engine/ngertiin_engine/native_worker.py
ENTRYPOINT ["/opt/native/bin/python", "/opt/engine/ngertiin_engine/native_worker.py", "serve"]
