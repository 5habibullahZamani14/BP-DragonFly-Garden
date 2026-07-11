const Groq = require("groq-sdk");

let groqClient = null;

const initializeAI = () => {
  if (!process.env.GROQ_API_KEY) {
    console.warn("GROQ_API_KEY not set. AI analysis will fall back to rule-based.");
    return false;
  }
  try {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return true;
  } catch (error) {
    console.error("Failed to initialize Groq AI:", error.message);
    return false;
  }
};

const anonymizeFeedback = (feedbacks) => {
  return feedbacks.map((fb) => {
    const anonymized = { ...fb };
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

const generateAIAnalysis = async (currentFeedbacks, previousFeedbacks, periodFrom, periodTo) => {
  const aiEnabled = initializeAI();
  if (!aiEnabled || !groqClient) {
    return { success: false, reason: "AI not available" };
  }

  try {
    const anonymizedCurrent = anonymizeFeedback(currentFeedbacks);
    const anonymizedPrevious = anonymizeFeedback(previousFeedbacks);

    const prompt = `You are a restaurant business analyst. Analyze the feedback data below and write a concise, scannable report.

PERIOD: ${periodFrom || "All time"} to ${periodTo || "Present"}

CURRENT FEEDBACK (${anonymizedCurrent.length} entries):
${JSON.stringify(anonymizedCurrent, null, 2)}

PREVIOUS FEEDBACK (${anonymizedPrevious.length} entries):
${JSON.stringify(anonymizedPrevious, null, 2)}

Cover these points (keep each very short):
1. Overall sentiment — one sentence
2. Top strength — one bullet
3. Top weakness — one bullet
4. 2-3 key themes from comments — bullets
5. 1-2 immediate actions — bullets
6. 1-2 positive trends — bullets

FORMATTING RULES:
- Start with a one-line summary in **bold**
- Use short bullet lists (not paragraphs)
- Each bullet = maximum 1-2 lines
- Use **bold** only for numbers and scores
- Use ### for section headings
- No images, no tables, no long paragraphs
- Total length: 15-25 lines maximum
- Think: executive dashboard, not a report`;

    const result = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.choices[0]?.message?.content || "";
    return { success: true, analysis: text };
  } catch (error) {
    console.error("AI analysis failed:", error.message);
    return { success: false, reason: error.message };
  }
};

const generateAIFindings = async (currentFeedbacks, previousFeedbacks) => {
  const aiEnabled = initializeAI();
  if (!aiEnabled || !groqClient) {
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

Format as JSON array with structure: [{title, description, priority}]. Return only the JSON array.`;

    const result = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.choices[0]?.message?.content || "";

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

const generateChatResponse = async (messages, contextData) => {
  const aiEnabled = initializeAI();
  if (!aiEnabled || !groqClient) {
    return { success: false, reason: "AI not available" };
  }

  try {
    const systemPrompt = `You are DragonBot, an AI assistant for the BP Dragonfly Garden Cafe Ordering and Management System. You have access to the restaurant's live data below. Answer questions helpfully based on this data.

RESTAURANT CONTEXT (current state):
${JSON.stringify(contextData, null, 2)}

Guidelines:
- Answer based on the provided data only. If the data doesn't contain what you need, say so.
- Use markdown formatting for readable responses: **bold** for key numbers, bullet lists, short paragraphs.
- Never reveal manager passwords, API keys, QR codes, or view tokens.
- Be concise but thorough. Think step by step.
- If asked about trends or analysis, note that your data is a snapshot of the current state.
- Do NOT include images, diagrams, or visual elements in your response. Text and tables only.`;

    const result = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });

    const text = result.choices[0]?.message?.content || "";
    return { success: true, response: text };
  } catch (error) {
    console.error("AI chat failed:", error.message);
    return { success: false, reason: error.message };
  }
};

module.exports = {
  generateAIAnalysis,
  generateAIFindings,
  generateChatResponse,
  initializeAI,
};
