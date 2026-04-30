const { ApifyClient } = require('apify-client');

const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });

// ─── Normaliza cidade pra slug do Facebook ────────────────
function cidadeParaSlug(cidade) {
  if (!cidade) return null;
  return cidade
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');
}

// ─── Normaliza preço pra número ──────────────────────────
function normalizarPreco(preco) {
  if (!preco) return null;
  if (typeof preco === 'number') return preco;
  const num = parseFloat(
    String(preco)
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  );
  return isNaN(num) ? null : num;
}

// ─── Quantos minutos atrás foi postado ───────────────────
function minutosAtras(timestamp) {
  if (!timestamp) return null;
  const diff = Date.now() - new Date(timestamp).getTime();
  return Math.floor(diff / 60000);
}

function tempoTexto(mins) {
  if (!mins) return 'Agora';
  if (mins < 60) return `${mins} min atrás`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h atrás`;
  return `${Math.floor(mins / 1440)}d atrás`;
}

// ─── Score de oportunidade ────────────────────────────────
function calcularScore(preco, precoMax) {
  if (!preco || !precoMax) return 3;
  const ratio = preco / precoMax;
  if (ratio < 0.5) return 5;
  if (ratio < 0.7) return 4;
  if (ratio < 0.9) return 3;
  return 2;
}

// ─── Extrai preço do texto do post ───────────────────────
function extrairPrecoDoTexto(texto) {
  if (!texto) return null;
  const match = texto.match(/R\$\s*[\d.,]+/i);
  if (!match) return null;
  return normalizarPreco(match[0]);
}

// ─── Busca no Marketplace via Apify ──────────────────────
async function buscarMarketplace(termo, cidade, precoMax) {
  const slug = cidadeParaSlug(cidade);
  const base = slug
    ? `https://www.facebook.com/marketplace/${slug}/search/`
    : `https://www.facebook.com/marketplace/search/`;

  const params = new URLSearchParams({ query: termo });
  if (precoMax) params.append('maxPrice', precoMax);

  const url = `${base}?${params.toString()}`;

  try {
    const run = await apify.actor('apify/facebook-marketplace-scraper').call({
      startUrls: [{ url }],
      maxItems: 20,
    }, { waitSecs: 90 });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    return items.map(item => {
      const preco = normalizarPreco(item.price);
      const mins = minutosAtras(item.createdAt || item.listedAt);
      return {
        id: item.id || item.url,
        titulo: item.title || item.name || 'Sem título',
        preco,
        precoFormatado: preco ? `R$ ${preco.toLocaleString('pt-BR')}` : 'Consultar',
        localidade: item.location || cidade || 'Brasil',
        distancia: item.distance || null,
        foto: item.photoUrl || item.image || null,
        url: item.url,
        fonte: 'Marketplace',
        minutosAtras: mins,
        tempo: tempoTexto(mins),
        score: calcularScore(preco, precoMax),
        vendedor: item.sellerName || null,
      };
    }).filter(a => !precoMax || !a.preco || a.preco <= precoMax);

  } catch (err) {
    console.error('Erro Marketplace:', err.message);
    return [];
  }
}

// ─── Busca em grupos públicos via Apify ──────────────────
async function buscarGrupos(termo, cidade) {
  const query = cidade ? `${termo} ${cidade}` : termo;
  const url = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`;

  try {
    const run = await apify.actor('apify/facebook-posts-scraper').call({
      startUrls: [{ url }],
      maxPosts: 15,
    }, { waitSecs: 90 });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    return items
      .filter(item => item.text && item.text.length > 10)
      .map(item => {
        const preco = extrairPrecoDoTexto(item.text);
        const mins = minutosAtras(item.time || item.timestamp);
        return {
          id: item.postId || item.url,
          titulo: (item.text || '').substring(0, 80).trim() + '...',
          preco,
          precoFormatado: preco ? `R$ ${preco.toLocaleString('pt-BR')}` : 'Ver post',
          localidade: cidade || 'Brasil',
          distancia: null,
          foto: item.image || (item.images && item.images[0]) || null,
          url: item.url || item.postUrl,
          fonte: item.groupName || 'Grupos Públicos',
          minutosAtras: mins,
          tempo: tempoTexto(mins),
          score: 3,
          vendedor: item.authorName || null,
        };
      });

  } catch (err) {
    console.error('Erro Grupos:', err.message);
    return [];
  }
}

// ─── Função principal ─────────────────────────────────────
async function buscarAnuncios({ termo, cidade, precoMax, fontes }) {
  const tarefas = [];

  if (fontes.includes('Marketplace')) {
    tarefas.push(buscarMarketplace(termo, cidade, precoMax));
  }

  if (fontes.includes('Grupos Públicos')) {
    tarefas.push(buscarGrupos(termo, cidade));
  }

  // Roda em paralelo
  const resultados = await Promise.allSettled(tarefas);

  const todos = resultados
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // Ordena por: mais recente primeiro, depois por score
  return todos.sort((a, b) => {
    if (a.minutosAtras !== null && b.minutosAtras !== null) {
      return a.minutosAtras - b.minutosAtras;
    }
    return b.score - a.score;
  });
}

module.exports = { buscarAnuncios };
