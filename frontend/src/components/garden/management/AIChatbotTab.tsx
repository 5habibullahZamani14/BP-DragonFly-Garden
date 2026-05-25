import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiChat } from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

type UsageData = {
  requests_today: number;
  max_per_day: number;
  requests_this_minute: number;
  max_per_minute: number;
  minute_reset_at: number;
  day_reset_at: number;
};

const fetchUsage = async (): Promise<UsageData | null> => {
  try {
    const res = await fetch(`${API_BASE}/management/feedback/ai-chat/usage`, {
      credentials: "include",
      headers: {
        Authorization: (() => {
          const saved = localStorage.getItem("managerLogin");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              return parsed.token ? `Bearer ${parsed.token}` : "";
            } catch { return ""; }
          }
          return "";
        })(),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

export const AIChatbotTab = () => {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [countdown, setCountdown] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadUsage = useCallback(async () => {
    const data = await fetchUsage();
    if (data) setUsage(data);
  }, []);

  useEffect(() => {
    loadUsage();
    const interval = setInterval(loadUsage, 10000);
    return () => clearInterval(interval);
  }, [loadUsage]);

  useEffect(() => {
    const tick = () => {
      if (!usage) { setCountdown(""); return; }
      const now = Date.now();
      const toMinute = Math.max(0, usage.minute_reset_at - now);
      const toDay = Math.max(0, usage.day_reset_at - now);

      const minSec = Math.ceil(toMinute / 1000);
      const hrs = Math.floor(toDay / 3600000);
      const mins = Math.floor((toDay % 3600000) / 60000);
      const secs = Math.ceil((toDay % 60000) / 1000);

      const dayStr = `${hrs}h ${mins}m ${secs}s`;
      setCountdown(
        toMinute > 0
          ? `Minute reset: ${minSec}s · Day reset: ${dayStr}`
          : `Day reset: ${dayStr}`
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [usage]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const result = await aiChat(msg);
      if (result.success && result.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.response! }]);
        if (result.usage) {
          setUsage(result.usage as unknown as UsageData);
        }
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const usagePercent = usage ? Math.round((usage.requests_today / usage.max_per_day) * 100) : 0;
  const usageColor = usagePercent > 80 ? "bg-red-500" : usagePercent > 50 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-6">
      {/* Usage banner */}
      <div className={`rounded-xl border p-4 ${
        usagePercent > 80
          ? "bg-red-50 border-red-200"
          : usagePercent > 50
          ? "bg-amber-50 border-amber-200"
          : "bg-blue-50 border-blue-200"
      }`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${
            usagePercent > 80 ? "text-red-600" : usagePercent > 50 ? "text-amber-600" : "text-blue-600"
          }`} />
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${
              usagePercent > 80 ? "text-red-800" : usagePercent > 50 ? "text-amber-800" : "text-blue-800"
            }`}>
              Groq API Usage Notice
            </p>
            <p className={`text-xs mt-1 ${
              usagePercent > 80 ? "text-red-700" : usagePercent > 50 ? "text-amber-700" : "text-blue-700"
            }`}>
              Each question you ask consumes API quota. Be intentional and careful with your questions. The more specific and focused your question, the more value you get from each call.
            </p>
            {usage && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600">Today:</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${usageColor}`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
                  </div>
                  <span className="font-medium text-gray-700 shrink-0">{usage.requests_today} / {usage.max_per_day}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600">Minute:</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-purple-400 transition-all duration-500" style={{ width: `${Math.min((usage.requests_this_minute / usage.max_per_minute) * 100, 100)}%` }} />
                  </div>
                  <span className="font-medium text-gray-700 shrink-0">{usage.requests_this_minute} / {usage.max_per_minute}</span>
                </div>
                {countdown && (
                  <p className="text-xs text-gray-500 mt-1">{countdown}</p>
                )}
              </div>
            )}
            {!usage && (
              <p className="text-xs text-gray-500 mt-1">Loading usage data...</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat card */}
      <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-900">
            <Bot className="h-6 w-6" />
            DragonBot — AI Assistant
          </CardTitle>
          <CardDescription>Ask anything about the restaurant — menu, orders, feedback, inventory, employees, finance, and more.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-xl border max-h-[500px] min-h-[300px] overflow-y-auto p-4 space-y-3 mb-3">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                Ask a question to get started. For example: "What's our best selling dish?" or "How is the inventory looking?"
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-gray-900">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the restaurant..."
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={loading} className="bg-emerald-700 hover:bg-emerald-800 shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
