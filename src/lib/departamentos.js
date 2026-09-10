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
 * Departamento por codigo de produto (Winthor) — a fonte de verdade.
 * Levantado em 10/09/2026 a partir dos 7 meses ja importados (jan-jul
 * 2026): 25 produtos distintos, tres linhas comerciais claras.
 *
 * Codigo manda sobre descricao. Produto novo que ainda nao esteja aqui
 * cai na regra de descricao abaixo, que erra pouco mas nao e garantia
 * — quando entrar produto novo, cadastre o codigo aqui.
 *
 * A linha de polpa 400g PREM inclui a POLPA DE ACAI (codigo 729):
 * confirmado pelo cliente que ela e polpa, nao a categoria Acai. A
 * categoria Acai e a linha pronta de 650g.
 */
export const DEPARTAMENTO_POR_CODIGO = {
  // ── Polpa de Frutas — linha 400g PREM ──
  684: "polpas",  // POLPA DE ABACAXI 400G
  729: "polpas",  // POLPA DE ACAI 400G  (polpa, nao categoria Acai)
  685: "polpas",  // POLPA DE ACEROLA 400G
  686: "polpas",  // POLPA DE BACURI 400G
  687: "polpas",  // POLPA DE CAJA 400G
  688: "polpas",  // POLPA DE CAJU 400G
  689: "polpas",  // POLPA DE CUPUACU 400G
  690: "polpas",  // POLPA DE GOIABA 400G
  691: "polpas",  // POLPA DE GRAVIOLA 400G
  692: "polpas",  // POLPA DE MANGA 400G
  693: "polpas",  // POLPA DE MARACUJA 400G
  694: "polpas",  // POLPA DE MORANGO 400G
  730: "polpas",  // POLPA DE MURICI 400G
  731: "polpas",  // POLPA DE TAMARINDO 400G
  735: "polpas",  // POLPA MIX ABX/HORT 400G
  736: "polpas",  // POLPA MIX HIBISCO 400G
  738: "polpas",  // POLPA MIX TROPICAL 400G
  733: "polpas",  // POLPA MIX VERDE 400G
  734: "polpas",  // POLPA MIX YELLOW 400G

  // ── Acai — linha pronta 650g ──
  14591: "acai",  // ACAI COM BANANA 650G
  14592: "acai",  // ACAI COM MORANGO 650G
  14599: "acai",  // ACAI TRADICIONAL 650G
  15560: "acai",  // ACAI TRADICIONAL ZERO 650G

  // ── Morango Congelado ──
  15567: "morango", // MORANGO CONGELADO 1,002KG
  15566: "morango", // MORANGO CONGELADO 500G
};

/**
 * Itens de Morango Congelado confirmados pelo cliente (10/09/2026).
 * Rede de seguranca caso o codigo mude: comparados ja normalizados.
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
 *   1. codigo cadastrado em DEPARTAMENTO_POR_CODIGO — manda sobre tudo;
 *   2. item da lista confirmada de morango congelado;
 *   3. MORANGO + CONGELAD na descricao -> Morango Congelado (pega
 *      embalagem nova sem precisar cadastrar o codigo);
 *   4. descricao que comeca com POLPA -> Polpa de Frutas, inclusive a
 *      polpa de acai;
 *   5. ACAI (com ou sem acento) -> Acai (a linha pronta de 650g);
 *   6. todo o resto -> Polpa de Frutas.
 */
export function classificarDepartamento(produto) {
  const porCodigo = DEPARTAMENTO_POR_CODIGO[produto?.codigo];
  if (porCodigo) return porCodigo;

  const d = normalizar(produto?.descricao);
  if (MORANGO_EXATOS.has(d)) return "morango";
  if (d.includes("MORANGO") && d.includes("CONGELAD")) return "morango";
  // Um produto que se chama "POLPA DE ..." e polpa, inclusive a de
  // acai — a categoria Acai e a linha pronta de 650g, que comeca a
  // descricao com ACAI. Esta ordem e o que impede "POLPA DE ACAI 400G"
  // de ser contado como Acai.
  if (d.startsWith("POLPA")) return "polpas";
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
