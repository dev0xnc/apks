# MiniOS APK Port — Web App Catalog

This repository stores **MiniOS web applications** (`.mapp`). It does not store Android APK binaries and does not convert APKs automatically.

## Structure

- `repository.json`: catalog index consumed by MiniOS.
- `apps/<app-id>/manifest.json`: metadata and entry point for an app.
- `apps/<app-id>/index.html`: browser-based application.
- `apps/<app-id>/assets/`: icons, images, fonts and other static assets.

## App format (v1)

Each app has a `manifest.json` with:
- `id`: stable, lowercase identifier.
- `name`, `version`, `description`, `author`.
- `entry`: relative path to the app's HTML entry point.
- `permissions`: requested MiniOS capabilities (keep this minimal).
- `runtime`: currently `web`.

Apps run in a compatible browser. The ESP32 is a controller/API device; it does not execute Android APKs or render the app UI.

## Publishing

1. Add an app folder under `apps/`.
2. Add its manifest and web files.
3. Add its metadata to `repository.json`.
4. Enable GitHub Pages for this repository (Settings → Pages → Deploy from a branch → main → / (root)).

Use only apps and media you have permission to distribute. Do not upload copyrighted APKs, DRM-protected content, private credentials, or access tokens.
