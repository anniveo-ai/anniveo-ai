
const json = (data, status, headers) =>
  new Response(JSON.stringify(data), {
    status,
    headers
  });

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
    "HMAC",
    secret,
    encoder.encode(token)
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
      "HMAC",
      key,
      encoder.encode(dataCheck)
    )
  );

  const expected = Array.from(signature)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return null;
  }

  let mismatch = 0;
  const actual = hash.toLowerCase();

  for (let i = 0; i < 64; i++) {
    mismatch |= expected.charCodeAt(i) ^
      actual.charCodeAt(i);
  }

  if (mismatch !== 0) return null;

  try {
    const user = JSON.parse(
      params.get("user") || "null"
    );

    return user &&
      Number.isSafeInteger(user.id) &&
      user.id > 0
      ? String(user.id)
      : null;
  } catch {
    return null;
  }
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function cleanHistory(items, limit = 12) {
  if (!Array.isArray(items)) return [];

  return items.slice(-limit).filter(item =>
    item &&
    ["user", "assistant"].includes(item.role) &&
    typeof item.content === "string" &&
    item.content.length <= 4000
  ).map(item => ({
    role: item.role,
    content: item.content
  }));
}

// Диагностика скорости и ошибок Pollinations.
async function askAI(messages, apiKey, mode) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      12000
    );

    try {
      console.log("ANNIVEO AI request", {
        mode,
        attempt,
        historyCount: messages.length - 2
      });

      const response = await fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
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
        }
      );

      if (!response.ok) {
        const error = new Error(
          "Pollinations HTTP " + response.status
        );

        error.retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        throw error;
      }

      const data = await response.json();
      const answer =
        data.choices?.[0]?.message?.content;

      if (
        typeof answer !== "string" ||
        !answer.trim()
      ) {
        throw new Error("ИИ вернул пустой ответ");
      }

      console.log("ANNIVEO AI success", {
        mode,
        attempt,
        durationMs: Date.now() - started
      });

      return answer;

    } catch (error) {
      lastError = error;

      console.error("ANNIVEO AI failure", {
        mode,
        attempt,
        durationMs: Date.now() - started,
        errorName: error.name,
        errorMessage: error.message
      });

      const retryable =
        error.retryable ||
        error.name === "AbortError" ||
        error instanceof TypeError;

      if (!retryable || attempt === 2) {
        throw error;
      }

      await sleep(250);

    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ||
    new Error("Сервис ИИ недоступен");
}

async function getHistory(db, userId, limit = 40) {
  const rows = await db.prepare(
    "SELECT role, content FROM chat_messages " +
    "WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(userId, limit).all();

  return (rows.results || []).reverse();
}

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin":
        "https://anniveo-ai-app.pages.dev",
      "Access-Control-Allow-Methods":
        "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type",
      "Content-Type":
        "application/json; charset=utf-8"
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
          {
            error:
              "Открой ANNIVEO AI через Telegram"
          },
          401,
          headers
        );
      }

      if (action === "history") {
        if (!env.DB) {
          return json(
            {
              error:
                "База данных не подключена"
            },
            503,
            headers
          );
        }

        const messages = await getHistory(
          env.DB,
          userId,
          40
        );

        return json(
          { messages },
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
          {
            error:
              "База данных не подключена"
          },
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

      const message = String(
        body.message || ""
      ).trim();

      if (!message || message.length > 4000) {
        return json(
          {
            error:
              "Недопустимая длина сообщения"
          },
          400,
          headers
        );
      }

      let history = [];
      let requestId = null;

      if (anonymous) {
        // Анонимный чат не читает D1.
        history = cleanHistory(
          body.messages,
          12
        );

      } else {
        requestId = String(
          body.requestId || ""
        );

        if (
          !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)
        ) {
          return json(
            {
              error:
                "Требуется идентификатор запроса"
            },
            400,
            headers
          );
        }

        const inserted = await env.DB.prepare(
          "INSERT OR IGNORE INTO chat_requests " +
          "(user_id, request_id, status) " +
          "VALUES (?, ?, 'processing')"
        ).bind(userId, requestId).run();

        if (!inserted.meta?.changes) {
          const existing = await env.DB.prepare(
            "SELECT status, reply " +
            "FROM chat_requests " +
            "WHERE user_id = ? AND request_id = ?"
          ).bind(userId, requestId).first();

          if (
            existing?.status === "done" &&
            typeof existing.reply === "string"
          ) {
            return json(
              { reply: existing.reply },
              200,
              headers
            );
          }

          return json(
            {
              error:
                "Запрос ещё обрабатывается",
              processing: true
            },
            202,
            headers
          );
        }

        history = await getHistory(
          env.DB,
          userId,
          12
        );
      }

      const messages = [
        {
          role: "system",
          content:
            "Ты ANNIVEO AI — полезный, умный " +
            "и дружелюбный ИИ-помощник. " +
            "Отвечай на русском языке, если " +
            "пользователь не просит другой язык. " +
            "Отвечай понятно и по существу."
        },
        ...history,
        {
          role: "user",
          content: message
        }
      ];

      let answer;

      try {
        answer = await askAI(
          messages,
          env.POLLINATIONS_API_KEY,
          anonymous ? "anonymous" : "normal"
        );
      } catch(error) {
        if (!anonymous && requestId) {
          await env.DB.prepare(
            "DELETE FROM chat_requests " +
            "WHERE user_id = ? " +
            "AND request_id = ? " +
            "AND status = 'processing'"
          ).bind(userId, requestId).run();
        }

        throw error;
      }

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
          ).bind(userId, answer),

          env.DB.prepare(
            "UPDATE chat_requests " +
            "SET status = 'done', reply = ? " +
            "WHERE user_id = ? AND request_id = ?"
          ).bind(answer, userId, requestId)
        ]);
      }

      return json(
        { reply: answer },
        200,
        headers
      );

    } catch(error) {
      console.error(
        "ANNIVEO AI error:",
        error.name,
        error.message
      );

      return json(
        {
          error:
            "Временная ошибка сервера. " +
            "Попробуй ещё раз."
        },
        503,
        headers
      );
    }
  }
};
