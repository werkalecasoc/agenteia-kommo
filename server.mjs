import "dotenv/config";
import express from "express";
import kommo from "./src/kommo.mjs";
import openai from "./src/openai.mjs";
import { handleWebhook, handleSalesbotRequest } from "./src/webhook.mjs";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

kommo.init();
openai.init();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "agenteia-kommo" });
});

// Webhook de Kommo: recibe el mensaje, procesa con OpenAI, guarda la respuesta
app.post("/webhook/kommo", async (req, res) => {
  console.log("[Webhook] Recibido:", JSON.stringify(req.body).substring(0, 300));
  res.status(200).json({ ok: true });

  try {
    await handleWebhook(req.body);
  } catch (err) {
    console.error("[Webhook] Error:", err);
  }
});

// Salesbot: devuelve la respuesta pendiente para que el Salesbot la envíe por chat
app.all("/salesbot", async (req, res) => {
  const params = { ...req.query, ...req.body };
  console.log("[Salesbot] Recibido:", JSON.stringify(params).substring(0, 300));

  try {
    const result = await handleSalesbotRequest(params);
    console.log("[Salesbot] Respuesta:", result.text?.substring(0, 100));
    res.json(result);
  } catch (err) {
    console.error("[Salesbot] Error:", err);
    res.json({ text: "" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Agente IA Kommo corriendo en puerto ${PORT}`);
});
