import "dotenv/config";
import express from "express";
import kommo from "./src/kommo.mjs";
import openai from "./src/openai.mjs";
import { handleIncomingMessage } from "./src/webhook.mjs";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

kommo.init();
openai.init();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "agenteia-kommo" });
});

app.post("/webhook/kommo", async (req, res) => {
  console.log("[Webhook] Recibido:", JSON.stringify(req.body).substring(0, 500));
  res.status(200).json({ ok: true });

  try {
    await handleIncomingMessage(req.body);
  } catch (err) {
    console.error("[Webhook] Error procesando mensaje:", err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Agente IA Kommo corriendo en puerto ${PORT}`);
});
