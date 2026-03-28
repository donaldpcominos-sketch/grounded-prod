export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const books = Array.isArray(body.books) ? body.books : [];
    const mode = body.mode === 'prompt' ? 'prompt' : 'history';
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim() : '';

    const existingTitles = new Set(
      books
        .map(book => (book?.title || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const positiveSignals = books
      .filter(book => (
        book &&
        book.status === 'finished' &&
        !book.isArchived
      ))
      .slice(0, 3)
      .map(book => ({
        title: book.title || '',
        author: book.author || '',
        rating: book.rating ?? null,
        notes: (book.notes || '').slice(0, 60),
      }));

    const negativeSignals = books
      .filter(book => (
        book &&
        book.status === 'stopped' &&
        !book.isArchived
      ))
      .slice(0, 2)
      .map(book => ({
        title: book.title || '',
        author: book.author || '',
        reason: (book.feedbackReason || '').slice(0, 50),
        notes: (book.feedbackNotes || '').slice(0, 60),
      }));

    if (mode === 'history' && positiveSignals.length === 0 && negativeSignals.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          signals: [],
          recommendations: [],
        }),
      };
    }

    if (mode === 'prompt' && !userPrompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Please enter a prompt first.',
        }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Missing GEMINI_API_KEY',
        }),
      };
    }

    const historyContext = JSON.stringify({
      positiveSignals,
      negativeSignals,
    });

const prompt = mode === 'prompt'
  ? `
Return valid JSON only.

Shape:
{
  "signals": ["...", "..."],
  "recommendations": [
    {
      "title": "...",
      "author": "...",
      "reason": "..."
    }
  ]
}

Rules:
- Maximum 2 signals
- Maximum 2 recommendations
- Keep every field short
- Keep reasons to one short sentence
- No markdown
- No code fences
- No text outside JSON
- Treat the user's prompt as the primary instruction
- Use reading history only as a light secondary input
- If the user's prompt conflicts with reading history, follow the user's prompt
- If the user's prompt is vague, playful, aesthetic, or theme-based, respond to it directly instead of defaulting to reading history
- Do not infer dislikes unless negativeSignals contains actual stopped books
- If negativeSignals is empty, only describe positive preferences or uncertainty
- Do not recommend books already in the user's library
- If the prompt is too vague to map confidently to books, make your best interpretation based on the prompt words themselves

User prompt:
${userPrompt}

Reading history:
${historyContext}
`.trim()
      : `
Return valid JSON only.

Shape:
{
  "signals": ["...", "..."],
  "recommendations": [
    {
      "title": "...",
      "author": "...",
      "reason": "..."
    }
  ]
}

Rules:
- Maximum 2 signals
- Maximum 2 recommendations
- Keep every field short
- Keep reasons to one short sentence
- No markdown
- No code fences
- No text outside JSON
- Use positive and negative reading signals
- Do not infer dislikes unless negativeSignals contains actual stopped books
- If negativeSignals is empty, only describe positive preferences or uncertainty
- Do not recommend books already in the user's library

Reading history:
${historyContext}
`.trim();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini request failed',
          details: errorText,
        }),
      };
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data?.candidates?.[0]?.finishReason || '';

    if (!rawText) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini returned empty content',
          finishReason,
        }),
      };
    }

    if (finishReason && finishReason !== 'STOP') {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini response was incomplete',
          finishReason,
        }),
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini returned invalid JSON',
          details: error.message,
        }),
      };
    }

    const normalized = {
      signals: Array.isArray(parsed.signals)
        ? parsed.signals
            .filter(item => typeof item === 'string' && item.trim())
            .slice(0, 2)
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
            .map(rec => ({
              title: typeof rec?.title === 'string' ? rec.title.trim() : '',
              author: typeof rec?.author === 'string' ? rec.author.trim() : '',
              reason: typeof rec?.reason === 'string' ? rec.reason.trim() : '',
            }))
            .filter(rec => rec.title && !existingTitles.has(rec.title.toLowerCase()))
            .slice(0, 2)
        : [],
    };

    return {
      statusCode: 200,
      body: JSON.stringify(normalized),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server error',
        details: error.message,
      }),
    };
  }
}