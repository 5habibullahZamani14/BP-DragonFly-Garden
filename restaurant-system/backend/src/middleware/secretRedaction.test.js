const assert = require("node:assert/strict");
const test = require("node:test");
const { redactSensitiveData, redactText } = require("./secretRedaction");

test("redacts credential fields and common credential formats from text", () => {
  const circular = { name: "test" };
  circular.self = circular;
  const response = redactSensitiveData({
    token: "hidden-token",
    AWS_ACCESS_KEY_ID: "not-an-example-key",
    view_token: "private-feedback-code",
    circular,
    message: "Authorization: Bearer eyJabcdefgh.abcdefgh.abcdefgh"
  });

  assert.equal(response.token, "[REDACTED]");
  assert.equal(response.AWS_ACCESS_KEY_ID, "[REDACTED]");
  assert.equal(response.view_token, "[REDACTED]");
  assert.equal(response.circular.self, "[Circular]");
  assert.equal(response.message, "Authorization: Bearer [REDACTED]");
  assert.equal(redactText("view_token=private-feedback-code"), "view_token=[REDACTED]");
  assert.equal(redactText("failed at /?api_key=private-value"), "failed at /?api_key=[REDACTED]");
  assert.equal(redactText('{"password": "private-value"}'), '{"password": "[REDACTED]"}');
  assert.equal(redactText("password=correct horse battery staple"), "password=[REDACTED]");
  assert.equal(redactText("OpenAI key sk-proj-abcdefghijklmnopqrstuvwxyz012345"), "OpenAI key [REDACTED_API_KEY]");
});
