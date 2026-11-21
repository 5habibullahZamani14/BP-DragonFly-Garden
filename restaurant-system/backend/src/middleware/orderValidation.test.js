const test = require("node:test");
const assert = require("node:assert/strict");
const { validateOrderCreation } = require("./validation");

const validate = (body) => {
  const req = { body };
  return new Promise((resolve) => {
    validateOrderCreation(req, {}, (error) => resolve({ req, error }));
  });
};

test("order validation keeps modifier IDs and discards client-supplied prices and labels", async () => {
  const { req, error } = await validate({
    table_id: 1,
    items: [{
      menu_item_id: 10,
      quantity: 1,
      options: [{
        groupId: 2,
        optionId: 3,
        groupName: "Forged group",
        optionLabel: "Forged option",
        priceDelta: -1000
      }]
    }]
  });

  assert.equal(error, undefined);
  assert.deepEqual(req.body.items[0].options, [{ groupId: 2, optionId: 3 }]);
});

test("order validation rejects malformed and duplicate modifier selections", async () => {
  const malformed = await validate({
    table_id: 1,
    items: [{ menu_item_id: 10, quantity: 1, options: [{ groupId: 2, optionId: "invalid" }] }]
  });
  assert.equal(malformed.error?.statusCode, 400);

  const duplicate = await validate({
    table_id: 1,
    items: [{
      menu_item_id: 10,
      quantity: 1,
      options: [{ groupId: 2, optionId: 3 }, { groupId: 2, optionId: 3 }]
    }]
  });
  assert.equal(duplicate.error?.statusCode, 400);
});

test("order validation rejects unsupported order types", async () => {
  const { error } = await validate({
    table_id: 1,
    order_type: "FREE",
    items: [{ menu_item_id: 10, quantity: 1 }]
  });

  assert.equal(error?.statusCode, 400);
});
