import { createClient } from "@supabase/supabase-js";

// Configurar em variáveis de ambiente do Netlify:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Sem essas variáveis, o app funciona em "modo local": sem login,
// sem persistência entre sessões — útil para testar rapidamente.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const persistenceEnabled = Boolean(supabase);

// ═══════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════

export async function signIn(email, password) {
  if (!supabase) return { ok: false, motivo: "supabase-nao-configurado" };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, motivo: error.message };
  return { ok: true, session: data.session };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Busca a sessão atual + o perfil (papel) da pessoa logada. */
export async function getSessaoEPerfil() {
  if (!supabase) return { user: null, perfil: null };
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user || null;
  if (!user) return { user: null, perfil: null };
  const { data: perfil } = await supabase.from("perfis").select("*").eq("id", user.id).maybeSingle();
  return { user, perfil };
}

/** Escuta mudanças de login/logout (retorna função para cancelar a escuta). */
export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => sub.subscription.unsubscribe();
}

// ═══════════════════════════════════════════════════════════════════
// IMPORTAÇÃO / HISTÓRICO (lotes)
// ═══════════════════════════════════════════════════════════════════

/**
 * Registra um novo lote de importação, marcando o lote anterior do
 * mesmo (rotina, mês) como substituído — implementa a regra de
 * histórico/versionamento: "se já existe um mês importado, substitui
 * e recalcula".
 */
export async function importarLote({ rotina, mesReferencia, nomeArquivo, linhas, importadoPor }) {
  if (!supabase) return { ok: false, motivo: "supabase-nao-configurado" };

  const { data: anterior } = await supabase
    .from("lotes_importacao")
    .select("id")
    .eq("rotina", rotina)
    .eq("mes_referencia", mesReferencia)
    .eq("ativo", true)
    .maybeSingle();

  const { data: novoLote, error } = await supabase
    .from("lotes_importacao")
    .insert({
      rotina, mes_referencia: mesReferencia, nome_arquivo_original: nomeArquivo,
      linhas_importadas: linhas, importado_por: importadoPor,
    })
    .select()
    .single();

  if (error) return { ok: false, motivo: error.message };

  if (anterior) {
    await supabase
      .from("lotes_importacao")
      .update({ ativo: false, substituido_por: novoLote.id })
      .eq("id", anterior.id);
  }

  return { ok: true, lote: novoLote, substituiu: Boolean(anterior) };
}

// ═══════════════════════════════════════════════════════════════════
// PERSISTÊNCIA REAL DOS VALORES CALCULADOS (dre_linhas)
// ═══════════════════════════════════════════════════════════════════

/**
 * Grava o valor calculado de uma linha da DRE para um mês, associado
 * ao lote que a gerou. `extra` (opcional) é um objeto serializado em
 * JSON dentro de memoria_calculo — usado para reconstruir campos que
 * a UI precisa (ex: saldoCompetencia/saldoCaixa da linha 138).
 */
export async function salvarLinhaDre({ loteId, mesReferencia, linhaNumero, valor, regime, origemRotina, extra }) {
  if (!supabase) return { ok: false, motivo: "supabase-nao-configurado" };
  const { error } = await supabase.from("dre_linhas").insert({
    lote_id: loteId,
    mes_referencia: mesReferencia,
    linha_numero: linhaNumero,
    descricao: `Linha ${linhaNumero}`,
    valor,
    regime: regime || "competencia",
    origem_rotina: origemRotina,
    memoria_calculo: extra ? JSON.stringify(extra) : null,
  });
  return { ok: !error, motivo: error?.message };
}

/** Atalho: importa o lote + já grava a(s) linha(s) de DRE correspondentes. */
export async function importarLoteEGravarLinha({ rotina, mesReferencia, nomeArquivo, linhaNumero, valor, regime, extra }) {
  const resultadoLote = await importarLote({ rotina, mesReferencia, nomeArquivo });
  if (!resultadoLote.ok) return resultadoLote;
  const resultadoLinha = await salvarLinhaDre({
    loteId: resultadoLote.lote.id, mesReferencia, linhaNumero, valor, regime, origemRotina: rotina, extra,
  });
  return { ...resultadoLote, linhaGravada: resultadoLinha.ok };
}

/**
 * Carrega todo o histórico já salvo no Supabase e devolve no MESMO
 * formato que o app usa localmente (historico[rotina][mes] = {...}),
 * para popular a tela ao abrir o site sem precisar reimportar nada.
 */
export async function carregarHistoricoDre() {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("dre_linhas")
    .select("mes_referencia, valor, regime, memoria_calculo, origem_rotina, lotes_importacao!inner(ativo, nome_arquivo_original, rotina)")
    .eq("lotes_importacao.ativo", true)
    .order("mes_referencia");

  if (error || !data) return {};

  const historico = {};
  for (const row of data) {
    const rotina = row.lotes_importacao?.rotina || row.origem_rotina;
    if (!rotina) continue;
    const mes = String(row.mes_referencia).slice(0, 7); // "2026-01-01" -> "2026-01"
    let extra = null;
    if (row.memoria_calculo) {
      try { extra = JSON.parse(row.memoria_calculo); } catch { extra = null; }
    }
    if (!historico[rotina]) historico[rotina] = {};
    historico[rotina][mes] = {
      arquivo: row.lotes_importacao?.nome_arquivo_original || "(Supabase)",
      valor: row.valor,
      extra,
      substituiu: false,
      doServidor: true,
    };
  }
  return historico;
}
