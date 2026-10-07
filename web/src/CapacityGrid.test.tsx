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
import { capacity, shiftDate, validRange } from "./dates";

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
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
    await screen.findByText("Refresh unavailable");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
    await screen.findByText("45 h over");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  });
});
