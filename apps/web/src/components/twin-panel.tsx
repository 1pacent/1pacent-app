"use client";

import { useState, type ReactNode } from "react";

/**
 * The Talk / See shell (Product Design v6 §2): Sally on the left, the card
 * canvas on the right, the workspace beneath. On mobile the two panels
 * become tabs of the same session.
 */
export function TwinPanel({ talk, board }: { talk: ReactNode; board: ReactNode }) {
  const [tab, setTab] = useState<"talk" | "board">("talk");

  return (
    <div>
      {/* Mobile tab switch */}
      <div className="mb-4 flex rounded-lg border border-slate-200 bg-white p-1 lg:hidden">
        {(["talk", "board"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${
              tab === t ? "bg-brand-600 text-white" : "text-slate-600"
            }`}
          >
            {t === "talk" ? "Talk to Sally" : "Your board"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={tab === "talk" ? "" : "hidden lg:block"}>{talk}</div>
        <div className={tab === "board" ? "" : "hidden lg:block"}>{board}</div>
      </div>
    </div>
  );
}
