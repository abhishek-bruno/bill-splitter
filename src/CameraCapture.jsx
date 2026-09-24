import { useEffect, useRef, useState } from "react";

// Opens the rear camera directly. The file input's capture="environment" is only a hint that many
// Android camera apps ignore (they reopen whichever camera was used last), so we drive the camera
// ourselves and fall back to the system camera if access is denied or unsupported.
async function openRearCamera() {
  const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: { exact: "environment" } }, audio: false });
  } catch (e) {
    // Devices with no rear camera (laptops) reject the exact constraint; use whatever camera exists
    if (e.name === "OverconstrainedError" || e.name === "NotFoundError") {
      return navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: "environment" }, audio: false });
    }
    throw e;
  }
}

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;

export default function CameraCapture({ onCapture, onClose, onFallback }) {
  const videoRef = useRef();
  const streamRef = useRef();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    openRearCamera()
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      })
      .catch(e => {
        if (cancelled) return;
        if (e.name === "NotAllowedError") setError("Camera access was blocked. Allow it in your browser settings, or use the phone's camera app.");
        else setError("Couldn't open the camera.");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      onCapture(new File([blob], "bill.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <video
          ref={videoRef} autoPlay playsInline muted onLoadedData={() => setReady(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <button onClick={onClose} aria-label="Close camera" style={{
          position: "absolute", top: "calc(12px + env(safe-area-inset-top))", left: 12,
          width: 40, height: 40, borderRadius: "50%", border: "none", background: "#0008",
          color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer"
        }}>×</button>
        {!ready && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff9", fontSize: 14 }}>
            Opening camera…
          </div>
        )}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{error}</div>
            <button onClick={onFallback} style={{ border: "none", borderRadius: 10, padding: "12px 18px", background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Use phone camera app
            </button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "20px 0 calc(24px + env(safe-area-inset-bottom))", background: "#000" }}>
        <button onClick={capture} disabled={!ready} aria-label="Take photo" style={{
          width: 72, height: 72, borderRadius: "50%", border: "4px solid #fff",
          background: ready ? "#fff" : "#fff5", boxShadow: "inset 0 0 0 3px #000", cursor: ready ? "pointer" : "default"
        }} />
      </div>
    </div>
  );
}
