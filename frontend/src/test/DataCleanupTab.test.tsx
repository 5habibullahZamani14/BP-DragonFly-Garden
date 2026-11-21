import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));

const record = {
  id: "14",
  label: "Guest feedback",
  created_at: "2026-01-02 12:00:00",
  type: "active",
  details: "Helpful comment",
};

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

    fireEvent.click(screen.getByRole("checkbox", { name: "m.dataCleanup.selectRecord Guest feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "m.dataCleanup.deleteSelected 1" }));

    const confirmation = await screen.findByLabelText("m.dataCleanup.typeToConfirm DELETE 1 FEEDBACK");
    const deleteButton = screen.getByRole("button", { name: "m.dataCleanup.deleteNow" });
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
});
