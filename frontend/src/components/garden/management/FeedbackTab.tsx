import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, Loader2, Sparkles, Archive, Trash2, Reply,
  Check, X, Calendar, Brain, ChevronRight, AlertTriangle, Star, Hash,
} from "lucide-react";
import { SelectedRatingStars } from "../customer/FeedbackRatingStars";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchManagerFeedback,
  fetchLatestFeedbackAnalysis,
  runFeedbackAnalysis,
  respondToFeedback,
  archiveManagerFeedback,
  deleteManagerFeedback,
  updateFeedbackFindingStatus,
  deleteFeedbackFinding,
  type CustomerFeedback,
  type FeedbackAnalysisFinding,
  type FeedbackAnalysisResponse,
} from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

type Notify = (kind: "success" | "error", text: string) => void;

const RATING_LABELS: { key: string; labelKey: string }[] = [
  { key: "staff", labelKey: "manager.feedback.dimStaff" },
  { key: "app", labelKey: "manager.feedback.dimApp" },
  { key: "cleanliness", labelKey: "manager.feedback.dimClean" },
  { key: "food", labelKey: "manager.feedback.dimFood" },
  { key: "atmosphere", labelKey: "manager.feedback.dimAtmosphere" },
  { key: "value", labelKey: "manager.feedback.dimValue" },
];

const priorityColor = (p: string) => {
  if (p === "high") return "bg-red-100 text-red-800 border-red-200";
  if (p === "medium") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

const statusBadge = (s: string) => {
  if (s === "accepted") return "bg-green-100 text-green-800";
  if (s === "declined") return "bg-gray-100 text-gray-600";
  return "bg-blue-100 text-blue-800";
};

const generateComprehensiveAnalysis = (summary: FeedbackAnalysisResponse["summary"], findings: FeedbackAnalysisFinding[]): React.ReactNode => {
  if (!summary) return null;

  // If AI analysis is available, display it
  if (summary.ai_analysis) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-gray-900">AI-Powered Analysis</h3>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">AI Generated</span>
          </div>
          <div className="text-gray-700 whitespace-pre-line leading-relaxed text-sm">
            {summary.ai_analysis}
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, use rule-based analysis
  const sections: React.ReactNode[] = [];

  // Overall summary section
  sections.push(
    <div key="overview" className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-4 mb-4 border border-violet-100">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-violet-600" />
        <h3 className="font-bold text-violet-900">Feedback Overview</h3>
      </div>
      <p className="text-gray-700 text-sm leading-relaxed">
        We received <span className="font-semibold text-violet-700">{summary.feedback_count ?? 0}</span> customer feedback entries during this period.
      </p>
    </div>
  );

  // Sentiment analysis
  if (summary.overall_sentiment && summary.overall_sentiment !== "ai_generated") {
    const sentiment = summary.overall_sentiment.toLowerCase();
    const sentimentColors = {
      positive: "bg-green-100 text-green-800 border-green-200",
      negative: "bg-red-100 text-red-800 border-red-200",
      mixed: "bg-yellow-100 text-yellow-800 border-yellow-200",
      text_only: "bg-gray-100 text-gray-800 border-gray-200",
    };
    const sentimentColor = sentimentColors[sentiment as keyof typeof sentimentColors] || sentimentColors.mixed;

    sections.push(
      <div key="sentiment" className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <h3 className="font-bold text-gray-900">Overall Sentiment</h3>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${sentimentColor}`}>
            {summary.overall_sentiment}
          </span>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">
          {sentiment === "positive" && "This is a good sign that most guests are satisfied with our service."}
          {sentiment === "negative" && "We need to address several concerns to improve customer satisfaction."}
          {sentiment === "mixed" && "There's room for improvement in certain areas."}
          {sentiment === "text_only" && "Customers provided text-only feedback without ratings."}
        </p>
      </div>
    );
  }

  // Negative feedback alert
  if (summary.negative_count && summary.negative_count > 0) {
    sections.push(
      <div key="negative" className="bg-red-50 rounded-xl p-4 mb-4 border border-red-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h3 className="font-bold text-red-900">Attention Required</h3>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">
          We received <span className="font-semibold text-red-700">{summary.negative_count}</span> negative feedback entries that require immediate attention. These highlight areas where customers are dissatisfied.
        </p>
      </div>
    );
  }

  // Dimension averages
  if (summary.dimension_averages) {
    const dimensions = Object.entries(summary.dimension_averages)
      .filter(([_, dim]) => dim.count > 0 && dim.average != null)
      .sort((a, b) => a[1].average! - b[1].average!);

    if (dimensions.length > 0) {
      const lowest = dimensions[0];
      const highest = dimensions[dimensions.length - 1];

      sections.push(
        <div key="dimensions" className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-5 w-5 text-amber-500" />
            <h3 className="font-bold text-gray-900">Performance by Category</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <p className="text-xs text-green-600 font-medium mb-1">Strongest Area</p>
              <p className="font-semibold text-green-800">{highest[1].label}</p>
              <p className="text-lg font-bold text-green-900">{highest[1].average!.toFixed(1)}/5</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <p className="text-xs text-red-600 font-medium mb-1">Needs Attention</p>
              <p className="font-semibold text-red-800">{lowest[1].label}</p>
              <p className="text-lg font-bold text-red-900">{lowest[1].average!.toFixed(1)}/5</p>
            </div>
          </div>
          <div className="space-y-2">
            {dimensions.map(([key, dim]) => {
              const score = dim.average!;
              const bgColor = score < 3 ? "bg-red-100" : score < 4 ? "bg-yellow-100" : "bg-green-100";
              const textColor = score < 3 ? "text-red-800" : score < 4 ? "text-yellow-800" : "text-green-800";
              const status = score < 3 ? "Critical" : score < 4 ? "Needs Improvement" : "Good";
              return (
                <div key={key} className={`flex items-center justify-between p-2 rounded-lg ${bgColor}`}>
                  <span className="font-medium text-gray-800 text-sm">{dim.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${textColor}`}>{status}</span>
                    <span className="font-bold text-gray-900">{score.toFixed(1)}/5</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  }

  // Top keywords
  if (summary.top_keywords && summary.top_keywords.length > 0) {
    sections.push(
      <div key="keywords" className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Hash className="h-5 w-5 text-purple-600" />
          <h3 className="font-bold text-gray-900">Common Themes</h3>
        </div>
        <p className="text-gray-600 text-sm mb-3">Customers frequently mentioned:</p>
        <div className="flex flex-wrap gap-2">
          {summary.top_keywords.slice(0, 5).map((k, i) => (
            <span key={i} className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm font-medium border border-purple-200">
              "{k.word}" <span className="text-purple-600">({k.count}x)</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Findings summary
  if (findings.length > 0) {
    const pending = findings.filter((f) => f.status === "pending").length;
    const highPriority = findings.filter((f) => f.priority === "high").length;

    sections.push(
      <div key="findings" className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4 mb-4 border border-blue-200">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-blue-600" />
          <h3 className="font-bold text-gray-900">Analysis Insights</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <p className="text-xs text-blue-600 font-medium mb-1">Total Insights</p>
            <p className="text-2xl font-bold text-blue-900">{findings.length}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <p className="text-xs text-blue-600 font-medium mb-1">Awaiting Review</p>
            <p className="text-2xl font-bold text-blue-900">{pending}</p>
          </div>
        </div>
        {highPriority > 0 && (
          <div className="mt-3 bg-orange-100 rounded-lg p-3 border border-orange-200">
            <p className="text-sm text-orange-800">
              <span className="font-semibold">{highPriority}</span> items are marked as high priority and should be addressed urgently.
            </p>
          </div>
        )}
      </div>
    );
  }

  return <div className="space-y-4">{sections}</div>;
};

export const FeedbackTab = ({ notify }: { notify: Notify }) => {
  const { t } = useTranslation();
  const [list, setList] = useState<CustomerFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [sortBy, setSortBy] = useState<"date" | "rating" | "sentiment">("date");
  const [selected, setSelected] = useState<CustomerFeedback | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responding, setResponding] = useState(false);

  const [analysisFrom, setAnalysisFrom] = useState("");
  const [analysisTo, setAnalysisTo] = useState("");
  const [analysis, setAnalysis] = useState<FeedbackAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleteFindingId, setDeleteFindingId] = useState<number | null>(null);
  const [useAI, setUseAI] = useState(true);
  const [findingPriorityFilter, setFindingPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const calculateAverageRating = useCallback((fb: CustomerFeedback): number => {
    const ratings = [
      fb.rating_staff,
      fb.rating_app,
      fb.rating_cleanliness,
      fb.rating_food,
      fb.rating_atmosphere,
      fb.rating_value,
    ].filter((r) => r != null);
    if (ratings.length === 0) return 0;
    return ratings.reduce((sum, r) => sum + r!, 0) / ratings.length;
  }, []);

  const calculateSentiment = useCallback((fb: CustomerFeedback): number => {
    const avg = calculateAverageRating(fb);
    return avg;
  }, [calculateAverageRating]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchManagerFeedback({ status: statusFilter });
      
      const sorted = [...data].sort((a, b) => {
        if (sortBy === "date") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        } else if (sortBy === "rating") {
          const aAvg = calculateAverageRating(a);
          const bAvg = calculateAverageRating(b);
          return bAvg - aAvg;
        } else if (sortBy === "sentiment") {
          const aSentiment = calculateSentiment(a);
          const bSentiment = calculateSentiment(b);
          return bSentiment - aSentiment;
        }
        return 0;
      });
      
      setList(sorted);
    } catch {
      notify("error", t("manager.feedback.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sortBy, notify, t, calculateAverageRating, calculateSentiment]);

  const loadAnalysis = useCallback(async () => {
    try {
      const data = await fetchLatestFeedbackAnalysis();
      setAnalysis(data);
    } catch {
      setAnalysis(null);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  // WebSocket listener for real-time updates
  useWebSocket(["NEW_FEEDBACK", "FEEDBACK_ANALYSIS_UPDATE"], (event) => {
    if (event.type === "NEW_FEEDBACK") {
      loadList();
    } else if (event.type === "FEEDBACK_ANALYSIS_UPDATE") {
      loadAnalysis();
    }
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await runFeedbackAnalysis(analysisFrom || undefined, analysisTo || undefined, useAI);
      setAnalysis({
        run: {
          id: result.run_id,
          period_from: analysisFrom || null,
          period_to: analysisTo || null,
          feedback_count: result.summary?.feedback_count || 0,
          created_at: new Date().toISOString(),
          analysis_method: result.analysis_method,
        },
        summary: result.summary,
        findings: result.findings,
        analysis_method: result.analysis_method,
      });
      notify("success", result.analysis_method === "ai" ? "AI analysis completed" : "Analysis completed");
    } catch (e: unknown) {
      const err = e as Error;
      notify("error", err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFinding = async (id: number, status: "accepted" | "declined") => {
    try {
      await updateFeedbackFindingStatus(id, status);
      await loadAnalysis();
      notify("success", t("manager.feedback.findingUpdated"));
    } catch {
      notify("error", t("manager.feedback.findingFailed"));
    }
  };

  const handleDeleteFinding = async (id: number) => {
    setDeleteFindingId(id);
  };

  const confirmDeleteFinding = async () => {
    if (!deleteFindingId) return;
    try {
      await deleteFeedbackFinding(deleteFindingId);
      await loadAnalysis();
      notify("success", t("manager.feedback.findingDeleted"));
      setDeleteFindingId(null);
    } catch {
      notify("error", t("manager.feedback.findingDeleteFailed"));
    }
  };

  const openDetail = (fb: CustomerFeedback) => {
    setSelected(fb);
    setResponseText(fb.manager_response || "");
  };

  const submitResponse = async () => {
    if (!selected) return;
    setResponding(true);
    try {
      const updated = await respondToFeedback(selected.id, responseText.trim());
      setSelected(updated);
      await loadList();
      notify("success", t("manager.feedback.responded"));
    } catch {
      notify("error", t("manager.feedback.respondFailed"));
    } finally {
      setResponding(false);
    }
  };

  const handleArchive = async (id: number) => {
    try {
      await archiveManagerFeedback(id);
      setSelected(null);
      await loadList();
      notify("success", t("manager.feedback.archived"));
    } catch {
      notify("error", t("manager.feedback.archiveFailed"));
    }
  };

  const exportAnalysis = () => {
    if (!analysis || !summary) return;
    
    const exportText = `
Feedback Analysis Report
========================
Generated: ${new Date().toLocaleString()}
Period: ${analysis.run?.period_from || "All time"} to ${analysis.run?.period_to || "Present"}
Analysis Method: ${analysis.analysis_method || "rule_based"}
Feedback Count: ${summary.feedback_count || 0}

${summary.ai_analysis ? `AI Analysis:\n${summary.ai_analysis}` : ''}

Findings:
${findings.map(f => `- ${f.title} (${f.priority}): ${f.description}`).join('\n')}
    `.trim();

    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-analysis-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    notify("success", "Analysis exported successfully");
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t("manager.feedback.deleteConfirm"))) return;
    try {
      await deleteManagerFeedback(id);
      setSelected(null);
      await loadList();
      notify("success", t("manager.feedback.deleted"));
    } catch {
      notify("error", t("manager.feedback.deleteFailed"));
    }
  };

  const summary = analysis?.summary;
  const findings = analysis?.findings ?? [];

  return (
    <div className="space-y-6">
      {/* AI-style analyzer */}
      <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50/80 to-indigo-50/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-violet-900">
            <Brain className="h-6 w-6" />
            {t("manager.feedback.analyzerTitle")}
          </CardTitle>
          <CardDescription>{t("manager.feedback.analyzerDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">{t("manager.feedback.from")}</Label>
              <Input type="date" value={analysisFrom} onChange={(e) => setAnalysisFrom(e.target.value)} className="w-40 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("manager.feedback.to")}</Label>
              <Input type="date" value={analysisTo} onChange={(e) => setAnalysisTo(e.target.value)} className="w-40 mt-1" />
            </div>
            <Button onClick={handleAnalyze} disabled={analyzing} className="bg-violet-700 hover:bg-violet-800">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {t("manager.feedback.runAnalysis")}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="useAI"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="h-4 w-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500"
            />
            <Label htmlFor="useAI" className="text-sm text-gray-700 cursor-pointer">
              {t("manager.feedback.useAI")}
            </Label>
            <span className="text-xs text-gray-500 ml-2">
              ({useAI ? t("manager.feedback.aiPowered") : t("manager.feedback.ruleBased")})
            </span>
          </div>
          
          <p className="text-xs text-gray-500">{t("manager.feedback.analyzerHint")}</p>

          {summary && (
            <div className="rounded-xl bg-white/90 p-4 border">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-violet-900">{t("manager.feedback.comprehensiveAnalysis")}</p>
                <Button size="sm" variant="outline" onClick={exportAnalysis} className="text-xs">
                  Export Report
                </Button>
              </div>
              {generateComprehensiveAnalysis(summary, findings)}
            </div>
          )}

          {findings.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-violet-900">{t("manager.feedback.findings")}</p>
                <select
                  value={findingPriorityFilter}
                  onChange={(e) => setFindingPriorityFilter(e.target.value as "all" | "high" | "medium" | "low")}
                  className="text-xs border rounded px-2 py-1 bg-white"
                >
                  <option value="all">All Priorities</option>
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
              {findings
                .filter((f) => findingPriorityFilter === "all" || f.priority === findingPriorityFilter)
                .map((f: FeedbackAnalysisFinding) => (
                <div
                  key={f.id}
                  className={`rounded-xl border p-3 bg-white/90 ${priorityColor(f.priority)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{f.title}</p>
                      <p className="text-sm text-gray-700 mt-1">{f.description}</p>
                      <Badge className={`mt-2 text-[0.65rem] ${statusBadge(f.status)}`}>{f.status}</Badge>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {f.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" className="text-green-700" onClick={() => handleFinding(f.id, "accepted")}>
                            <Check className="h-3.5 w-3.5 mr-1" /> {t("manager.feedback.accept")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleFinding(f.id, "declined")}>
                            <X className="h-3.5 w-3.5 mr-1" /> {t("manager.feedback.decline")}
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteFinding(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {analysis?.run && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {t("manager.feedback.lastRun")}: {new Date(analysis.run.created_at).toLocaleString()}
              {analysis.run.period_from && ` · ${analysis.run.period_from} → ${analysis.run.period_to || "now"}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Feedback inbox */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-700" />
            {t("manager.feedback.inbox")}
          </CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            {(["active", "archived", "all"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
              >
                {t(`manager.feedback.filter_${s}`)}
              </Button>
            ))}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "rating" | "sentiment")}
              className="text-xs border rounded px-2 py-1 bg-white ml-2"
            >
              <option value="date">Sort by Date</option>
              <option value="rating">Sort by Rating</option>
              <option value="sentiment">Sort by Sentiment</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
          ) : list.length === 0 ? (
            <p className="text-center text-gray-500 py-8">{t("manager.feedback.empty")}</p>
          ) : (
            <ul className="divide-y">
              {list.map((fb) => (
                <li key={fb.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(fb)}
                    className="w-full text-left px-2 py-3 hover:bg-green-50/80 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{fb.sender_name}</p>
                      <p className="text-sm text-gray-500 truncate">{fb.comment}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fb.table_number || "—"} · {new Date(fb.created_at).toLocaleString()}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.sender_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {selected.sender_email && <p><strong>{t("manager.feedback.email")}:</strong> {selected.sender_email}</p>}
                <p><strong>{t("manager.feedback.table")}:</strong> {selected.table_number || "—"}</p>
                <p className="whitespace-pre-wrap">{selected.comment}</p>

                <div className="grid grid-cols-2 gap-2">
                  {RATING_LABELS.map(({ key, labelKey }) => {
                    const v = selected.ratings?.[key as keyof typeof selected.ratings] ?? selected[`rating_${key}` as keyof CustomerFeedback];
                    if (v == null) return null;
                    const num = Number(v);
                    return (
                      <div key={key} className="rounded-lg bg-gray-50 px-2 py-2">
                        <span className="text-xs text-gray-500">{t(labelKey)}</span>
                        <p className="font-bold text-sm">{num > 0 ? `+${num}` : num}</p>
                        <SelectedRatingStars value={num} />
                      </div>
                    );
                  })}
                </div>

                {selected.suggestion_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.suggestion_tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}

                {selected.images?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.images.map((img) => (
                      <a
                        key={img.id}
                        href={`${API_BASE}${img.image_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-20 w-20 rounded-lg overflow-hidden border"
                      >
                        <img src={`${API_BASE}${img.image_url}`} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                <div>
                  <Label>{t("manager.feedback.yourResponse")}</Label>
                  <Textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    className="mt-1 min-h-[80px]"
                  />
                  <Button className="mt-2" size="sm" onClick={submitResponse} disabled={responding}>
                    <Reply className="h-3.5 w-3.5 mr-1" />
                    {t("manager.feedback.sendResponse")}
                  </Button>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  {selected.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => handleArchive(selected.id)}>
                      <Archive className="h-3.5 w-3.5 mr-1" /> {t("manager.feedback.archive")}
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(selected.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("manager.feedback.delete")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Finding Confirmation Dialog */}
      <Dialog open={!!deleteFindingId} onOpenChange={(open) => !open && setDeleteFindingId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("manager.feedback.deleteConfirm")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{t("manager.feedback.deleteFindingConfirm")}</p>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setDeleteFindingId(null)} variant="outline" className="flex-1">
              {t("manager.feedback.cancel")}
            </Button>
            <Button onClick={confirmDeleteFinding} variant="destructive" className="flex-1">
              {t("manager.feedback.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
