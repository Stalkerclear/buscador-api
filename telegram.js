const TelegramBot = require('node-telegram-bot-api');

let bot;

function getBot() {
  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
  }
  return bot;
}

async function enviarNotificacao(chatId, anuncio) {
  const b = getBot();

  const score = anuncio.score >= 5
    ? '🔥 Ótimo preço'
    : anuncio.score >= 4
    ? '✨ Bom negócio'
    : '📦 Disponível';

  const caption = [
    `⚡ *${anuncio.tempo}*  ·  📍 ${anuncio.localidade}`,
    ``,
    `*${anuncio.titulo}*`,
    ``,
    `💰 *${anuncio.precoFormatado}*`,
    ``,
    `${score}  ·  ${anuncio.fonte}`,
  ].join('\n');

  const opcoes = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '👀 Ver anúncio →', url: anuncio.url }
      ]]
    }
  };

  try {
    if (anuncio.foto) {
      await b.sendPhoto(chatId, anuncio.foto, { caption, ...opcoes });
    } else {
      await b.sendMessage(chatId, caption, opcoes);
    }
  } catch (err) {
    console.error('Erro ao notificar:', err.message);
  }
}

module.exports = { enviarNotificacao };
