import { AlertTriangle, RefreshCw, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ServerConnectionNoticeKind } from "@/lib/useServerConnectionNotice";

interface ServerConnectionNoticeProps {
  kind: ServerConnectionNoticeKind | null;
}

export const ServerConnectionNotice = ({ kind }: ServerConnectionNoticeProps) => {
  const { t } = useTranslation();
  if (!kind) return null;

  const isOffline = kind === "offline";
  const Icon = isOffline ? AlertTriangle : kind === "retrying" ? RefreshCw : Wifi;
  const titleKey = `connection.${kind}Title`;
  const bodyKey = `connection.${kind}Body`;

  return (
    <div className="sticky top-3 z-[70] mx-auto mt-3 w-[calc(100%-1rem)] max-w-3xl">
      <div
        role={isOffline ? "alert" : "status"}
        aria-live={isOffline ? "assertive" : "polite"}
        aria-atomic="true"
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[var(--shadow-deep)] ${
          isOffline
            ? "border-destructive/30 bg-card text-foreground"
            : "border-accent/50 bg-card text-foreground"
        }`}
      >
        <span
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            isOffline ? "bg-destructive/10 text-destructive" : "bg-accent/20 text-primary"
          }`}
          aria-hidden="true"
        >
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
