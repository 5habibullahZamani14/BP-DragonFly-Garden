const os = require("os");

const getLocalIpv4Addresses = () => {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const ifaceList of Object.values(nets)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (iface.address.startsWith("169.254.")) continue;
      candidates.push(iface.address);
    }
  }

  return candidates;
};

const pickPreferredLocalIp = () => {
  const candidates = getLocalIpv4Addresses();
  if (candidates.length === 0) {
    return null;
  }

  return candidates.find((address) => address === "10.42.0.1")
    || candidates.find((address) => address !== "127.0.0.1")
    || candidates[0];
};

const getValidatedRequestBaseUrl = (req) => {
  const requestHost = typeof req.get === "function" ? req.get("host") : req.headers?.host;
  if (
    typeof requestHost !== "string"
    || !/^(?:[a-z0-9.-]+(?::\d{1,5})?|\[[a-f0-9:]+\](?::\d{1,5})?)$/i.test(requestHost)
  ) {
    return null;
  }

  let hostUrl;
  try {
    hostUrl = new URL(`http://${requestHost}`);
  } catch {
    return null;
  }

  const hostname = hostUrl.hostname.toLowerCase();
  if (!getLocalIpv4Addresses().includes(hostname)) return null;

  const protocol = req.protocol === "https" ? "https" : "http";
  return `${protocol}://${hostUrl.host}`;
};

module.exports = {
  getLocalIpv4Addresses,
  getValidatedRequestBaseUrl,
  pickPreferredLocalIp,
};
