/*
 * feedbackAnalyzer.js — Rule-based comprehensive analysis of customer feedback.
 * Produces actionable findings managers can accept or decline.
 */

const RATING_DIMS = [
  { key: "rating_staff", label: "Staff service" },
  { key: "rating_app", label: "App experience" },
  { key: "rating_cleanliness", label: "Cleanliness" },
  { key: "rating_food", label: "Food quality" },
  { key: "rating_atmosphere", label: "Atmosphere" },
  { key: "rating_value", label: "Value for money" },
];

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "is", "was",
  "are", "were", "be", "been", "it", "this", "that", "with", "from", "as", "by", "not",
  "no", "so", "if", "my", "our", "we", "they", "you", "your", "i", "me", "very", "too",
  "also", "just", "had", "have", "has", "was", "were", "would", "could", "should",
]);

const tokenize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

const avg = (nums) => {
  const valid = nums.filter((n) => typeof n === "number" && !Number.isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
};

const dimAverages = (rows) => {
  const out = {};
  for (const { key, label } of RATING_DIMS) {
    const vals = rows.map((r) => r[key]).filter((v) => v != null);
    out[key] = { label, average: avg(vals), count: vals.length };
  }
  return out;
};

const topKeywords = (rows, limit = 8) => {
  const freq = {};
  for (const row of rows) {
    for (const w of tokenize(row.comment)) {
      freq[w] = (freq[w] || 0) + 1;
    }
    if (row.suggestion_tags) {
      try {
        const tags = JSON.parse(row.suggestion_tags);
        if (Array.isArray(tags)) {
          for (const tag of tags) {
            const t = String(tag).toLowerCase().replace(/\s+/g, "_");
            if (t.length > 2) freq[`tag:${t}`] = (freq[`tag:${t}`] || 0) + 2;
          }
        }
      } catch { /* ignore */ }
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word: word.replace(/^tag:/, ""), count }));
};

const negativeComments = (rows) =>
  rows.filter((r) => {
    const ratings = RATING_DIMS.map((d) => r[d.key]).filter((v) => v != null);
    const low = ratings.some((v) => v <= -2);
    const textNeg = /\b(bad|terrible|awful|slow|dirty|cold|wrong|rude|disappoint|horrible|never|worst)\b/i.test(
      r.comment || "",
    );
    return low || textNeg;
  });

const buildFindings = (current, previous, keywords, periodLabel) => {
  const findings = [];
  const curAvg = dimAverages(current);

  for (const { key, label } of RATING_DIMS) {
    const cur = curAvg[key];
    if (cur.count < 2 || cur.average == null) continue;

    if (cur.average <= -1.5) {
      findings.push({
        category: "ratings",
        title: `${label} needs urgent attention`,
        description: `Average score for ${label.toLowerCase()} is ${cur.average.toFixed(1)} (scale −5 to +5) across ${cur.count} ratings in ${periodLabel}. Guests are consistently unhappy in this area.`,
        priority: "high",
        evidence: { dimension: key, average: cur.average, count: cur.count },
      });
    } else if (cur.average <= -0.5) {
      findings.push({
        category: "ratings",
        title: `${label} could be improved`,
        description: `Average ${label.toLowerCase()} score is ${cur.average.toFixed(1)} in ${periodLabel}. Consider staff training, process checks, or menu adjustments related to this theme.`,
        priority: "medium",
        evidence: { dimension: key, average: cur.average, count: cur.count },
      });
    }

    if (previous.length >= 3) {
      const prevAvg = dimAverages(previous)[key];
      if (prevAvg.average != null && cur.average != null && cur.count >= 2) {
        const delta = cur.average - prevAvg.average;
        if (delta >= 1) {
          findings.push({
            category: "improvement",
            title: `${label} improved after your changes`,
            description: `${label} rose from ${prevAvg.average.toFixed(1)} to ${cur.average.toFixed(1)} (+${delta.toFixed(1)}). This suggests recent changes may be working for guests.`,
            priority: "low",
            evidence: { dimension: key, before: prevAvg.average, after: cur.average, delta },
          });
        } else if (delta <= -1) {
          findings.push({
            category: "regression",
            title: `${label} declined — review recent changes`,
            description: `${label} dropped from ${prevAvg.average.toFixed(1)} to ${cur.average.toFixed(1)} (${delta.toFixed(1)}). Compare this period with operational changes made around the same time.`,
            priority: "high",
            evidence: { dimension: key, before: prevAvg.average, after: cur.average, delta },
          });
        }
      }
    }
  }

  const neg = negativeComments(current);
  if (neg.length >= 2) {
    findings.push({
      category: "sentiment",
      title: "Multiple dissatisfied guest comments",
      description: `${neg.length} of ${current.length} feedback entries in ${periodLabel} mention serious issues or very low ratings. Read individual tickets for specifics.`,
      priority: neg.length >= 4 ? "high" : "medium",
      evidence: { negative_count: neg.length, total: current.length, sample_ids: neg.slice(0, 5).map((r) => r.id) },
    });
  }

  if (keywords.length >= 3) {
    const top = keywords.slice(0, 5).map((k) => `"${k.word}" (${k.count})`).join(", ");
    findings.push({
      category: "themes",
      title: "Recurring topics in guest comments",
      description: `Guests often mention: ${top}. These themes appear across free-text feedback and quick suggestions.`,
      priority: "medium",
      evidence: { keywords: keywords.slice(0, 8) },
    });
  }

  const withResponse = current.filter((r) => r.manager_response);
  const unanswered = current.length - withResponse.length;
  if (unanswered >= 3) {
    findings.push({
      category: "operations",
      title: "Unanswered feedback waiting for manager",
      description: `${unanswered} feedback item(s) in ${periodLabel} have no manager response yet. Responding shows guests you are listening.`,
      priority: "medium",
      evidence: { unanswered_count: unanswered },
    });
  }

  if (!current.length) {
    findings.push({
      category: "data",
      title: "No feedback in selected period",
      description: "There are no guest feedback entries in this date range. Try widening the timeframe or encouraging guests to use the Feedback tab after their meal.",
      priority: "low",
      evidence: {},
    });
  }

  return findings;
};

const analyzeFeedback = (currentRows, previousRows, periodFrom, periodTo) => {
  const periodLabel =
    periodFrom && periodTo
      ? `${periodFrom} to ${periodTo}`
      : "all time";

  const keywords = topKeywords(currentRows);
  const findings = buildFindings(currentRows, previousRows, keywords, periodLabel);

  const summary = {
    period_from: periodFrom || null,
    period_to: periodTo || null,
    feedback_count: currentRows.length,
    previous_period_count: previousRows.length,
    dimension_averages: dimAverages(currentRows),
    top_keywords: keywords,
    negative_count: negativeComments(currentRows).length,
    overall_sentiment:
      currentRows.length === 0
        ? "no_data"
        : (() => {
            const allRatings = currentRows.flatMap((r) =>
              RATING_DIMS.map((d) => r[d.key]).filter((v) => v != null),
            );
            const m = avg(allRatings);
            if (m == null) return "text_only";
            if (m >= 1.5) return "positive";
            if (m <= -0.5) return "negative";
            return "mixed";
          })(),
  };

  return { summary, findings };
};

module.exports = { analyzeFeedback, RATING_DIMS };
