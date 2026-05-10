import "dotenv/config";
import express from "express";
import kommo from "./src/kommo.mjs";
import openai from "./src/openai.mjs";
import { handleIncomingMessage } from "./src/webhook.mjs";

const app = express();
app.use(express.json());

kommo.init();
openai.init();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "agenteia-kommo" });
});

app.post("/webhook/kommo", async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    await handleIncomingMessage(req.body);
  } catch (err) {
    console.error("[Webhook] Error procesando mensaje:", err);
  }
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Falta code" });

  try {
    const tokenRes = await fetch(
      `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/oauth2/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.KOMMO_CLIENT_ID,
          client_secret: process.env.KOMMO_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.KOMMO_REDIRECT_URI,
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(400).json({ error: "Token exchange failed", details: err });
    }

    const tokens = await tokenRes.json();
    console.log("\n=== TOKENS OBTENIDOS ===");
    console.log("ACCESS_TOKEN:", tokens.access_token);
    console.log("REFRESH_TOKEN:", tokens.refresh_token);
    console.log("========================\n");
    console.log("Copiá estos tokens a tus variables de entorno en Railway.");

    res.json({
      message: "Autenticación exitosa. Copiá los tokens de la consola a tus variables de entorno.",
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    console.error("[Auth] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Agente IA Kommo corriendo en puerto ${PORT}`);
});
