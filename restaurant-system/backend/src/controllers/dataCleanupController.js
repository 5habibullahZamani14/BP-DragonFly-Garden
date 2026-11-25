const path = require("path");
const { all, get, run } = require("../utils/dbUtils");
const { createLog } = require("./managementController");
const {
  DATASETS,
  DATASET_KEYS,
  DataCleanupError,
  createDataCleanupService,
} = require("../services/dataCleanupService");

const cleanupService = createDataCleanupService({
  all,
  get,
  run,
  publicDir: path.resolve(__dirname, "../../../../frontend/public"),
});
let broadcastFn = null;
const setBroadcast = (fn) => { broadcastFn = fn; };

const listDatasets = (_req, res) => {
  res.json({
    datasets: DATASET_KEYS.map((key) => ({
      key,
      label: DATASETS[key].label,
      impact: DATASETS[key].impact,
      dateFilter: Boolean(DATASETS[key].dateColumn),
      filters: DATASETS[key].filters,
    })),
  });
};

const listRecords = async (req, res, next) => {
  try {
    const result = await cleanupService.getRows(
      req.params.dataset,
      req.query,
      Number(req.query.page || 1),
      Number(req.query.pageSize || 50)
    );
    res.json(result);
  } catch (error) {
    if (error instanceof DataCleanupError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const deleteRecords = async (req, res, next) => {
  try {
    const { dataset, ids, filters, allMatching, excludedIds, expectedCount, confirmationText } = req.body || {};
    const definition = DATASETS[dataset];
    if (!definition) {
      return res.status(400).json({ success: false, message: "Unknown data category." });
    }
    const count = allMatching ? expectedCount : Array.isArray(ids) ? new Set(ids.map(String)).size : 0;
    if (!Number.isSafeInteger(count) || count < 1) {
      return res.status(400).json({ success: false, message: "The reviewed record count is invalid." });
    }
    const expectedConfirmation = `DELETE ${count} ${definition.label.toUpperCase()}`;
    if (String(confirmationText || "") !== expectedConfirmation) {
      return res.status(400).json({
        success: false,
        message: `Type exactly: ${expectedConfirmation}`,
      });
    }

    const result = await cleanupService.deleteRecords({
      dataset,
      ids,
      filters,
      allMatching: allMatching === true,
      excludedIds,
      expectedCount: count,
      audit: (deletedCount) => createLog(
        "SYSTEM",
        "BULK_DATA_DELETE",
        req.user?.id,
        req.user?.name,
        dataset,
        definition.label,
        {
          deleted_count: deletedCount,
          all_matching: allMatching === true,
          excluded_count: Array.isArray(excludedIds) ? excludedIds.length : 0,
        }
      ),
    });
    if (broadcastFn) broadcastFn({ type: "DATA_REFRESH" });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof DataCleanupError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = { listDatasets, listRecords, deleteRecords, setBroadcast };
