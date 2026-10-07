import { afterEach, expect, it, vi } from "vitest";
import { request, REQUEST_TIMEOUT_MS } from "./request";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("times out a stalled response body and aborts the transport", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
  vi.stubGlobal("fetch", fetch);
  const pending = request("/capacity");
  const assertion = expect(pending).rejects.toMatchObject({
    uncertain: true,
    message: expect.stringContaining("timed out"),
  });
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await assertion;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up the timer and transport when the caller cancels", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const pending = request("/capacity", { signal: controller.signal });
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await assertion;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("distinguishes rejected input from an uncertain server failure", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid hours" }),
    })
    .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  await expect(request("/people/1")).rejects.toMatchObject({
    uncertain: false,
    message: "Invalid hours",
  });
  await expect(request("/people/1")).rejects.toMatchObject({ uncertain: true });
});
