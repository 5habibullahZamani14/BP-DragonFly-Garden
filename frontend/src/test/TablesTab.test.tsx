import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablesTab } from "@/components/garden/management/TablesTab";

const mocks = vi.hoisted(() => ({
  fetchTables: vi.fn(),
  fetchSettings: vi.fn(),
  createTable: vi.fn(),
  updateTable: vi.fn(),
  deleteTable: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchTables: mocks.fetchTables,
  fetchSettings: mocks.fetchSettings,
  createTable: mocks.createTable,
  updateTable: mocks.updateTable,
  deleteTable: mocks.deleteTable,
}));

vi.mock("@/lib/useWebSocket", () => ({ useWebSocket: vi.fn() }));

vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

describe("TablesTab", () => {
  beforeEach(() => {
    mocks.fetchTables.mockReset().mockResolvedValue([
      {
        id: 1000,
        table_number: "R4M",
        qr_code: `table-${"a".repeat(64)}`,
        ordering_url: `https://ordering.example/?table=1000&qr=table-${"a".repeat(64)}`,
      },
      { id: 1, table_number: "Table 1", qr_code: `table-${"b".repeat(64)}` },
      { id: 999, table_number: "Counter Order", qr_code: "counter-orders" },
    ]);
    mocks.fetchSettings.mockReset().mockResolvedValue({});
    mocks.createTable.mockReset();
    mocks.updateTable.mockReset();
    mocks.deleteTable.mockReset();
  });

  it("shows R4M as the protected direct customer-ordering entry above physical tables", async () => {
    render(<TablesTab />);

    const r4mLink = await screen.findByRole("link", { name: /R4M/ });
    expect(r4mLink).toHaveAttribute(
      "href",
      `https://ordering.example/?table=1000&qr=table-${"a".repeat(64)}`
    );
    expect(r4mLink).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Table 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit R4M" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete R4M" })).not.toBeInTheDocument();
  });
});
