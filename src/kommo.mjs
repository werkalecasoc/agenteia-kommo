const BASE_URL = () => `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;

let accessToken = null;

function init() {
  accessToken = process.env.KOMMO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("KOMMO_ACCESS_TOKEN no configurado");
}

async function request(method, path, body = null) {
  const url = `${BASE_URL()}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Kommo API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

// --- Chat Session (amojo) ---

let chatSession = null;

async function getChatSession() {
  if (chatSession) return chatSession;

  const url = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/ajax/v1/chats/session`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "request[chats][session][action]=create",
  });

  if (!res.ok) throw new Error(`Chat session failed: ${await res.text()}`);

  const data = await res.json();
  chatSession = data.response.chats.session;
  console.log("[Kommo] Chat session creada");

  // Renovar sesión cada 10 minutos
  setTimeout(() => { chatSession = null; }, 10 * 60 * 1000);

  return chatSession;
}

async function sendChatMessage(chatId, text, metadata) {
  const session = await getChatSession();
  const accountId = session.account.id;
  const url = `https://amojo.kommo.com/v1/chats/${accountId}/${chatId}/messages`;

  const body = new URLSearchParams({
    silent: "false",
    priority: "low",
    text,
    "crm_entity[id]": String(metadata.entityId || ""),
    "crm_entity[type]": String(metadata.elementType || ""),
    persona_name: session.user?.name || "Agente IA",
    persona_avatar: session.user?.avatar || "",
    recipient_id: metadata.authorId || "",
    crm_dialog_id: String(metadata.talkId || ""),
    crm_contact_id: String(metadata.contactId || ""),
    crm_account_id: String(metadata.accountId || ""),
    skip_link_shortener: "false",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Token": session.access_token,
      chatId,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Kommo] Error enviando mensaje chat:", errText);
    throw new Error(`Send chat message failed: ${errText}`);
  }

  return res.json();
}

// --- CRM API ---

async function getLead(leadId) {
  return request("GET", `/leads/${leadId}?with=contacts`);
}

async function getLeadTags(leadId) {
  const lead = await getLead(leadId);
  return lead?._embedded?.tags || [];
}

async function hasTag(leadId, tagName) {
  const tags = await getLeadTags(leadId);
  return tags.some((t) => t.name.toLowerCase() === tagName.toLowerCase());
}

async function updateLead(leadId, fields) {
  return request("PATCH", `/leads/${leadId}`, fields);
}

async function moveLeadToStage(leadId, pipelineId, statusId) {
  return updateLead(leadId, { pipeline_id: pipelineId, status_id: statusId });
}

async function updateLeadCustomFields(leadId, customFields) {
  const fields = customFields.map(({ id, value }) => ({
    field_id: id,
    values: [{ value }],
  }));
  return updateLead(leadId, { custom_fields_values: fields });
}

async function getContact(contactId) {
  return request("GET", `/contacts/${contactId}`);
}

async function getPipelines() {
  return request("GET", "/leads/pipelines");
}

export default {
  init,
  getLead,
  hasTag,
  updateLead,
  moveLeadToStage,
  updateLeadCustomFields,
  getContact,
  getPipelines,
  sendChatMessage,
  getChatSession,
};
