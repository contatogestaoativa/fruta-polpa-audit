// ═══════════════════════════════════════════════════════════════════
// LINHAS GERENCIAIS CONFIGURÁVEIS
//
// A contabilidade (perfil com pode_configurar_layout) liga/desliga linhas e
// cria linhas novas pela tela "Linhas gerenciais", sem mexer em código.
//
//  · Linhas EXISTENTES (builtin): só ganham vigência. Fora da vigência a linha
//    vale 0 naquele mês — o histórico anterior continua intacto.
//  · Linhas PERSONALIZADAS: nome, sinal (+ soma ao lucro, − subtrai), fonte
//    (grupo de contas do Winthor, conta específica ou valor digitado por mês) e
//    vigência. Entram na fórmula dos dois lucros (gerencial e com subvenções),
//    exatamente como Depreciação, Grupo 222, Notas Técnicas e Grupo 750.
//
// Vigência: vigente_de / vigente_ate são o dia 01 do mês ("2026-09-01") ou null.
// Tudo aqui é função pura para poder ser testada sem navegador.
// ═══════════════════════════════════════════════════════════════════

// Linhas que já existiam no sistema e entram em "ajustes gerenciais".
export const LINHAS_BUILTIN = [
  { chave: "builtin:depreciacao",     rotulo: "Depreciação ( + )",                       curta: "depreciacao" },
  { chave: "builtin:descontos2025",   rotulo: "Descontos Concedidos 2025 ( + )",         curta: "descontos2025" },
  { chave: "builtin:descontos2026",   rotulo: "Descontos Concedidos 2026 ( + )",         curta: "descontos2026" },
  { chave: "builtin:descontosPorComp", rotulo: "Descontos Concedidos por Comp ( - )",    curta: "descontosPorComp" },
  { chave: "builtin:grupo222",        rotulo: "Despesas Pré-operacionais Grupo 222 ( + )", curta: "grupo222" },
  { chave: "builtin:notasTecnicas",   rotulo: "Notas Técnicas ( + )",                    curta: "notasTecnicas" },
  { chave: "builtin:grupo750",        rotulo: "Despesas Grupo 750 e 538 ESB ( - )",      curta: "grupo750" },
];

const soMes = (d) => (d ? String(d).slice(0, 7) : null); // "2026-09-01" -> "2026-09"

/** A linha vale no mês? mes = "AAAA-MM". Linha inexistente = vale (comportamento antigo). */
export function vigenteNoMes(linha, mes) {
  if (!linha) return true;
  if (linha.excluida) return false;
  const de = soMes(linha.vigente_de), ate = soMes(linha.vigente_ate);
  if (de && mes < de) return false;
  if (ate && mes > ate) return false;
  return true;
}

/** Linhas ativas em algum mês da lista (para decidir se a linha aparece na tela). */
export function vigenteEmAlgumMes(linha, meses) {
  return meses.some((m) => vigenteNoMes(linha, m));
}

/** Mês anterior: "2026-09" -> "2026-08". */
export function mesAnterior(mes) {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export function mesComoData(mes) { return `${mes}-01`; }

/** Linhas personalizadas não excluídas, na ordem escolhida pela contabilidade. */
export function personalizadasOrdenadas(linhas) {
  return (linhas || [])
    .filter((l) => l.tipo === "personalizada" && !l.excluida)
    .sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || String(a.criado_em || "").localeCompare(String(b.criado_em || "")));
}

/** Rótulo exibido na árvore: o nome + (+) ou (-), no mesmo padrão das demais linhas. */
export function rotuloNaArvore(linha) {
  const marca = linha.sinal === -1 ? "( - )" : "( + )";
  return `${String(linha.rotulo).trim()} ${marca}`;
}

/**
 * Valor (já com sinal) que a linha personalizada tem no mês, ou undefined se não houver dado.
 *  - grupo/conta: o que o script gravou em banco-gerencial.extra.personalizadas
 *  - manual: valor digitado na tela
 */
export function valorPersonalizada(linha, mes, bancoExtra, valoresManuais) {
  let bruto;
  if (linha.fonte === "manual") bruto = valoresManuais?.[linha.chave]?.[mes];
  else bruto = bancoExtra?.personalizadas?.[linha.chave];
  if (typeof bruto !== "number" || Number.isNaN(bruto)) return undefined;
  return Math.round(bruto * (linha.sinal === -1 ? -1 : 1) * 100) / 100;
}

/**
 * Configuração de um mês no formato que montarDreDoMes entende.
 * @param linhas          linhas_gerenciais (builtin + personalizadas)
 * @param valoresManuais  { chave: { "AAAA-MM": valor } }
 * @param bancoExtra      historico["banco-gerencial"]?.[mes]?.extra
 */
export function configDoMes(linhas, valoresManuais, bancoExtra, mes) {
  const porChave = Object.fromEntries((linhas || []).map((l) => [l.chave, l]));
  const personalizadas = personalizadasOrdenadas(linhas)
    .filter((l) => vigenteNoMes(l, mes))
    .map((l) => ({ chave: l.chave, valor: valorPersonalizada(l, mes, bancoExtra, valoresManuais) ?? 0, temDado: valorPersonalizada(l, mes, bancoExtra, valoresManuais) !== undefined }));
  return {
    builtinAtiva: (curta) => vigenteNoMes(porChave[`builtin:${curta}`], mes),
    personalizadas,
  };
}

/** Agrupa as linhas de valores manuais do banco em { chave: { "AAAA-MM": valor } }. */
export function valoresManuaisPorChave(linhasValores) {
  const out = {};
  for (const v of linhasValores || []) {
    const mes = soMes(v.mes_referencia);
    (out[v.linha_chave] ||= {})[mes] = Number(v.valor);
  }
  return out;
}

/** Validação do formulário de nova linha / edição. Devolve lista de mensagens (vazia = ok). */
export function validarLinha(l, outras = []) {
  const erros = [];
  const nome = String(l.rotulo || "").trim();
  if (nome.length < 3) erros.push("Dê um nome para a linha (mínimo 3 letras).");
  if (nome.length > 60) erros.push("O nome está muito longo (máximo 60 caracteres).");
  if (![1, -1].includes(l.sinal)) erros.push("Escolha se a linha soma (+) ou subtrai (−) do lucro.");
  if (!["grupo_winthor", "conta_winthor", "manual"].includes(l.fonte)) erros.push("Escolha de onde vem o valor.");
  if ((l.fonte === "grupo_winthor" || l.fonte === "conta_winthor") && !/^\d{1,12}$/.test(String(l.fonte_valor || "").trim()))
    erros.push(l.fonte === "grupo_winthor" ? "Informe o número do grupo de contas do Winthor (só números)." : "Informe o código da conta do Winthor (só números).");
  const de = soMes(l.vigente_de), ate = soMes(l.vigente_ate);
  if (de && ate && ate < de) erros.push("O fim da vigência não pode ser antes do início.");
  const dup = outras.find((o) => o.chave !== l.chave && !o.excluida && String(o.rotulo).trim().toLowerCase() === nome.toLowerCase());
  if (dup) erros.push("Já existe uma linha com esse nome.");
  return erros;
}

/** Chave estável para linha nova (sem acento, minúscula, com sufixo único). */
export function gerarChave(rotulo, agora = Date.now()) {
  const base = String(rotulo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "linha";
  return `pers:${base}-${agora.toString(36)}`;
}
