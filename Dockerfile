# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.25-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/better-bill-splitter ./cmd/server

FROM alpine:3.22 AS web
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S app && adduser -S -G app app \
    && mkdir -p /app/public/spa /app/data/archive /usr/local/go/lib/time \
    && chown -R app:app /app/data
WORKDIR /app
COPY --from=backend /out/better-bill-splitter /usr/local/bin/better-bill-splitter
# timezoneNames reads the canonical Go zone list; time.LoadLocation uses tzdata.
COPY --from=backend /usr/local/go/lib/time/zoneinfo.zip /usr/local/go/lib/time/zoneinfo.zip
COPY --from=frontend /src/public/spa ./public/spa
COPY public/favicon.ico public/robots.txt ./public/
COPY config.yaml ./config.yaml
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O - http://127.0.0.1:8000/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/better-bill-splitter"]
