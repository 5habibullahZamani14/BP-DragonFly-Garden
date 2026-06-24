export type HotspotSecurity = "WPA" | "WEP" | "nopass";

const escapeWifiValue = (value: string) =>
  String(value || "").replace(/([\\\\;,\":])/g, "\\$1");

export const buildWifiQrValue = (
  ssid: string,
  password: string,
  security: HotspotSecurity = "WPA"
) => {
  if (!ssid) return "";
  const normalizedSecurity = security === "nopass" ? "nopass" : security || "WPA";
  const parts = [`WIFI:T:${normalizedSecurity};`, `S:${escapeWifiValue(ssid)};`];
  if (normalizedSecurity !== "nopass") {
    parts.push(`P:${escapeWifiValue(password || "")};;`);
  } else {
    parts.push("H:false;;");
  }
  return parts.join("");
};
