import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

const keys = {
  "customer.feedback.tab": "Feedback",
  "customer.feedback.badge": "Your voice",
  "customer.feedback.title": "Share your experience",
  "customer.feedback.subtitle": "Tell us about the food, service, app, or anything else. Only you and the manager can see what you send.",
  "customer.feedback.quickSuggestions": "Quick suggestions — tap to add",
  "customer.feedback.name": "Your name",
  "customer.feedback.namePh": "How should we address you?",
  "customer.feedback.nameRequired": "Please enter your name before sending.",
  "customer.feedback.email": "Email (recommended)",
  "customer.feedback.emailPh": "you@example.com",
  "customer.feedback.emailHint": "Optional — helps the manager follow up if needed.",
  "customer.feedback.comment": "Your feedback",
  "customer.feedback.commentPh": "What went well? What could be better?",
  "customer.feedback.commentShort": "Please write a little more detail (at least 8 characters).",
  "customer.feedback.profanity": "Please remove offensive words before sending.",
  "customer.feedback.profanityFix": "Please fix these words: {{words}}",
  "customer.feedback.optionalRatings": "Optional ratings (−5 to +5)",
  "customer.feedback.ratingScale": "−5 = very poor · 0 = neutral · +5 = excellent",
  "customer.feedback.rateStaff": "Staff & service",
  "customer.feedback.rateApp": "This app",
  "customer.feedback.rateClean": "Cleanliness",
  "customer.feedback.rateFood": "Food quality",
  "customer.feedback.rateAtmosphere": "Atmosphere",
  "customer.feedback.rateValue": "Value for money",
  "customer.feedback.photos": "Photos ({{count}}/5)",
  "customer.feedback.removePhoto": "Remove photo",
  "customer.feedback.send": "Send feedback",
  "customer.feedback.sent": "Thank you — your feedback was sent to the manager.",
  "customer.feedback.failed": "Could not send feedback. Please try again.",
  "customer.feedback.mySubmissions": "Your submissions",
  "customer.feedback.loading": "Loading…",
  "customer.feedback.noneYet": "You have not sent feedback yet on this device.",
  "customer.feedback.managerReply": "Manager reply",
  "customer.feedback.sugFoodQuality": "Food taste & freshness",
  "customer.feedback.sugWaitTime": "Waiting time",
  "customer.feedback.sugStaffFriendly": "Staff friendliness",
  "customer.feedback.sugCleanliness": "Table & restroom cleanliness",
  "customer.feedback.sugAppEase": "App ease of use",
  "customer.feedback.sugAtmosphere": "Music & atmosphere",
  "customer.feedback.sugPortion": "Portion size",
  "customer.feedback.sugValue": "Price & value",
  "customer.feedback.sugThisVisit": "My visit today",
  "customer.feedback.sugReadyPickup": "Order ready notification",
  "customer.feedback.sugCookingTime": "Kitchen speed",
  "customer.feedback.sugSoupTemp": "Soup temperature",
  "customer.feedback.sugRice": "Rice texture & warmth",
  "customer.feedback.sugDrinks": "Drinks & beverages",
  "manager.feedback.title": "Guest Feedback",
  "manager.feedback.desc": "Read responses, analyze trends, and reply to guests.",
  "manager.feedback.analyzerTitle": "Feedback intelligence",
  "manager.feedback.analyzerDesc": "Analyzes all guest feedback in your chosen period and surfaces actionable findings.",
  "manager.feedback.from": "From date",
  "manager.feedback.to": "To date",
  "manager.feedback.runAnalysis": "Run analysis",
  "manager.feedback.analyzerHint": "Leave dates empty to analyze all feedback. Use a range after a change (e.g. menu update) to measure impact.",
  "manager.feedback.count": "Feedback in period",
  "manager.feedback.sentiment": "Overall sentiment",
  "manager.feedback.negative": "Concern flags",
  "manager.feedback.avgRatings": "Average ratings by topic",
  "manager.feedback.findings": "Suggested actions",
  "manager.feedback.accept": "Accept",
  "manager.feedback.decline": "Decline",
  "manager.feedback.lastRun": "Last analysis",
  "manager.feedback.inbox": "Inbox",
  "manager.feedback.filter_active": "Active",
  "manager.feedback.filter_archived": "Archived",
  "manager.feedback.filter_all": "All",
  "manager.feedback.empty": "No feedback in this filter.",
  "manager.feedback.loadFailed": "Could not load feedback.",
  "manager.feedback.analysisDone": "Analysis complete.",
  "manager.feedback.analysisFailed": "Analysis failed.",
  "manager.feedback.findingUpdated": "Finding updated.",
  "manager.feedback.findingFailed": "Could not update finding.",
  "manager.feedback.email": "Email",
  "manager.feedback.table": "Table",
  "manager.feedback.dimStaff": "Staff",
  "manager.feedback.dimApp": "App",
  "manager.feedback.dimClean": "Cleanliness",
  "manager.feedback.dimFood": "Food",
  "manager.feedback.dimAtmosphere": "Atmosphere",
  "manager.feedback.dimValue": "Value",
  "manager.feedback.yourResponse": "Your response to the guest",
  "manager.feedback.sendResponse": "Send response",
  "manager.feedback.responded": "Response saved.",
  "manager.feedback.respondFailed": "Could not save response.",
  "manager.feedback.archive": "Archive",
  "manager.feedback.archived": "Feedback archived.",
  "manager.feedback.archiveFailed": "Could not archive.",
  "manager.feedback.delete": "Delete",
  "manager.feedback.deleteConfirm": "Permanently delete this feedback?",
  "manager.feedback.deleted": "Feedback deleted.",
  "manager.feedback.deleteFailed": "Could not delete.",
};

for (const file of fs.readdirSync(localesDir)) {
  if (!file.endsWith(".ts")) continue;
  const fp = path.join(localesDir, file);
  let content = fs.readFileSync(fp, "utf8");
  for (const [k, v] of Object.entries(keys)) {
    if (content.includes(`"${k}"`)) continue;
    const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    content = content.replace(
      /(\n  \},\n\};\n)$/,
      `,\n    "${k}": "${escaped}"$1`,
    );
    if (!content.includes(`"${k}"`)) {
      content = content.replace(
        /(\n  \}\n\};\n)$/,
        `,\n    "${k}": "${escaped}"$1`,
      );
    }
  }
  fs.writeFileSync(fp, content);
  console.log("Updated", file);
}
