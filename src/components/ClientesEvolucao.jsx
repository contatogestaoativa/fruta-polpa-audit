// ═══════════════════════════════════════════════════════════════════
// DEPARTAMENTOS COMERCIAIS — MIX DE VENDAS (Rotina 1464)
//
// A Rotina 1464 nao traz o departamento: so Codigo, Descricao, Qt.
// Faturada e Vl. Faturado. O departamento e derivado da descricao
// aqui, num lugar so, para poder ser corrigido sem mexer na tela.
//
// A classificacao acontece na EXIBICAO, nao na importacao — assim os
// meses ja gravados no Supabase passam a ser agrupados sem precisar
// reimportar nada.
//
// ATENCAO A UMA ARMADILHA: a marca aparece dentro da propria descricao
// ("... FRUTA POLPA"). Ou seja, a palavra POLPA existe em TODO produto
// e nao serve para separar polpa de fruta congelada. E por isso que o
// morango congelado so se distingue pela palavra CONGELADO.
// ═══════════════════════════════════════════════════════════════════

export const DEPARTAMENTOS = [
  { id: "polpas", label: "Polpa de Frutas" },
  { id: "acai", label: "Açaí" },
  { id: "morango", label: "Morango Congelado" },
];

export const LABEL_DEPARTAMENTO = Object.fromEntries(DEPARTAMENTOS.map((d) => [d.id, d.label]));

/**
 * Excecoes por codigo de produto (Winthor). Tem precedencia sobre a
 * regra de descricao — e aqui que se corrige um produto classificado
 * errado, sem tocar na logica.
 * Ex: { 729: "acai", 694: "polpas" }
 */
export const DEPARTAMENTO_POR_CODIGO = {};

/**
 * Itens de Morango Congelado confirmados pelo cliente (10/09/2026).
 * Comparados ja normalizados (sem acento, em caixa alta).
 */
export const ITENS_MORANGO_CONGELADO = [
  "MORANGO CONGELADO 1,002KG FRUTA POLPA",
  "MORANGO CONGELADO 500G FRUTA POLPA",
];

/** Tira acento e caixa, pra regra nao depender de como foi digitado. */
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const MORANGO_EXATOS = new Set(ITENS_MORANGO_CONGELADO.map(normalizar));

/**
 * Regra de classificacao (a ordem importa):
 *   1. excecao cadastrada por codigo;
 *   2. item da lista confirmada de morango congelado;
 *   3. MORANGO + CONGELAD em qualquer lugar da descricao -> Morango
 *      Congelado (pega embalagem nova sem precisar cadastrar);
 *   4. ACAI (com ou sem acento) -> Acai;
 *   5. todo o resto -> Polpa de Frutas.
 */
export function classificarDepartamento(produto) {
  const porCodigo = DEPARTAMENTO_POR_CODIGO[produto?.codigo];
  if (porCodigo) return porCodigo;

  const d = normalizar(produto?.descricao);
  if (MORANGO_EXATOS.has(d)) return "morango";
  if (d.includes("MORANGO") && d.includes("CONGELAD")) return "morango";
  if (d.includes("ACAI")) return "acai";
  return "polpas";
}

/** Ordena por descricao em portugues (ACAI e AÇAI juntos, etc.). */
export function ordenarPorDescricao(produtos) {
  return [...produtos].sort((a, b) =>
    String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR", { sensitivity: "base" })
  );
}

/** Ticket medio da categoria = faturamento da categoria / qtd. da categoria. */
export function ticketMedioCategoria(totalFaturamento, totalQuantidade) {
  if (!totalQuantidade) return null;
  return totalFaturamento / totalQuantidade;
}

/**
 * Agrupa os produtos do mes nos departamentos comerciais, cada um com
 * seus itens em ordem alfabetica, o subtotal e o ticket medio proprio.
 * Departamento sem nenhum produto no mes nao e devolvido.
 *
 * @returns {Array<{id,label,produtos,totalQuantidade,totalFaturamento,pctParticipacao,ticketMedio}>}
 */
export function agruparPorDepartamento(produtos, totalFaturamentoMes) {
  const lista = Array.isArray(produtos) ? produtos : [];
  const total = totalFaturamentoMes || lista.reduce((s, p) => s + (p.faturamento || 0), 0);

  return DEPARTAMENTOS.map((dep) => {
    const itens = ordenarPorDescricao(lista.filter((p) => classificarDepartamento(p) === dep.id));
    const totalQuantidade = itens.reduce((s, p) => s + (p.quantidade || 0), 0);
    const totalFaturamento = itens.reduce((s, p) => s + (p.faturamento || 0), 0);
    return {
      ...dep,
      produtos: itens,
      totalQuantidade,
      totalFaturamento,
      pctParticipacao: total ? (totalFaturamento / total) * 100 : 0,
      ticketMedio: ticketMedioCategoria(totalFaturamento, totalQuantidade),
    };
  }).filter((dep) => dep.produtos.length > 0);
}
