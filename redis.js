const { createClient } = require('redis');

let client;

async function getClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', err => console.error('Redis erro:', err));
    await client.connect();
  }
  return client;
}

// ─── Salva alerta ─────────────────────────────────────────
async function saveAlert(chatId, alerta) {
  const r = await getClient();
  const existentes = await getAlerts(chatId);

  const duplicado = existentes.find(
    a => a.termo.toLowerCase() === alerta.termo.toLowerCase() &&
         a.cidade?.toLowerCase() === alerta.cidade?.toLowerCase()
  );
  if (duplicado) return false;

  existentes.push(alerta);
  await r.set(`alertas:${chatId}`, JSON.stringify(existentes));
  return true;
}

// ─── Busca alertas de um usuário ─────────────────────────
async function getAlerts(chatId) {
  const r = await getClient();
  const data = await r.get(`alertas:${chatId}`);
  return data ? JSON.parse(data) : [];
}

// ─── Deleta alerta específico ─────────────────────────────
async function deleteAlert(chatId, alertaId) {
  const r = await getClient();
  const existentes = await getAlerts(chatId);
  const filtrados = existentes.filter(a => a.id !== alertaId);
  await r.set(`alertas:${chatId}`, JSON.stringify(filtrados));
}

// ─── Busca todos alertas ativos (pro scheduler) ───────────
async function getAllAlerts() {
  const r = await getClient();
  const keys = await r.keys('alertas:*');
  const todos = [];

  for (const key of keys) {
    const chatId = key.split(':')[1];
    const data = await r.get(key);
    if (data) {
      JSON.parse(data)
        .filter(a => a.ativo !== false)
        .forEach(a => todos.push({ ...a, chatId }));
    }
  }
  return todos;
}

// ─── Deduplicação de anúncios já notificados ──────────────
async function jaFoiVisto(chatId, anuncioId) {
  const r = await getClient();
  try {
    await r.get(`visto:${chatId}:${anuncioId}`);
    return true;
  } catch {
    return false;
  }
}

async function markAsSeen(chatId, anuncioId) {
  const r = await getClient();
  // Expira em 30 dias
  await r.set(`visto:${chatId}:${anuncioId}`, '1', { EX: 60 * 60 * 24 * 30 });
}

module.exports = { saveAlert, getAlerts, deleteAlert, getAllAlerts, jaFoiVisto, markAsSeen };
