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

async function sendNote(leadId, text) {
  return request("POST", `/leads/${leadId}/notes`, [
    {
      note_type: "common",
      params: { text },
    },
  ]);
}

async function getNotes(leadId, limit = 20) {
  const data = await request("GET", `/leads/${leadId}/notes?limit=${limit}&order=desc`);
  return data?._embedded?.notes || [];
}

async function getEvents(leadId, limit = 20) {
  const data = await request("GET", `/events?filter[entity]=lead&filter[entity_id]=${leadId}&limit=${limit}`);
  return data?._embedded?.events || [];
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
  sendNote,
  getNotes,
  getEvents,
};
