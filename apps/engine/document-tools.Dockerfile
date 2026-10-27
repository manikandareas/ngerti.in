# Build on the selected immutable native workspace/desktop image.
ARG BASE_IMAGE=ngertiin-native-desktop:nma032-persistent-download
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    fonts-liberation fonts-dejavu-core poppler-utils ripgrep \
    && rm -rf /var/lib/apt/lists/*
COPY apps/engine/document-requirements.lock /opt/engine/document-requirements.lock
RUN /usr/local/bin/python -m pip --python /opt/native/bin/python install --require-hashes -r /opt/engine/document-requirements.lock \
    && /opt/native/bin/python -c "import docx,openpyxl,pptx,pypdf,reportlab,pdfplumber,pypdfium2" \
    && soffice --headless --version && pdftoppm -v
RUN rm /usr/local/bin/python /usr/local/bin/python3 \
    && printf '#!/bin/sh\nexec /opt/native/bin/python "$@"\n' > /usr/local/bin/python \
    && cp /usr/local/bin/python /usr/local/bin/python3 \
    && chmod 755 /usr/local/bin/python /usr/local/bin/python3 \
    && /usr/local/bin/python -c "import docx,openpyxl,pptx,pypdf,reportlab,pdfplumber"
COPY apps/engine/src/ngertiin_engine /opt/engine/ngertiin_engine
RUN apt-get update && apt-get install -y --no-install-recommends file zip unzip && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/native/bin:${PATH}"
LABEL org.ngertiin.native.documents="office-pdf.v2"
LABEL org.ngertiin.native.learning="skills.v1"
RUN ln -sf /opt/native/bin/pygount /usr/local/bin/pygount && /usr/local/bin/pygount --version
USER probe
