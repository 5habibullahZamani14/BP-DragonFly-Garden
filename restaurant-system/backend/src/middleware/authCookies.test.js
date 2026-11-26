const assert = require("node:assert/strict");
const test = require("node:test");
const {
  clearAuthCookie,
  getAuthCookieValue,
  PAYMENT_COUNTER_SESSION_MAX_AGE_SECONDS,
  setAuthCookie
} = require("./authCookies");

test("auth cookies are HttpOnly, SameSite strict, and role-scoped", () => {
  const headers = {};
  setAuthCookie({ setHeader: (name, value) => { headers[name] = value; } }, { secure: true }, "manager", "a.jwt.value");

  assert.match(headers["Set-Cookie"], /^dfg_manager_session=a\.jwt\.value;/);
  assert.match(headers["Set-Cookie"], /HttpOnly/);
  assert.match(headers["Set-Cookie"], /SameSite=Strict/);
  assert.match(headers["Set-Cookie"], /; Secure$/);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(getAuthCookieValue(`other=x; ${headers["Set-Cookie"].split(";")[0]}`, "manager"), "a.jwt.value");
  assert.equal(getAuthCookieValue(headers["Set-Cookie"], "payment_counter"), null);
});

test("logout clears the role cookie without requiring a secure transport", () => {
  const headers = {};
  clearAuthCookie({ setHeader: (name, value) => { headers[name] = value; } }, { secure: false }, "payment_counter");

  assert.match(headers["Set-Cookie"], /^dfg_payment_session=;/);
  assert.match(headers["Set-Cookie"], /Max-Age=0/);
  assert.match(headers["Set-Cookie"], /HttpOnly/);
  assert.doesNotMatch(headers["Set-Cookie"], /; Secure$/);
});

test("auth cookies use Secure when Express marks the request as HTTPS", () => {
  const headers = {};
  setAuthCookie(
    { setHeader: (name, value) => { headers[name] = value; } },
    { secure: true },
    "manager",
    "a.jwt.value"
  );
  assert.match(headers["Set-Cookie"], /; Secure$/);
});

test("untrusted forwarded protocol headers do not mark cookies Secure", () => {
  const headers = {};
  setAuthCookie(
    { setHeader: (name, value) => { headers[name] = value; } },
    { secure: false, headers: { "x-forwarded-proto": "https" } },
    "manager",
    "a.jwt.value"
  );
  assert.doesNotMatch(headers["Set-Cookie"], /; Secure$/);
});

test("feedback access uses a long-lived HttpOnly cookie without overwriting other cookies", () => {
  const headers = { "Set-Cookie": "dfg_manager_session=manager-cookie; Path=/; HttpOnly" };
  const res = {
    getHeader: (name) => headers[name],
    setHeader: (name, value) => { headers[name] = value; }
  };
  setAuthCookie(res, { secure: false }, "feedback", "feedback-session", 180 * 24 * 60 * 60);

  assert.equal(headers["Set-Cookie"].length, 2);
  assert.match(headers["Set-Cookie"][1], /^dfg_feedback_session=feedback-session;/);
  assert.match(headers["Set-Cookie"][1], /Max-Age=15552000/);
  assert.match(headers["Set-Cookie"][1], /HttpOnly/);
  assert.match(headers["Set-Cookie"][1], /SameSite=Strict/);
});

test("customer table sessions use an HttpOnly, short-lived, role-scoped cookie", () => {
  const headers = {};
  setAuthCookie(
    { setHeader: (name, value) => { headers[name] = value; } },
    { secure: false },
    "customer_table",
    "table-session",
    8 * 60 * 60
  );

  assert.match(headers["Set-Cookie"], /^dfg_customer_table_session=table-session;/);
  assert.match(headers["Set-Cookie"], /Max-Age=28800/);
  assert.match(headers["Set-Cookie"], /HttpOnly/);
  assert.equal(getAuthCookieValue(headers["Set-Cookie"], "customer_table"), "table-session");
  assert.equal(getAuthCookieValue(headers["Set-Cookie"], "manager"), null);
});

test("payment counter sessions have a 12-hour maximum lifetime", () => {
  const headers = {};
  setAuthCookie(
    { setHeader: (name, value) => { headers[name] = value; } },
    { secure: true },
    "payment_counter",
    "payment-session",
    PAYMENT_COUNTER_SESSION_MAX_AGE_SECONDS
  );
  assert.match(headers["Set-Cookie"], /Max-Age=43200/);
});
