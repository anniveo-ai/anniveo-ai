
export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "https://anniveo-ai-app.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
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
          JSON.stringify({ error: "Некорректное сообщение" }),
          { status: 400, headers }
        );
      }

      const response = await fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.POLLINATIONS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openai",
            messages: [
  {
    role: "system",
    content: "Ты ANNIVEO AI, дружелюбный интеллектуальный помощник. Отвечай на языке пользователя."
  },
  ...history.slice(0, -1),
  {
    role: "user",
    content: message
  }
]
          })
        }
      );

      if (!response.ok) {
        throw new Error("AI provider error: " + response.status);
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content;

      if (typeof answer !== "string") {
        throw new Error("Empty AI response");
      }

      return new Response(
        JSON.stringify({ answer }),
        { headers }
      );
    } catch (error) {
      console.error("ANNIVEO AI:", error.message);
      return new Response(
        JSON.stringify({
          error: "Не удалось получить ответ ИИ"
        }),
        { status: 502, headers }
      );
    }
  }
};
