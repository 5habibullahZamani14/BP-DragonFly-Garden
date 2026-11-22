const RECEIPT_MARGIN_MM = 2;
const RECEIPT_MARGIN_HUNDREDTHS_INCH = Math.round((RECEIPT_MARGIN_MM / 25.4) * 100);

const RECEIPT_LAYOUT = Object.freeze({
  columns: 44,
  fontFamily: "Consolas",
  baseFontSizePt: 10,
  fontWeight: 400,
  marginsMm: Object.freeze({
    left: (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4,
    right: (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4,
    top: 0,
    bottom: (RECEIPT_MARGIN_HUNDREDTHS_INCH / 100) * 25.4,
  }),
});

module.exports = {
  RECEIPT_LAYOUT,
  RECEIPT_MARGIN_HUNDREDTHS_INCH,
};
