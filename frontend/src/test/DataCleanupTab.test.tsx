import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataCleanupTab } from "@/components/garden/management/DataCleanupTab";

const mocks = vi.hoisted(() => ({
  fetchDataCleanupDatasets: vi.fn(),
  fetchDataCleanupRecords: vi.fn(),
  deleteDataCleanupRecords: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchDataCleanupDatasets: mocks.fetchDataCleanupDatasets,
  fetchDataCleanupRecords: mocks.fetchDataCleanupRecords,
  deleteDataCleanupRecords: mocks.deleteDataCleanupRecords,
}));

vi.mock("react-i18next", () => ({
  useTranslation: (() => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key;
    return () => ({ t, i18n: { language: "en", resolvedLanguage: "en" } });
  })(),
}));

const record = {
  id: "14",
  label: "Guest feedback",
  created_at: "2026-01-02 12:00:00",
  type: "active",
  details: "Helpful comment",
};

const createPageRecords = (firstId: number) => Array.from({ length: 50 }, (_, index) => ({
  ...record,
  id: String(firstId + index),
  label: `Guest feedback ${firstId + index}`,
}));

describe("DataCleanupTab", () => {
  beforeEach(() => {
    mocks.fetchDataCleanupDatasets.mockReset().mockResolvedValue({
      datasets: [{
        key: "feedback",
        label: "Feedback",
        impact: "Feedback and attached photos will be removed.",
        dateFilter: true,
        filters: {},
      }],
    });
    mocks.fetchDataCleanupRecords.mockReset().mockResolvedValue({
      rows: [record],
      total: 1,
    });
    mocks.deleteDataCleanupRecords.mockReset().mockResolvedValue({ deleted: 1, warnings: [] });
  });

  it("requires the exact reviewed count and category before deleting selected rows", async () => {
    render(<DataCleanupTab />);
    await screen.findByText("Guest feedback");

    const rowCheckbox = screen.getByRole("checkbox", { name: "m.dataCleanup.selectRecord Guest feedback" });
    await waitFor(() => expect(rowCheckbox).toBeEnabled());
    fireEvent.click(rowCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.deleteSelected 1" }));

    const confirmation = await screen.findByLabelText("m.dataCleanup.typeToConfirm DELETE 1 FEEDBACK");
    const deleteButton = screen.getByRole("button", { name: "m.dataCleanup.deleteNow" });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(confirmation, { target: { value: " DELETE 1 FEEDBACK " } });
    expect(deleteButton).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: "DELETE 1 FEEDBACK" } });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);

    await waitFor(() => expect(mocks.deleteDataCleanupRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "feedback",
        ids: ["14"],
        expectedCount: 1,
        confirmationText: "DELETE 1 FEEDBACK",
      })
    ));
  });

  it("selects matching records across pages and preserves that selection when a page is deselected", async () => {
    mocks.fetchDataCleanupRecords.mockImplementation((_dataset, _filters, requestedPage) => Promise.resolve({
      rows: createPageRecords((requestedPage - 1) * 50 + 1),
      total: 8292,
    }));
    mocks.deleteDataCleanupRecords.mockResolvedValue({ deleted: 8242, warnings: [] });

    render(<DataCleanupTab />);
    const selectAllButton = await screen.findByRole("button", { name: "m.dataCleanup.selectAll 8292" });
    await waitFor(() => expect(selectAllButton).toBeEnabled());
    fireEvent.click(selectAllButton);

    expect(screen.getByRole("status")).toHaveTextContent("m.dataCleanup.selectedAcrossPages 8292");
    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.deselectPage" }));
    expect(screen.getByRole("status")).toHaveTextContent("m.dataCleanup.selectedAcrossPages 8242");

    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.next" }));
    await waitFor(() => expect(mocks.fetchDataCleanupRecords).toHaveBeenLastCalledWith(
      "feedback",
      expect.any(Object),
      2,
      50
    ));
    expect(screen.getByText("m.dataCleanup.page 2 166")).toBeInTheDocument();
    await screen.findByText("Guest feedback 51");
    expect(screen.getByRole("checkbox", { name: "m.dataCleanup.deselectPage" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.deleteSelected 8242" }));
    const confirmation = await screen.findByLabelText("m.dataCleanup.typeToConfirm DELETE 8242 FEEDBACK");
    fireEvent.change(confirmation, { target: { value: "DELETE 8242 FEEDBACK" } });
    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.deleteNow" }));

    await waitFor(() => expect(mocks.deleteDataCleanupRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "feedback",
        allMatching: true,
        excludedIds: Array.from({ length: 50 }, (_, index) => String(index + 1)),
        expectedCount: 8242,
        confirmationText: "DELETE 8242 FEEDBACK",
      })
    ));
  });

  it("blocks pasted and dropped confirmation text while allowing manual typing", async () => {
    render(<DataCleanupTab />);
    await screen.findByText("Guest feedback");
    const rowCheckbox = screen.getByRole("checkbox", { name: "m.dataCleanup.selectRecord Guest feedback" });
    await waitFor(() => expect(rowCheckbox).toBeEnabled());
    fireEvent.click(rowCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.deleteSelected 1" }));

    const confirmation = await screen.findByLabelText("m.dataCleanup.typeToConfirm DELETE 1 FEEDBACK");
    const deleteButton = screen.getByRole("button", { name: "m.dataCleanup.deleteNow" });
    fireEvent.paste(confirmation, { clipboardData: { getData: () => "DELETE 1 FEEDBACK" } });
    expect(confirmation).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent("m.dataCleanup.manualEntryOnly");

    const pasteShortcut = createEvent.keyDown(confirmation, { key: "v", ctrlKey: true });
    fireEvent(confirmation, pasteShortcut);
    expect(pasteShortcut.defaultPrevented).toBe(true);

    const droppedText = createEvent.drop(confirmation, { dataTransfer: { getData: () => "DELETE 1 FEEDBACK" } });
    fireEvent(confirmation, droppedText);
    expect(droppedText.defaultPrevented).toBe(true);
    expect(confirmation).toHaveValue("");

    fireEvent.change(confirmation, { target: { value: "DELETE 1 FEEDBACK" } });
    expect(deleteButton).toBeEnabled();
  });
});
