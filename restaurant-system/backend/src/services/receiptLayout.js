const RECEIPT_MARGIN_MM = 1;
const RECEIPT_MARGIN_HUNDREDTHS_INCH = Math.round((RECEIPT_MARGIN_MM / 25.4) * 100);

const RECEIPT_LAYOUT = Object.freeze({
  columns: 44,
  fontFamily: "Roboto Condensed",
  brandFontFamily: "Cinzel",
  numericFontFamily: "Bodoni Moda",
  baseFontSizePt: 10,
  brandFontSizePt: 15,
  totalFontSizePt: 12,
  logoSizeMm: 30,
  qrCodeSizeMm: 40,
  fontWeight: 300,
  boldFontWeight: 700,
  brandFontWeight: 700,
  numericFontWeight: 400,
  numericBoldFontWeight: 700,
  marginsMm: Object.freeze({
    left: (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4,
    right: (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4,
    top: 0,
    bottom: (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4,
  }),
});

const RESTAURANT_FACEBOOK_URL = "https://www.facebook.com/BPDragonflyGarden/";

module.exports = {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
  RESTAURANT_FACEBOOK_URL,
};
