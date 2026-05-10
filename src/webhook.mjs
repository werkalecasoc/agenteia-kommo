import kommo from "./kommo.mjs";
import openai from "./openai.mjs";

const CHATBOT_TAG = () => process.env.CHATBOT_TAG || "Chatbot";

export async function handleSalesbotRequest(payload) {
  const leadId = extractLeadId(payload);

  if (!leadId) {
    console.log("[Salesbot] No se encontró lead_id en el payload");
    return { text: "" };
  }

  const hasChatbotTag = await kommo.hasTag(leadId, CHATBOT_TAG());
  if (!hasChatbotTag) {
    console.log(`[Salesbot] Lead ${leadId} no tiene tag "${CHATBOT_TAG()}", ignorando`);
    return { text: "" };
  }

  const lastMessage = await getLastIncomingMessage(leadId);
  if (!lastMessage) {
    console.log(`[Salesbot] No se encontró mensaje entrante en lead ${leadId}`);
    return { text: "" };
  }

  console.log(`[Salesbot] Procesando lead ${leadId}: "${lastMessage.substring(0, 80)}"`);

  const lead = await kommo.getLead(leadId);
  const leadContext = buildLeadContext(lead);
  const history = await buildConversationHistory(leadId, lastMessage);

  const { message: reply, actions } = await openai.getResponse(history, leadContext);

  for (const action of actions) {
    await executeAction(leadId, action);
  }

  console.log(`[Salesbot] Respuesta: ${reply?.substring(0, 100)}`);
  return { text: reply || "No pude procesar tu consulta. ¿Podés repetirla?" };
}

function extractLeadId(payload) {
  if (payload.leads?.add?.[0]?.id) return Number(payload.leads.add[0].id);
  if (payload.leads?.status?.[0]?.id) return Number(payload.leads.status[0].id);
  if (payload.leads?.update?.[0]?.id) return Number(payload.leads.update[0].id);
  if (payload.lead_id) return Number(payload.lead_id);
  if (payload.message?.add?.[0]?.entity_id) return Number(payload.message.add[0].entity_id);
  return null;
}

async function getLastIncomingMessage(leadId) {
  const notes = await kommo.getNotes(leadId, 5);

  const incoming = notes
    .filter((n) => {
      const isChat = n.note_type === "incoming_chat_message" || n.note_type === 102;
      const isSms = n.note_type === "sms_in" || n.note_type === 3;
      const isIncoming = n.note_type === 10;
      return isChat || isSms || isIncoming;
    })
    .sort((a, b) => b.created_at - a.created_at);

  if (incoming.length > 0) {
    return incoming[0].params?.text || incoming[0].params?.message || null;
  }

  const allNotes = notes
    .filter((n) => n.params?.text || n.params?.message)
    .sort((a, b) => b.created_at - a.created_at);

  return allNotes[0]?.params?.text || allNotes[0]?.params?.message || null;
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
    .filter((n) => n.params?.text || n.params?.message)
    .sort((a, b) => a.created_at - b.created_at);

  for (const note of sorted) {
    const text = note.params?.text || note.params?.message || "";
    if (!text) continue;

    const isOutgoing = note.note_type === "outgoing_chat_message" ||
      note.note_type === 103 ||
      note.note_type === 11 ||
      text.startsWith("🤖");

    history.push({
      role: isOutgoing ? "assistant" : "user",
      content: text.replace(/^🤖\s*Bot:\s*/, ""),
    });
  }

  if (!history.length || history[history.length - 1].content !== currentMessage) {
    history.push({ role: "user", content: currentMessage });
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
