const os = require("os");

const pickPreferredLocalIp = () => {
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

  if (candidates.length === 0) {
    return null;
  }

  return candidates.find((address) => address !== "127.0.0.1") || candidates[0];
};

module.exports = {
  pickPreferredLocalIp,
};
