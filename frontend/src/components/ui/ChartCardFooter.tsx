import React from "react";
import ChartInfo from "@/components/ui/ChartInfo";
import ChartExport from "@/components/ui/ChartExport";

type ChartCardFooterProps = {
  infoKey: string;
  targetId: string;
  data?: Record<string, unknown>[];
  fileName: string;
};

export const ChartCardFooter: React.FC<ChartCardFooterProps> = ({
  infoKey,
  targetId,
  data,
  fileName,
}) => (
  <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between px-2">
    <ChartInfo textKey={infoKey} className="mt-0 shrink-0" />
    <ChartExport
      targetId={targetId}
      data={data}
      fileName={fileName}
      className="mt-0 shrink-0 sm:ml-auto"
    />
  </div>
);

export default ChartCardFooter;
