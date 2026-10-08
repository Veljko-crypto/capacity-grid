import { useState } from "react";
import { CapacityGrid } from "./CapacityGrid";
import { shiftDate, validRange } from "./dates";

export function App() {
  const [range, setRange] = useState({ from: "2025-12-29", to: "2026-01-16" });
  const [draft, setDraft] = useState(range);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function move(days: number) {
    const next = {
      from: shiftDate(range.from, days),
      to: shiftDate(range.to, days),
    };
    if (!validRange(next.from, next.to)) return;
    setRange(next);
    setDraft(next);
    setError("");
  }
  return (
    <main>
      <header className="page-header">
        <div>
          <p className="eyebrow">TEAM PLANNING</p>
          <h1>Team capacity</h1>
          <p>See who has room, and who needs a lighter week.</p>
        </div>
      </header>
      <section aria-label="Capacity planning">
        <div className="toolbar">
          <div className="week-nav">
            <button
              disabled={saving}
              onClick={() => move(-7)}
              aria-label="Previous week"
            >
              ← Previous week
            </button>
            <button
              disabled={saving}
              onClick={() => move(7)}
              aria-label="Next week"
            >
              Next week →
            </button>
          </div>
          <form
            className="range-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              const next = {
                from: String(fields.get("from") ?? ""),
                to: String(fields.get("to") ?? ""),
              };
              if (!validRange(next.from, next.to)) {
                setError(
                  "Choose dates in order, no more than two years apart.",
                );
                return;
              }
              setRange(next);
              setDraft(next);
              setError("");
            }}
          >
            <label>
              From
              <input
                type="date"
                name="from"
                value={draft.from}
                disabled={saving}
                required
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                name="to"
                value={draft.to}
                disabled={saving}
                required
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
            <button disabled={saving} type="submit">
              Apply range
            </button>
          </form>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="help">
          Monday–Sunday weeks · Mon–Fri working days · Partial weeks use only
          selected days.
        </p>
        <CapacityGrid
          from={range.from}
          to={range.to}
          onSavingChange={setSaving}
        />
      </section>
    </main>
  );
}
