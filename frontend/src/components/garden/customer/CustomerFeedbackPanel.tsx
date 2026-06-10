import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, Star, ImagePlus, X, Send, Loader2, Mail, User,
  Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";
import { FeedbackRatingScale } from "./FeedbackRatingStars";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  submitFeedback,
  fetchMyFeedback,
  type CustomerFeedback,
  type Order,
} from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type Notify = (kind: "success" | "error", text: string) => void;

type Props = {
  qrCode: string;
  tableId: number | null;
  orders: Order[];
  notify: Notify;
  onSuccess?: () => void;
};

type RatingKey = keyof CustomerFeedback["ratings"];

const RATING_KEYS: { key: RatingKey; labelKey: string }[] = [
  { key: "staff", labelKey: "customer.feedback.rateStaff" },
  { key: "app", labelKey: "customer.feedback.rateApp" },
  { key: "cleanliness", labelKey: "customer.feedback.rateClean" },
  { key: "food", labelKey: "customer.feedback.rateFood" },
  { key: "atmosphere", labelKey: "customer.feedback.rateAtmosphere" },
  { key: "value", labelKey: "customer.feedback.rateValue" },
];

const STORAGE_KEY = (qr: string) => `dfg_feedback_refs_${qr}`;

const loadRefs = (qr: string): { id: number; view_token: string }[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY(qr)) || "[]");
  } catch {
    return [];
  }
};

const saveRef = (qr: string, id: number, view_token: string) => {
  const refs = loadRefs(qr).filter((r) => r.id !== id);
  refs.unshift({ id, view_token });
  sessionStorage.setItem(STORAGE_KEY(qr), JSON.stringify(refs.slice(0, 20)));
};

const buildSuggestions = (orders: Order[], t: (k: string) => string): string[] => {
  const out: string[] = [
    t("customer.feedback.sugFoodQuality"),
    t("customer.feedback.sugWaitTime"),
    t("customer.feedback.sugStaffFriendly"),
    t("customer.feedback.sugCleanliness"),
    t("customer.feedback.sugAppEase"),
    t("customer.feedback.sugAtmosphere"),
    t("customer.feedback.sugPortion"),
    t("customer.feedback.sugValue"),
  ];

  const active = orders.filter((o) => !o.customer_archived_at);
  if (active.length) {
    out.unshift(t("customer.feedback.sugThisVisit"));
    const latest = active[0];
    if (latest.status === "ready") out.unshift(t("customer.feedback.sugReadyPickup"));
    if (latest.status === "preparing") out.unshift(t("customer.feedback.sugCookingTime"));
    const items = (latest.items || []).map((i) => i.item_name).join(" ");
    if (/soup|herbal|mee/i.test(items)) out.unshift(t("customer.feedback.sugSoupTemp"));
    if (/rice|multigrain/i.test(items)) out.unshift(t("customer.feedback.sugRice"));
    if (/tea|beverage|drink/i.test(items)) out.unshift(t("customer.feedback.sugDrinks"));
  }

  return [...new Set(out)].slice(0, 14);
};

const RatingPicker = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) => (
  <div className="rounded-2xl border border-border/60 bg-card/80 px-2 py-2.5 sm:px-3">
    <p className="text-[0.65rem] font-semibold text-foreground/70 mb-2 px-0.5">{label}</p>
    <FeedbackRatingScale value={value} onChange={onChange} />
  </div>
);

export const CustomerFeedbackPanel = ({ qrCode, tableId, orders, notify, onSuccess }: Props) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    staff: null,
    app: null,
    cleanliness: null,
    food: null,
    atmosphere: null,
    value: null,
  });
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [profanityWords, setProfanityWords] = useState<string[]>([]);
  const [showRatings, setShowRatings] = useState(true);
  const [myFeedback, setMyFeedback] = useState<CustomerFeedback[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  const suggestions = useMemo(() => buildSuggestions(orders, t), [orders, t]);

  const latestOrderId = useMemo(() => {
    const active = orders.filter((o) => !o.customer_archived_at);
    return active[0]?.id ?? orders[0]?.id ?? null;
  }, [orders]);

  const loadMine = useCallback(async () => {
    const refs = loadRefs(qrCode);
    if (!refs.length) {
      setMyFeedback([]);
      setLoadingMine(false);
      return;
    }
    try {
      const list = await fetchMyFeedback(qrCode, refs);
      setMyFeedback(list);
    } catch {
      setMyFeedback([]);
    } finally {
      setLoadingMine(false);
    }
  }, [qrCode]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  const toggleTag = (tag: string) => {
    setSelectedTags((cur) =>
      cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag],
    );
    if (!comment.includes(tag)) {
      setComment((c) => (c ? `${c} ${tag}` : tag));
    }
  };

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const next = [...images, ...Array.from(files)].slice(0, 5);
    setImages(next);
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const handleSubmit = async () => {
    setProfanityWords([]);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      notify("error", t("customer.feedback.nameRequired"));
      return;
    }
    if (comment.trim().length < 8) {
      notify("error", t("customer.feedback.commentShort"));
      return;
    }

    const fd = new FormData();
    fd.append("sender_name", trimmedName);
    if (email.trim()) fd.append("sender_email", email.trim());
    fd.append("comment", comment.trim());
    if (tableId) fd.append("table_id", String(tableId));
    if (latestOrderId) fd.append("order_id", String(latestOrderId));
    fd.append("suggestion_tags", JSON.stringify(selectedTags));
    for (const { key } of RATING_KEYS) {
      if (ratings[key] != null) fd.append(`rating_${key}`, String(ratings[key]));
    }
    images.forEach((img) => fd.append("images", img));

    setSubmitting(true);
    try {
      const result = await submitFeedback(qrCode, fd);
      saveRef(qrCode, result.id, result.view_token);
      notify("success", t("customer.feedback.sent"));
      setComment("");
      setSelectedTags([]);
      setImages([]);
      previews.forEach((u) => URL.revokeObjectURL(u));
      setPreviews([]);
      setRatings({
        staff: null,
        app: null,
        cleanliness: null,
        food: null,
        atmosphere: null,
        value: null,
      });
      await loadMine();
      onSuccess?.();
    } catch (e: unknown) {
      const err = e as Error & { error?: string; words?: string[] };
      if (err.error === "profanity" && err.words?.length) {
        setProfanityWords(err.words);
        notify("error", t("customer.feedback.profanity"));
      } else {
        notify("error", err.message || t("customer.feedback.failed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      key="feedback-screen"
      className="animate-fade-up pb-10"
    >
      <header
        className="relative mx-5 mt-3 mb-6 rounded-[28px] p-5 text-primary-foreground"
        style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-deep)" }}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] backdrop-blur">
          <MessageSquare className="h-3 w-3 text-accent-soft" /> {t("customer.feedback.badge")}
        </span>
        <h1 className="mt-3 font-display text-[2rem] font-bold leading-[0.95] tracking-tight">
          {t("customer.feedback.title")}
        </h1>
        <p className="mt-2 max-w-[20rem] text-[0.85rem] leading-snug text-primary-foreground/80">
          {t("customer.feedback.subtitle")}
        </p>
      </header>

      <div className="mx-5 space-y-5">
        {/* Quick suggestions */}
        <section className="rounded-[24px] border border-border/60 bg-card/90 p-4 shadow-[var(--shadow-soft)]">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-foreground/50 mb-2">
            {t("customer.feedback.quickSuggestions")}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => toggleTag(sug)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  selectedTags.includes(sug)
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted/70 text-foreground/70 hover:bg-muted"
                }`}
              >
                {sug}
              </button>
            ))}
          </div>
        </section>

        {/* Form */}
        <section className="rounded-[24px] border border-border/60 bg-card/90 p-4 space-y-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fb-name" className="flex items-center gap-1 text-xs">
                <User className="h-3 w-3" /> {t("customer.feedback.name")} *
              </Label>
              <Input
                id="fb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("customer.feedback.namePh")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fb-email" className="flex items-center gap-1 text-xs">
                <Mail className="h-3 w-3" /> {t("customer.feedback.email")}
              </Label>
              <Input
                id="fb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("customer.feedback.emailPh")}
                className="mt-1"
              />
              <p className="mt-1 text-[0.65rem] text-foreground/45">{t("customer.feedback.emailHint")}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="fb-comment" className="text-xs">{t("customer.feedback.comment")} *</Label>
            <Textarea
              id="fb-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("customer.feedback.commentPh")}
              className="mt-1 min-h-[120px]"
            />
            {profanityWords.length > 0 && (
              <p className="mt-2 text-sm text-berry font-medium">
                {t("customer.feedback.profanityFix", { words: profanityWords.join(", ") })}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowRatings((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              <Star className="h-4 w-4 text-accent" />
              {t("customer.feedback.optionalRatings")}
            </span>
            {showRatings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showRatings && (
            <div className="space-y-2">
              <p className="text-[0.65rem] text-foreground/50">{t("customer.feedback.ratingScale")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {RATING_KEYS.map(({ key, labelKey }) => (
                  <RatingPicker
                    key={key}
                    label={t(labelKey)}
                    value={ratings[key]}
                    onChange={(v) => setRatings((r) => ({ ...r, [key]: v }))}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs flex items-center gap-1">
              <ImagePlus className="h-3.5 w-3.5" />
              {t("customer.feedback.photos", { count: images.length })}
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={src} className="relative h-16 w-16 rounded-xl overflow-hidden border border-border">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
                    aria-label={t("customer.feedback.removePhoto")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-border cursor-pointer hover:bg-muted/50">
                  <ImagePlus className="h-5 w-5 text-foreground/40" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="sr-only"
                    onChange={(e) => onPickImages(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("customer.feedback.send")}
          </button>
        </section>

        {/* My submissions */}
        <section className="rounded-[24px] border border-border/60 bg-card/60 p-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            {t("customer.feedback.mySubmissions")}
          </h2>
          {loadingMine ? (
            <p className="mt-3 text-sm text-foreground/50">{t("customer.feedback.loading")}</p>
          ) : myFeedback.length === 0 ? (
            <p className="mt-3 text-sm text-foreground/50">{t("customer.feedback.noneYet")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {myFeedback.map((fb) => (
                <li key={fb.id} className="rounded-2xl border border-border/50 bg-background/80 p-3">
                  <p className="text-xs text-foreground/45">
                    {new Date(fb.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm line-clamp-3">{fb.comment}</p>
                  {fb.manager_response && (
                    <div className="mt-2 rounded-xl bg-primary/10 px-3 py-2 text-sm">
                      <p className="text-[0.6rem] font-bold uppercase text-primary/70">{t("customer.feedback.managerReply")}</p>
                      <p className="mt-0.5">{fb.manager_response}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
