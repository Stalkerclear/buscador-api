require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { buscarAnuncios } = require('./scraper');
const { saveAlert, getAlerts, getAllAlerts, deleteAlert } = require('./redis');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Buscador API rodando ✅' });
});

// ─── BUSCA em tempo real ──────────────────────────────────
// POST /api/buscar
// body: { termo, cidade, precoMax, fontes }
app.post('/api/buscar', async (req, res) => {
  const { termo, cidade, precoMax, fontes } = req.body;

  if (!termo || termo.trim().length < 2) {
    return res.status(400).json({ erro: 'Termo de busca inválido' });
  }

  if (!fontes || fontes.length === 0) {
    return res.status(400).json({ erro: 'Selecione ao menos uma fonte' });
  }

  try {
    console.log(`🔍 Busca: "${termo}" | ${cidade || 'Brasil'} | até R$${precoMax || '∞'} | fontes: ${fontes.join(', ')}`);

    const resultados = await buscarAnuncios({
      termo: termo.trim(),
      cidade: cidade?.trim() || '',
      precoMax: precoMax ? parseInt(precoMax) : null,
      fontes,
    });

    return res.json({
      sucesso: true,
      total: resultados.length,
      resultados,
    });

  } catch (err) {
    console.error('Erro na busca:', err.message);
    return res.status(500).json({ erro: 'Erro ao buscar anúncios. Tente novamente.' });
  }
});

// ─── SALVAR alerta ────────────────────────────────────────
// POST /api/alertas
// body: { chatId, termo, cidade, precoMax, fontes }
app.post('/api/alertas', async (req, res) => {
  const { chatId, termo, cidade, precoMax, fontes } = req.body;

  if (!chatId || !termo) {
    return res.status(400).json({ erro: 'chatId e termo são obrigatórios' });
  }

  try {
    const alerta = {
      id: `${Date.now()}`,
      termo: termo.trim(),
      cidade: cidade?.trim() || '',
      precoMax: precoMax ? parseInt(precoMax) : null,
      fontes: fontes || ['Marketplace', 'Grupos Públicos'],
      ativo: true,
      criadoEm: new Date().toISOString(),
    };

    const salvo = await saveAlert(chatId, alerta);

    if (!salvo) {
      return res.status(409).json({ erro: 'Você já tem um alerta para esse termo nessa cidade' });
    }

    return res.json({ sucesso: true, alerta });

  } catch (err) {
    console.error('Erro ao salvar alerta:', err.message);
    return res.status(500).json({ erro: 'Erro ao salvar alerta' });
  }
});

// ─── LISTAR alertas do usuário ────────────────────────────
// GET /api/alertas/:chatId
app.get('/api/alertas/:chatId', async (req, res) => {
  const { chatId } = req.params;

  try {
    const alertas = await getAlerts(chatId);
    return res.json({ sucesso: true, alertas });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao buscar alertas' });
  }
});

// ─── DELETAR alerta ───────────────────────────────────────
// DELETE /api/alertas/:chatId/:alertaId
app.delete('/api/alertas/:chatId/:alertaId', async (req, res) => {
  const { chatId, alertaId } = req.params;

  try {
    await deleteAlert(chatId, alertaId);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao deletar alerta' });
  }
});

// ─── Inicia servidor ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});

module.exports = app;
