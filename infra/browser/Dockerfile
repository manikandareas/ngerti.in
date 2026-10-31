FROM python:3.12.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb x11vnc x11-utils fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.lock /opt/browser/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r /opt/browser/requirements.lock
COPY configure.py host.py patch.py /opt/browser/
RUN python /opt/browser/patch.py && useradd --uid 1000 --create-home browser && mkdir /profile && chown browser /profile
USER browser
ENV DISPLAY=:99 BROWSER_USE_CONFIG_PATH=/tmp/browser-config.json ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_HINTS=false BROWSER_USE_VERSION_CHECK=false BROWSER_USE_DISABLE_EXTENSIONS=true
ENTRYPOINT ["python", "/opt/browser/host.py"]
