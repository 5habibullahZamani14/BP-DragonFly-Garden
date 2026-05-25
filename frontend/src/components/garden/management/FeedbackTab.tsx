import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, Loader2, Sparkles, Archive, Trash2, Reply,
  Check, X, Calendar, Brain, ChevronRight,
} from "lucide-react";
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
  type CustomerFeedback,
  type FeedbackAnalysisFinding,
  type FeedbackAnalysisResponse,
} from "@/lib/api";

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

export const FeedbackTab = ({ notify }: { notify: Notify }) => {
  const { t } = useTranslation();
  const [list, setList] = useState<CustomerFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [selected, setSelected] = useState<CustomerFeedback | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responding, setResponding] = useState(false);

  const [analysisFrom, setAnalysisFrom] = useState("");
  const [analysisTo, setAnalysisTo] = useState("");
  const [analysis, setAnalysis] = useState<FeedbackAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchManagerFeedback({ status: statusFilter });
      setList(data);
    } catch {
      notify("error", t("manager.feedback.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify, t]);

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

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await runFeedbackAnalysis(analysisFrom || undefined, analysisTo || undefined);
      setAnalysis({
        run: {
          id: result.run_id,
          period_from: analysisFrom || null,
          period_to: analysisTo || null,
          feedback_count: result.summary?.feedback_count ?? 0,
          created_at: new Date().toISOString(),
        },
        summary: result.summary,
        findings: result.findings,
      });
      notify("success", t("manager.feedback.analysisDone"));
    } catch {
      notify("error", t("manager.feedback.analysisFailed"));
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
            <p className="text-xs text-gray-500 w-full">{t("manager.feedback.analyzerHint")}</p>
          </div>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white/80 p-3 border">
                <p className="text-xs text-gray-500">{t("manager.feedback.count")}</p>
                <p className="text-2xl font-bold">{summary.feedback_count ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 border">
                <p className="text-xs text-gray-500">{t("manager.feedback.sentiment")}</p>
                <p className="text-lg font-semibold capitalize">{summary.overall_sentiment ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 border">
                <p className="text-xs text-gray-500">{t("manager.feedback.negative")}</p>
                <p className="text-2xl font-bold text-red-700">{summary.negative_count ?? 0}</p>
              </div>
              {summary.top_keywords?.slice(0, 3).map((k) => (
                <div key={k.word} className="rounded-xl bg-white/80 p-3 border">
                  <p className="text-xs text-gray-500 truncate">{k.word}</p>
                  <p className="text-lg font-bold">×{k.count}</p>
                </div>
              ))}
            </div>
          )}

          {summary?.dimension_averages && (
            <div className="rounded-xl bg-white/70 p-3 border text-sm">
              <p className="font-semibold text-gray-700 mb-2">{t("manager.feedback.avgRatings")}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.dimension_averages).map(([key, dim]) =>
                  dim.count > 0 && dim.average != null ? (
                    <Badge key={key} variant="outline" className="text-xs">
                      {dim.label}: {dim.average.toFixed(1)} ({dim.count})
                    </Badge>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {findings.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold text-violet-900">{t("manager.feedback.findings")}</p>
              {findings.map((f: FeedbackAnalysisFinding) => (
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
                    {f.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-green-700" onClick={() => handleFinding(f.id, "accepted")}>
                          <Check className="h-3.5 w-3.5 mr-1" /> {t("manager.feedback.accept")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleFinding(f.id, "declined")}>
                          <X className="h-3.5 w-3.5 mr-1" /> {t("manager.feedback.decline")}
                        </Button>
                      </div>
                    )}
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
          <div className="flex gap-2 mt-2">
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
                    return (
                      <div key={key} className="rounded-lg bg-gray-50 px-2 py-1">
                        <span className="text-xs text-gray-500">{t(labelKey)}</span>
                        <p className="font-bold">{Number(v) > 0 ? `+${v}` : v}</p>
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
    </div>
  );
};
