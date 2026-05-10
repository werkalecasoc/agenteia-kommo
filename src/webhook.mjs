import kommo from "./kommo.mjs";
import openai from "./openai.mjs";

const CHATBOT_TAG = () => process.env.CHATBOT_TAG || "Chatbot";

export async function handleIncomingMessage(payload) {
  const leadId = extractLeadId(payload);

  if (!leadId) {
    console.log("[Webhook] No se encontró lead_id en el payload");
    return { status: "ignored" };
  }

  const hasChatbotTag = await kommo.hasTag(leadId, CHATBOT_TAG());
  if (!hasChatbotTag) {
    console.log(`[Webhook] Lead ${leadId} no tiene tag "${CHATBOT_TAG()}", ignorando`);
    return { status: "no_tag" };
  }

  const messageText = extractMessageText(payload);
  if (!messageText) {
    console.log("[Webhook] No hay texto de mensaje para procesar");
    return { status: "no_text" };
  }

  console.log(`[Webhook] Procesando mensaje de lead ${leadId}: "${messageText.substring(0, 80)}"`);

  const lead = await kommo.getLead(leadId);
  const leadContext = buildLeadContext(lead);
  const history = await buildConversationHistory(leadId, messageText);

  const { message: reply, actions } = await openai.getResponse(history, leadContext);

  if (reply) {
    await kommo.sendNote(leadId, `🤖 Bot: ${reply}`);
    console.log(`[Webhook] Respuesta guardada en lead ${leadId}`);
  }

  for (const action of actions) {
    await executeAction(leadId, action);
  }

  return { status: "processed", reply, actions };
}

function extractLeadId(payload) {
  if (payload.leads?.status?.[0]?.id) return Number(payload.leads.status[0].id);
  if (payload.leads?.add?.[0]?.id) return Number(payload.leads.add[0].id);
  if (payload.leads?.update?.[0]?.id) return Number(payload.leads.update[0].id);

  if (payload.message?.add?.[0]?.element_id) return Number(payload.message.add[0].element_id);
  if (payload.message?.lead_id) return Number(payload.message.lead_id);
  if (payload.lead_id) return Number(payload.lead_id);

  if (payload.unsorted?.add?.[0]?.lead_id) return Number(payload.unsorted.add[0].lead_id);

  return null;
}

function extractMessageText(payload) {
  if (payload.message?.add?.[0]?.text) return payload.message.add[0].text;
  if (payload.message?.text) return payload.message.text;
  if (payload.unsorted?.add?.[0]?.message?.text) return payload.unsorted.add[0].message.text;

  if (payload.leads?.add?.[0]?.name) return `Nuevo lead: ${payload.leads.add[0].name}`;
  if (payload.leads?.status?.[0]) return null;

  return null;
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
