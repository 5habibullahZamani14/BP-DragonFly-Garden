const revokeStoredSession = (db, settingKey, sessionId) =>
  new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM restaurant_settings
        WHERE key = ?
          AND json_extract(value, '$.sessionId') = ?`,
      [settingKey, sessionId],
      function onRevoked(error) {
        if (error) reject(error);
        else resolve(this.changes > 0);
      },
    );
  });

module.exports = { revokeStoredSession };
