
const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers });

async function verifyTelegram(initData, token) {
  if (!initData || !token) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));

  if (
    !hash ||
    !authDate ||
    Math.abs(Date.now() / 1000 - authDate) > 86400
  ) return null;

  const dataCheck = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const encoder = new TextEncoder();

  const secret = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const secretBytes = await crypto.subtle.sign(
    "HMAC", secret, encoder.encode(token)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC", key, encoder.encode(dataCheck)
    )
  );

  const expected = Array.from(signature)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (!/^[a-f0-9]{64}$/i.test(hash)) return null;

  let mismatch = 0;
  const actual = hash.toLowerCase();

  for (let i = 0; i < 64; i++) {
    mismatch |= expected.charCodeAt(i) ^
      actual.charCodeAt(i);
  }

  if (mismatch !== 0) return null;

  try {
    const user = JSON.parse(params.get("user") || "null");

    return user &&
      Number.isSafeInteger(user.id) &&
      user.id > 0
      ? String(user.id)
      : null;
  } catch {
    return null;
  }
}

const wait = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function askAI(messages, apiKey) {
  const url =
    "https://gen.pollinations.ai/v1/chat/completions";

  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      18000
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-5.4-nano",
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        if (retryable && attempt === 0) {
          lastError = new Error(
            "Сервис ИИ временно недоступен"
          );
          continue;
        }

        throw new Error(
          response.status === 429
            ? "Сервис ИИ перегружен. Попробуй позже."
            : "Ошибка сервиса ИИ: " + response.status
        );
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content;

      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("ИИ вернул пустой ответ");
      }

      return answer;

    } catch (error) {
      lastError = error;

      const retryable =
        error.name === "AbortError" ||
        error instanceof TypeError;

      if (!retryable || attempt === 1) {
        throw error;
      }

    } finally {
      clearTimeout(timeout);
    }

    if (attempt === 0) await wait(400);
  }

  throw lastError || new Error("Сервис ИИ недоступен");
}

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin":
        "https://anniveo-ai-app.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return json(
        { status: "ANNIVEO AI работает" },
        200,
        headers
      );
    }

    try {
      const body = await request.json();
      const action = body.action || "chat";

      const userId = await verifyTelegram(
        String(body.initData || ""),
        env.TELEGRAM_BOT_TOKEN
      );

      if (!userId) {
        return json(
          { error: "Открой ANNIVEO AI через Telegram" },
          401,
          headers
        );
      }

      if (action === "history") {
        if (!env.DB) {
          return json(
            { error: "База данных не подключена" },
            503,
            headers
          );
        }

        const rows = await env.DB.prepare(
          "SELECT role, content FROM chat_messages " +
          "WHERE user_id = ? ORDER BY id DESC LIMIT 40"
        ).bind(userId).all();

        return json(
          { messages: (rows.results || []).reverse() },
          200,
          headers
        );
      }

      const anonymous = action === "anonymous";

      if (!anonymous && action !== "chat") {
        return json(
          { error: "Неизвестное действие" },
          400,
          headers
        );
      }

      if (!anonymous && !env.DB) {
        return json(
          { error: "База данных не подключена" },
          503,
          headers
        );
      }

      if (!env.POLLINATIONS_API_KEY) {
        return json(
          { error: "Ключ ИИ не настроен" },
          503,
          headers
        );
      }

      const message = String(body.message || "").trim();

      if (!message || message.length > 4000) {
        return json(
          { error: "Недопустимая длина сообщения" },
          400,
          headers
        );
      }

      let history = [];

      if (anonymous) {
        history = Array.isArray(body.messages)
          ? body.messages.slice(-12).filter(item =>
              item &&
              ["user", "assistant"].includes(item.role) &&
              typeof item.content === "string" &&
              item.content.length <= 4000
            ).map(item => ({
              role: item.role,
              content: item.content
            }))
          : [];
      } else {
        const rows = await env.DB.prepare(
          "SELECT role, content FROM chat_messages " +
          "WHERE user_id = ? ORDER BY id DESC LIMIT 12"
        ).bind(userId).all();

        history = (rows.results || [])
          .reverse()
          .filter(item =>
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string"
          );
      }

      const messages = [
        {
          role: "system",
          content:
            "Ты ANNIVEO AI — полезный, умный и " +
            "дружелюбный ИИ-помощник. " +
            "Отвечай на русском языке, если " +
            "пользователь не просит другой язык. " +
            "Отвечай понятно и по существу."
        },
        ...history,
        { role: "user", content: message }
      ];

      const answer = await askAI(
        messages,
        env.POLLINATIONS_API_KEY
      );

      if (!anonymous) {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO chat_messages " +
            "(user_id, role, content) " +
            "VALUES (?, 'user', ?)"
          ).bind(userId, message),

          env.DB.prepare(
            "INSERT INTO chat_messages " +
            "(user_id, role, content) " +
            "VALUES (?, 'assistant', ?)"
          ).bind(userId, answer)
        ]);
      }

      return json({ reply: answer }, 200, headers);

    } catch (error) {
      console.error("ANNIVEO AI error:", error);

      const message =
        error.name === "AbortError"
          ? "ИИ отвечает слишком долго. Попробуй ещё раз."
          : error.message?.startsWith("Ошибка сервиса ИИ") ||
            error.message?.startsWith("Сервис ИИ") ||
            error.message === "ИИ вернул пустой ответ"
          ? error.message
          : "Временная ошибка. Попробуй ещё раз.";

      return json(
        { error: message },
        503,
        headers
      );
    }
  }
};
