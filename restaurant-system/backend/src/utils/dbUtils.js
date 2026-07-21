/**
 * dbUtils.js — Shared database utility functions.
 *
 * Consolidates Promise wrapper patterns used across controllers,
 * provides query result caching for frequently accessed data,
 * and standardizes database error handling.
 */

const db = require("../database/db");

// Cache configuration
const CACHE_TTL_MS = 30000; // 30 seconds cache for frequently accessed data
const MAX_CACHE_SIZE = 100; // Prevent unbounded cache growth

// In-memory cache with TTL support
const queryCache = new Map();

/**
 * Get a cached value if it exists and hasn't expired.
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if not found/expired
 */
const getCached = (key) => {
  const entry = queryCache.get(key);
  if (!entry) return null;
  
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }
  
  return entry.value;
};

/**
 * Set a value in the cache with TTL.
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlMs - Time to live in milliseconds (default: CACHE_TTL_MS)
 */
const setCached = (key, value, ttlMs = CACHE_TTL_MS) => {
  // Prevent unbounded cache growth
  if (queryCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }
  
  queryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
};

/**
 * Clear cache entries matching a pattern.
 * @param {string} pattern - Pattern to match (e.g., "menu_" clears all menu-related cache)
 */
const clearCachePattern = (pattern) => {
  for (const key of queryCache.keys()) {
    if (key.startsWith(pattern)) {
      queryCache.delete(key);
    }
  }
};

/**
 * Clear all cache entries.
 */
const clearCache = () => {
  queryCache.clear();
};

// Promise wrappers for SQLite operations
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

/**
 * Execute a query with caching.
 * @param {string} cacheKey - Unique cache key for this query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {number} ttlMs - Cache TTL in milliseconds
 * @returns {Promise<any>} - Query results
 */
const cachedAll = async (cacheKey, sql, params = [], ttlMs = CACHE_TTL_MS) => {
  const cached = getCached(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  const result = await all(sql, params);
  setCached(cacheKey, result, ttlMs);
  return result;
};

/**
 * Execute a single-row query with caching.
 * @param {string} cacheKey - Unique cache key for this query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {number} ttlMs - Cache TTL in milliseconds
 * @returns {Promise<any>} - Query result
 */
const cachedGet = async (cacheKey, sql, params = [], ttlMs = CACHE_TTL_MS) => {
  const cached = getCached(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  const result = await get(sql, params);
  setCached(cacheKey, result, ttlMs);
  return result;
};

/**
 * Get the default pattern image URL with caching.
 * This is called frequently in getMenu and benefits from caching.
 */
const getDefaultPatternImage = async () => {
  const cacheKey = "default_pattern_image";
  const cached = getCached(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  const settingsRows = await all(
    `SELECT value FROM restaurant_settings WHERE key = ?`,
    ["default_pattern_id"]
  );
  
  if (settingsRows.length === 0) {
    setCached(cacheKey, null, 60000); // Cache null for 1 minute
    return null;
  }
  
  const parsedId = parseInt(settingsRows[0].value, 10);
  if (Number.isNaN(parsedId)) {
    setCached(cacheKey, null, 60000);
    return null;
  }
  
  const patternRows = await all(`SELECT image_url FROM patterns WHERE id = ?`, [parsedId]);
  const result = patternRows.length > 0 ? patternRows[0].image_url : null;
  setCached(cacheKey, result, 60000); // Cache for 1 minute
  return result;
};

/**
 * Invalidate the default pattern cache when patterns are updated.
 */
const invalidateDefaultPatternCache = () => {
  queryCache.delete("default_pattern_image");
};

module.exports = {
  // Promise wrappers
  all,
  get,
  run,
  
  // Caching utilities
  cachedAll,
  cachedGet,
  getCached,
  setCached,
  clearCache,
  clearCachePattern,
  
  // Cached queries
  getDefaultPatternImage,
  invalidateDefaultPatternCache,
  
  // Cache configuration
  CACHE_TTL_MS
};