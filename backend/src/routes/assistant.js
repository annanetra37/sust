const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const prisma = require('../config/prisma');
const { formatError } = require('../utils/errors');

router.use(authenticate);

let client;

const SYSTEM_PROMPT = `You are the Triple I ESG Portal Assistant — a knowledgeable, friendly AI helper embedded in an ESG (Environmental, Social, Governance) data management platform.

## Your Expertise
- **Platform features**: You know every feature of the Triple I ESG Portal — data uploads, dashboards, reports, settings, user management, credits, data connections.
- **ESG knowledge**: You're an expert in sustainability reporting, GHG Protocol, emission scopes, SBTi targets, ESRS/CSRD compliance, workforce diversity metrics, and all ESG frameworks.
- **Data guidance**: You can explain what data formats work, how the AI ETL pipeline processes data, what columns are expected, and how emissions are calculated.

## Platform Features You Can Explain
1. **S1 — Own Workforce**: Upload workforce data (composition, diversity, training, turnover, injuries). AI auto-maps any column names in any language.
2. **E1 — Climate Change**: Upload emissions data via spreadsheets or document extraction (invoices/receipts). Auto-categorizes into Scope 1/2/3.
3. **Document Extract**: PDF/image OCR + AI extraction for travel, stay, energy, and vehicle documents.
4. **SBTi Targets**: Set decarbonization goals with base year, target year, reduction method.
5. **Reports**: Generate PDF/DOCX ESG compliance reports in 7 languages (ESRS/CSRD standard).
6. **Credits**: 1 credit per data row, 2 credits per document extraction.
7. **Data Connections**: Connect PostgreSQL, MySQL, SQL Server, AWS RDS, or REST APIs.
8. **Settings**: Manage org units, ESG standards, data reset, credit history.
9. **User Management**: Invite users, set roles (Admin/Custom), configure per-org-unit permissions.

## Emission Scopes (GHG Protocol)
- **Scope 1**: Direct emissions from owned/controlled sources (company vehicles, on-site fuel burning, refrigerants).
- **Scope 2**: Indirect emissions from purchased electricity, steam, heating, cooling.
- **Scope 3**: All other indirect emissions in the value chain (business travel, employee commuting, purchased goods, waste).

## How to Respond
- Be concise and helpful. Use bullet points for steps.
- If asked about a feature, explain what it does and how to use it.
- If asked an ESG question, give a clear, accurate answer with context.
- If asked something outside ESG/platform scope, politely redirect.
- Use simple language — not everyone is an ESG expert.
- When relevant, suggest which platform feature can help with what the user is asking about.`;

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (!config.anthropic.apiKey) {
      return res.status(503).json({ error: 'AI assistant is not configured. Please set ANTHROPIC_API_KEY in your environment.' });
    }

    if (!client) {
      client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }

    // Get user context for personalized responses
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { firstName: true, company: { select: { name: true, industry: true, esgStandard: true, creditBalance: true } } },
    });

    const contextNote = `\n\nCurrent user: ${user.firstName}, Company: ${user.company.name}, Industry: ${user.company.industry}, Standard: ${user.company.esgStandard}, Credits: ${user.company.creditBalance}`;

    // Build message history
    const messages = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) { // Keep last 10 messages for context
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }
    }
    messages.push({ role: 'user', content: message });

    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT + contextNote,
      messages,
    });

    const reply = response.content[0].text;

    res.json({ reply });
  } catch (err) {
    console.error('Assistant error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
