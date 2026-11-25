# ZXing reader WASM

`zxing_reader.wasm` is the reader-only build from `zxing-wasm@3.1.8`
(`node_modules/zxing-wasm/dist/reader/zxing_reader.wasm`, MIT).

It is served from this origin so the fallback decoder never fetches from a CDN.
When `zxing-wasm` is upgraded, copy the matching reader wasm again:

```bash
cp node_modules/zxing-wasm/dist/reader/zxing_reader.wasm public/zxing/zxing_reader.wasm
```

The library's package version and the wasm file must match. The file is fetched
only after a user starts the camera without a usable native `BarcodeDetector`.
