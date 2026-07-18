import React from "react";
import ChartInfo from "@/components/ui/ChartInfo";

type ChartCardFooterProps = {
  infoKey: string;
};

export const ChartCardFooter: React.FC<ChartCardFooterProps> = ({
  infoKey,
}) => (
  <div className="mt-3 px-2 py-2 bg-gray-50/50 rounded-lg border border-gray-100/50">
    <ChartInfo textKey={infoKey} className="w-full" />
  </div>
);

export default ChartCardFooter;
