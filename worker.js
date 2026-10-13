const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers });

async function verifyTelegram(initData, token) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !authDate ||
      Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  const dataCheck = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const encoder = new TextEncoder();
  const secret = await crypto.subtle.importKey(
    "raw", encoder.encode("WebAppData"), 
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const secretBytes = await crypto.subtle.sign(
    "HMAC", secret, encoder.encode(token)
  );
  const key = await crypto.subtle.importKey(
    "raw", secretBytes,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(dataCheck))
  );
  const expected = Array.from(signature)
    .map(b => b.toString(16).padStart(2, "0")).join("");
  if (!/^[a-f0-9]{64}$/i.test(hash)) return null;
  let mismatch = 0;
  for (let i = 0; i < 64; i++) {
    mismatch |= expected.charCodeAt(i) ^ hash.toLowerCase().charCodeAt(i);
  }
  if (mismatch !== 0) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && Number.isSafeInteger(user.id) && user.id > 0
      ? String(user.id) : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "https://anniveo-ai-app.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS")
      return new Response(null, { headers });

    if (request.method !== "POST")
      return json({ status: "ANNIVEO AI работает" }, 200, headers);

    try {
      const body = await request.json();
      const action = body.action || "chat";
      const initData = String(body.initData || "");
      const userId = await verifyTelegram(initData, env.TELEGRAM_BOT_TOKEN);
      if (!userId)
        return json({ error: "Открой ANNIVEO AI через Telegram" }, 401, headers);
      if (!env.DB)
        return json({ error: "База данных не подключена" }, 503, headers);

      if (action === "history") {
        const rows = await env.DB.prepare(
          "SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 40"
        ).bind(userId).all();
        return json({ messages: (rows.results || []).reverse() }, 200, headers);
      }

      if (action !== "chat")
        return json({ error: "Неизвестное действие" }, 400, headers);

      if (!env.POLLINATIONS_API_KEY)
        throw new Error("API key not configured");

      const message = String(body.message || "").trim();
      if (!message || message.length > 4000)
        return json({ error: "Недопустимая длина сообщения" }, 400, headers);

      const rows = await env.DB.prepare(
        "SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 20"
      ).bind(userId).all();

      const history = (rows.results || []).reverse().filter(item =>
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      );

      const messages = [
        {
          role: "system",
          content: "Ты ANNIVEO AI — полезный, умный и дружелюбный ИИ-помощник. Отвечай на русском языке, если пользователь не просит другой язык. Отвечай понятно и по существу."
        },
        ...history,
        { role: "user", content: message }
      ];

      const response = await fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.POLLINATIONS_API_KEY,
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
      if (!response.ok)
        return json({
          error: data.error?.message || "Ошибка подключения к ИИ"
        }, response.status, headers);

      const answer = data.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim())
        throw new Error("ИИ не вернул ответ");

      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'user', ?)"
        ).bind(userId, message),
        env.DB.prepare(
          "INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'assistant', ?)"
        ).bind(userId, answer)
      ]);

      return json({ reply: answer }, 200, headers);
    } catch (error) {
      console.error("ANNIVEO AI error:", error);
      return json({ error: "Ошибка обработки запроса" }, 500, headers);
    }
  }
};