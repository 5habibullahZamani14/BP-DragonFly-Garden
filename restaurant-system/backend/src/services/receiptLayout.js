const toHundredthsInch = mm => Math.round((mm / 25.4) * 100);

const RECEIPT_LAYOUT = Object.freeze({
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
  marginsMm: Object.freeze({
    left: 0.0,
    right: 12.0,
    top: 0.0,
    bottom: 2.0,
  }),
});

const RECEIPT_MARGINS_HUNDREDTHS_INCH = Object.freeze({
  left: toHundredthsInch(RECEIPT_LAYOUT.marginsMm.left),
  right: toHundredthsInch(RECEIPT_LAYOUT.marginsMm.right),
  top: toHundredthsInch(RECEIPT_LAYOUT.marginsMm.top),
  bottom: toHundredthsInch(RECEIPT_LAYOUT.marginsMm.bottom),
});

const RESTAURANT_FACEBOOK_URL = "https://www.facebook.com/BPDragonflyGarden/";

module.exports = {
  RECEIPT_LAYOUT,
  RECEIPT_MARGINS_HUNDREDTHS_INCH,
  RESTAURANT_FACEBOOK_URL,
};
