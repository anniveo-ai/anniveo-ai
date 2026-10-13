
export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "https://anniveo-ai-app.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ status: "ANNIVEO AI работает" }),
        { headers }
      );
    }

    try {
      if (!env.POLLINATIONS_API_KEY) {
        throw new Error("API key not configured");
      }

      const body = await request.json();
      const message = String(body.message || "").trim();

      const history = Array.isArray(body.messages)
        ? body.messages.slice(-20).filter(item =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string" &&
            item.content.length <= 4000
          )
        : [];

      if (!message || message.length > 4000) {
        return new Response(
          JSON.stringify({
            error: "Сообщение пустое или слишком длинное"
          }),
          { status: 400, headers }
        );
      }

      const messages = [
        {
          role: "system",
          content:
            "Ты ANNIVEO AI — полезный, умный и дружелюбный ИИ-помощник. Отвечай на русском языке, если пользователь не просит другой язык. Отвечай понятно и по существу."
        },
        ...history,
        {
          role: "user",
          content: message
        }
      ];

      const response = await fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.POLLINATIONS_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openai/gpt-5.4-nano",
            messages,
            stream: false
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: data.error?.message ||
              "Ошибка подключения к ИИ",
          }),
          { status: response.status, headers }
        );
      }

      const answer =
        data.choices?.[0]?.message?.content;

      if (!answer) {
        throw new Error("ИИ не вернул ответ");
      }

      return new Response(
        JSON.stringify({ reply: answer }),
        { status: 200, headers }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message || "Внутренняя ошибка сервера"
        }),
        { status: 500, headers }
      );
    }
  }
};
