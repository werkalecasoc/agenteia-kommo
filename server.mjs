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

app.post("/salesbot", async (req, res) => {
  console.log("[Salesbot] Recibido:", JSON.stringify(req.body).substring(0, 500));

  try {
    const result = await handleSalesbotRequest(req.body);
    console.log("[Salesbot] Respuesta:", result.text?.substring(0, 100));
    res.json(result);
  } catch (err) {
    console.error("[Salesbot] Error:", err);
    res.json({ text: "Disculpá, hubo un error. ¿Podés repetir tu consulta?" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Agente IA Kommo corriendo en puerto ${PORT}`);
});
