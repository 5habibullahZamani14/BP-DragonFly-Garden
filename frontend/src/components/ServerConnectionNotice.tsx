import { Power, RefreshCw, Server, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  isServerConnectionOutage,
  type ServerConnectionNoticeKind,
} from "@/lib/useServerConnectionNotice";

interface ServerConnectionNoticeProps {
  kind: ServerConnectionNoticeKind | null;
}

export const ServerConnectionNotice = ({ kind }: ServerConnectionNoticeProps) => {
  const { t } = useTranslation();
  if (!kind) return null;

  const isOutage = isServerConnectionOutage(kind);

  if (isOutage) {
    const isFinal = kind === "shutdownOffline";
    const isAlert = kind === "offline" || isFinal;
    const serverStateKey = kind === "retrying"
      ? "connection.serverStateChecking"
      : kind === "shutdownRequested" || kind === "shutdownFinishing"
        ? "connection.serverStateStopping"
        : "connection.serverStateOffline";
    const titleKey = `connection.${kind}Title`;
    const bodyKey = `connection.${kind}Body`;
    const statusKey = kind === "retrying"
      ? "connection.checkingLabel"
      : kind === "offline"
        ? "connection.reconnectingLabel"
        : kind === "shutdownRequested"
          ? "connection.shutdownRequestedLabel"
          : kind === "shutdownFinishing"
            ? "connection.shutdownFinishingLabel"
            : "connection.shutdownOfflineLabel";

    return (
      <div className="connection-outage-backdrop fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
        <section
          role={isAlert ? "alert" : "status"}
          aria-live={isAlert ? "assertive" : "polite"}
          aria-atomic="true"
          className="connection-outage-panel flex min-h-[34rem] w-full max-w-3xl flex-col items-center justify-center rounded-[2rem] border border-[#E0E4EF] bg-[#FBFCFF] px-6 py-10 text-center shadow-[0_28px_90px_-40px_rgba(54,64,105,0.26)] sm:min-h-[38rem] sm:rounded-[2.5rem] sm:px-12 sm:py-14"
        >
          <div className="mx-auto flex h-56 w-full max-w-[27rem] items-end justify-center gap-2 sm:h-60" aria-hidden="true">
            <div className="h-[78%] w-[39%]">
              <DownServer label={t(serverStateKey)} offline={serverStateKey === "connection.serverStateOffline"} />
            </div>
            <div className="h-full w-[61%]">
              <ConnectionRobot />
            </div>
          </div>
          <div className="connection-robot-bubble mt-1 inline-flex max-w-sm items-center gap-2 rounded-2xl border border-[#E0E4EF] bg-white/90 px-4 py-2 text-sm font-medium text-[#4C5872] shadow-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E8EAFE] font-bold text-[#5361D9]" aria-hidden="true">?</span>
            <span>{t("connection.robotMessage")}</span>
          </div>

          <div className="mx-auto mt-1 inline-flex items-center gap-2 rounded-full bg-[#ECEEF7] px-4 py-2 text-sm font-medium text-[#4C5872]">
            {isFinal ? <Power className="h-4 w-4 text-[#A55D50]" /> : <RefreshCw className="h-4 w-4 motion-safe:animate-spin text-[#5965F5]" />}
            <span>{t(statusKey)}</span>
          </div>
          <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight text-[#20243A] sm:text-4xl">
            {t(titleKey)}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#58647B] sm:text-lg">
            {t(bodyKey)}
          </p>
          <div className="mt-6 flex w-full max-w-xs items-center justify-center rounded-2xl border border-[#E0E4EF] bg-white/80 px-5 py-3 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8EAFE] text-[#5361D9]">
                <Server className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="ml-3 min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7D8498]">{t("connection.serverLabel")}</p>
                <p className="truncate text-sm font-semibold text-[#30364C]">{t(serverStateKey)}</p>
              </div>
          </div>
        </section>
      </div>
    );
  }

  const Icon = kind === "restored" ? Wifi : RefreshCw;
  const titleKey = `connection.${kind}Title`;
  const bodyKey = `connection.${kind}Body`;

  return (
    <div className="sticky top-3 z-[70] mx-auto mt-3 w-[calc(100%-1rem)] max-w-3xl">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-start gap-3 rounded-2xl border border-accent/50 bg-card px-4 py-3 text-foreground shadow-[var(--shadow-deep)]"
      >
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-primary" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{t(titleKey)}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
        </div>
      </div>
    </div>
  );
};

const ConnectionRobot = () => (
  <svg viewBox="0 0 340 360" className="h-full w-full" fill="none">
    <defs>
      <linearGradient id="robot-shell" x1="108" y1="108" x2="221" y2="286" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F0F1F4" />
        <stop offset="1" stopColor="#B8BBC5" />
      </linearGradient>
      <linearGradient id="robot-face" x1="133" y1="45" x2="204" y2="144" gradientUnits="userSpaceOnUse">
        <stop stopColor="#30334B" />
        <stop offset="1" stopColor="#171B30" />
      </linearGradient>
    </defs>
    <ellipse cx="170" cy="343" rx="92" ry="9" fill="#3C4B6D" fillOpacity=".12" />

    <g>
      <path d="M145 291L133 318" stroke="#A5A9B4" strokeWidth="22" strokeLinecap="round" />
      <circle cx="133" cy="319" r="10" fill="#30334B" />
      <path d="M133 327L127 337Q125 341 131 342H157Q162 340 158 336L149 328Z" fill="#D8DAE0" stroke="#858A98" strokeWidth="3" />
      <path d="M132 337H155" stroke="#5965F5" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g>
      <path d="M196 291L207 318" stroke="#A5A9B4" strokeWidth="22" strokeLinecap="round" />
      <circle cx="207" cy="319" r="10" fill="#30334B" />
      <path d="M207 327L213 337Q215 341 209 342H183Q178 340 182 336L191 328Z" fill="#D8DAE0" stroke="#858A98" strokeWidth="3" />
      <path d="M185 337H208" stroke="#5965F5" strokeWidth="3" strokeLinecap="round" />
    </g>

    <g className="connection-robot-arm-left">
      <path d="M118 205L89 224" stroke="#30334B" strokeWidth="13" strokeLinecap="round" />
      <path d="M86 225Q72 226 70 242L66 266Q66 278 77 280Q89 280 92 268L97 244Q100 232 86 225Z" fill="url(#robot-shell)" stroke="#858A98" strokeWidth="3" />
      <circle cx="88" cy="226" r="11" fill="#30334B" />
      <path d="M72 277Q61 282 66 293Q71 303 81 300L90 292Q92 285 86 280Z" fill="#D6D8DE" stroke="#858A98" strokeWidth="3" />
    </g>
    <g className="connection-robot-arm-right">
      <path d="M220 205L249 224" stroke="#30334B" strokeWidth="13" strokeLinecap="round" />
      <path d="M252 225Q266 226 268 242L272 266Q272 278 261 280Q249 280 246 268L241 244Q238 232 252 225Z" fill="url(#robot-shell)" stroke="#858A98" strokeWidth="3" />
      <circle cx="250" cy="226" r="11" fill="#30334B" />
      <path d="M266 277Q277 282 272 293Q267 303 257 300L248 292Q246 285 252 280Z" fill="#D6D8DE" stroke="#858A98" strokeWidth="3" />
    </g>

    <path d="M143 157C132 160 133 167 144 170C155 173 155 179 144 182C133 185 134 191 145 196" stroke="#34384F" strokeWidth="5" strokeLinecap="round" />
    <path d="M154 157C143 160 144 167 155 170C166 173 166 179 155 182C144 185 145 191 156 196" stroke="#5965F5" strokeWidth="3" strokeLinecap="round" />

    <path d="M130 182Q107 188 101 213L91 256Q87 281 111 293Q146 310 184 307Q227 304 245 277Q254 263 246 239L232 202Q226 185 207 181Q170 171 130 182Z" fill="url(#robot-shell)" stroke="#858A98" strokeWidth="4" strokeLinejoin="round" />
    <path d="M109 218Q107 242 117 261Q121 267 128 262Q142 251 154 243Q169 234 178 228Q190 221 183 211Q171 195 149 194Q124 194 114 207" fill="#F8F8FA" fillOpacity=".56" />
    <path d="M126 279Q170 292 211 276" stroke="#A0A4AF" strokeWidth="3" strokeLinecap="round" />
    <circle cx="172" cy="208" r="5" fill="#5965F5" />
    <circle cx="188" cy="211" r="3" fill="#B2B7C2" />

    <g className="connection-robot-head">
      <ellipse cx="174" cy="97" rx="63" ry="67" fill="#E4E5EA" stroke="#B8BBC5" strokeWidth="4" />
      <path d="M128 57Q141 38 165 34" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M215 44Q231 53 237 69" stroke="#C1C4CD" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="177" cy="97" rx="44" ry="51" fill="url(#robot-face)" />
      <path d="M180 48Q194 68 221 70" stroke="#5965F5" strokeWidth="3" strokeLinecap="round" />
      <g className="connection-robot-eyes" stroke="#4DE1EE" strokeWidth="4" strokeLinecap="round">
        <path d="M152 76V94M143 85H161" />
        <path d="M190 99V117M181 108H199" />
      </g>
      <path className="connection-robot-mouth" d="M160 132L166 129L172 133L178 130L184 134" stroke="#DDE5F3" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="119" cy="99" r="4" fill="#B8BBC5" />
      <circle cx="229" cy="99" r="4" fill="#B8BBC5" />
    </g>
  </svg>
);

const DownServer = ({ label, offline }: { label: string; offline: boolean }) => (
  <svg viewBox="0 0 220 270" className="connection-server h-full w-full" fill="none">
    <ellipse cx="110" cy="258" rx="80" ry="9" fill="#3C4B6D" fillOpacity=".12" />
    <rect x="32" y="39" width="170" height="204" rx="20" fill="#5965F5" />
    <rect x="25" y="34" width="170" height="204" rx="20" fill="#DDE0E8" stroke="#858A98" strokeWidth="5" />
    <path d="M37 53Q37 45 45 45H175Q183 45 183 53V68H37Z" fill="#30334B" />
    <text x="108" y="66" textAnchor="middle" fill="#F7F6FA" fontSize="12" fontWeight="700" letterSpacing="2">
      SERVER
    </text>
    <circle cx="168" cy="60" r="5" fill={offline ? "#C98262" : "#D7B466"} />

    {[86, 132, 178].map((top, index) => (
      <g key={top}>
        <rect x="38" y={top} width="144" height="39" rx="10" fill="#F5F6F8" stroke="#AEB3C0" strokeWidth="2.5" />
        <rect x="46" y={top + 8} width="19" height="23" rx="6" fill="#CFD2DA" />
        <path d={`M76 ${top + 12}H133M76 ${top + 19}H143M76 ${top + 26}H125`} stroke="#A3A8B5" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="163" cy={top + 13} r="4" fill={index === 0 && offline ? "#C98262" : "#AAB0BD"} />
        <circle cx="163" cy={top + 26} r="4" fill="#C5C9D2" />
      </g>
    ))}
    <text x="110" y="231" textAnchor="middle" fill="#53596D" fontSize="10" fontWeight="700" letterSpacing="1.1">
      {label.toLocaleUpperCase()}
    </text>
    <path d="M55 245H165" stroke="#858A98" strokeWidth="5" strokeLinecap="round" />
  </svg>
);
