import React from "react";
import ChartExport from "@/components/ui/ChartExport";

type ChartHeaderExportProps = {
  targetId: string;
  data?: any[];
  fileName: string;
};

export const ChartHeaderExport: React.FC<ChartHeaderExportProps> = ({
  targetId,
  data,
  fileName,
}) => (
  <div className="flex items-center">
    <ChartExport
      targetId={targetId}
      data={data}
      fileName={fileName}
      className="flex-1"
    />
  </div>
);

export default ChartHeaderExport;
