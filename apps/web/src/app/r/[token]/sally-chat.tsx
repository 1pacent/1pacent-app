"use client";

import { useRef, useState, useTransition } from "react";
import { sendMessage } from "./actions";

interface ChatEntry {
  role: "tenant" | "sally";
  content: string;
}

const OPENING_LINE =
  "Hi, I'm Sally! Sorry you're dealing with an issue — tell me what's going on and I'll get it sorted.";

export function SallyChat({ token }: { token: string }) {
  const [messages, setMessages] = useState<ChatEntry[]>([{ role: "sally", content: OPENING_LINE }]);
  const [input, setInput] = useState("");
  const [dispatched, setDispatched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [pending, startTransition] = useTransition();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function playAudio(text: string) {
    fetch("/api/sally/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || !audioRef.current) return;
        audioRef.current.src = URL.createObjectURL(blob);
        void audioRef.current.play().catch(() => {});
      })
      .catch(() => {});
  }

  function send() {
    const text = input.trim();
    if (!text || pending || dispatched) return;
    setError(null);
    setMessages((m) => [...m, { role: "tenant", content: text }]);
    setInput("");
    startTransition(async () => {
      const result = await sendMessage(token, text);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong — try again.");
        return;
      }
      if (result.reply) {
        setMessages((m) => [...m, { role: "sally", content: result.reply! }]);
        if (voiceOn) playAudio(result.reply);
      }
      if (result.dispatched) setDispatched(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audioRef} className="hidden" />

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Sally is an AI assistant — she never gives repair advice or prices.</p>
        <button
          type="button"
          onClick={() => setVoiceOn((v) => !v)}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
        </button>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "tenant" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "tenant" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
              Sally is typing…
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {dispatched ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 text-center">
          <p className="text-lg font-semibold text-brand-900">Logged ✓</p>
          <p className="mt-2 text-sm text-brand-800">
            Sally has passed this on. Your rental provider will review it, and a tradie will be in touch with a
            quote.
          </p>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type your message…"
            disabled={pending}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !input.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
