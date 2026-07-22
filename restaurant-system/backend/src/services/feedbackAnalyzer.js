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
  "also", "just", "had", "have", "has", "would", "could", "should",
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

  // Specific issue patterns in comments
  const issuePatterns = [
    { pattern: /\b(loud|noise|music|volume)\b/i, category: "atmosphere", action: "Consider adjusting music volume or ambiance to create a more comfortable dining experience." },
    { pattern: /\b(slow|wait|time|delay)\b/i, category: "service", action: "Review service speed and kitchen processes. Faster service could improve customer satisfaction and table turnover." },
    { pattern: /\b(cold|warm|temperature)\b/i, category: "food", action: "Check food temperature control. Serving food at proper temperature is critical for customer satisfaction." },
    { pattern: /\b(dirty|clean|mess|hygiene)\b/i, category: "cleanliness", action: "Increase cleaning frequency and staff attention to cleanliness. This directly impacts customer comfort and repeat business." },
    { pattern: /\b(rude|staff|attitude|friend|help)\b/i, category: "staff", action: "Provide staff training on customer service and hospitality. Better staff interactions increase customer loyalty." },
    { pattern: /\b(price|expensive|cost|value|worth)\b/i, category: "value", action: "Review pricing strategy and portion sizes. Customers who feel they received good value are more likely to return." },
    { pattern: /\b(app|slow|crash|bug|difficult)\b/i, category: "app", action: "Improve app performance and user experience. A smoother ordering process increases order frequency and customer satisfaction." },
  ];

  // Analyze comments for specific issues
  const commentIssues = {};
  current.forEach(row => {
    const comment = row.comment || "";
    issuePatterns.forEach(({ pattern, category }) => {
      if (pattern.test(comment)) {
        commentIssues[category] = (commentIssues[category] || 0) + 1;
      }
    });
  });

  // Generate specific findings based on comment patterns
  Object.entries(commentIssues).forEach(([category, count]) => {
    if (count >= 2) {
      const pattern = issuePatterns.find(p => p.category === category);
      if (pattern) {
        findings.push({
          category: "specific_issue",
          title: `${category.charAt(0).toUpperCase() + category.slice(1)} concerns mentioned in ${count} feedbacks`,
          description: pattern.action,
          priority: "high",
          evidence: { category, count, pattern: pattern.pattern.toString() },
        });
      }
    }
  });

  // Rating-based findings with more specific actions
  for (const { key, label } of RATING_DIMS) {
    const cur = curAvg[key];
    if (cur.count < 2 || cur.average == null) continue;

    if (cur.average <= -1.5) {
      const specificActions = {
        "rating_staff": "Provide immediate staff training on customer service. Consider implementing a service quality checklist and regular performance reviews.",
        "rating_app": "Fix critical app issues immediately. Technical problems directly impact order volume and customer retention.",
        "rating_cleanliness": "Implement stricter cleaning protocols and increase staff accountability. Cleanliness is a top factor in customer return decisions.",
        "rating_food": "Review kitchen processes and food quality control. Consider menu adjustments or supplier changes if needed.",
        "rating_atmosphere": "Evaluate the dining environment - lighting, music, seating comfort. Small improvements here significantly impact customer experience.",
        "rating_value": "Review your pricing strategy against competitors. Consider adjusting portions or prices to better match customer expectations.",
      };
      findings.push({
        category: "ratings",
        title: `${label} requires immediate action`,
        description: specificActions[key] || `Average score for ${label.toLowerCase()} is ${cur.average.toFixed(1)} across ${cur.count} ratings. Addressing this will improve customer satisfaction and repeat business.`,
        priority: "high",
        evidence: { dimension: key, average: cur.average, count: cur.count },
      });
    } else if (cur.average <= -0.5) {
      const improvementActions = {
        "rating_staff": "Schedule additional staff training sessions focused on areas receiving negative feedback.",
        "rating_app": "Identify and fix app usability issues. Small improvements can significantly increase order frequency.",
        "rating_cleanliness": "Increase cleaning frequency and add spot checks during peak hours.",
        "rating_food": "Monitor food quality closely and gather specific customer feedback on dishes receiving low ratings.",
        "rating_atmosphere": "Make small adjustments to ambiance based on customer comments to enhance the dining experience.",
        "rating_value": "Consider promotional offers or value-added items to improve perceived value.",
      };
      findings.push({
        category: "ratings",
        title: `${label} needs improvement`,
        description: improvementActions[key] || `Average ${label.toLowerCase()} score is ${cur.average.toFixed(1)}. Improving this area will increase customer satisfaction and loyalty.`,
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
            title: `${label} improved — continue current approach`,
            description: `${label} rose from ${prevAvg.average.toFixed(1)} to ${cur.average.toFixed(1)} (+${delta.toFixed(1)}). Maintain the changes that led to this improvement to sustain customer satisfaction gains.`,
            priority: "low",
            evidence: { dimension: key, before: prevAvg.average, after: cur.average, delta },
          });
        } else if (delta <= -1) {
          findings.push({
            category: "regression",
            title: `${label} declined — investigate recent changes`,
            description: `${label} dropped from ${prevAvg.average.toFixed(1)} to ${cur.average.toFixed(1)} (${delta.toFixed(1)}). Review any recent operational changes, menu updates, or staff changes that may have caused this decline.`,
            priority: "high",
            evidence: { dimension: key, before: prevAvg.average, after: cur.average, delta },
          });
        }
      }
    }
  }

  // Keyword-based specific suggestions
  if (keywords.length >= 2) {
    const keywordActions = {
      "slow": "Optimize kitchen workflow and staff scheduling during peak hours to reduce wait times.",
      "wait": "Implement a table management system to better estimate and communicate wait times to customers.",
      "cold": "Review food holding procedures and implement temperature checks before serving.",
      "loud": "Adjust music volume or soundproofing to create a more comfortable dining environment.",
      "music": "Consider changing music selection or volume based on customer feedback and time of day.",
      "dirty": "Increase cleaning frequency and implement regular cleanliness audits.",
      "price": "Review pricing strategy and consider value-added promotions to improve perceived value.",
      "expensive": "Consider portion adjustments or value bundles to better align with customer expectations.",
      "staff": "Provide additional training on customer service and hospitality skills.",
      "rude": "Address staff behavior immediately through coaching and clear service standards.",
      "service": "Review service protocols and ensure staff are following best practices.",
    };

    keywords.slice(0, 5).forEach(({ word, count }) => {
      const lowerWord = word.toLowerCase();
      const action = keywordActions[lowerWord];
      if (action && count >= 2) {
        findings.push({
          category: "keyword_action",
          title: `Action needed: "${word}" mentioned ${count} times`,
          description: action,
          priority: "medium",
          evidence: { keyword: word, count },
        });
      }
    });
  }

  const neg = negativeComments(current);
  if (neg.length >= 2) {
    findings.push({
      category: "sentiment",
      title: `${neg.length} customers expressed serious dissatisfaction`,
      description: "Review these specific feedback entries to understand the exact issues. Addressing these concerns directly can prevent negative word-of-mouth and improve retention.",
      priority: neg.length >= 4 ? "high" : "medium",
      evidence: { negative_count: neg.length, total: current.length, sample_ids: neg.slice(0, 5).map((r) => r.id) },
    });
  }

  const withResponse = current.filter((r) => r.manager_response);
  const unanswered = current.length - withResponse.length;
  if (unanswered >= 3) {
    findings.push({
      category: "operations",
      title: `Respond to ${unanswered} customer feedbacks`,
      description: "Responding to feedback shows customers you value their input and increases the likelihood they'll return. Set aside time daily to address recent feedback.",
      priority: "medium",
      evidence: { unanswered_count: unanswered },
    });
  }

  if (!current.length) {
    findings.push({
      category: "data",
      title: "No feedback data available",
      description: "Encourage customers to provide feedback through the app. More feedback helps identify improvement opportunities and measure customer satisfaction trends.",
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
