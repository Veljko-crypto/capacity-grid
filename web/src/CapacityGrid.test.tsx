import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CapacityGrid } from "./CapacityGrid";
import { capacity, overHours, shiftDate, validRange } from "./dates";
import { REQUEST_TIMEOUT_MS } from "./request";

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const data = (from = "2026-01-05", hours = 40) => ({
  from,
  to: "2026-01-09",
  weeks: [{ start: "2026-01-05", workdays: 5 }],
  people: [{ id: 1, name: "Ana", weeklyHours: hours, allocated: [45] }],
});
const response = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
});

describe("capacity planning", () => {
  it("handles UTC year boundaries, invalid ranges and zero/partial capacity", () => {
    expect(shiftDate("2025-12-29", 7)).toBe("2026-01-05");
    expect(shiftDate("2026-03-30", -7)).toBe("2026-03-23");
    expect(validRange("2026-02-30", "2026-03-02")).toBe(false);
    expect(validRange("2026-01-10", "2026-01-09")).toBe(false);
    expect(validRange("2024-01-01", "2026-01-02")).toBe(false);
    expect(capacity(40, 3)).toBe(24);
    expect(capacity(0, 5)).toBe(0);
    expect(capacity(0.47, 5)).toBe(0.47);
    expect(overHours(0.47, 0.4699999999999999)).toBe(0);
    expect(overHours(40, 39.999)).toBeGreaterThan(0);
  });
  it("ignores an old range response even if fetch does not honor abort", async () => {
    let resolveOld!: (value: unknown) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(response(data("2026-01-06")));
    vi.stubGlobal("fetch", fetch);
    const view = render(<CapacityGrid from="2026-01-05" to="2026-01-09" />);
    view.rerender(<CapacityGrid from="2026-01-06" to="2026-01-09" />);
    await screen.findByText("Ana");
    await act(async () =>
      resolveOld(
        response({
          ...data(),
          people: [{ ...data().people[0], name: "Stale person" }],
        }),
      ),
    );
    expect(screen.queryByText("Stale person")).toBeNull();
    expect(screen.getByText("Ana")).toBeTruthy();
  });
  it("keeps a failed-save draft, then refreshes authoritative numbers on retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(response({ error: "Save unavailable" }, false))
      .mockResolvedValueOnce(response({ id: 1, weeklyHours: 30 }))
      .mockResolvedValueOnce(response(data("2026-01-05", 30)));
    vi.stubGlobal("fetch", fetch);
    render(<CapacityGrid from="2026-01-05" to="2026-01-09" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit weekly hours for Ana" }),
    );
    fireEvent.change(screen.getByLabelText("Weekly hours"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Save unavailable",
    );
    expect(
      (screen.getByLabelText("Weekly hours") as HTMLInputElement).value,
    ).toBe("30");
    expect(screen.getByText("5 h over")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByText("15 h over");
    expect(screen.queryByText("5 h over")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("makes a failed refresh after a successful save retryable without resaving", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(response({}))
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce(response(data("2026-01-05", 0)));
    vi.stubGlobal("fetch", fetch);
    render(<CapacityGrid from="2026-01-05" to="2026-01-09" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit weekly hours for Ana" }),
    );
    fireEvent.change(screen.getByLabelText("Weekly hours"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByText("The connection was interrupted. Please retry.");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    await screen.findByText("45 h over");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  });

  it("does not flag decimal arithmetic noise and labels small real overloads", async () => {
    const result = data();
    result.people = [
      { id: 1, name: "Exact match", weeklyHours: 0.47, allocated: [0.47] },
      { id: 2, name: "Small overload", weeklyHours: 39.999, allocated: [40] },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(result)));
    render(<CapacityGrid from="2026-01-05" to="2026-01-09" />);
    const exact = await screen.findByRole("row", { name: /Exact match/ });
    expect(exact.querySelector(".over")).toBeNull();
    expect(screen.getByText("<0.01 h over")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Over capacity only"));
    expect(screen.queryByText("Exact match")).toBeNull();
    expect(screen.getByText("Small overload")).toBeTruthy();
  });

  it("ends a stalled save, keeps the draft, and ignores a late success", async () => {
    let resolveSave!: (value: unknown) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          }),
      );
    const onSavingChange = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <CapacityGrid
        from="2026-01-05"
        to="2026-01-09"
        onSavingChange={onSavingChange}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit weekly hours for Ana" }),
    );
    fireEvent.change(screen.getByLabelText("Weekly hours"), {
      target: { value: "30" },
    });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    expect(
      screen.getByRole("button", { name: "Saving…" }).hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "may have completed",
    );
    expect(
      (screen.getByLabelText("Weekly hours") as HTMLInputElement).value,
    ).toBe("30");
    expect(
      screen
        .getByRole("button", { name: "Save hours" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      resolveSave(response({}));
    });
    expect(screen.queryByText("Saved weekly hours for Ana.")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves the people page after save and restores focus to the edited row", async () => {
    const result = data();
    result.people = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      name: `Person ${i + 1}`,
      weeklyHours: 40,
      allocated: [45],
    }));
    const refreshed = {
      ...result,
      people: result.people.map((p) =>
        p.id === 101 ? { ...p, weeklyHours: 30 } : p,
      ),
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(result))
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(response(refreshed)),
    );
    render(<CapacityGrid from="2026-01-05" to="2026-01-09" />);
    await screen.findByText("Person 1");
    fireEvent.click(screen.getByRole("button", { name: "Next people" }));
    fireEvent.click(screen.getByRole("button", { name: "Next people" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Edit weekly hours for Person 101" }),
    );
    fireEvent.change(screen.getByLabelText("Weekly hours"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByText("15 h over");
    expect(screen.getByText("Showing 101–101 of 101")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Edit weekly hours for Person 101" }),
    );
  });

  it("moves focus to the summary when a save removes the edited person from the filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(data()))
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(response(data("2026-01-05", 50))),
    );
    render(<CapacityGrid from="2026-01-05" to="2026-01-09" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit weekly hours for Ana" }),
    );
    fireEvent.click(screen.getByLabelText("Over capacity only"));
    fireEvent.change(screen.getByLabelText("Weekly hours"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByText("No people match these filters.");
    expect(document.activeElement?.className).toBe("grid-summary");
  });
});
