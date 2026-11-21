import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Index from "@/pages/Index";
import { useServerConnectionNotice } from "@/lib/useServerConnectionNotice";

vi.mock("@/components/garden/GardenAtmosphere", () => ({
  GardenAtmosphere: () => null,
}));
vi.mock("@/components/garden/LandingView", () => ({
  LandingView: () => <div data-testid="landing-view" />,
}));
vi.mock("@/components/garden/CustomerView", () => ({
  CustomerView: () => <div data-testid="customer-view" />,
}));
vi.mock("@/components/garden/PaymentCounterView", () => ({
  PaymentCounterView: () => <div data-testid="payment-view" />,
}));
vi.mock("@/components/garden/ManagementView", () => ({
  ManagementView: () => <div data-testid="manager-view" />,
}));
vi.mock("@/components/ServerConnectionNotice", () => ({
  ServerConnectionNotice: ({ kind }: { kind: string | null }) => (
    <div data-testid="outage-screen" data-kind={kind} />
  ),
}));
vi.mock("@/lib/useServerConnectionNotice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useServerConnectionNotice")>();
  return { ...actual, useServerConnectionNotice: vi.fn() };
});

const outageViews = [
  { query: "?qr=table-1", view: "customer-view" },
  { query: "?view=payment", view: "payment-view" },
  { query: "?view=manager", view: "manager-view" },
];

describe("Index server outage coverage", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  it.each(outageViews)(
    "shows only the outage screen for $view when the server is down",
    ({ query, view }) => {
      window.history.replaceState({}, "", `/${query}`);
      vi.mocked(useServerConnectionNotice).mockReturnValue("offline");

      render(<Index />);

      expect(screen.getByTestId("outage-screen")).toHaveAttribute("data-kind", "offline");
      expect(screen.queryByTestId(view)).not.toBeInTheDocument();
    },
  );
});
