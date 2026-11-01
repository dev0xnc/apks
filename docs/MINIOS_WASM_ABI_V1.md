# MiniOS SDK and WebAssembly ABI v1

SDK file: `sdk/minios-sdk.js`  
Current SDK version: `0.1.0`

## JavaScript API

Load the SDK from an app page:

```html
<script src="../../sdk/minios-sdk.js"></script>
```

The SDK exposes a read-only global `MiniOS` object:

- `MiniOS.version`: SDK version.
- `MiniOS.capabilities.webAssembly`: WebAssembly availability.
- `MiniOS.capabilities.webGL`: WebGL availability.
- `await MiniOS.wasm.load("module.wasm.b64")`: fetches a Base64-encoded module relative to the app page, compiles it, validates imports, instantiates it, and returns the WebAssembly instance.

## WebAssembly imports

ABI v1 allows only function imports from the `minios` namespace:

| Import | Signature | Purpose |
| --- | --- | --- |
| `minios.now_ms` | `() -> i32` | Current Unix time in milliseconds, truncated to signed 32-bit |
| `minios.random` | `() -> f64` | Pseudorandom value in [0, 1) |
| `minios.log` | `() -> void` | Writes a fixed diagnostic message to the browser console |

Modules must not import memory, tables, globals, WASI functions, or arbitrary host functions in ABI v1. The Runtime validates the import namespace and names before opening the app; the SDK validates again when instantiating it.

## Minimal app pattern

The app's HTML loads the SDK, then calls `MiniOS.wasm.load()`. The app page remains responsible for connecting WASM exports to its own interface. The SDK does not execute APKs or native Linux binaries and is not a WASI implementation.

## Compatibility and security

This is an early browser SDK. It does not grant extra browser privileges. Browser APIs remain subject to normal browser permissions and sandbox restrictions. Never store passwords, private API keys, or account tokens in app code. Do not load untrusted third-party apps in the current same-origin prototype.
