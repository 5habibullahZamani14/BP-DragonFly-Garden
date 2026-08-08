const test = require('node:test');
const assert = require('node:assert/strict');
const { getResetCategoryOptions, getResetCategoryByKey } = require('./dataReset');

test('reset categories include full reset and specific menu/feedback scopes', () => {
  const categories = getResetCategoryOptions();
  const keys = categories.map((item) => item.key);

  assert.ok(keys.includes('all_data'));
  assert.ok(keys.includes('foods'));
  assert.ok(keys.includes('drinks'));
  assert.ok(keys.includes('feedback_images'));
  assert.ok(keys.includes('feedbacks'));

  const fullReset = getResetCategoryByKey('all_data');
  assert.ok(fullReset);
  assert.equal(fullReset.label, 'All app data');
});
