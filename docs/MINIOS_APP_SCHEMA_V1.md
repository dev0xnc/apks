# MiniOS App Manifest — Schema v1

A MiniOS catalog entry points to a JSON manifest. The manifest is the package contract between the catalog and MiniOS Runtime.

## Required fields

- `schemaVersion`: integer, currently `1`.
- `id`: unique app identifier; must match the catalog entry ID.
- `name`: display name.
- `version`: app version.
- `runtime`: `web` or `wasm-web`.
- `entry`: HTML entry point, relative to the manifest directory.

## Optional fields

- `description`: short description.
- `author`: publisher.
- `icon`: icon URL/path.
- `permissions`: declared permissions; declarations do not grant browser privileges.
- `requires`: capability list. Version 1 recognizes `wasm` and `webgl`.
- `minBrowser`: reserved for future browser-version constraints.

## WebAssembly profile v1

For `runtime: "wasm-web"`, include:

- `wasm`: path to a Base64-encoded WebAssembly binary asset.
- `wasmFormat`: must be `"base64"`.
- `wasmExport`: optional export name that Runtime verifies exists.

Version 1 supports standalone modules with no external imports. The app's `entry` page is responsible for instantiating the module and connecting its exports to the user interface, input, audio, and graphics. This is deliberately not a universal WASI or native-app compatibility layer.

All entry and WASM paths must stay inside the app directory and on the MiniOS site origin. Catalog entries and manifests are public input: do not put secrets or private account tokens in app code. The current prototype's iframe sandbox is not yet suitable for untrusted third-party apps.
