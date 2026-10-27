ARG BASE_IMAGE=ngertiin-native-base:69b9e9b7ca9eb47b
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends xvfb openbox dbus-x11 at-spi2-core libgtk-3-0 libxtst6 libxdo3 xdotool mousepad imagemagick && rm -rf /var/lib/apt/lists/*
COPY apps/engine/native-dependencies.json /opt/engine/native-dependencies.json
COPY apps/engine/install_desktop.py /opt/engine/install_desktop.py
RUN /opt/native/bin/python /opt/engine/install_desktop.py
COPY apps/engine/notices/cua-driver-0.21.0-MIT.txt /opt/cua/LICENSE.md
COPY apps/engine/src/ngertiin_engine /opt/engine/ngertiin_engine
LABEL org.ngertiin.native.desktop="x11-cua.v1"
ENV DISPLAY=:99 XDG_SESSION_TYPE=x11 XDG_RUNTIME_DIR=/tmp/runtime-probe HERMES_CUA_DRIVER_CMD=/opt/cua/cua-driver CUA_DRIVER_RS_TELEMETRY_ENABLED=0 BROWSER_CDP_URL=http://127.0.0.1:9222
USER probe
ENTRYPOINT ["/opt/native/bin/python", "/opt/engine/ngertiin_engine/native_worker.py", "serve"]
