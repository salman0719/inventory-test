"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ScanProduct } from "@/lib/scan";
import {
  manualScanHref,
  scannerSupport,
  type ScannerSupport,
} from "@/lib/scan-code";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const WANTED_FORMATS = [
  "qr_code",
  "ean_13",
  "ean_8",
  "code_128",
  "upc_a",
  "upc_e",
];

/**
 * Capabilities are a constant for the life of the tab. Reading them through
 * `useSyncExternalStore` keeps the server render (`null`) and the hydrated client
 * value in one place without setting state from an effect.
 */
let cachedSupport: ScannerSupport | undefined;

function subscribeToNothing(): () => void {
  return () => undefined;
}

function supportSnapshot(): ScannerSupport {
  if (cachedSupport === undefined) {
    cachedSupport = scannerSupport({
      userAgent: navigator.userAgent,
      hasBarcodeDetector: "BarcodeDetector" in window,
      isSecureContext: window.isSecureContext,
    });
  }
  return cachedSupport;
}

function serverSupportSnapshot(): null {
  return null;
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
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const support = useSyncExternalStore(
    subscribeToNothing,
    supportSnapshot,
    serverSupportSnapshot,
  );
  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopCamera() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  async function startCamera() {
    setError(null);
    setStarting(true);
    try {
      const Detector = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;
      if (!Detector) {
        throw new Error("BarcodeDetector is unavailable");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("Video element is unavailable");
      video.srcObject = stream;
      await video.play();

      const formats = Detector.getSupportedFormats
        ? await Detector.getSupportedFormats()
        : [];
      const selected = WANTED_FORMATS.filter((format) =>
        formats.includes(format),
      );
      const detector = new Detector(
        selected.length > 0 ? { formats: selected } : undefined,
      );

      setScanning(true);
      let busy = false;
      timerRef.current = window.setInterval(async () => {
        if (busy || !videoRef.current) return;
        busy = true;
        try {
          const found = await detector.detect(videoRef.current);
          const value = found.find((barcode) => barcode.rawValue.trim());
          if (value) {
            stopCamera();
            router.push(manualScanHref(value.rawValue));
          }
        } catch {
          // A frame that cannot be decoded is normal; keep the preview running.
        } finally {
          busy = false;
        }
      }, 350);
    } catch (caught) {
      stopCamera();
      const name = caught instanceof DOMException ? caught.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError(
          "Camera permission was denied. Allow it in the browser, or enter the code below.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No usable camera was found. Enter the code below.");
      } else {
        setError("The camera could not start. Enter the code below.");
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
                    {starting ? "Starting camera…" : "Start camera"}
                  </button>
                )}
                <span aria-live="polite" className="text-[11px] text-ink-muted">
                  {scanning ? "Scanning…" : ""}
                </span>
              </div>
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
