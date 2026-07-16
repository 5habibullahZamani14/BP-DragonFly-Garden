import React from "react";
import { BarChart3 } from "lucide-react";

type ChartEmptyStateProps = {
  message: string;
};

export const ChartEmptyState: React.FC<ChartEmptyStateProps> = ({ message }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
    <BarChart3 className="h-10 w-10 text-gray-300 mb-3" />
    <p className="text-sm font-medium text-gray-400 max-w-xs">{message}</p>
  </div>
);

export default ChartEmptyState;
