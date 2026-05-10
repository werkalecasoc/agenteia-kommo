import OpenAI from "openai";

let client = null;

function init() {
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `Eres un asistente comercial amable y profesional que trabaja para la empresa.
Tu objetivo es responder consultas de clientes potenciales, resolver dudas y guiarlos en el proceso de compra.

REGLAS:
- Sé conciso y claro. No uses más de 3-4 oraciones por respuesta.
- Responde en el mismo idioma que el cliente.
- Si no sabés algo, decilo honestamente y ofrecé derivar con un humano.
- Nunca inventes información sobre precios, disponibilidad o características que no conozcas.

ACCIONES DISPONIBLES:
Podés indicar acciones a realizar en el CRM incluyendo un bloque JSON al final de tu respuesta.
Solo incluí el bloque si es necesario. El bloque debe estar en una línea separada con el prefijo "###ACTION:".

Acciones posibles:
1. Mover lead a otra etapa:
###ACTION:{"action":"move_stage","pipeline_id":NUMBER,"status_id":NUMBER}

2. Actualizar campo del lead:
###ACTION:{"action":"update_field","field_id":NUMBER,"value":"texto"}

3. Derivar a humano (quitar tag Chatbot):
###ACTION:{"action":"handoff"}

Usa "handoff" cuando el cliente pida hablar con una persona o cuando no puedas resolver su consulta.`;

async function getResponse(conversationHistory, leadContext) {
  const systemMessage = SYSTEM_PROMPT + (leadContext ? `\n\nCONTEXTO DEL LEAD:\n${leadContext}` : "");

  const messages = [
    { role: "system", content: systemMessage },
    ...conversationHistory,
  ];

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 500,
    temperature: 0.7,
  });

  const fullResponse = completion.choices[0].message.content;
  return parseResponse(fullResponse);
}

function parseResponse(text) {
  const lines = text.split("\n");
  const actionLines = lines.filter((l) => l.startsWith("###ACTION:"));
  const messageParts = lines.filter((l) => !l.startsWith("###ACTION:"));

  const actions = actionLines.map((l) => {
    try {
      return JSON.parse(l.replace("###ACTION:", ""));
    } catch {
      return null;
    }
  }).filter(Boolean);

  return {
    message: messageParts.join("\n").trim(),
    actions,
  };
}

export default { init, getResponse };
