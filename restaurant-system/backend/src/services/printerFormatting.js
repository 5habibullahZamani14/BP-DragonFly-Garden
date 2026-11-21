const STANDARD_PAPER_COLUMNS = new Map([
  [45, 24],
  [50, 32],
  [58, 32],
  [80, 48],
]);

const validatePaperWidth = (paperWidthMm) => {
  if (!Number.isInteger(paperWidthMm) || paperWidthMm < 30 || paperWidthMm > 120) {
    throw new Error("Paper width must be a whole number between 30 and 120 mm.");
  }
  return paperWidthMm;
};

const validateMargin = (margin, name) => {
  if (!Number.isInteger(margin) || margin < 0 || margin > 20) {
    throw new Error(`${name} must be a whole number between 0 and 20 characters.`);
  }
  return margin;
};

const paperWidthToCharacterColumns = (paperWidthMm) => {
  validatePaperWidth(paperWidthMm);
  return STANDARD_PAPER_COLUMNS.get(paperWidthMm) ?? Math.floor(paperWidthMm * 0.6);
};

const wrapReceiptText = (text, maxWidth) => {
  if (!Number.isInteger(maxWidth) || maxWidth < 1) {
    throw new Error("Receipt line width must be a positive whole number.");
  }
  if (!text || text.length <= maxWidth) return [text || ""];

  const lines = [];
  let current = "";
  for (const originalWord of text.trim().split(/\s+/)) {
    let word = originalWord;
    while (word.length > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxWidth));
      word = word.slice(maxWidth);
    }

    if (current && current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const getPrintableCharacterColumns = (paperWidthMm, marginLeft = 0, marginRight = 0) => {
  const left = validateMargin(marginLeft, "Left margin");
  const right = validateMargin(marginRight, "Right margin");
  const columns = paperWidthToCharacterColumns(paperWidthMm) - left - right;
  if (columns < 1) {
    throw new Error("Paper width and margins leave no printable characters.");
  }
  return columns;
};

module.exports = {
  getPrintableCharacterColumns,
  paperWidthToCharacterColumns,
  wrapReceiptText,
  validatePaperWidth,
};
