// Voice or video call window. Your own camera is real (if you allow it); the
// other side is simulated, since this prototype has no calling server.

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { isExternal, type Contact } from "./data";

type Phase = "calling" | "connected" | "no-answer" | "ended";

export function Call({ contact, video, onEnd }: { contact: Contact; video: boolean; onEnd: (summary: string) => void }) {
  const [phase, setPhase] = useState<Phase>("calling");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(video);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const self = useRef<HTMLVideoElement>(null);

  // Ring, then the other side answers (or not, when they are offline).
  useEffect(() => {
    const t = setTimeout(() => setPhase(contact.presence === "offline" ? "no-answer" : "connected"), contact.presence === "offline" ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [contact.presence]);

  useEffect(() => {
    if (phase !== "connected") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Your camera, only for video calls and only while it is switched on.
  useEffect(() => {
    if (!video || !cameraOn) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true }).then(
      (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (self.current) self.current.srcObject = s;
        setCameraError(null);
      },
      () => setCameraError("Camera not available"),
    );
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [video, cameraOn]);

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const hangUp = () => {
    const kind = video ? "Video call" : "Call";
    onEnd(phase === "connected" ? `${kind} · ${time}` : `${kind} · no answer`);
  };
  const status = phase === "calling" ? "Calling…" : phase === "no-answer" ? `${contact.name.split(" ")[0]} didn't answer` : time;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label={`${video ? "Video call" : "Call"} with ${contact.name}`}>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div>
          <div className="font-semibold">{contact.name}</div>
          <div className="text-xs text-slate-400">{isExternal(contact) ? `External · ${contact.org}` : contact.role}</div>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">Prototype: the other side is simulated</span>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className={`flex size-28 items-center justify-center rounded-full text-3xl font-semibold ${contact.avatarColor} ${phase === "calling" ? "animate-pulse" : ""}`} aria-hidden>
            {contact.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <div className="text-lg font-medium">{contact.name}</div>
          <div className="text-sm text-slate-300" aria-live="polite">{status}</div>
          {phase === "connected" && video && <div className="text-xs text-slate-500">{contact.name.split(" ")[0]}'s camera is off</div>}
        </div>

        {video && (
          <div className="absolute right-4 bottom-4 flex h-32 w-24 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-slate-800 sm:h-40 sm:w-56">
            {cameraOn && !cameraError ? (
              <video ref={self} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera" />
            ) : (
              <span className="px-2 text-center text-xs text-slate-400">{cameraError ?? "Your camera is off"}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center gap-3 px-4 py-5">
        <button className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
        </button>
        {video && (
          <button className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => setCameraOn(!cameraOn)} aria-pressed={!cameraOn} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>
            {cameraOn ? <Video className="size-5" aria-hidden /> : <VideoOff className="size-5" aria-hidden />}
          </button>
        )}
        <button className="flex size-12 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700" onClick={hangUp} aria-label="Hang up">
          <PhoneOff className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
