import { describe, expect, it } from "vitest";
import { getReceiptRuleStyle } from "@/components/garden/management/SettingsTab";

describe("receipt rule preview layout", () => {
  it("keeps section rules inset within the paper's left and right margins", () => {
    const style = getReceiptRuleStyle({
      columns: 42,
      paperWidthMm: 80,
      fontFamily: "Roboto Condensed",
      boldFontFamily: "Roboto Condensed",
      brandFontFamily: "Cinzel",
      numericFontFamily: "Bodoni Moda",
      baseFontSizePt: 9,
      brandFontSizePt: 20,
      totalFontSizePt: 13,
      logoSizeMm: 35,
      qrCodeSizeMm: 30,
      fontWeight: 300,
      boldFontWeight: 700,
      brandFontWeight: 400,
      numericFontWeight: 400,
      numericBoldFontWeight: 700,
      marginsMm: { left: 1.75, right: 6, top: 0, bottom: 1.75 },
    });

    expect(style).toMatchObject({
      width: "calc(100% - 7.75mm)",
      boxSizing: "border-box",
      marginLeft: "1.75mm",
      marginRight: "6mm",
    });
  });
});
