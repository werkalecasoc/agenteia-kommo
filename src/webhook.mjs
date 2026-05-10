import kommo from "./kommo.mjs";
import openai from "./openai.mjs";

const CHATBOT_TAG = () => process.env.CHATBOT_TAG || "Chatbot";
const FIELD_RESPUESTA_IA = 1114435;

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

  // Guardar la respuesta en el campo "Respuesta IA" del lead
  await kommo.updateLeadCustomFields(leadId, [
    { id: FIELD_RESPUESTA_IA, value: reply },
  ]);
  console.log(`[Webhook] Respuesta guardada en campo "Respuesta IA" del lead ${leadId}`);

  for (const action of actions) {
    await executeAction(leadId, action);
  }

  return { status: "processed", leadId };
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
      if (field.field_id === FIELD_RESPUESTA_IA) continue;
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
