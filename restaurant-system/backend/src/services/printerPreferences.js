const { normalizeReceiptCopyCounts } = require("./receiptCopies");

let preferenceUpdateQueue = Promise.resolve();

const mergePrinterPreferences = (currentPreferences, updates = {}) => {
  const merged = { ...currentPreferences };

  if (updates.printerPreferences !== undefined) {
    for (const [key, value] of Object.entries(updates.printerPreferences)) {
      if (key === "receipt_copies" && value && typeof value === "object" && !Array.isArray(value)) {
        const existingCopies = merged.receipt_copies && typeof merged.receipt_copies === "object" && !Array.isArray(merged.receipt_copies)
          ? merged.receipt_copies
          : {};
        const globalCopies = value.global && typeof value.global === "object" && !Array.isArray(value.global)
          ? {
              ...(existingCopies.global && typeof existingCopies.global === "object" && !Array.isArray(existingCopies.global)
                ? existingCopies.global
                : {}),
              ...value.global
            }
          : existingCopies.global;
        merged.receipt_copies = {
          ...existingCopies,
          ...value,
          ...(globalCopies ? { global: globalCopies } : {})
        };
      } else {
        merged[key] = value;
      }
    }
  }

  if (updates.testTicket !== undefined) {
    merged.test_ticket = updates.testTicket;
  }

  return merged;
};

const getStoredPrinterPreferences = (db) => new Promise((resolve, reject) => {
  db.get("SELECT value FROM restaurant_settings WHERE key = 'printer_preferences'", (error, row) => {
    if (error) {
      reject(error);
      return;
    }

    try {
      const preferences = row ? JSON.parse(row.value) : {};
      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
        throw new Error("Stored printer preferences have an invalid format.");
      }
      if (preferences.receipt_copies !== undefined) {
        preferences.receipt_copies = {
          ...preferences.receipt_copies,
          global: normalizeReceiptCopyCounts(preferences)
        };
      }
      resolve(preferences);
    } catch (error) {
      reject(new Error(`Could not read printer preferences: ${error.message}`));
    }
  });
});

const updateStoredPrinterPreferences = (db, updates) => {
  const update = async () => {
    const currentPreferences = await getStoredPrinterPreferences(db);
    const updatedPreferences = mergePrinterPreferences(currentPreferences, updates);

    if (updates.printerPreferences?.receipt_copies !== undefined) {
      updatedPreferences.receipt_copies = {
        ...(updatedPreferences.receipt_copies || {}),
        global: normalizeReceiptCopyCounts(updatedPreferences)
      };
    }

    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO restaurant_settings (key, value) VALUES ('printer_preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [JSON.stringify(updatedPreferences)],
        error => error ? reject(error) : resolve()
      );
    });

    return getStoredPrinterPreferences(db);
  };

  const result = preferenceUpdateQueue.then(update, update);
  preferenceUpdateQueue = result.then(() => undefined, () => undefined);
  return result;
};

module.exports = {
  mergePrinterPreferences,
  getStoredPrinterPreferences,
  updateStoredPrinterPreferences
};
