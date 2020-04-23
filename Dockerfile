FROM node:11

ENV CWEBP_URL "https://storage.googleapis.com/downloads.webmproject.org/releases/webp"
ENV CWEBP_VERSION 1.0.2

RUN for server in ha.pool.sks-keyservers.net \
              hkp://p80.pool.sks-keyservers.net:80 \
              keyserver.ubuntu.com \
              hkp://keyserver.ubuntu.com:80 \
              pgp.mit.edu; do \
    gpg --keyserver "$server" --recv-keys 6B0E6B70976DE303EDF2F601F9C3D6BDB8232B5D && break || echo "Trying new server..."; \
  done \
  && cd /tmp \
  && curl -SLO "${CWEBP_URL}/libwebp-${CWEBP_VERSION}.tar.gz" \
  && curl -SLO "${CWEBP_URL}/libwebp-${CWEBP_VERSION}.tar.gz.asc" \
  && gpg --verify "libwebp-${CWEBP_VERSION}.tar.gz.asc" "libwebp-${CWEBP_VERSION}.tar.gz" \
  && tar -xf "libwebp-${CWEBP_VERSION}.tar.gz" \
  && cd libwebp-${CWEBP_VERSION} \
  && ./configure \
  && make \
  && make install \
  && ldconfig /usr/local/lib \
  && rm -rf /tmp/*

