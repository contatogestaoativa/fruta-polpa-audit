// ═══════════════════════════════════════════════════════════════════
// ROTINA 1464 — FATURAMENTO POR PRODUTO (Mix de Vendas)
// Formato diferente das demais rotinas: um arquivo único, todos os
// meses na mesma aba, identificados pelo nome do mês por extenso em
// português (não por data) — por isso tem parser próprio.
// ═══════════════════════════════════════════════════════════════════

const MES_NOME_PARA_CHAVE = {
  "janeiro": "01", "fevereiro": "02", "março": "03", "marco": "03", "abril": "04",
  "maio": "05", "junho": "06", "julho": "07", "agosto": "08", "setembro": "09",
  "outubro": "10", "novembro": "11", "dezembro": "12",
};

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * @param {Array<Record<string, any>>} rows  linhas já lidas via
 *   XLSX.utils.sheet_to_json(sheet, { range: 3 }) — pula título/subtítulo
 * @param {number} ano  ano de referência (ex: 2026) — o arquivo não traz o ano na coluna Mês
 * @returns {Record<string, {produtos: Array, totalQuantidade:number, totalFaturamento:number}>}
 */
export function parseProdutos1464(rows, ano = 2026) {
  const porMes = {};
  for (const row of rows) {
    const mesNome = String(row["Mês"] || "").trim().toLowerCase();
    const mm = MES_NOME_PARA_CHAVE[mesNome];
    if (!mm) continue;
    const mesKey = `${ano}-${mm}`;
    const quantidade = Number(row["Qt. Faturada"]) || 0;
    const faturamento = Number(row["Vl. Faturado"]) || 0;

    if (!porMes[mesKey]) porMes[mesKey] = { produtos: [], totalQuantidade: 0, totalFaturamento: 0 };
    const bucket = porMes[mesKey];
    bucket.produtos.push({
      codigo: row["Código"],
      descricao: String(row["Descrição"] || "").trim(),
      quantidade,
      faturamento: round2(faturamento),
      precoMedio: quantidade ? round2(faturamento / quantidade) : null,
    });
    bucket.totalQuantidade += quantidade;
    bucket.totalFaturamento += faturamento;
  }

  for (const mesKey of Object.keys(porMes)) {
    const bucket = porMes[mesKey];
    bucket.totalQuantidade = round2(bucket.totalQuantidade);
    bucket.totalFaturamento = round2(bucket.totalFaturamento);
    bucket.produtos.forEach((p) => {
      p.pctParticipacao = bucket.totalFaturamento ? round2((p.faturamento / bucket.totalFaturamento) * 10000) / 100 : 0;
    });
    bucket.produtos.sort((a, b) => b.faturamento - a.faturamento);
  }
  return porMes;
}

/** Ticket médio da empresa no mês = Faturamento Gerencial (DRE) ÷ quantidade total vendida (1464). */
export function calcularTicketMedio(faturamentoGerencial, totalQuantidade) {
  if (!totalQuantidade) return null;
  return round2(faturamentoGerencial / totalQuantidade);
}
