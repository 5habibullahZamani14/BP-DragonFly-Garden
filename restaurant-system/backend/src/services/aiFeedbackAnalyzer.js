/*
 * aiFeedbackAnalyzer.js - AI-powered feedback analysis using Google Gemini.
 * Provides intelligent, context-aware business insights with proper security measures.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI client
let genAI = null;
let model = null;

const initializeAI = () => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set. AI analysis will fall back to rule-based.");
    return false;
  }
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    return true;
  } catch (error) {
    console.error("Failed to initialize Gemini AI:", error.message);
    return false;
  }
};

/**
 * Anonymize feedback data before sending to AI
 * Removes personally identifiable information while preserving analysis-relevant content
 */
const anonymizeFeedback = (feedbacks) => {
  return feedbacks.map((fb) => {
    const anonymized = { ...fb };
    // Remove sensitive fields
    delete anonymized.sender_name;
    delete anonymized.sender_email;
    delete anonymized.table_id;
    delete anonymized.order_id;
    delete anonymized.qr_code;
    delete anonymized.view_token;
    delete anonymized.manager_response;
    delete anonymized.responded_at;
    delete anonymized.archived_at;
    delete anonymized.customer_archived_at;
    delete anonymized.created_at;
    delete anonymized.updated_at;
    return anonymized;
  });
};

/**
 * Generate AI-powered comprehensive analysis
 * No length limit - analysis can be as detailed as needed
 */
const generateAIAnalysis = async (currentFeedbacks, previousFeedbacks, periodFrom, periodTo) => {
  const aiEnabled = initializeAI();
  if (!aiEnabled || !model) {
    return { success: false, reason: "AI not available" };
  }

  try {
    const anonymizedCurrent = anonymizeFeedback(currentFeedbacks);
    const anonymizedPrevious = anonymizeFeedback(previousFeedbacks);

    const prompt = `You are an expert restaurant business analyst. Analyze the following customer feedback data and provide a comprehensive, actionable business report.

PERIOD: ${periodFrom || "All time"} to ${periodTo || "Present"}

CURRENT FEEDBACK (${anonymizedCurrent.length} entries):
${JSON.stringify(anonymizedCurrent, null, 2)}

PREVIOUS FEEDBACK (${anonymizedPrevious.length} entries):
${JSON.stringify(anonymizedPrevious, null, 2)}

Please provide a detailed analysis covering:
1. Overall customer sentiment and satisfaction trends
2. Specific areas of strength and weakness (staff, food, atmosphere, cleanliness, app experience, value)
3. Recurring themes and patterns in customer comments
4. Actionable business recommendations to improve customer satisfaction and profitability
5. Specific issues that need immediate attention
6. Positive trends to continue and build upon

Format your response as a structured analysis with clear sections. Be specific and practical in your recommendations. Focus on business impact and customer satisfaction. Do not use markdown formatting - use plain text with clear section breaks.

The analysis should be as detailed as needed to provide valuable insights. There is no length limit.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return { success: true, analysis: text };
  } catch (error) {
    console.error("AI analysis failed:", error.message);
    return { success: false, reason: error.message };
  }
};

/**
 * Generate AI-powered actionable findings
 */
const generateAIFindings = async (currentFeedbacks, previousFeedbacks) => {
  const aiEnabled = initializeAI();
  if (!aiEnabled || !model) {
    return { success: false, reason: "AI not available" };
  }

  try {
    const anonymizedCurrent = anonymizeFeedback(currentFeedbacks);

    const prompt = `You are a restaurant business consultant. Analyze the following customer feedback and generate 3-5 specific, actionable business recommendations.

FEEDBACK DATA:
${JSON.stringify(anonymizedCurrent, null, 2)}

For each recommendation, provide:
1. A clear, specific title (under 10 words)
2. A detailed description of the issue and recommended action (2-3 sentences)
3. Priority level (high/medium/low)

Focus on:
- Customer satisfaction improvements
- Profitability enhancements
- Operational efficiency
- Specific issues mentioned in feedback

Format as JSON array with structure: [{title, description, priority}]. Do not include markdown formatting.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { success: false, reason: "Invalid AI response format" };
    }

    const findings = JSON.parse(jsonMatch[0]);
    return { success: true, findings };
  } catch (error) {
    console.error("AI findings generation failed:", error.message);
    return { success: false, reason: error.message };
  }
};

module.exports = {
  generateAIAnalysis,
  generateAIFindings,
  initializeAI,
};
