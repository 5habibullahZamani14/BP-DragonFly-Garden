import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchFinanceData, FinanceData } from "@/lib/api";
import { 
  DollarSign, TrendingUp, TrendingDown, PieChart, 
  Activity, ArrowUpRight, ArrowDownRight, PackageOpen
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";

export const FinanceTab = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topItemsCount, setTopItemsCount] = useState<number>(5);

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

  const metrics = useMemo(() => {
    if (!data) return { revenue: 0, cost: 0, profit: 0, margin: 0 };
    
    const revenue = data.orders.reduce((sum, o) => sum + o.total_price, 0);
    const cost = data.items.reduce((sum, item) => sum + (item.unit_cost * item.total_sold), 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { revenue, cost, profit, margin };
  }, [data]);

  const revenueByDay = useMemo(() => {
    if (!data) return [];
    const days: Record<string, number> = {};
    
    data.orders.forEach(order => {
      const date = new Date(order.created_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
      days[date] = (days[date] || 0) + order.total_price;
    });

    return Object.entries(days).map(([date, total]) => ({ date, total }));
  }, [data]);

  const topItemsData = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter(item => item.total_sold > 0)
      .map(item => ({
        name: item.name,
        sold: item.total_sold,
        revenue: item.price * item.total_sold,
        profit: (item.price - item.unit_cost) * item.total_sold
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, topItemsCount);
  }, [data, topItemsCount]);

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
                    return <Cell key={`cell-${index}`} fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
};
