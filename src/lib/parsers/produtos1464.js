// ═══════════════════════════════════════════════════════════════════
// ROTINA 1464 — FATURAMENTO POR PRODUTO (Mix de Vendas)
//
// FORMATO NATIVO DO WINTHOR (confirmado 24/09) — uma aba por mês
// (nome da aba = nome do mês em português: "janeiro", "fevereiro"...),
// SEM linha de cabeçalho — os dados começam direto na linha 1.
//
// RESILIÊNCIA — as colunas não ficam sempre na mesma posição: o
// arquivo de Jan-Jul trazia uma coluna extra (repetindo a quantidade)
// que Agosto não tinha, empurrando Faturamento e "% Participação" uma
// posição pra frente. Por isso as colunas de Quantidade, Preço Médio,
// Faturamento e % Participação são localizadas por RELAÇÃO
// ALGÉBRICA (quantidade × preço médio ≈ faturamento; e a coluna de %
// soma ~100), não por índice fixo — sobrevive à próxima mudança do
// Winthor sem precisar editar este arquivo de novo.
//
// As 5 primeiras colunas são estáveis em todos os formatos vistos até
// aqui: [0]=sequência, [1]=código, [2]=descrição, [3]=embalagem,
// [4]=unidade.
// ═══════════════════════════════════════════════════════════════════

const MES_NOME_PARA_CHAVE = {
  "janeiro": "01", "fevereiro": "02", "março": "03", "marco": "03", "abril": "04",
  "maio": "05", "junho": "06", "julho": "07", "agosto": "08", "setembro": "09",
  "outubro": "10", "novembro": "11", "dezembro": "12",
};

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Localiza, entre as colunas numéricas de uma aba, quais são
 * Quantidade, Preço Médio, Faturamento e % Participação — validando
 * a relação real entre elas em vez de confiar num índice fixo.
 * @param {Array<Array<any>>} linhas  linhas cruas (sheet_to_json com {header:1})
 * @returns {{qtdCol:number, precoCol:number, fatCol:number, pctCol:number} | null}
 */
export function detectarColunasProdutos(linhas) {
  const validas = linhas.filter((l) => Array.isArray(l) && l.length > 5);
  if (!validas.length) return null;
  const numCols = Math.max(...validas.map((l) => l.length));
  let melhor = null;

  for (let a = 5; a < numCols; a++) {
    for (let b = 5; b < numCols; b++) {
      if (b === a) continue;
      for (let fatCol = 5; fatCol < numCols; fatCol++) {
        if (fatCol === a || fatCol === b) continue;
        let acertos = 0, total = 0;
        for (const linha of validas) {
          const x = Number(linha[a]), y = Number(linha[b]), fat = Number(linha[fatCol]);
          if (!x || !y || !fat) continue;
          total++;
          if (Math.abs(x * y - fat) / Math.abs(fat) < 0.01) acertos++;
        }
        if (total < 3 || acertos !== total) continue; // precisa validar em pelo menos 3 linhas, sem exceção

        const pctCol = fatCol + 1;
        const somaPct = validas.reduce((s, l) => s + (Number(l[pctCol]) || 0), 0);
        if (Math.abs(somaPct - 100) > 1) continue; // a coluna seguinte ao faturamento precisa somar ~100%

        // Desambiguação: preço médio tem magnitude média MENOR que quantidade
        // (um produto custar, em média, menos que a quantidade vendida dele é
        // praticamente sempre verdade neste negócio — poucos reais por unidade,
        // centenas/milhares de unidades vendidas).
        const mediaA = validas.reduce((s, l) => s + Math.abs(Number(l[a]) || 0), 0) / validas.length;
        const mediaB = validas.reduce((s, l) => s + Math.abs(Number(l[b]) || 0), 0) / validas.length;
        const [qtdCol, precoCol] = mediaA > mediaB ? [a, b] : [b, a];
        melhor = { qtdCol, precoCol, fatCol, pctCol };
      }
    }
  }
  return melhor;
}

/**
 * @param {Record<string, Array<Array<any>>>} porAba  { "janeiro": linhas, "agosto": linhas, ... }
 *   cada `linhas` já lida via XLSX.utils.sheet_to_json(sheet, { header: 1 })
 * @param {number} ano
 * @returns {Record<string, {produtos: Array, totalQuantidade:number, totalFaturamento:number}>}
 */
export function parseProdutos1464(porAba, ano = 2026) {
  const porMes = {};

  for (const [nomeAba, linhas] of Object.entries(porAba)) {
    const mm = MES_NOME_PARA_CHAVE[String(nomeAba).trim().toLowerCase()];
    if (!mm) continue; // aba que não é nome de mês (ex: alguma aba auxiliar) — ignora
    const cols = detectarColunasProdutos(linhas);
    if (!cols) continue; // não conseguiu localizar as colunas nesta aba — não quebra o resto do arquivo

    const mesKey = `${ano}-${mm}`;
    const bucket = { produtos: [], totalQuantidade: 0, totalFaturamento: 0 };

    for (const linha of linhas) {
      if (!Array.isArray(linha) || linha.length <= cols.fatCol) continue;
      const codigo = linha[1];
      const descricao = String(linha[2] || "").trim();
      const quantidade = Number(linha[cols.qtdCol]) || 0;
      const faturamento = round2(Number(linha[cols.fatCol]) || 0);
      if (!descricao && !quantidade && !faturamento) continue; // linha vazia/lixo

      bucket.produtos.push({
        codigo, descricao, quantidade, faturamento,
        precoMedio: quantidade ? round2(faturamento / quantidade) : null,
      });
      bucket.totalQuantidade += quantidade;
      bucket.totalFaturamento += faturamento;
    }

    bucket.totalQuantidade = round2(bucket.totalQuantidade);
    bucket.totalFaturamento = round2(bucket.totalFaturamento);
    bucket.produtos.forEach((p) => {
      p.pctParticipacao = bucket.totalFaturamento ? round2((p.faturamento / bucket.totalFaturamento) * 10000) / 100 : 0;
    });
    bucket.produtos.sort((a, b) => b.faturamento - a.faturamento);
    porMes[mesKey] = bucket;
  }

  return porMes;
}

/** Ticket médio da empresa no mês = Faturamento Gerencial (DRE) ÷ quantidade total vendida (1464). */
export function calcularTicketMedio(faturamentoGerencial, totalQuantidade) {
  if (!totalQuantidade) return null;
  return round2(faturamentoGerencial / totalQuantidade);
}
