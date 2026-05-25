/*
 * profanityFilter.js — Blocks offensive language in customer feedback text.
 */

const BLOCKED = [
  "fuck", "fucking", "fucker", "shit", "shitty", "bitch", "bastard", "asshole",
  "cunt", "dick", "pussy", "whore", "slut", "nigger", "nigga", "faggot", "retard",
  "motherfucker", "bullshit", "damn", "piss", "cock", "wanker", "twat",
];

const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const findOffensiveWords = (text) => {
  const normalized = normalize(text);
  if (!normalized) return [];
  const words = normalized.split(" ");
  const found = new Set();
  for (const word of words) {
    if (!word) continue;
    for (const blocked of BLOCKED) {
      if (word === blocked || word.includes(blocked)) {
        found.add(blocked);
      }
    }
  }
  return [...found];
};

const containsProfanity = (text) => findOffensiveWords(text).length > 0;

const validateFeedbackText = (fields) => {
  const bad = new Set();
  for (const value of fields) {
    findOffensiveWords(value).forEach((w) => bad.add(w));
  }
  return [...bad];
};

module.exports = { containsProfanity, findOffensiveWords, validateFeedbackText };
