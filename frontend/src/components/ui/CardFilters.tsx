import React from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TimeframeValue } from "@/lib/parseDbTimestamp";

type SelectOption = { value: string; label: string };

type CardFiltersProps = {
  label: string;
  timeframe?: TimeframeValue;
  onTimeframeChange?: (val: TimeframeValue) => void;
  startDate?: string;
  onStartDateChange?: (val: string) => void;
  endDate?: string;
  onEndDateChange?: (val: string) => void;
  productType?: string;
  onProductTypeChange?: (val: string) => void;
  secondaryLabel?: string;
  secondaryValue?: string;
  onSecondaryChange?: (val: string) => void;
  secondaryOptions?: SelectOption[];
  tertiaryLabel?: string;
  tertiaryValue?: string;
  onTertiaryChange?: (val: string) => void;
  tertiaryOptions?: SelectOption[];
};

export const CardFilters: React.FC<CardFiltersProps> = ({
  label,
  timeframe,
  onTimeframeChange,
  startDate = "",
  onStartDateChange,
  endDate = "",
  onEndDateChange,
  productType,
  onProductTypeChange,
  secondaryLabel,
  secondaryValue,
  onSecondaryChange,
  secondaryOptions,
  tertiaryLabel,
  tertiaryValue,
  onTertiaryChange,
  tertiaryOptions,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-gray-50/70 p-3 rounded-2xl border border-gray-100/80 mb-4 text-xs">
      <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] sm:mr-2">
        {label}
      </span>
      <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
        {timeframe !== undefined && onTimeframeChange && (
          <Select value={timeframe} onValueChange={(v) => onTimeframeChange(v as TimeframeValue)}>
            <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-gray-200 min-w-[110px] w-auto">
              <SelectValue placeholder={t("m.timeframe")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("m.allTime")}</SelectItem>
              <SelectItem value="today">{t("m.today")}</SelectItem>
              <SelectItem value="yesterday">{t("m.yesterday")}</SelectItem>
              <SelectItem value="week">{t("m.last7Days")}</SelectItem>
              <SelectItem value="month">{t("m.last30Days")}</SelectItem>
              <SelectItem value="custom">{t("m.customRange")}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {productType !== undefined && onProductTypeChange && (
          <Select value={productType} onValueChange={onProductTypeChange}>
            <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-gray-200 min-w-[110px] w-auto">
              <SelectValue placeholder={t("m.productType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("m.allCategories")}</SelectItem>
              <SelectItem value="food">{t("m.food")}</SelectItem>
              <SelectItem value="drink">{t("m.drink")}</SelectItem>
              <SelectItem value="merchandise">{t("m.merchandise")}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {secondaryOptions && secondaryValue !== undefined && onSecondaryChange && (
          <Select value={secondaryValue} onValueChange={onSecondaryChange}>
            <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-gray-200 min-w-[110px] w-auto">
              <SelectValue placeholder={secondaryLabel || t("m.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              {secondaryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {tertiaryOptions && tertiaryValue !== undefined && onTertiaryChange && (
          <Select value={tertiaryValue} onValueChange={onTertiaryChange}>
            <SelectTrigger className="h-8 text-xs bg-white rounded-lg border-gray-200 min-w-[110px] w-auto">
              <SelectValue placeholder={tertiaryLabel || t("m.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              {tertiaryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {timeframe === "custom" && onStartDateChange && onEndDateChange && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
            <Input
              type="date"
              className="h-8 text-xs bg-white rounded-lg border-gray-200 w-[120px]"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
            <span className="text-[10px] text-gray-400">to</span>
            <Input
              type="date"
              className="h-8 text-xs bg-white rounded-lg border-gray-200 w-[120px]"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CardFilters;
