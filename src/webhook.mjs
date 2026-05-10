import kommo from "./kommo.mjs";
import openai from "./openai.mjs";

const CHATBOT_TAG = () => process.env.CHATBOT_TAG || "Chatbot";

// Almacén temporal de respuestas pendientes: leadId -> respuesta
const pendingResponses = new Map();

// Llamado por el webhook de Kommo cuando llega un mensaje
export async function handleWebhook(payload) {
  const messageData = payload.message?.add?.[0];
  if (!messageData) return { status: "no_message" };

  if (messageData.type !== "incoming") return { status: "not_incoming" };

  const leadId = Number(messageData.entity_id || messageData.element_id);
  const messageText = messageData.text;

  if (!leadId || !messageText) {
    console.log("[Webhook] Faltan datos:", { leadId, messageText });
    return { status: "missing_data" };
  }

  const hasChatbotTag = await kommo.hasTag(leadId, CHATBOT_TAG());
  if (!hasChatbotTag) {
    console.log(`[Webhook] Lead ${leadId} no tiene tag "${CHATBOT_TAG()}"`);
    return { status: "no_tag" };
  }

  console.log(`[Webhook] Procesando lead ${leadId}: "${messageText.substring(0, 80)}"`);

  const lead = await kommo.getLead(leadId);
  const leadContext = buildLeadContext(lead);

  const history = [{ role: "user", content: messageText }];
  const { message: reply, actions } = await openai.getResponse(history, leadContext);

  for (const action of actions) {
    await executeAction(leadId, action);
  }

  // Guardar la respuesta para que el Salesbot la recoja
  pendingResponses.set(leadId, reply);
  console.log(`[Webhook] Respuesta lista para lead ${leadId}: "${reply?.substring(0, 80)}"`);

  // Limpiar respuestas viejas (más de 5 minutos)
  setTimeout(() => pendingResponses.delete(leadId), 5 * 60 * 1000);

  return { status: "processed", leadId };
}

// Llamado por el Salesbot para obtener la respuesta generada
export async function handleSalesbotRequest(payload) {
  const leadId = extractLeadId(payload);

  if (!leadId) {
    console.log("[Salesbot] No se encontró lead_id");
    return { text: "" };
  }

  const reply = pendingResponses.get(leadId);
  if (reply) {
    pendingResponses.delete(leadId);
    console.log(`[Salesbot] Entregando respuesta para lead ${leadId}`);
    return { text: reply };
  }

  console.log(`[Salesbot] No hay respuesta pendiente para lead ${leadId}`);
  return { text: "" };
}

function extractLeadId(payload) {
  if (payload.leads?.add?.[0]?.id) return Number(payload.leads.add[0].id);
  if (payload.leads?.status?.[0]?.id) return Number(payload.leads.status[0].id);
  if (payload.leads?.update?.[0]?.id) return Number(payload.leads.update[0].id);
  if (payload.lead_id) return Number(payload.lead_id);
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
