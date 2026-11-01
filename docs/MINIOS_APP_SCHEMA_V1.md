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

The MiniOS WebAssembly ABI v1 allows only documented function imports from the `minios` namespace (`now_ms`, `random`, and `log`). The app's `entry` page loads the shared SDK and connects module exports to its interface. See `docs/MINIOS_WASM_ABI_V1.md`. This is not a universal WASI or native-app compatibility layer.

All entry and WASM paths must stay inside the app directory and on the MiniOS site origin. Catalog entries and manifests are public input: do not put secrets or private account tokens in app code. The current prototype's iframe sandbox is not yet suitable for untrusted third-party apps.
