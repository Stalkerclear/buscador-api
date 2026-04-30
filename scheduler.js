const cron = require('node-cron');
const { getAllAlerts, jaFoiVisto, markAsSeen } = require('./redis');
const { buscarAnuncios } = require('./scraper');
const { enviarNotificacao } = require('./telegram');

function iniciarScheduler() {
  console.log('⏰ Scheduler iniciado — verificando a cada 15 minutos');

  // Roda a cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    console.log(`\n🔄 [${new Date().toLocaleTimeString('pt-BR')}] Verificando alertas...`);
    await verificarTodos();
  });

  // Primeira execução após 10s do start
  setTimeout(verificarTodos, 10000);
}

async function verificarTodos() {
  try {
    const alertas = await getAllAlerts();
    if (alertas.length === 0) {
      console.log('📭 Nenhum alerta ativo');
      return;
    }

    console.log(`📋 ${alertas.length} alerta(s) ativos`);

    for (const alerta of alertas) {
      await processarAlerta(alerta);
      await sleep(3000); // 3s entre alertas pra não sobrecarregar Apify
    }

  } catch (err) {
    console.error('Erro no scheduler:', err.message);
  }
}

async function processarAlerta(alerta) {
  const { chatId, termo, cidade, precoMax, fontes } = alerta;

  try {
    const anuncios = await buscarAnuncios({ termo, cidade, precoMax, fontes });
    let novos = 0;

    for (const anuncio of anuncios) {
      const id = anuncio.id || anuncio.url;
      if (!id) continue;

      const visto = await jaFoiVisto(chatId, id);
      if (visto) continue;

      await enviarNotificacao(chatId, anuncio);
      await markAsSeen(chatId, id);
      novos++;

      await sleep(800);
    }

    console.log(`${novos > 0 ? '✅' : '➖'} "${termo}" em ${cidade || 'BR'}: ${novos} novo(s)`);

  } catch (err) {
    console.error(`Erro alerta "${termo}":`, err.message);
  }
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

module.exports = { iniciarScheduler };
