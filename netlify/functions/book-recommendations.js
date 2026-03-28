export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const books = Array.isArray(body.books) ? body.books : [];

    const existingTitles = new Set(
      books
        .map(book => (book?.title || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const finishedBooks = books
      .filter(book => book && book.status === 'finished' && !book.isArchived)
      .slice(0, 8)
      .map(book => ({
        title: book.title || '',
        author: book.author || '',
        rating: book.rating ?? null,
        notes: (book.notes || '').slice(0, 200),
      }));

    if (finishedBooks.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          signals: [],
          recommendations: [],
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

    const prompt = `
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
- Max 2 signals
- Max 2 recommendations
- Each signal must be short
- Each reason must be short
- No markdown
- No code fences
- No text outside JSON
- Do not recommend any book the user has already read or already added
- Be conservative if the reading history is thin

Finished books:
${JSON.stringify(finishedBooks)}
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

    if (finishReason === 'MAX_TOKENS') {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini response was truncated',
          finishReason,
          raw: rawText,
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
          finishReason,
          raw: rawText,
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