import "dotenv/config";
import express from "express";
import kommo from "./src/kommo.mjs";
import openai from "./src/openai.mjs";
import { handleSalesbotRequest } from "./src/webhook.mjs";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

kommo.init();
openai.init();

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "agenteia-kommo" });
});

app.all("/salesbot", async (req, res) => {
  const params = { ...req.query, ...req.body };
  console.log("[Salesbot] Recibido:", JSON.stringify(params).substring(0, 500));

  try {
    const result = await handleSalesbotRequest(params);
    console.log("[Salesbot] Respuesta:", result.text?.substring(0, 100));
    res.json(result);
  } catch (err) {
    console.error("[Salesbot] Error:", err);
    res.json({ text: "Disculpá, hubo un error. ¿Podés repetir tu consulta?" });
  }
});

// Endpoint de debug para ver qué manda el Salesbot
app.all("/debug", async (req, res) => {
  const data = {
    method: req.method,
    query: req.query,
    body: req.body,
    headers: req.headers,
  };
  console.log("[Debug]", JSON.stringify(data, null, 2));
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Agente IA Kommo corriendo en puerto ${PORT}`);
});
