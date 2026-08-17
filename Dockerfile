# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS backend
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go test ./...
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/better-bill-splitter ./cmd/server

FROM --platform=$BUILDPLATFORM alpine:3.22 AS runtime-assets
RUN apk add --no-cache ca-certificates tzdata \
    && mkdir -p /rootfs/app/data/archive

FROM --platform=$TARGETPLATFORM alpine:3.22 AS web
WORKDIR /app
COPY --from=backend /out/better-bill-splitter /usr/local/bin/better-bill-splitter
# timezoneNames reads the canonical Go zone list; time.LoadLocation uses tzdata.
COPY --from=backend /usr/local/go/lib/time/zoneinfo.zip /usr/local/go/lib/time/zoneinfo.zip
COPY --from=runtime-assets /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=runtime-assets /usr/share/zoneinfo/ /usr/share/zoneinfo/
COPY --from=runtime-assets --chown=65532:65532 /rootfs/app/data/ ./data/
COPY --from=frontend --chown=65532:65532 /src/public/spa ./public/spa
COPY public/favicon.ico public/robots.txt ./public/
COPY config.yaml ./config.yaml
USER 65532:65532
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O - http://127.0.0.1:8000/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/better-bill-splitter"]
