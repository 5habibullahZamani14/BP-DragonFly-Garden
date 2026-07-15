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
import ChartInfo from "@/components/ui/ChartInfo";
import ChartTickWrap from "@/components/ui/ChartTickWrap";
import ChartExport from "@/components/ui/ChartExport";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeConsoleError } from "@/lib/safeConsole";

export const FinanceTab = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topItemsCount, setTopItemsCount] = useState<number>(5);

  // Filter States
  const [timeframe, setTimeframe] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [productType, setProductType] = useState<'all' | 'food' | 'drink' | 'merchandise'>('all');

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

  // Filtered Transaction Items
  const filteredOrderItems = useMemo(() => {
    if (!data) return [];
    let items = data.order_items || [];

    // 1. Filter by product type
    if (productType !== 'all') {
      items = items.filter(item => item.type === productType);
    }

    // 2. Filter by timeframe
    if (timeframe !== 'all') {
      const now = new Date();
      const getLocalDateString = (d: Date) => d.toISOString().split('T')[0];
      const todayStr = getLocalDateString(now);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);

      items = items.filter(item => {
        const itemDate = new Date(item.created_at);
        const itemDateStr = getLocalDateString(itemDate);

        if (timeframe === 'today') {
          return itemDateStr === todayStr;
        }
        if (timeframe === 'yesterday') {
          return itemDateStr === yesterdayStr;
        }
        if (timeframe === 'week') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return itemDate >= sevenDaysAgo;
        }
        if (timeframe === 'month') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return itemDate >= thirtyDaysAgo;
        }
        if (timeframe === 'custom') {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) return false;
          }
          return true;
        }
        return true;
      });
    }

    return items;
  }, [data, timeframe, startDate, endDate, productType]);

  // Compute P&L Metrics based on filtered items
  const metrics = useMemo(() => {
    if (!data) return { revenue: 0, cost: 0, profit: 0, margin: 0 };
    
    let revenue = 0;
    let cost = 0;

    const costMap = new Map<number, number>();
    data.items.forEach(item => {
      costMap.set(item.id, item.unit_cost || 0);
    });

    filteredOrderItems.forEach(oi => {
      const itemRev = oi.quantity * oi.price_at_order_time;
      const unitCost = costMap.get(oi.menu_item_id) || 0;
      const itemCost = oi.quantity * unitCost;

      revenue += itemRev;
      cost += itemCost;
    });

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { revenue, cost, profit, margin };
  }, [data, filteredOrderItems]);

  // Group matching items by date for timeline chart
  const revenueByDay = useMemo(() => {
    const days: Record<string, number> = {};
    
    filteredOrderItems.forEach(oi => {
      const date = new Date(oi.created_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
      days[date] = (days[date] || 0) + (oi.quantity * oi.price_at_order_time);
    });

    return Object.entries(days).map(([date, total]) => ({ date, total }));
  }, [filteredOrderItems]);

  // Group sales matching items for top profit drivers ranking
  const topItemsData = useMemo(() => {
    if (!data) return [];
    
    const salesMap = new Map<number, { sold: number; revenue: number }>();
    filteredOrderItems.forEach(oi => {
      const existing = salesMap.get(oi.menu_item_id) || { sold: 0, revenue: 0 };
      salesMap.set(oi.menu_item_id, {
        sold: existing.sold + oi.quantity,
        revenue: existing.revenue + (oi.quantity * oi.price_at_order_time)
      });
    });

    return data.items
      .filter(item => {
        if (productType !== 'all' && item.type !== productType) return false;
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
  }, [data, filteredOrderItems, topItemsCount, productType]);

  // BI Insights dimension rating mapper
  const feedbackChartData = useMemo(() => {
    if (!data || !data.feedback_ratings) return [];
    const r = data.feedback_ratings;
    return [
      { name: "Staff", rating: r.avg_staff !== null ? parseFloat(Number(r.avg_staff).toFixed(2)) : 0 },
      { name: "App", rating: r.avg_app !== null ? parseFloat(Number(r.avg_app).toFixed(2)) : 0 },
      { name: "Cleanliness", rating: r.avg_cleanliness !== null ? parseFloat(Number(r.avg_cleanliness).toFixed(2)) : 0 },
      { name: "Food Quality", rating: r.avg_food !== null ? parseFloat(Number(r.avg_food).toFixed(2)) : 0 },
      { name: "Atmosphere", rating: r.avg_atmosphere !== null ? parseFloat(Number(r.avg_atmosphere).toFixed(2)) : 0 },
      { name: "Value for Money", rating: r.avg_value !== null ? parseFloat(Number(r.avg_value).toFixed(2)) : 0 },
    ];
  }, [data]);

  // BI Customer satisfaction actionable advice generator
  const satisfactionAdvice = useMemo(() => {
    if (feedbackChartData.length === 0) return null;
    const validRatings = feedbackChartData.filter(d => d.rating > 0);
    if (validRatings.length === 0) return "No feedback ratings recorded yet. Encourage customers to rate their experience in the app.";
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

  // BI Floor help request weekly frequencies
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const helpRequestsData = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    dayNames.forEach(name => { counts[name] = 0; });
    
    (data.help_stats || []).forEach(row => {
      const index = parseInt(row.day_of_week);
      if (index >= 0 && index < 7) {
        counts[dayNames[index]] = row.count;
      }
    });
    return Object.entries(counts).map(([day, count]) => ({ day, count }));
  }, [data]);

  // BI Floor help request peak day alert text
  const peakHelpDayText = useMemo(() => {
    if (helpRequestsData.length === 0) return null;
    const maxItem = helpRequestsData.reduce((prev, curr) => prev.count > curr.count ? prev : curr);
    if (maxItem.count === 0) return "No staff assistance requests recorded. Guests are well-serviced.";
    return `Peak Floor Traffic: ${maxItem.day} (${maxItem.count} staff calls). Action: Schedule extra floor staff on ${maxItem.day}s to ensure prompt service.`;
  }, [helpRequestsData]);

  // BI Restocking recommendations forecasting list
  const restockingForecastData = useMemo(() => {
    if (!data) return [];
    return [...data.inventory_forecast]
      .map(item => {
        let recommendation = "Healthy Stock";
        if (item.days_remaining !== null) {
          if (item.days_remaining < 3) recommendation = "Restock URGENTLY (within 2 days)";
          else if (item.days_remaining < 7) recommendation = "Order replenishment soon";
        }
        return { ...item, recommendation };
      })
      .sort((a, b) => {
        if (a.days_remaining === null) return 1;
        if (b.days_remaining === null) return -1;
        return a.days_remaining - b.days_remaining;
      })
      .slice(0, 5);
  }, [data]);

  // BI Order Type popularity over time list
  const orderPopularityData = useMemo(() => {
    if (!data) return [];
    const days: Record<string, { date: string; dine_in: number; takeaway: number; delivery: number; counter: number }> = {};
    
    data.orders.forEach(order => {
      const date = new Date(order.created_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
      if (!days[date]) {
        days[date] = { date, dine_in: 0, takeaway: 0, delivery: 0, counter: 0 };
      }
      
      const type = order.order_type || "DINE_IN";
      if (type === "DINE_IN") days[date].dine_in += 1;
      else if (type === "TAKEAWAY") days[date].takeaway += 1;
      else if (type === "DELIVERY" || type === "PICKUP") days[date].delivery += 1;
      else if (type === "COUNTER") days[date].counter += 1;
    });

    return Object.values(days);
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-foreground/40 font-medium">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
        {t("m.calculatingFinance")}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
        <div>
          <h2 className="text-3xl font-1 font-bold" style={{ color: "hsl(140, 30%, 15%)" }}>
            {t("m.finInt")}
          </h2>
          <p className="text-foreground/60 mt-1 font-medium">{t("m.financeDesc")}</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white/60 backdrop-blur-md border border-white/30 shadow-md rounded-3xl p-5 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {/* Timeframe Selector */}
          <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
            <label className="text-xs font-semibold text-foreground/50 uppercase tracking-wider pl-1">{t("m.timeframe")}</label>
            <Select value={timeframe} onValueChange={(v: any) => setTimeframe(v)}>
              <SelectTrigger className="w-full sm:w-[180px] bg-white rounded-xl border-gray-200">
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
          </div>

          {/* Product Type Selector */}
          <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
            <label className="text-xs font-semibold text-foreground/50 uppercase tracking-wider pl-1">{t("m.productType")}</label>
            <Select value={productType} onValueChange={(v: any) => setProductType(v)}>
              <SelectTrigger className="w-full sm:w-[180px] bg-white rounded-xl border-gray-200">
                <SelectValue placeholder={t("m.productType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("m.allCategories")}</SelectItem>
                <SelectItem value="food">{t("m.food")}</SelectItem>
                <SelectItem value="drink">{t("m.drink")}</SelectItem>
                <SelectItem value="merchandise">{t("m.merchandise")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom Date Range Inputs */}
        {timeframe === "custom" && (
          <div className="flex gap-3 w-full md:w-auto items-end animate-in fade-in slide-in-from-left-2">
            <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
              <label className="text-xs font-semibold text-foreground/50 uppercase tracking-wider pl-1">{t("m.startDate")}</label>
              <Input
                type="date"
                className="bg-white rounded-xl border-gray-200 w-full sm:w-[150px]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
              <label className="text-xs font-semibold text-foreground/50 uppercase tracking-wider pl-1">{t("m.endDate")}</label>
              <Input
                type="date"
                className="bg-white rounded-xl border-gray-200 w-full sm:w-[150px]"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/80 backdrop-blur border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
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

        <Card className="bg-white/80 backdrop-blur border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
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

        <Card className="bg-white/80 backdrop-blur border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
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

        <Card className="bg-white/80 backdrop-blur border-white/50 shadow-lg rounded-3xl overflow-hidden relative">
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
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 h-[400px] flex flex-col">
          <div className="mb-6 flex items-center gap-2 px-2">
            <Activity className="h-5 w-5 text-accent" />
            <h3 className="font-1 text-xl font-bold" style={{ color: "hsl(140, 30%, 20%)" }}>{t("m.revenueTimeline")}</h3>
          </div>

          <div className="flex-1 w-full">
            <div id="revenue-timeline-chart" className="flex-1 w-full h-[260px]">
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
            <div className="mt-2 flex justify-between items-center px-2">
              <ChartInfo textKey="m.revenueTimelineInfo" />
              <ChartExport targetId="revenue-timeline-chart" data={revenueByDay} fileName="revenue-timeline" />
            </div>
          </div>
        </div>

        {/* Top Sellers Ranking Bar Chart */}
        <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center px-2 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <h3 className="font-1 text-xl font-bold" style={{ color: "hsl(140, 30%, 20%)" }}>{t("m.topProfitDrivers")}</h3>
              </div>
              <p className="text-xs text-foreground/50 mt-1">{t("m.topProfitDesc")}</p>
            </div>

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
          </div>

          <div className="w-full" style={{ height: Math.max(250, topItemsCount * 32) }}>
            <div id="top-profit-drivers-chart" className="w-full" style={{ height: Math.max(250, topItemsCount * 32) }}>
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
            <div className="mt-2 px-6">
              <ChartInfo textKey="m.topProfitDriversInfo" />
              <ChartExport targetId="top-profit-drivers-chart" data={topItemsData} fileName="top-profit-drivers" />
            </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card 1: Customer Satisfaction */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4">
              <h3 className="font-1 text-lg font-bold text-slate-700 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-500" />
                Customer Satisfaction Dimensions
              </h3>
              <p className="text-xs text-foreground/50 mt-1">Average ratings from customer feedback submissions (1.0 to 5.0 scale).</p>
            </div>
            
            <div className="flex-1 w-full h-[220px]">
              <div id="feedback-bi-chart" className="w-full h-full">
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
            <div className="mt-2 flex justify-between items-center px-2">
              <ChartInfo textKey="m.feedbackBiInfo" />
              <ChartExport targetId="feedback-bi-chart" data={feedbackChartData} fileName="feedback-ratings" />
            </div>
          </div>

          {/* Card 2: Help Request Patterns */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4">
              <h3 className="font-1 text-lg font-bold text-slate-700 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                Floor Assistance Peak Days
              </h3>
              <p className="text-xs text-foreground/50 mt-1">Total customer calls for floor staff assistance grouped by day of the week.</p>
            </div>
            
            <div className="flex-1 w-full h-[220px]">
              <div id="assistance-bi-chart" className="w-full h-full">
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
            <div className="mt-2 flex justify-between items-center px-2">
              <ChartInfo textKey="m.assistanceBiInfo" />
              <ChartExport targetId="assistance-bi-chart" data={helpRequestsData} fileName="staff-assistance-calls" />
            </div>
          </div>

          {/* Card 3: Order Type Popularity Timeline */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px] lg:col-span-2">
            <div className="mb-4">
              <h3 className="font-1 text-lg font-bold text-slate-700 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-emerald-500" />
                Order Type Popularity Trends
              </h3>
              <p className="text-xs text-foreground/50 mt-1">Timeline plotting order volumes across Dine-In, Takeaway, Delivery, and Counter Orders.</p>
            </div>
            
            <div className="flex-1 w-full h-[260px]">
              <div id="popularity-bi-chart" className="w-full h-full">
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
            <div className="mt-2 flex justify-between items-center px-2">
              <ChartInfo textKey="m.popularityBiInfo" />
              <ChartExport targetId="popularity-bi-chart" data={orderPopularityData} fileName="order-popularity-trends" />
            </div>
          </div>

          {/* Card 4: Inventory Restocking Forecast */}
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px] lg:col-span-2">
            <div className="mb-4">
              <h3 className="font-1 text-lg font-bold text-slate-700 flex items-center gap-2">
                <PackageOpen className="w-5 h-5 text-rose-500" />
                Raw Stock Depletion Forecast
              </h3>
              <p className="text-xs text-foreground/50 mt-1">Calculates days of stock remaining based on daily burn rate computed from 30-day order ingredient consumption.</p>
            </div>
            
            <div className="flex-1 overflow-x-auto">
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
                      <td colSpan={5} className="py-8 text-center text-gray-400 italic">No inventory consumption statistics available.</td>
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
            <div className="mt-4 flex justify-between items-center px-2">
              <ChartInfo textKey="m.restockingBiInfo" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
