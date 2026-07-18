import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchFinanceData, FinanceData } from "@/lib/api";
import { 
  DollarSign, TrendingUp, TrendingDown, PieChart, 
  Activity, ArrowUpRight, ArrowDownRight, PackageOpen,
  Bell, AlertTriangle, Utensils, Brain
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LineChart, Line, Legend
} from "recharts";
import ChartCardFooter from "@/components/ui/ChartCardFooter";
import ChartHeaderExport from "@/components/ui/ChartHeaderExport";
import ChartEmptyState from "@/components/ui/ChartEmptyState";
import CardFilters from "@/components/ui/CardFilters";
import { PageSkeleton, ChartSkeleton, KpiSkeleton } from "@/components/ui/LoadingSkeletons";
import { getLocalDateString, matchesTimeframe, parseDbTimestamp, type TimeframeValue } from "@/lib/parseDbTimestamp";
import { safeConsoleError } from "@/lib/safeConsole";

export const FinanceTab = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topItemsCount, setTopItemsCount] = useState<number>(5);

  // --- Filter States for Card 1: Overview Metrics ---
  const [metricsTimeframe, setMetricsTimeframe] = useState<TimeframeValue>('all');
  const [metricsStartDate, setMetricsStartDate] = useState<string>("");
  const [metricsEndDate, setMetricsEndDate] = useState<string>("");
  const [metricsProductType, setMetricsProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  // --- Filter States for Card 2: Revenue Timeline Chart ---
  const [timelineTimeframe, setTimelineTimeframe] = useState<TimeframeValue>('all');
  const [timelineStartDate, setTimelineStartDate] = useState<string>("");
  const [timelineEndDate, setTimelineEndDate] = useState<string>("");
  const [timelineProductType, setTimelineProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  // --- Filter States for Card 3: Top Profit Drivers ---
  const [driversTimeframe, setDriversTimeframe] = useState<TimeframeValue>('all');
  const [driversStartDate, setDriversStartDate] = useState<string>("");
  const [driversEndDate, setDriversEndDate] = useState<string>("");
  const [driversProductType, setDriversProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  // --- Filter States for Card 4: Customer Satisfaction ---
  const [feedbackTimeframe, setFeedbackTimeframe] = useState<TimeframeValue>('all');
  const [feedbackStartDate, setFeedbackStartDate] = useState<string>("");
  const [feedbackEndDate, setFeedbackEndDate] = useState<string>("");
  const [feedbackProductType, setFeedbackProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  // --- Filter States for Card 5: Floor Assistance ---
  const [assistanceTimeframe, setAssistanceTimeframe] = useState<TimeframeValue>('all');
  const [assistanceStartDate, setAssistanceStartDate] = useState<string>("");
  const [assistanceEndDate, setAssistanceEndDate] = useState<string>("");
  const [assistanceProductType, setAssistanceProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  // --- Filter States for Card 6: Order Type Popularity ---
  const [popularityTimeframe, setPopularityTimeframe] = useState<TimeframeValue>('all');
  const [popularityStartDate, setPopularityStartDate] = useState<string>("");
  const [popularityEndDate, setPopularityEndDate] = useState<string>("");
  const [popularityProductType, setPopularityProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  // --- Filter States for Card 7: Stock Depletion Forecast ---
  const [stockTimeframe, setStockTimeframe] = useState<TimeframeValue>('all');
  const [stockStartDate, setStockStartDate] = useState<string>("");
  const [stockEndDate, setStockEndDate] = useState<string>("");
  const [stockProductType, setStockProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const res = await fetchFinanceData();
        setData(res);
      } catch (err) {
        safeConsoleError("Failed to load finance data", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filterOrderItems = (
    timeframeVal: TimeframeValue,
    productTypeVal: string,
    startDateVal: string,
    endDateVal: string
  ) => {
    if (!data) return [];
    let items = data.order_items || [];

    if (productTypeVal !== 'all') {
      items = items.filter(item => item.type === productTypeVal);
    }

    if (timeframeVal !== 'all') {
      items = items.filter(item =>
        matchesTimeframe(item.created_at, timeframeVal, startDateVal, endDateVal)
      );
    }

    return items;
  };

  // --- Compute 1. Financial Overview Metrics ---
  const metrics = useMemo(() => {
    if (!data) return { revenue: 0, cost: 0, profit: 0, margin: 0 };
    
    const filtered = filterOrderItems(metricsTimeframe, metricsProductType, metricsStartDate, metricsEndDate);
    
    let revenue = 0;
    let cost = 0;

    const costMap = new Map<number, number>();
    data.items.forEach(item => {
      costMap.set(item.id, item.unit_cost || 0);
    });

    filtered.forEach(oi => {
      const itemRev = oi.quantity * oi.price_at_order_time;
      const unitCost = costMap.get(oi.menu_item_id) || 0;
      const itemCost = oi.quantity * unitCost;

      revenue += itemRev;
      cost += itemCost;
    });

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { revenue, cost, profit, margin };
  }, [data, metricsTimeframe, metricsProductType, metricsStartDate, metricsEndDate]);

  // --- Compute 2. Revenue Timeline Chart ---
  const revenueByDay = useMemo(() => {
    const filtered = filterOrderItems(timelineTimeframe, timelineProductType, timelineStartDate, timelineEndDate);
    const days: Record<string, { date: string; total: number; sortKey: number }> = {};
    
    filtered.forEach(oi => {
      const parsed = parseDbTimestamp(oi.created_at);
      if (!parsed) return;
      const date = parsed.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
      const sortKey = parsed.getTime();
      if (!days[date]) {
        days[date] = { date, total: 0, sortKey };
      }
      days[date].total += oi.quantity * oi.price_at_order_time;
    });

    return Object.values(days)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ date, total }) => ({ date, total }));
  }, [data, timelineTimeframe, timelineProductType, timelineStartDate, timelineEndDate]);

  // --- Compute 3. Top Profit Drivers Chart ---
  const topItemsData = useMemo(() => {
    if (!data) return [];
    
    const filtered = filterOrderItems(driversTimeframe, driversProductType, driversStartDate, driversEndDate);
    const salesMap = new Map<number, { sold: number; revenue: number }>();
    
    filtered.forEach(oi => {
      const existing = salesMap.get(oi.menu_item_id) || { sold: 0, revenue: 0 };
      salesMap.set(oi.menu_item_id, {
        sold: existing.sold + oi.quantity,
        revenue: existing.revenue + (oi.quantity * oi.price_at_order_time)
      });
    });

    return data.items
      .filter(item => {
        if (driversProductType !== 'all' && item.type !== driversProductType) return false;
        const sales = salesMap.get(item.id);
        return sales && sales.sold > 0;
      })
      .map(item => {
        const sales = salesMap.get(item.id) || { sold: 0, revenue: 0 };
        const profit = (item.price - (item.unit_cost || 0)) * sales.sold;
        return {
          name: item.name,
          sold: sales.sold,
          revenue: sales.revenue,
          profit: profit
        };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, topItemsCount);
  }, [data, driversTimeframe, driversProductType, driversStartDate, driversEndDate, topItemsCount]);

  // --- Compute 4. Customer Satisfaction Dimensions ---
  const feedbackChartData = useMemo(() => {
    if (!data || !data.feedbacks) return [];
    
    let filteredFeedbacks = data.feedbacks;
    
    // Timeframe Filter
    if (feedbackTimeframe !== 'all') {
      filteredFeedbacks = filteredFeedbacks.filter(fb =>
        matchesTimeframe(fb.created_at, feedbackTimeframe, feedbackStartDate, feedbackEndDate)
      );
    }

    // Product Type Filter
    if (feedbackProductType !== 'all') {
      const matchingOrderIds = new Set<number>();
      data.order_items.forEach(oi => {
        if (oi.type === feedbackProductType) {
          matchingOrderIds.add(oi.order_id);
        }
      });
      filteredFeedbacks = filteredFeedbacks.filter(fb => fb.order_id && matchingOrderIds.has(fb.order_id));
    }

    let staffSum = 0, appSum = 0, cleanSum = 0, foodSum = 0, atmosSum = 0, valSum = 0;
    let staffCount = 0, appCount = 0, cleanCount = 0, foodCount = 0, atmosCount = 0, valCount = 0;

    filteredFeedbacks.forEach(fb => {
      if (fb.rating_staff !== null) { staffSum += fb.rating_staff; staffCount++; }
      if (fb.rating_app !== null) { appSum += fb.rating_app; appCount++; }
      if (fb.rating_cleanliness !== null) { cleanSum += fb.rating_cleanliness; cleanCount++; }
      if (fb.rating_food !== null) { foodSum += fb.rating_food; foodCount++; }
      if (fb.rating_atmosphere !== null) { atmosSum += fb.rating_atmosphere; atmosCount++; }
      if (fb.rating_value !== null) { valSum += fb.rating_value; valCount++; }
    });

    return [
      { name: "Staff", rating: staffCount > 0 ? parseFloat((staffSum / staffCount).toFixed(2)) : 0 },
      { name: "App", rating: appCount > 0 ? parseFloat((appSum / appCount).toFixed(2)) : 0 },
      { name: "Cleanliness", rating: cleanCount > 0 ? parseFloat((cleanSum / cleanCount).toFixed(2)) : 0 },
      { name: "Food Quality", rating: foodCount > 0 ? parseFloat((foodSum / foodCount).toFixed(2)) : 0 },
      { name: "Atmosphere", rating: atmosCount > 0 ? parseFloat((atmosSum / atmosCount).toFixed(2)) : 0 },
      { name: "Value for Money", rating: valCount > 0 ? parseFloat((valSum / valCount).toFixed(2)) : 0 },
    ];
  }, [data, feedbackTimeframe, feedbackProductType, feedbackStartDate, feedbackEndDate]);

  // Actions recommendations based on dimensions averages
  const satisfactionAdvice = useMemo(() => {
    if (feedbackChartData.length === 0) return null;
    
    // Check if there's actual data (ratings > 0)
    const validRatings = feedbackChartData.filter(d => d.rating > 0);
    if (validRatings.length === 0) return null;
    
    const minItem = validRatings.reduce((prev, curr) => prev.rating < curr.rating ? prev : curr);
    
    let action = "";
    if (minItem.name === "Staff") {
      action = "Staff service is crucial. Action: Arrange a customer service training refresher for table floor staff.";
    } else if (minItem.name === "App") {
      action = "Digital ordering speed is affecting guest experience. Action: Ensure hotspot routers and network speed are optimized.";
    } else if (minItem.name === "Cleanliness") {
      action = "Guests notice sanitation details. Action: Set up hourly table and dining area cleanliness sweeps.";
    } else if (minItem.name === "Food Quality") {
      action = "Dishes must meet our high standards consistently. Action: Audit ingredients freshness and run a quality check in the kitchen.";
    } else if (minItem.name === "Atmosphere") {
      action = "The ambiance could be warmer. Action: Lower background music volume slightly and adjust dining room lighting.";
    } else if (minItem.name === "Value for Money") {
      action = "Guests are price sensitive. Action: Introduce promotional discount tags on high-margin dishes to boost perception of value.";
    }
    return `Lowest Rated: ${minItem.name} (${minItem.rating}/5.0). ${action}`;
  }, [feedbackChartData]);

  // --- Compute 5. Floor Assistance Peak Days ---
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const helpRequestsData = useMemo(() => {
    if (!data || !data.help_requests) return [];
    
    let filteredHelp = data.help_requests;

    // Timeframe Filter
    if (assistanceTimeframe !== 'all') {
      filteredHelp = filteredHelp.filter(hr =>
        matchesTimeframe(hr.requested_at, assistanceTimeframe, assistanceStartDate, assistanceEndDate)
      );
    }

    // Product Type Filter (Associated with table orders of selected type on same day)
    if (assistanceProductType !== 'all') {
      const validTableDates = new Set<string>();

      const matchingOrderIds = new Set<number>();
      data.order_items.forEach(oi => {
        if (oi.type === assistanceProductType) {
          matchingOrderIds.add(oi.order_id);
        }
      });
      
      data.orders.forEach(o => {
        if (o.table_id && matchingOrderIds.has(o.id)) {
          const parsed = parseDbTimestamp(o.created_at);
          if (parsed) {
            validTableDates.add(`${o.table_id}_${getLocalDateString(parsed)}`);
          }
        }
      });
      
      filteredHelp = filteredHelp.filter(hr => {
        const parsed = parseDbTimestamp(hr.requested_at);
        if (!parsed) return false;
        return validTableDates.has(`${hr.table_id}_${getLocalDateString(parsed)}`);
      });
    }

    const counts: Record<string, number> = {};
    dayNames.forEach(name => { counts[name] = 0; });
    
    filteredHelp.forEach(row => {
      const parsed = parseDbTimestamp(row.requested_at);
      if (!parsed) return;
      const dayIndex = parsed.getDay();
      if (dayIndex >= 0 && dayIndex < 7) {
        counts[dayNames[dayIndex]] += 1;
      }
    });

    return Object.entries(counts).map(([day, count]) => ({ day, count }));
  }, [data, assistanceTimeframe, assistanceProductType, assistanceStartDate, assistanceEndDate]);

  // Peak help call text
  const peakHelpDayText = useMemo(() => {
    if (helpRequestsData.length === 0) return null;
    const maxItem = helpRequestsData.reduce((prev, curr) => prev.count > curr.count ? prev : curr);
    if (maxItem.count === 0) return "No staff assistance requests recorded for the selected filters.";
    return `Peak Floor Traffic: ${maxItem.day} (${maxItem.count} staff calls). Action: Schedule extra floor staff on ${maxItem.day}s to ensure prompt service.`;
  }, [helpRequestsData]);

  // --- Compute 6. Order Type Popularity Timeline ---
  const orderPopularityData = useMemo(() => {
    if (!data) return [];
    
    let filteredOrders = data.orders;

    // Timeframe Filter
    if (popularityTimeframe !== 'all') {
      filteredOrders = filteredOrders.filter(o =>
        matchesTimeframe(o.created_at, popularityTimeframe, popularityStartDate, popularityEndDate)
      );
    }

    // Product Type Filter (Only count orders containing the selected type)
    if (popularityProductType !== 'all') {
      const matchingOrderIds = new Set<number>();
      data.order_items.forEach(oi => {
        if (oi.type === popularityProductType) {
          matchingOrderIds.add(oi.order_id);
        }
      });
      filteredOrders = filteredOrders.filter(o => matchingOrderIds.has(o.id));
    }

    const days: Record<string, { date: string; dine_in: number; takeaway: number; delivery: number; counter: number; sortKey: number }> = {};
    
    filteredOrders.forEach(order => {
      const parsed = parseDbTimestamp(order.created_at);
      if (!parsed) return;
      const date = parsed.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
      if (!days[date]) {
        days[date] = { date, dine_in: 0, takeaway: 0, delivery: 0, counter: 0, sortKey: parsed.getTime() };
      }
      
      const type = order.order_type || "DINE_IN";
      if (type === "DINE_IN") days[date].dine_in += 1;
      else if (type === "TAKEAWAY") days[date].takeaway += 1;
      else if (type === "DELIVERY" || type === "PICKUP") days[date].delivery += 1;
      else if (type === "COUNTER") days[date].counter += 1;
    });

    return Object.values(days).sort((a, b) => a.sortKey - b.sortKey);
  }, [data, popularityTimeframe, popularityProductType, popularityStartDate, popularityEndDate]);

  // --- Compute 7. Stock Depletion Forecast ---
  const restockingForecastData = useMemo(() => {
    if (!data || !data.inventory_forecast || !data.recipe_ingredients) return [];

    // Filter order items by selected timeframe
    const filteredStockOrderItems = filterOrderItems(stockTimeframe, "all", stockStartDate, stockEndDate);

    // Calculate timeframe duration in days
    let daysCount = 30; // default baseline
    if (stockTimeframe === 'today' || stockTimeframe === 'yesterday') {
      daysCount = 1;
    } else if (stockTimeframe === 'week') {
      daysCount = 7;
    } else if (stockTimeframe === 'month') {
      daysCount = 30;
    } else if (stockTimeframe === 'custom') {
      if (stockStartDate && stockEndDate) {
        const start = new Date(stockStartDate);
        const end = new Date(stockEndDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysCount = diffDays > 0 ? diffDays : 1;
      }
    } else if (stockTimeframe === 'all') {
      if (data.orders.length > 0) {
        const timestamps = data.orders
          .map(o => parseDbTimestamp(o.created_at)?.getTime())
          .filter((t): t is number => t != null);
        if (timestamps.length > 0) {
          const minTime = Math.min(...timestamps);
          const maxTime = Math.max(...timestamps);
          const diffDays = Math.ceil(Math.abs(maxTime - minTime) / (1000 * 60 * 60 * 24));
          daysCount = diffDays > 0 ? diffDays : 1;
        }
      }
    }

    // Map ingredients usage in this timeframe
    const usageMap = new Map<number, number>();
    filteredStockOrderItems.forEach(oi => {
      const recipe = data.recipe_ingredients.filter(ri => ri.menu_item_id === oi.menu_item_id);
      recipe.forEach(ri => {
        const usedAmount = oi.quantity * ri.quantity_required;
        usageMap.set(ri.inventory_item_id, (usageMap.get(ri.inventory_item_id) || 0) + usedAmount);
      });
    });

    return [...data.inventory_forecast]
      .filter(item => {
        if (stockProductType !== 'all') {
          const types = item.linked_types.split(',');
          return types.includes(stockProductType);
        }
        return true;
      })
      .map(item => {
        const totalUsage = usageMap.get(item.id) || 0;
        const burnRatePerDay = totalUsage / daysCount;
        const daysRemaining = burnRatePerDay > 0 ? (item.current_stock / burnRatePerDay) : null;
        
        let recommendation = "Healthy Stock";
        if (daysRemaining !== null) {
          if (daysRemaining < 3) recommendation = "Restock URGENTLY (within 2 days)";
          else if (daysRemaining < 7) recommendation = "Order replenishment soon";
        }
        return {
          ...item,
          burn_rate_day: burnRatePerDay,
          days_remaining: daysRemaining !== null ? parseFloat(daysRemaining.toFixed(1)) : null,
          recommendation
        };
      })
      .sort((a, b) => {
        if (a.days_remaining === null) return 1;
        if (b.days_remaining === null) return -1;
        return a.days_remaining - b.days_remaining;
      })
      .slice(0, 5);
  }, [data, stockTimeframe, stockProductType, stockStartDate, stockEndDate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-foreground/40 font-medium">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
        {t("m.calculatingFinance")}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {loading ? (
        <PageSkeleton />
      ) : (
        <>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
        <div>
          <h2 className="text-3xl font-1 font-bold text-[#142d1f]">
            {t("m.finInt")}
          </h2>
          <p className="text-foreground/60 mt-1 font-medium">{t("m.financeDesc")}</p>
        </div>
      </div>

      {/* Overview Metrics Section Filter */}
      <CardFilters
        label="Filter for Financial Metrics"
        timeframe={metricsTimeframe}
        onTimeframeChange={setMetricsTimeframe}
        productType={metricsProductType}
        onProductTypeChange={setMetricsProductType}
        startDate={metricsStartDate}
        onStartDateChange={setMetricsStartDate}
        endDate={metricsEndDate}
        onEndDateChange={setMetricsEndDate}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/80 backdrop-blur border border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-16 h-16" />
          </div>
          <CardContent className="p-6 relative z-10">
            <p className="text-sm font-bold tracking-wider uppercase text-foreground/50 mb-1">{t("m.totRev")}</p>
            <h4 className="text-4xl font-1 font-bold text-emerald-700">RM {metrics.revenue.toFixed(2)}</h4>
            <div className="mt-4 flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-full">
              <ArrowUpRight className="w-3 h-3 mr-1" /> {t("m.grossIncome")}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur border border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <PackageOpen className="w-16 h-16" />
          </div>
          <CardContent className="p-6 relative z-10">
            <p className="text-sm font-bold tracking-wider uppercase text-foreground/50 mb-1">{t("m.cogs")}</p>
            <h4 className="text-4xl font-1 font-bold text-rose-700">RM {metrics.cost.toFixed(2)}</h4>
            <div className="mt-4 flex items-center text-xs font-bold text-rose-600 bg-rose-50 w-fit px-2 py-1 rounded-full">
              <ArrowDownRight className="w-3 h-3 mr-1" /> {t("m.ingredientCosts")}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur border border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="w-16 h-16" />
          </div>
          <CardContent className="p-6 relative z-10">
            <p className="text-sm font-bold tracking-wider uppercase text-foreground/50 mb-1">{t("m.grossProf")}</p>
            <h4 className="text-4xl font-1 font-bold text-blue-700">RM {metrics.profit.toFixed(2)}</h4>
            <div className="mt-4 flex items-center text-xs font-bold text-blue-600 bg-blue-50 w-fit px-2 py-1 rounded-full">
              <Activity className="w-3 h-3 mr-1" /> {t("m.netEarn")}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 backdrop-blur border border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <PieChart className="w-16 h-16" />
          </div>
          <CardContent className="p-6 relative z-10">
            <p className="text-sm font-bold tracking-wider uppercase text-foreground/50 mb-1">{t("m.averageMargin")}</p>
            <h4 className="text-4xl font-1 font-bold text-violet-700">{metrics.margin.toFixed(1)}%</h4>
            <div className="mt-4 flex items-center text-xs font-bold text-violet-600 bg-violet-50 w-fit px-2 py-1 rounded-full">
              <PieChart className="w-3 h-3 mr-1" /> {t("m.profitability")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="flex flex-col gap-8">
        {/* Revenue Trend Area Chart */}
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 h-auto flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              <div>
                <h3 className="font-1 text-xl font-bold text-[#142d1f]">{t("m.revenueTimeline")}</h3>
                <p className="text-xs text-foreground/50 mt-1">Daily revenue trends over time</p>
              </div>
            </div>
            <ChartHeaderExport
              targetId="revenue-timeline-chart"
              data={revenueByDay}
              fileName="revenue-timeline"
            />
          </div>

          <CardFilters
            label="Filter for Revenue Timeline"
            timeframe={timelineTimeframe}
            onTimeframeChange={setTimelineTimeframe}
            productType={timelineProductType}
            onProductTypeChange={setTimelineProductType}
            startDate={timelineStartDate}
            onStartDateChange={setTimelineStartDate}
            endDate={timelineEndDate}
            onEndDateChange={setTimelineEndDate}
          />

          <div className="flex-1 w-full">
            <div id="revenue-timeline-chart" className="relative flex-1 w-full h-[260px]">
              {revenueByDay.length === 0 && (
                <ChartEmptyState message={t("m.noChartData", "No paid order data available for the selected filters.")} />
              )}
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 12 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <ChartCardFooter
              infoKey="m.revenueTimelineInfo"
            />
          </div>
        </div>

        {/* Top Sellers Ranking Bar Chart */}
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col">
          <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center px-2 gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <h3 className="font-1 text-xl font-bold text-[#142d1f]">{t("m.topProfitDrivers")}</h3>
                <p className="text-xs text-foreground/50 mt-1">{t("m.topProfitDesc")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white/80 rounded-full px-4 py-1.5 shadow-sm border border-foreground/5">
                <span className="text-xs font-semibold text-foreground/60 whitespace-nowrap">{t("m.showTop")}</span>
                <input 
                  type="number" 
                  min={1}
                  max={data?.items.length || 100}
                  className="w-12 h-6 bg-transparent border-b-2 border-primary/20 hover:border-primary/50 focus:border-primary text-sm font-bold outline-none text-center text-primary transition-colors"
                  value={topItemsCount || ""}
                  onChange={(e) => setTopItemsCount(parseInt(e.target.value) || 1)}
                  onBlur={(e) => {
                    let val = parseInt(e.target.value);
                    if (isNaN(val) || val < 1) val = 1;
                    const maxItems = data?.items.length || 100;
                    if (val > maxItems) val = maxItems;
                    setTopItemsCount(val);
                  }}
                />
                <span className="text-xs font-semibold text-foreground/60 mr-1">{t("m.itemsLabel")}</span>
                <button 
                  onClick={() => setTopItemsCount(data?.items.length || 100)}
                  className="text-[0.65rem] uppercase tracking-wider font-bold bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded-full transition-colors"
                >
                  {t("m.all")}
                </button>
              </div>
              <ChartHeaderExport
                targetId="top-profit-drivers-chart"
                data={topItemsData}
                fileName="top-profit-drivers"
              />
            </div>
          </div>

          <CardFilters
            label="Filter for Top Profit Drivers"
            timeframe={driversTimeframe}
            onTimeframeChange={setDriversTimeframe}
            productType={driversProductType}
            onProductTypeChange={setDriversProductType}
            startDate={driversStartDate}
            onStartDateChange={setDriversStartDate}
            endDate={driversEndDate}
            onEndDateChange={setDriversEndDate}
          />

          <div className="flex flex-col">
            <div id="top-profit-drivers-chart" className="relative w-full" style={{ height: Math.max(250, topItemsCount * 32) }}>
              {topItemsData.length === 0 && (
                <ChartEmptyState message={t("m.noChartData", "No paid order data available for the selected filters.")} />
              )}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItemsData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} width={140} />
                  <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                  <Bar dataKey="profit" name="Gross Profit (RM)" radius={[0, 4, 4, 0]} barSize={18}>
                    {topItemsData.map((entry, index) => {
                      const total = topItemsData.length;
                      const ratio = total <= 1 ? 1 : 1 - (index / (total - 1));
                      const hue = Math.round(0 + (45 - 0) * ratio);
                      const saturation = Math.round(75 + (95 - 75) * ratio);
                      const lightness = Math.round(35 + (50 - 35) * ratio);
                      return <Cell key={"cell-" + index} fill={"hsl(" + hue + ", " + saturation + "%, " + lightness + "%)"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartCardFooter
              infoKey="m.topProfitDriversInfo"
            />
          </div>
        </div>
      </div>

      {/* ══ BUSINESS INTELLIGENCE SECTION ════════════════════════════════ */}
      <div className="space-y-6 pt-4 border-t border-gray-100">
        <div>
          <h2 className="text-2xl font-1 font-bold text-slate-800">
            {t("m.businessIntelligence", "Business Intelligence & Insights")}
          </h2>
          <p className="text-foreground/50 text-sm mt-1">
            {t("m.biDesc", "Data-driven answers to floor operations, customer satisfaction, and restocking schedules.")}
          </p>
        </div>

        <div className="space-y-8">
          {/* Card 1: Customer Satisfaction */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-500" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">Customer Satisfaction Dimensions</h3>
                  <p className="text-xs text-foreground/50 mt-1">Average ratings from customer feedback submissions (1.0 to 5.0 scale).</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="feedback-bi-chart"
                data={feedbackChartData}
                fileName="customer-satisfaction"
              />
            </div>

            <CardFilters
              label="Filter for Customer Satisfaction"
              timeframe={feedbackTimeframe}
              onTimeframeChange={setFeedbackTimeframe}
              productType={feedbackProductType}
              onProductTypeChange={setFeedbackProductType}
              startDate={feedbackStartDate}
              onStartDateChange={setFeedbackStartDate}
              endDate={feedbackEndDate}
              onEndDateChange={setFeedbackEndDate}
            />
            
            <div className="flex-1 w-full h-[220px]">
              <div id="feedback-bi-chart" className="relative w-full h-full">
                {feedbackChartData.every(d => d.rating === 0) && (
                  <ChartEmptyState message={t("m.noChartData", "No feedback ratings recorded for the selected filters.")} />
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={feedbackChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} />
                    <YAxis domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                    <Bar dataKey="rating" name="Rating" radius={[4, 4, 0, 0]} barSize={24}>
                      {feedbackChartData.map((entry, index) => {
                        const score = entry.rating;
                        const fill = score === 0 ? "#cbd5e1" : score < 3.0 ? "#ef4444" : score < 4.2 ? "#f59e0b" : "#10b981";
                        return <Cell key={`cell-${index}`} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {satisfactionAdvice && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-2.5">
                <Brain className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-indigo-800 leading-relaxed">{satisfactionAdvice}</p>
              </div>
            )}
            <ChartCardFooter
              infoKey="m.feedbackBiInfo"
            />
          </div>

          {/* Card 2: Help Request Patterns */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">Floor Assistance Peak Days</h3>
                  <p className="text-xs text-foreground/50 mt-1">Total customer calls for floor staff assistance grouped by day of the week.</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="assistance-bi-chart"
                data={helpRequestsData}
                fileName="staff-assistance-calls"
              />
            </div>

            <CardFilters
              label="Filter for Floor Assistance"
              timeframe={assistanceTimeframe}
              onTimeframeChange={setAssistanceTimeframe}
              productType={assistanceProductType}
              onProductTypeChange={setAssistanceProductType}
              startDate={assistanceStartDate}
              onStartDateChange={setAssistanceStartDate}
              endDate={assistanceEndDate}
              onEndDateChange={setAssistanceEndDate}
            />
            
            <div className="flex-1 w-full h-[220px]">
              <div id="assistance-bi-chart" className="relative w-full h-full">
                {helpRequestsData.every(d => d.count === 0) && (
                  <ChartEmptyState message={t("m.noChartData", "No staff assistance requests recorded for the selected filters.")} />
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={helpRequestsData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                    <Bar dataKey="count" name="Assistance Calls" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {peakHelpDayText && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-amber-800 leading-relaxed">{peakHelpDayText}</p>
              </div>
            )}
            <ChartCardFooter
              infoKey="m.assistanceBiInfo"
            />
          </div>

          {/* Card 3: Order Type Popularity Timeline */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">Order Type Popularity Trends</h3>
                  <p className="text-xs text-foreground/50 mt-1">Timeline plotting order volumes across Dine-In, Takeaway, Delivery, and Counter Orders.</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="popularity-bi-chart"
                data={orderPopularityData}
                fileName="order-popularity-trends"
              />
            </div>

            <CardFilters
              label="Filter for Order Type Popularity"
              timeframe={popularityTimeframe}
              onTimeframeChange={setPopularityTimeframe}
              productType={popularityProductType}
              onProductTypeChange={setPopularityProductType}
              startDate={popularityStartDate}
              onStartDateChange={setPopularityStartDate}
              endDate={popularityEndDate}
              onEndDateChange={setPopularityEndDate}
            />
            
            <div className="flex-1 w-full h-[260px]">
              <div id="popularity-bi-chart" className="relative w-full h-full">
                {orderPopularityData.length === 0 && (
                  <ChartEmptyState message={t("m.noChartData", "No paid orders found for the selected filters.")} />
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={orderPopularityData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="dine_in" name="Dine-In" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="takeaway" name="Takeaway" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="delivery" name="Delivery / Pickup" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="counter" name="Counter Order" stroke="#ec4899" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <ChartCardFooter
              infoKey="m.popularityBiInfo"
            />
          </div>

          {/* Card 4: Inventory Restocking Forecast */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <PackageOpen className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">Raw Stock Depletion Forecast</h3>
                  <p className="text-xs text-foreground/50 mt-1">Calculates days of stock remaining based on daily burn rate computed from custom order ingredient consumption.</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="stock-depletion-table"
                data={restockingForecastData}
                fileName="stock-depletion-forecast"
              />
            </div>

            <CardFilters
              label="Filter for Stock Depletion"
              timeframe={stockTimeframe}
              onTimeframeChange={setStockTimeframe}
              productType={stockProductType}
              onProductTypeChange={setStockProductType}
              startDate={stockStartDate}
              onStartDateChange={setStockStartDate}
              endDate={stockEndDate}
              onEndDateChange={setStockEndDate}
            />
            
            <div id="stock-depletion-table" className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200/50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Ingredient</th>
                    <th className="pb-3 text-right">Current Stock</th>
                    <th className="pb-3 text-right">Burn Rate (Day)</th>
                    <th className="pb-3 text-right">Estimated Days Left</th>
                    <th className="pb-3 text-right pr-2">Action Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-slate-700 font-medium">
                  {restockingForecastData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400 italic">No inventory consumption statistics available for this criteria.</td>
                    </tr>
                  ) : restockingForecastData.map((item) => {
                    const daysLeft = item.days_remaining;
                    const badgeClass = daysLeft === null ? "bg-slate-100 text-slate-700" : daysLeft < 3 ? "bg-red-100 text-red-800" : daysLeft < 7 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800";
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pl-2 font-semibold text-slate-800">{item.name}</td>
                        <td className="py-4 text-right">{item.current_stock.toFixed(1)} {item.unit}</td>
                        <td className="py-4 text-right text-gray-500">{item.burn_rate_day.toFixed(2)} {item.unit}/day</td>
                        <td className="py-4 text-right">
                          {daysLeft === null ? "N/A (No Usage)" : `${daysLeft} days`}
                        </td>
                        <td className="py-4 text-right pr-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}`}>
                            {item.recommendation}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ChartCardFooter
              infoKey="m.restockingBiInfo"
            />
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
