// ═══════════════════════════════════════════════════════════════════
// LINHA 209 — DESPESAS GRUPO 222
// Fonte: extrato mensal da Rotina 750, já filtrado pela contabilidade
// para contas 222xxx. A última coluna (sem cabeçalho no export)
// vem marcada "222" (entra no cálculo) ou "NT" (não-operacional,
// vencimento 31/12 — caixa tesouraria 3 — excluído).
// Regra validada 100% contra o arquivo real de janeiro/2026.
// ═══════════════════════════════════════════════════════════════════

const COL_VALOR_CANDIDATOS = ["valor"]; // comparação case-insensitive
                                          // (export do Winthor varia: "Valor" em jan, "VALOR" em jul)

/**
 * @param {Array<Record<string, any>>} rows  linhas cruas do export da Rotina 750
 * @returns {{ total: number, excluidoNT: number, linhas: number }}
 */
export function parseGrupo222(rows) {
  let total = 0;
  let excluidoNT = 0;
  let linhas = 0;

  for (const row of rows) {
    const valor = Number(findValor(row));
    if (Number.isNaN(valor)) continue;
    const marcacao = findMarcacao(row);
    // Só soma linhas explicitamente marcadas "222". Ignora linhas sem
    // marcação (ex: a própria linha de total do export) e as "NT".
    if (marcacao === "222" || marcacao === 222) {
      total += valor;
      linhas += 1;
    } else if (marcacao === "NT") {
      excluidoNT += valor;
      linhas += 1;
    }
  }

  return { total: round2(total), excluidoNT: round2(excluidoNT), linhas };
}

// Nomes de coluna variam mês a mês nos exports do Winthor — busca
// case-insensitive pelo nome da coluna em vez de fixar "Valor".
function findValor(row) {
  for (const [key, value] of Object.entries(row)) {
    if (COL_VALOR_CANDIDATOS.includes(key.trim().toLowerCase())) return value;
  }
  return NaN;
}

// A coluna de marcação não tem cabeçalho no arquivo original — pega o
// último valor de string ("222" ou "NT") entre os campos da linha.
function findMarcacao(row) {
  const values = Object.values(row);
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] === "222" || values[i] === "NT" || values[i] === 222) {
      return String(values[i]);
    }
  }
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

/** Detecta o mês predominante (AAAA-MM) a partir de QUALQUER coluna que
 * contenha datas — os exports do Winthor usam nomes de cabeçalho
 * diferentes entre meses (ex: "DATA" em alguns, "Dt. Lanc" em outros),
 * então não fixamos o nome da coluna, procuramos por conteúdo. */
export function detectarMesPredominante(rows, colDataPreferida = "DATA") {
  if (!rows.length) return null;
  let colAlvo = colDataPreferida in rows[0] ? colDataPreferida : null;
  if (!colAlvo) {
    for (const key of Object.keys(rows[0])) {
      if (rows.some((r) => r[key] instanceof Date)) { colAlvo = key; break; }
    }
  }
  if (!colAlvo) return null;

  const contagem = {};
  for (const row of rows) {
    const v = row[colAlvo];
    if (!(v instanceof Date)) continue;
    const key = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
    contagem[key] = (contagem[key] || 0) + 1;
  }
  let melhor = null, max = 0;
  for (const [k, c] of Object.entries(contagem)) {
    if (c > max) { max = c; melhor = k; }
  }
  return melhor;
}
