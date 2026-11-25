"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ScanProduct } from "@/lib/scan";
import { manualScanHref } from "@/lib/scan-code";
import {
  assessScanDevice,
  scannerSupport,
  type ScanDecoder,
  type ScanDeviceProfile,
  type ScannerSupport,
} from "@/lib/scan-device";
import type {
  ScanWorkerRequest,
  ScanWorkerResponse,
} from "@/lib/scan-worker-protocol";

type ScanEnvironment = {
  support: ScannerSupport;
  device: ScanDeviceProfile;
};

/**
 * Capabilities are a constant for the life of the tab. Reading them through
 * `useSyncExternalStore` keeps the server render (`null`) and the hydrated client
 * value in one place without setting state from an effect.
 */
let cachedEnvironment: ScanEnvironment | undefined;

function subscribeToNothing(): () => void {
  return () => undefined;
}

function environmentSnapshot(): ScanEnvironment {
  if (cachedEnvironment === undefined) {
    const navigatorWithMemory = navigator as Navigator & {
      deviceMemory?: number;
    };
    cachedEnvironment = {
      support: scannerSupport({
        hasBarcodeDetector: "BarcodeDetector" in window,
        hasWebAssembly: typeof WebAssembly === "object",
        hasCamera: typeof navigator.mediaDevices?.getUserMedia === "function",
        hasWorker: "Worker" in window,
        isSecureContext: window.isSecureContext,
      }),
      device: assessScanDevice({
        userAgent: navigator.userAgent,
        deviceMemory: navigatorWithMemory.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
      }),
    };
  }
  return cachedEnvironment;
}

function serverEnvironmentSnapshot(): null {
  return null;
}

class NativeDecoderUnavailable extends Error {
  constructor() {
    super("The built-in detector is unavailable.");
    this.name = "NativeDecoderUnavailable";
  }
}

class DecoderStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecoderStartError";
  }
}

type DecoderHandle = { worker: Worker; mode: ScanDecoder };

function createDecoder(mode: ScanDecoder): Promise<DecoderHandle> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./scan-decoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;

    function finish(action: () => void): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.onmessage = null;
      worker.onerror = null;
      action();
    }

    const timeout = window.setTimeout(() => {
      finish(() => {
        worker.terminate();
        reject(
          new DecoderStartError("The on-device decoder did not start in time."),
        );
      });
    }, 15_000);

    worker.onmessage = (event: MessageEvent<ScanWorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        finish(() => resolve({ worker, mode: message.mode }));
        return;
      }
      if (message.type === "fallback") {
        finish(() => {
          worker.terminate();
          reject(new NativeDecoderUnavailable());
        });
        return;
      }
      if (message.type === "error") {
        finish(() => {
          worker.terminate();
          reject(new DecoderStartError(message.message));
        });
      }
    };

    worker.onerror = () => {
      finish(() => {
        worker.terminate();
        reject(new DecoderStartError("The decoder failed to load."));
      });
    };

    worker.postMessage({
      type: "start",
      mode,
    } satisfies ScanWorkerRequest);
  });
}

export function Scanner({
  code,
  matches = [],
  notFound = false,
}: {
  code?: string;
  matches?: ScanProduct[];
  notFound?: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const waitingRef = useRef(false);
  const runRef = useRef(0);
  const switchingRef = useRef(false);
  const decoderModeRef = useRef<ScanDecoder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const environment = useSyncExternalStore(
    subscribeToNothing,
    environmentSnapshot,
    serverEnvironmentSnapshot,
  );
  const support = environment?.support ?? null;
  const device = environment?.device;
  const lowPower = device?.tier === "low";

  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [decoderMode, setDecoderMode] = useState<ScanDecoder | null>(null);
  const [decoderLoading, setDecoderLoading] = useState<ScanDecoder | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      runRef.current += 1;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      workerRef.current?.terminate();
    };
  }, []);

  function stopCamera(): void {
    runRef.current += 1;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    waitingRef.current = false;
    switchingRef.current = false;
    const worker = workerRef.current;
    workerRef.current = null;
    worker?.terminate();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    decoderModeRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
    setDecoderMode(null);
    setDecoderLoading(null);
  }

  function attachWorker(worker: Worker, mode: ScanDecoder): void {
    workerRef.current = worker;
    decoderModeRef.current = mode;
    setDecoderMode(mode);
    setDecoderLoading(null);
    waitingRef.current = false;

    worker.onmessage = (event: MessageEvent<ScanWorkerResponse>) => {
      handleWorkerMessage(event.data);
    };
    worker.onerror = () => {
      stopCamera();
      setError("The decoder stopped. Enter the code below.");
    };
  }

  function handleWorkerMessage(message: ScanWorkerResponse): void {
    if (message.type === "result") {
      stopCamera();
      router.push(manualScanHref(message.value));
      return;
    }
    if (message.type === "done") {
      waitingRef.current = false;
      return;
    }
    if (message.type === "fallback") {
      void switchToWasm();
      return;
    }
    if (message.type === "error") {
      stopCamera();
      setError("The on-device decoder stopped. Enter the code below.");
    }
  }

  async function switchToWasm(): Promise<void> {
    if (switchingRef.current || decoderModeRef.current !== "native") return;
    switchingRef.current = true;
    const run = runRef.current;
    waitingRef.current = false;
    const oldWorker = workerRef.current;
    workerRef.current = null;
    oldWorker?.terminate();
    decoderModeRef.current = null;
    setDecoderMode(null);
    setDecoderLoading("wasm");

    try {
      const next = await createDecoder("wasm");
      if (run !== runRef.current) {
        next.worker.terminate();
        return;
      }
      attachWorker(next.worker, next.mode);
    } catch {
      if (run === runRef.current) {
        stopCamera();
        setError("The fallback decoder could not start. Enter the code below.");
      }
    } finally {
      switchingRef.current = false;
    }
  }

  function captureFrame(): void {
    if (waitingRef.current || !workerRef.current || document.hidden) return;
    const video = videoRef.current;
    const worker = workerRef.current;
    if (!video || !worker || video.videoWidth === 0) return;

    const maxDimension = lowPower ? 720 : 960;
    const scale = Math.min(
      1,
      maxDimension / Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const buffer = image.data.buffer;
    waitingRef.current = true;
    try {
      worker.postMessage(
        {
          type: "frame",
          buffer,
          width,
          height,
        } satisfies ScanWorkerRequest,
        [buffer],
      );
    } catch {
      waitingRef.current = false;
    }
  }

  async function startCamera(): Promise<void> {
    setError(null);
    setStarting(true);
    const run = ++runRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (run !== runRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("Video element is unavailable");
      video.srcObject = stream;
      await video.play();
      if (run !== runRef.current) return;

      const initial: ScanDecoder =
        support?.kind === "ready" ? support.decoder : "wasm";
      if (initial === "wasm") setDecoderLoading("wasm");

      let handle: DecoderHandle;
      try {
        handle = await createDecoder(initial);
      } catch (caught) {
        if (caught instanceof NativeDecoderUnavailable) {
          setDecoderLoading("wasm");
          handle = await createDecoder("wasm");
        } else {
          throw caught;
        }
      }

      if (run !== runRef.current) {
        handle.worker.terminate();
        return;
      }

      attachWorker(handle.worker, handle.mode);
      setScanning(true);
      timerRef.current = window.setInterval(captureFrame, lowPower ? 650 : 350);
    } catch (caught) {
      if (run !== runRef.current) return;
      stopCamera();
      const name = caught instanceof DOMException ? caught.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError(
          "Camera permission was denied. Allow it in the browser, or enter the code below.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No usable camera was found. Enter the code below.");
      } else if (caught instanceof DecoderStartError) {
        setError(
          "The on-device decoder could not load. Enter the code below, or try again.",
        );
      } else {
        setError("The camera could not start. Enter the code below.");
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {device && !device.isChromeAndroid ? (
        <div
          role="note"
          className="rounded border border-line bg-panel px-3 py-2.5"
        >
          <p className="text-[12px] font-medium">Best on Chrome for Android</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
            For the fastest, most reliable camera scanning, use Chrome on an
            Android phone. This browser is {device.browserLabel}; scanning can
            work here, but performance and reliability vary.
          </p>
        </div>
      ) : null}

      {lowPower ? (
        <div
          role="alert"
          className="rounded border border-warning bg-warning-soft px-3 py-2.5 text-warning"
        >
          <p className="text-[12px] font-semibold">
            This device may struggle to scan
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed">
            It reports {device?.reasons.join(" and ")}. Camera decoding can be
            slow, use significant battery, or fail. Manual barcode or SKU entry
            is the more reliable choice here.
          </p>
        </div>
      ) : null}

      {notFound ? (
        <div
          role="status"
          className="rounded border border-line bg-warning-soft px-3 py-2 text-[12px] text-warning"
        >
          No product in this business matches
          {code ? ` “${code}”` : " that code"}. Check the label, or search the
          product list.
        </div>
      ) : null}

      {matches.length > 0 ? (
        <section className="rounded border border-line bg-surface">
          <div className="border-b border-line px-3 py-2.5">
            <h2 className="text-[12px] font-semibold">
              More than one product uses this code
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Choose the product you are holding.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {matches.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/products?product=${product.id}`}
                  className="flex min-h-[48px] items-center gap-3 px-3 py-2 hover:bg-panel"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">
                      {product.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                      {product.sku}
                      {product.isArchived ? " · Archived" : ""}
                    </span>
                  </span>
                  <span className="text-[11px] text-accent">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded border border-line bg-surface">
        <div className="border-b border-line px-3 py-2.5">
          <h2 className="text-[12px] font-semibold">Scan a label</h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Point the camera at a QR label, or use the barcode or SKU.
          </p>
        </div>

        <div className="flex flex-col gap-3 p-3">
          {support === null ? (
            <p className="text-[11px] text-ink-muted">
              Checking camera support…
            </p>
          ) : support.kind === "ready" ? (
            <>
              <div className="relative overflow-hidden rounded border border-line bg-panel">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="aspect-[4/3] w-full object-cover"
                />
                {!scanning ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="max-w-[32ch] px-4 text-center text-[11px] text-ink-muted">
                      The camera stays off until you start it.
                    </p>
                  </div>
                ) : (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-[12%] inset-y-[20%] rounded border-2 border-on-accent/80"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                {scanning ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex min-h-[40px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
                  >
                    Stop camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    disabled={starting}
                    className="inline-flex min-h-[40px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-60"
                  >
                    {starting
                      ? decoderLoading === "wasm"
                        ? "Loading decoder…"
                        : "Starting camera…"
                      : lowPower
                        ? "Try camera anyway"
                        : "Start camera"}
                  </button>
                )}
                <span aria-live="polite" className="text-[11px] text-ink-muted">
                  {scanning
                    ? decoderMode === "wasm"
                      ? "Scanning with the on-device fallback…"
                      : "Scanning with the built-in detector…"
                    : ""}
                </span>
              </div>
              {decoderMode === "wasm" ? (
                <p className="text-[10.5px] text-ink-faint">
                  The fallback decoder is downloaded once and runs on this
                  device.
                </p>
              ) : null}
            </>
          ) : (
            <div
              role="note"
              className="rounded border border-line bg-panel px-3 py-2.5"
            >
              <p className="text-[12px] font-medium">{support.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                {support.message}
              </p>
            </div>
          )}

          {error ? (
            <p role="alert" className="text-[11px] text-danger">
              {error}
            </p>
          ) : null}

          <form
            action="/scan"
            method="get"
            className="flex flex-col gap-1.5 border-t border-line pt-3"
          >
            <label
              htmlFor="scan-code"
              className="text-[11px] font-medium text-ink-muted"
            >
              Barcode or SKU
            </label>
            <div className="flex gap-2">
              <input
                id="scan-code"
                name="code"
                defaultValue={code ?? ""}
                required
                autoComplete="off"
                spellCheck={false}
                className="min-h-[40px] min-w-0 flex-1 rounded border border-line bg-surface px-2.5 font-mono text-[13px] outline-none focus:border-accent"
                placeholder="e.g. 9300675024235"
              />
              <button
                type="submit"
                className="inline-flex min-h-[40px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
              >
                Open
              </button>
            </div>
            <p className="text-[10.5px] text-ink-faint">
              A USB barcode scanner works here too: it types the code and
              presses Enter.
            </p>
          </form>
        </div>
      </section>

      <p className="px-1 text-[11px] text-ink-muted">
        Looking for a product?{" "}
        <Link href="/products" className="text-accent hover:underline">
          Search the product list
        </Link>
        .
      </p>
    </div>
  );
}
