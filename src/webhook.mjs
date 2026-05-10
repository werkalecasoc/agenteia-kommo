import kommo from "./kommo.mjs";
import openai from "./openai.mjs";

const CHATBOT_TAG = () => process.env.CHATBOT_TAG || "Chatbot";

export async function handleSalesbotRequest(payload) {
  const leadId = payload.lead_id || payload.leads_id;
  const messageText = payload.message || payload.text;

  if (!leadId || !messageText) {
    console.log("[Salesbot] Faltan datos: lead_id o message");
    return { text: "" };
  }

  const hasChatbotTag = await kommo.hasTag(leadId, CHATBOT_TAG());
  if (!hasChatbotTag) {
    console.log(`[Salesbot] Lead ${leadId} no tiene tag "${CHATBOT_TAG()}", ignorando`);
    return { text: "" };
  }

  console.log(`[Salesbot] Procesando lead ${leadId}: "${messageText.substring(0, 80)}"`);

  const lead = await kommo.getLead(leadId);
  const leadContext = buildLeadContext(lead);
  const history = await buildConversationHistory(leadId, messageText);

  const { message: reply, actions } = await openai.getResponse(history, leadContext);

  for (const action of actions) {
    await executeAction(leadId, action);
  }

  return { text: reply || "" };
}

function buildLeadContext(lead) {
  if (!lead) return "";

  const parts = [`Lead ID: ${lead.id}`];

  if (lead.name) parts.push(`Nombre del lead: ${lead.name}`);
  if (lead.price) parts.push(`Precio: ${lead.price}`);
  if (lead.status_id) parts.push(`Estado ID: ${lead.status_id}`);
  if (lead.pipeline_id) parts.push(`Pipeline ID: ${lead.pipeline_id}`);

  if (lead.custom_fields_values) {
    for (const field of lead.custom_fields_values) {
      const val = field.values?.[0]?.value;
      if (val) parts.push(`${field.field_name}: ${val}`);
    }
  }

  const contact = lead._embedded?.contacts?.[0];
  if (contact) parts.push(`Contacto ID: ${contact.id}`);

  return parts.join("\n");
}

async function buildConversationHistory(leadId, currentMessage) {
  const notes = await kommo.getNotes(leadId, 10);

  const history = [];

  const sorted = notes
    .filter((n) => [4, 10, 25].includes(n.note_type) || typeof n.note_type === "string")
    .sort((a, b) => a.created_at - b.created_at);

  for (const note of sorted) {
    const text = note.params?.text || note.params?.message || "";
    if (!text) continue;

    const isBot = text.startsWith("🤖 Bot:");
    history.push({
      role: isBot ? "assistant" : "user",
      content: isBot ? text.replace("🤖 Bot: ", "") : text,
    });
  }

  history.push({ role: "user", content: currentMessage });

  return history;
}

async function executeAction(leadId, action) {
  try {
    switch (action.action) {
      case "move_stage":
        await kommo.moveLeadToStage(leadId, action.pipeline_id, action.status_id);
        console.log(`[Action] Lead ${leadId} movido a pipeline ${action.pipeline_id}, etapa ${action.status_id}`);
        break;

      case "update_field":
        await kommo.updateLeadCustomFields(leadId, [{ id: action.field_id, value: action.value }]);
        console.log(`[Action] Lead ${leadId} campo ${action.field_id} actualizado`);
        break;

      case "handoff":
        console.log(`[Action] Lead ${leadId} derivado a humano`);
        break;

      default:
        console.log(`[Action] Acción desconocida: ${action.action}`);
    }
  } catch (err) {
    console.error(`[Action] Error ejecutando ${action.action} en lead ${leadId}:`, err.message);
  }
}
