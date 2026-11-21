const test = require("node:test");
const assert = require("node:assert/strict");
const { getLocalIpv4Addresses, getValidatedRequestBaseUrl } = require("./networkAddress");

test("request URLs reject spoofed hosts and forwarded protocol overrides", (t) => {
  const [localIp] = getLocalIpv4Addresses();
  if (!localIp) {
    t.skip("No local IPv4 address is available in this environment.");
    return;
  }

  assert.equal(
    getValidatedRequestBaseUrl({ protocol: "http", headers: { host: "attacker.example" } }),
    null
  );
  assert.equal(
    getValidatedRequestBaseUrl({ protocol: "http", headers: { host: "localhost:5000" } }),
    null
  );
  assert.equal(
    getValidatedRequestBaseUrl({
      protocol: "http",
      headers: { host: `${localIp}:5000`, "x-forwarded-proto": "https" },
    }),
    `http://${localIp}:5000`
  );
});
