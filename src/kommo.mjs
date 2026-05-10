const BASE_URL = () => `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;

let accessToken = null;
let refreshToken = null;

function init() {
  accessToken = process.env.KOMMO_ACCESS_TOKEN;
  refreshToken = process.env.KOMMO_REFRESH_TOKEN;
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

  if (res.status === 401) {
    await refreshAccessToken();
    opts.headers.Authorization = `Bearer ${accessToken}`;
    const retry = await fetch(url, opts);
    if (!retry.ok) throw new Error(`Kommo API ${retry.status}: ${await retry.text()}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`Kommo API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

async function refreshAccessToken() {
  const res = await fetch(`https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.KOMMO_CLIENT_ID,
      client_secret: process.env.KOMMO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: process.env.KOMMO_REDIRECT_URI,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

  const data = await res.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  console.log("[Kommo] Token renovado exitosamente");
}

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

async function sendMessage(chatToken, text) {
  const scopeId = process.env.KOMMO_SCOPE_ID || process.env.KOMMO_CLIENT_ID;
  const url = `https://amojo.kommo.com/v2/origin/custom/${scopeId}/${chatToken}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      text,
      type: "text",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Kommo] Error enviando mensaje:", errText);
    throw new Error(`Send message failed: ${errText}`);
  }

  return res.json();
}

async function getNotes(leadId, limit = 20) {
  const data = await request("GET", `/leads/${leadId}/notes?limit=${limit}&order=desc`);
  return data?._embedded?.notes || [];
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
  sendMessage,
  getNotes,
  refreshAccessToken,
};
