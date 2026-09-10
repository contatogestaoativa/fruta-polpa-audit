// ═══════════════════════════════════════════════════════════════════
// DEPARTAMENTOS COMERCIAIS — MIX DE VENDAS (Rotina 1464)
//
// A Rotina 1464 não traz o departamento: só Código, Descrição, Qt.
// Faturada e Vl. Faturado. O departamento é derivado da descrição
// aqui, num lugar só, para poder ser corrigido sem mexer na tela.
//
// A classificação acontece na EXIBIÇÃO, não na importação — assim os
// meses já gravados no Supabase passam a ser agrupados sem precisar
// reimportar nada.
// ═══════════════════════════════════════════════════════════════════

export const DEPARTAMENTOS = [
  { id: "polpas", label: "Polpas" },
  { id: "acai", label: "Açaí" },
  { id: "morango", label: "Morango Congelado" },
];

/**
 * Exceções por código de produto (Winthor). Tem precedência sobre a
 * regra de descrição — é aqui que se corrige um produto classificado
 * errado, sem tocar na lógica.
 * Ex: { 729: "acai", 694: "polpas" }
 */
export const DEPARTAMENTO_POR_CODIGO = {};

/** Tira acento e caixa, pra regra não depender de como foi digitado. */
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Regra de classificação (a ordem importa):
 *   1. exceção cadastrada por código;
 *   2. MORANGO + CONGELAD, sem a palavra POLPA -> Morango Congelado
 *      (o sabor "MORANGO" sozinho é polpa de morango, não a fruta);
 *   3. ACAI (com ou sem acento) -> Açaí;
 *   4. todo o resto -> Polpas.
 */
export function classificarDepartamento(produto) {
  const porCodigo = DEPARTAMENTO_POR_CODIGO[produto?.codigo];
  if (porCodigo) return porCodigo;

  const d = normalizar(produto?.descricao);
  if (d.includes("MORANGO") && d.includes("CONGELAD") && !d.includes("POLPA")) return "morango";
  if (d.includes("ACAI")) return "acai";
  return "polpas";
}

/** Ordena por descrição em português (AÇAÍ depois de ACEROLA, etc.). */
export function ordenarPorDescricao(produtos) {
  return [...produtos].sort((a, b) =>
    String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR", { sensitivity: "base" })
  );
}

/**
 * Agrupa os produtos do mês nos departamentos comerciais, cada um com
 * seus itens em ordem alfabética e o subtotal do departamento.
 * Departamento sem nenhum produto no mês não é devolvido.
 *
 * @returns {Array<{id, label, produtos, totalQuantidade, totalFaturamento, pctParticipacao}>}
 */
export function agruparPorDepartamento(produtos, totalFaturamentoMes) {
  const total = totalFaturamentoMes || produtos.reduce((s, p) => s + (p.faturamento || 0), 0);

  return DEPARTAMENTOS.map((dep) => {
    const itens = ordenarPorDescricao(produtos.filter((p) => classificarDepartamento(p) === dep.id));
    const totalQuantidade = itens.reduce((s, p) => s + (p.quantidade || 0), 0);
    const totalFaturamento = itens.reduce((s, p) => s + (p.faturamento || 0), 0);
    return {
      ...dep,
      produtos: itens,
      totalQuantidade,
      totalFaturamento,
      pctParticipacao: total ? (totalFaturamento / total) * 100 : 0,
    };
  }).filter((dep) => dep.produtos.length > 0);
}
