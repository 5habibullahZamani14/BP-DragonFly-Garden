import React from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const ChartInfo = ({ textKey, className }: { textKey: string; className?: string }) => {
  const { t } = useTranslation();

  return (
    <details className={cn("mt-3 text-sm text-gray-600", className)}>
      <summary className="flex items-center gap-2 cursor-pointer select-none list-none outline-none">
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-muted text-muted-foreground text-xs">
          <Info className="h-4 w-4" />
          <span className="font-medium">{t("m.info")}</span>
        </span>
      </summary>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t(textKey)}
      </div>
    </details>
  );
};

export default ChartInfo;
