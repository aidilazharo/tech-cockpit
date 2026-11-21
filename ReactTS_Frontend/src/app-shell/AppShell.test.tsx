import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAD_ANY } from "../features/sad/permissions";
import { json, mockApi, renderRoute, signInWith } from "../test/harness";

beforeEach(() => {
  const api = mockApi();
  api.on("GET /api/v1/me/notifications/unread-count", json(200, { unread: 0 }));
  api.on("GET /api/v1/me/api-keys", json(200, { items: [] }));
  api.on(
    "GET /api/v1/sad/documents",
    json(200, { items: [], page: 1, pageSize: 25, total: 0 }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("page width", () => {
  it("lets the SAD pages use the screen up to 1920px", async () => {
    signInWith(SAD_ANY);
    renderRoute("/sad");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(screen.getByRole("main")).toHaveClass("max-w-480"),
    );
    expect(screen.getByRole("main")).not.toHaveClass("max-w-6xl");
  });

  it("keeps every other page at 1152px", async () => {
    signInWith(["apikey:own:manage"]);
    renderRoute("/me/api-keys");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("main")).toHaveClass("max-w-6xl");
    expect(screen.getByRole("main")).not.toHaveClass("max-w-480");
  });
});
