import kommo from "./kommo.mjs";
import openai from "./openai.mjs";

const CHATBOT_TAG = () => process.env.CHATBOT_TAG || "Chatbot";

export async function handleIncomingMessage(payload) {
  const { message, lead_id, chat_token } = extractMessageData(payload);

  if (!message || !lead_id) {
    console.log("[Webhook] Payload sin mensaje o lead_id, ignorando");
    return { status: "ignored" };
  }

  const hasChatbotTag = await kommo.hasTag(lead_id, CHATBOT_TAG());
  if (!hasChatbotTag) {
    console.log(`[Webhook] Lead ${lead_id} no tiene tag "${CHATBOT_TAG()}", ignorando`);
    return { status: "no_tag" };
  }

  console.log(`[Webhook] Procesando mensaje de lead ${lead_id}: "${message.text?.substring(0, 50)}..."`);

  const lead = await kommo.getLead(lead_id);
  const leadContext = buildLeadContext(lead);
  const history = await buildConversationHistory(lead_id, message);

  const { message: reply, actions } = await openai.getResponse(history, leadContext);

  if (reply) {
    await kommo.sendMessage(chat_token, reply);
    console.log(`[Webhook] Respuesta enviada a lead ${lead_id}`);
  }

  for (const action of actions) {
    await executeAction(lead_id, action);
  }

  return { status: "processed", reply, actions };
}

function extractMessageData(payload) {
  if (payload.message) {
    return {
      message: payload.message,
      lead_id: payload.message?.lead_id || payload.lead_id,
      chat_token: payload.message?.chat_token || payload.chat_token,
    };
  }

  if (payload.unsorted?.[0]) {
    const unsorted = payload.unsorted[0];
    return {
      message: { text: unsorted.message?.text },
      lead_id: unsorted.lead_id,
      chat_token: unsorted.chat_token,
    };
  }

  return { message: null, lead_id: null, chat_token: null };
}

function buildLeadContext(lead) {
  if (!lead) return "";

  const parts = [`Lead ID: ${lead.id}`];

  if (lead.name) parts.push(`Nombre: ${lead.name}`);
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
  if (contact) {
    parts.push(`Contacto ID: ${contact.id}`);
  }

  return parts.join("\n");
}

async function buildConversationHistory(leadId, currentMessage) {
  const notes = await kommo.getNotes(leadId, 10);

  const history = [];

  const sorted = notes
    .filter((n) => n.note_type === "message" || n.note_type === "incoming_message" || n.note_type === "outgoing_message")
    .sort((a, b) => a.created_at - b.created_at);

  for (const note of sorted) {
    const text = note.params?.text || note.params?.message;
    if (!text) continue;

    const isIncoming = note.note_type === "incoming_message" || note.note_type === "message";
    history.push({
      role: isIncoming ? "user" : "assistant",
      content: text,
    });
  }

  if (currentMessage?.text) {
    history.push({ role: "user", content: currentMessage.text });
  }

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
