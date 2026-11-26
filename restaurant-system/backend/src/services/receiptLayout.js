// Left, top, and bottom share this setting; the right edge is configured separately.
const RECEIPT_MARGIN_MM = 1.75;
const RECEIPT_RIGHT_MARGIN_MM = 4.0;
const toHundredthsInch = mm => Math.round((mm / 25.4) * 100);
const toEffectiveMillimeters = hundredthsInch => (hundredthsInch / 100) * 25.4;
const RECEIPT_MARGIN_HUNDREDTHS_INCH = toHundredthsInch(RECEIPT_MARGIN_MM);
const RECEIPT_RIGHT_MARGIN_HUNDREDTHS_INCH = toHundredthsInch(RECEIPT_RIGHT_MARGIN_MM);
const RECEIPT_EFFECTIVE_MARGIN_MM = toEffectiveMillimeters(RECEIPT_MARGIN_HUNDREDTHS_INCH);
const RECEIPT_EFFECTIVE_RIGHT_MARGIN_MM = toEffectiveMillimeters(RECEIPT_RIGHT_MARGIN_HUNDREDTHS_INCH);

const RECEIPT_LAYOUT = Object.freeze({
  columns: 40,
  fontFamily: "Oranienbaum",
  brandFontFamily: "Cinzel",
  numericFontFamily: "Bodoni Moda",
  baseFontSizePt: 10,
  brandFontSizePt: 20,
  totalFontSizePt: 13,
  logoSizeMm: 30,
  qrCodeSizeMm: 40,
  fontWeight: 400,
  boldFontWeight: 700,
  brandFontWeight: 700,
  brandOverprintOffsetHundredthsInch: 0.5,
  numericFontWeight: 400,
  numericBoldFontWeight: 700,
  marginsMm: Object.freeze({
    left: RECEIPT_EFFECTIVE_MARGIN_MM,
    right: RECEIPT_EFFECTIVE_RIGHT_MARGIN_MM,
    top: RECEIPT_EFFECTIVE_MARGIN_MM,
    bottom: RECEIPT_EFFECTIVE_MARGIN_MM,
  }),
});

const RESTAURANT_FACEBOOK_URL = "https://www.facebook.com/BPDragonflyGarden/";

module.exports = {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
  RECEIPT_RIGHT_MARGIN_HUNDREDTHS_INCH,
  RESTAURANT_FACEBOOK_URL,
};
