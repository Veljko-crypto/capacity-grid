import { useEffect, useRef, useState } from "react";
import { capacity, overHours } from "./dates";
import { request, RequestError } from "./request";

type Person = {
  id: number;
  name: string;
  weeklyHours: number;
  allocated: number[];
};
type Data = {
  from: string;
  to: string;
  weeks: { start: string; workdays: number }[];
  people: Person[];
};
type Props = {
  from: string;
  to: string;
  onSavingChange?: (saving: boolean) => void;
};
const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const format = (n: number) => (n > 0 && n < 0.005 ? "<0.01" : number.format(n));
const date = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function CapacityGrid({ from, to, onSavingChange }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [overOnly, setOverOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Person | null>(null);
  const [hours, setHours] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const focusAfterRefresh = useRef<number | null>(null);
  const summary = useRef<HTMLDivElement | null>(null);
  const editor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPage(0);
  }, [from, to]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError("");
    request<Data>(`/api/capacity?from=${from}&to=${to}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (current) setData(result);
      })
      .catch((err) => {
        if (current) setError(err.message || "Could not load capacity.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [from, to, revision]);

  useEffect(() => {
    if (
      !editing &&
      !loading &&
      !error &&
      data &&
      focusAfterRefresh.current !== null
    ) {
      const target = document.getElementById(
        `edit-person-${focusAfterRefresh.current}`,
      );
      (target ?? summary.current)?.focus();
      focusAfterRefresh.current = null;
    }
  }, [loading, error, data, editing]);

  function closeEditor() {
    focusAfterRefresh.current = editing?.id ?? null;
    setEditing(null);
    setSaveError("");
  }
  async function save() {
    if (!editing || saving) return;
    const value = Number(hours);
    if (
      hours.trim() === "" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 168
    ) {
      setSaveError("Enter weekly hours between 0 and 168.");
      return;
    }
    setSaving(true);
    onSavingChange?.(true);
    setSaveError("");
    setNotice("");
    try {
      await request(`/api/people/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyHours: value }),
      });
      // A confirmed write invalidates the entire range. Hide old numbers until
      // the authoritative refresh completes; its failure remains retryable.
      setNotice(`Saved weekly hours for ${editing.name}.`);
      focusAfterRefresh.current = editing.id;
      setData(null);
      setLoading(true);
      setRevision((v) => v + 1);
      closeEditor();
    } catch (err) {
      setSaveError(
        err instanceof RequestError && !err.uncertain
          ? err.message
          : `${err instanceof Error ? err.message + " " : ""}Could not confirm the save. It may have completed. Retry to set these hours again.`,
      );
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }
  const visibleData = data?.from === from && data?.to === to ? data : null;
  const people =
    visibleData?.people.filter(
      (p) =>
        p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        (!overOnly ||
          p.allocated.some(
            (a, i) =>
              overHours(
                a,
                capacity(p.weeklyHours, visibleData.weeks[i].workdays),
              ) > 0,
          )),
    ) ?? [];
  const lastPage = Math.max(0, Math.ceil(people.length / 50) - 1);
  const currentPage = Math.min(page, lastPage);
  const ready = !loading && !error && visibleData;
  return (
    <>
      <div className="grid-tools">
        <label className="search">
          Find a person
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            disabled={saving}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={overOnly}
            disabled={saving}
            onChange={(e) => {
              setOverOnly(e.target.checked);
              setPage(0);
            }}
          />{" "}
          Over capacity only
        </label>
        <span className="legend">
          <span className="dot" /> Over capacity
        </span>
      </div>
      <p className="sr-only" role="status">
        {notice}
      </p>
      {notice && <p className="success">{notice}</p>}
      {editing && (
        <div
          className="editor"
          ref={editor}
          role="region"
          aria-label={`Edit weekly hours for ${editing.name}`}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !saving) closeEditor();
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            noValidate
          >
            <strong>{editing.name}</strong>
            <p>
              Weekly hours apply to every week, including past weeks.
              Allocations stay the same.
            </p>
            <div className="edit-controls">
              <label>
                Weekly hours
                <input
                  autoFocus
                  type="number"
                  min="0"
                  max="168"
                  step="any"
                  value={hours}
                  disabled={saving}
                  aria-describedby={saveError ? "save-error" : undefined}
                  aria-invalid={!!saveError}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
              <button className="primary" disabled={saving} type="submit">
                {saving ? "Saving…" : "Save hours"}
              </button>
              <button disabled={saving} type="button" onClick={closeEditor}>
                Cancel
              </button>
            </div>
            {saveError && (
              <p role="alert" id="save-error" className="error">
                {saveError} Your entered hours have been kept.
              </p>
            )}
          </form>
        </div>
      )}
      {loading && (
        <div className="state" role="status">
          Loading capacity for {date(from)} – {date(to)}…
        </div>
      )}
      {!loading && error && (
        <div className="state error" role="alert">
          <p>{error}</p>
          <button onClick={() => setRevision((v) => v + 1)}>
            Retry loading
          </button>
        </div>
      )}
      {ready && (
        <>
          <div className="grid-summary" ref={summary} tabIndex={-1}>
            <strong>
              {people.length} {people.length === 1 ? "person" : "people"}
            </strong>
            <span>
              {date(from)} – {date(to)}
            </span>
            <span>Allocated / capacity in hours</span>
          </div>
          {people.length === 0 ? (
            <div className="state">
              {visibleData.people.length === 0
                ? "No people in this team yet."
                : "No people match these filters."}
            </div>
          ) : (
            <>
              <div
                className="table-scroll"
                tabIndex={0}
                aria-label="Weekly capacity table; scroll to see more weeks"
              >
                <table>
                  <caption className="sr-only">
                    Allocated hours compared with capacity, {date(from)} to{" "}
                    {date(to)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Person / weekly hours</th>
                      {visibleData.weeks.map((w) => (
                        <th scope="col" key={w.start}>
                          Week of {date(w.start)}
                          <small>
                            {w.workdays} working{" "}
                            {w.workdays === 1 ? "day" : "days"} selected
                          </small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {people
                      .slice(currentPage * 50, (currentPage + 1) * 50)
                      .map((p) => (
                        <tr key={p.id}>
                          <th scope="row">
                            <span className="person-name">{p.name}</span>
                            <button
                              id={`edit-person-${p.id}`}
                              className="edit-button"
                              disabled={saving || editing !== null}
                              aria-label={`Edit weekly hours for ${p.name}`}
                              onClick={() => {
                                setEditing(p);
                                setHours(String(p.weeklyHours));
                                setSaveError("");
                                requestAnimationFrame(() =>
                                  editor.current?.scrollIntoView({
                                    block: "nearest",
                                  }),
                                );
                              }}
                            >
                              {format(p.weeklyHours)} h / week{" "}
                              <span aria-hidden="true">✎</span>
                            </button>
                          </th>
                          {p.allocated.map((allocated, i) => {
                            const available = capacity(
                                p.weeklyHours,
                                visibleData.weeks[i].workdays,
                              ),
                              over = overHours(allocated, available);
                            return (
                              <td
                                key={visibleData.weeks[i].start}
                                className={
                                  over > 0
                                    ? "over"
                                    : allocated === 0
                                      ? "unallocated"
                                      : ""
                                }
                              >
                                <span className="hours">
                                  <strong>{format(allocated)}</strong> /{" "}
                                  {format(available)} h
                                </span>
                                <small>
                                  {over > 0
                                    ? `${format(over)} h over`
                                    : `${format(overHours(available, allocated))} h available`}
                                </small>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <nav className="pagination" aria-label="People pages">
                <span>
                  Showing {currentPage * 50 + 1}–
                  {Math.min((currentPage + 1) * 50, people.length)} of{" "}
                  {people.length}
                </span>
                <button
                  disabled={currentPage === 0 || saving}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous people
                </button>
                <button
                  disabled={currentPage === lastPage || saving}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next people
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </>
  );
}
