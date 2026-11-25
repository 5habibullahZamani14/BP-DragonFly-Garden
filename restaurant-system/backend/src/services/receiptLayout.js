const RECEIPT_MARGIN_MM = 1.75;
const RECEIPT_MARGIN_HUNDREDTHS_INCH = Math.round((RECEIPT_MARGIN_MM / 25.4) * 100);
const RECEIPT_EFFECTIVE_MARGIN_MM = (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4;

const RECEIPT_LAYOUT = Object.freeze({
  columns: 40,
  fontFamily: "Roboto Condensed",
  brandFontFamily: "Cinzel",
  numericFontFamily: "Bodoni Moda",
  baseFontSizePt: 11,
  brandFontSizePt: 20,
  totalFontSizePt: 13,
  logoSizeMm: 30,
  qrCodeSizeMm: 40,
  fontWeight: 300,
  boldFontWeight: 700,
  brandFontWeight: 700,
  numericFontWeight: 400,
  numericBoldFontWeight: 700,
  marginsMm: Object.freeze({
    left: RECEIPT_EFFECTIVE_MARGIN_MM,
    right: RECEIPT_EFFECTIVE_MARGIN_MM,
    top: RECEIPT_EFFECTIVE_MARGIN_MM,
    bottom: RECEIPT_EFFECTIVE_MARGIN_MM,
  }),
});

const RESTAURANT_FACEBOOK_URL = "https://www.facebook.com/BPDragonflyGarden/";

module.exports = {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
  RESTAURANT_FACEBOOK_URL,
};
