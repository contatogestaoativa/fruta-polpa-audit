import { useState, useMemo, useEffect, useCallback } from "react";
import { glass } from "../theme.js";
import { salvarLinhaGerencial, salvarValorManualLinha, listarHistoricoLinhas } from "../lib/supabaseClient.js";
import { personalizadasOrdenadas, mesAnterior, validarLinha, gerarChave, mesComoData } from "../lib/linhasGerenciais.js";

const NOME_MES = { "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez" };
const fmtMes = (m) => (m ? `${NOME_MES[m.slice(5, 7)]}/${m.slice(0, 4)}` : "—");
const soMes = (d) => (d ? String(d).slice(0, 7) : "");
const proximoMes = (m) => { const [a, n] = m.split("-").map(Number); return n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, "0")}`; };

const FONTES = {
  grupo_winthor: "Grupo de contas do Winthor",
  conta_winthor: "Conta do Winthor",
  manual: "Valor digitado por mês",
};

function numeroBR(texto) {
  const t = String(texto).trim();
  if (t === "") return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
const textoBR = (n) => (n === undefined || n === null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function ConfigLinhasGerenciais({ T, linhas, valores, meses, onAlterou, migracaoPendente }) {
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [novaAberta, setNovaAberta] = useState(false);

  const ultimoMes = meses[meses.length - 1];
  const opcoesMes = useMemo(() => {
    const lista = [...meses];
    for (let i = 0; i < 6; i++) lista.push(proximoMes(lista[lista.length - 1]));
    return [...new Set(lista)].sort();
  }, [meses]);

  const recarregarHistorico = useCallback(async () => {
    const r = await listarHistoricoLinhas(30);
    setHistorico(r.historico || []);
  }, []);
  useEffect(() => { recarregarHistorico(); }, [recarregarHistorico]);

  const originais = useMemo(() => linhas.filter((l) => l.tipo === "builtin").sort((a, b) => a.ordem - b.ordem), [linhas]);
  const personalizadas = useMemo(() => personalizadasOrdenadas(linhas), [linhas]);

  async function aplicar(promessa, textoOk) {
    setOcupado(true); setMsg(null);
    const r = await promessa;
    setOcupado(false);
    if (!r.ok) { setMsg({ tipo: "erro", texto: r.motivo || "Não foi possível salvar." }); return false; }
    setMsg({ tipo: "ok", texto: textoOk });
    await onAlterou();
    recarregarHistorico();
    return true;
  }

  const salvarLinha = (linha, patch, textoOk, opcoes) => aplicar(salvarLinhaGerencial({ ...linha, ...patch }, opcoes), textoOk);

  // ── estilos ──
  const cartao = { ...glass(T), borderRadius: 16, padding: "14px 16px", marginBottom: 10 };
  const botao = (primario) => ({ background: primario ? T.gradient : "transparent", color: primario ? T.onPrimary : T.text, border: primario ? "none" : `1px solid ${T.borderHi}`, borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 });
  const campo = { background: T.bg, color: T.text, border: `1px solid ${T.borderHi}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 };
  const chip = (cor) => ({ fontSize: 10, fontWeight: 700, color: cor, border: `1px solid ${cor}55`, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" });

  function status(l) {
    if (l.excluida) return { texto: "Arquivada", cor: T.textMuted };
    const de = soMes(l.vigente_de), ate = soMes(l.vigente_ate);
    if (ate && ate < ultimoMes) return { texto: `Encerrada em ${fmtMes(ate)}`, cor: T.warning };
    if (ate) return { texto: `Ativa até ${fmtMes(ate)}`, cor: T.leaf };
    if (de && de > ultimoMes) return { texto: `Começa em ${fmtMes(de)}`, cor: T.gold };
    return { texto: de ? `Ativa desde ${fmtMes(de)}` : "Ativa", cor: T.leaf };
  }

  function CartaoLinha({ l }) {
    const [aberto, setAberto] = useState(false);
    const [editando, setEditando] = useState(false);
    const [mesDesativar, setMesDesativar] = useState(opcoesMes.find((m) => m > ultimoMes) || ultimoMes);
    const [de, setDe] = useState(soMes(l.vigente_de));
    const [ate, setAte] = useState(soMes(l.vigente_ate));
    const st = status(l);
    const personalizada = l.tipo === "personalizada";
    const encerrada = Boolean(l.vigente_ate);

    return (
      <div style={{ ...cartao, opacity: l.excluida ? 0.6 : 1 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 14, flex: "1 1 240px", minWidth: 0 }}>{l.rotulo}</div>
          <span style={chip(T.textSub)}>{l.sinal === -1 ? "Subtrai do lucro" : "Soma ao lucro"}</span>
          {personalizada && <span style={chip(T.primaryText)}>{FONTES[l.fonte]}{l.fonte !== "manual" ? ` ${l.fonte_valor}` : ""}</span>}
          {!personalizada && <span style={chip(T.textMuted)}>linha original</span>}
          <span style={chip(st.cor)}>{st.texto}</span>
        </div>

        {!l.excluida && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            {!encerrada ? (
              <>
                <span style={{ fontSize: 12, color: T.textSub }}>Desativar a partir de</span>
                <select value={mesDesativar} onChange={(e) => setMesDesativar(e.target.value)} style={campo} aria-label="Mês a partir do qual a linha deixa de valer">
                  {opcoesMes.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
                </select>
                <button disabled={ocupado} style={botao(false)}
                  onClick={() => salvarLinha(l, { vigente_ate: mesComoData(mesAnterior(mesDesativar)) }, `“${l.rotulo}” deixa de valer a partir de ${fmtMes(mesDesativar)}. Os meses anteriores não mudam.`)}>
                  Desativar
                </button>
              </>
            ) : (
              <button disabled={ocupado} style={botao(true)}
                onClick={() => salvarLinha(l, { vigente_ate: null }, `“${l.rotulo}” foi reativada, sem data de fim.`)}>
                Reativar (sem data de fim)
              </button>
            )}
            <button disabled={ocupado} style={botao(false)} onClick={() => setEditando((v) => !v)}>{editando ? "Fechar edição" : "Editar vigência"}</button>
            {personalizada && l.fonte === "manual" && <button style={botao(false)} onClick={() => setAberto((v) => !v)}>{aberto ? "Ocultar valores" : "Digitar valores"}</button>}
            {personalizada && (
              <button disabled={ocupado} style={botao(false)}
                onClick={() => window.confirm(`Arquivar “${l.rotulo}”? Ela sai da DRE, mas o histórico fica guardado.`) && salvarLinha(l, { excluida: true }, `“${l.rotulo}” foi arquivada.`)}>
                Arquivar
              </button>
            )}
          </div>
        )}
        {l.excluida && personalizada && (
          <div style={{ marginTop: 10 }}><button disabled={ocupado} style={botao(false)} onClick={() => salvarLinha(l, { excluida: false }, `“${l.rotulo}” voltou para a DRE.`)}>Restaurar</button></div>
        )}

        {editando && (
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>Vale desde
              <select value={de} onChange={(e) => setDe(e.target.value)} style={campo}><option value="">Desde o início</option>{opcoesMes.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}</select>
            </label>
            <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>Vale até (inclusive)
              <select value={ate} onChange={(e) => setAte(e.target.value)} style={campo}><option value="">Sem data de fim</option>{opcoesMes.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}</select>
            </label>
            <button disabled={ocupado} style={botao(true)} onClick={async () => {
              if (de && ate && ate < de) { setMsg({ tipo: "erro", texto: "O fim da vigência não pode ser antes do início." }); return; }
              if (await salvarLinha(l, { vigente_de: de ? mesComoData(de) : null, vigente_ate: ate ? mesComoData(ate) : null }, `Vigência de “${l.rotulo}” atualizada.`)) setEditando(false);
            }}>Salvar vigência</button>
          </div>
        )}

        {aberto && personalizada && l.fonte === "manual" && <GradeManual l={l} />}
      </div>
    );
  }

  function GradeManual({ l }) {
    const meses1 = opcoesMes.filter((m) => m <= (opcoesMes.find((x) => x > ultimoMes) || ultimoMes));
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8 }}>
          Digite o valor <b>positivo</b> de cada mês (ex.: 1.250,00). O sinal da linha ({l.sinal === -1 ? "subtrai" : "soma"}) é aplicado automaticamente. Vale na hora, sem esperar o TI. Deixe em branco para remover.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {meses1.map((m) => (
            <label key={m} style={{ fontSize: 11, color: T.textSub, display: "grid", gap: 3 }}>{fmtMes(m)}
              <input defaultValue={textoBR(valores?.[l.chave]?.[m])} inputMode="decimal" placeholder="—" style={{ ...campo, textAlign: "right" }}
                onBlur={async (e) => {
                  const n = numeroBR(e.target.value);
                  if (Number.isNaN(n)) { setMsg({ tipo: "erro", texto: `Valor inválido em ${fmtMes(m)}.` }); return; }
                  if ((n ?? null) === (valores?.[l.chave]?.[m] ?? null)) return;
                  await aplicar(salvarValorManualLinha({ chave: l.chave, mes: m, valor: n }), `${fmtMes(m)} de “${l.rotulo}” salvo.`);
                }} />
            </label>
          ))}
        </div>
      </div>
    );
  }

  function FormNova() {
    const [f, setF] = useState({ rotulo: "", sinal: 1, fonte: "grupo_winthor", fonte_valor: "", vigente_de: "" });
    const [erros, setErros] = useState([]);
    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    return (
      <div style={{ ...cartao, borderColor: T.borderHi }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Nova linha gerencial</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>Nome da linha
            <input value={f.rotulo} onChange={(e) => set("rotulo", e.target.value)} placeholder="Ex.: Prêmio de promoção comercial" style={campo} maxLength={60} />
          </label>
          <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>O valor…
            <select value={f.sinal} onChange={(e) => set("sinal", Number(e.target.value))} style={campo}>
              <option value={1}>Soma ao lucro ( + )</option>
              <option value={-1}>Subtrai do lucro ( − )</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>De onde vem o valor
            <select value={f.fonte} onChange={(e) => set("fonte", e.target.value)} style={campo}>
              {Object.entries(FONTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {f.fonte !== "manual" && (
            <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>{f.fonte === "grupo_winthor" ? "Nº do grupo de contas" : "Código da conta"}
              <input value={f.fonte_valor} onChange={(e) => set("fonte_valor", e.target.value.trim())} inputMode="numeric" placeholder={f.fonte === "grupo_winthor" ? "Ex.: 224" : "Ex.: 750570"} style={campo} />
            </label>
          )}
          <label style={{ fontSize: 12, color: T.textSub, display: "grid", gap: 4 }}>Vale desde
            <select value={f.vigente_de} onChange={(e) => set("vigente_de", e.target.value)} style={campo}>
              <option value="">Desde o início</option>
              {opcoesMes.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
            </select>
          </label>
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10, lineHeight: 1.6 }}>
          {f.fonte === "manual"
            ? "Você digita o valor de cada mês depois de criar a linha. Vale na hora."
            : "O valor é a soma dos lançamentos do Winthor (por data de lançamento) e é calculado na atualização diária do TI: a linha aparece no dia seguinte. Para preencher meses anteriores, peça ao TI uma carga do período."}
        </div>
        {erros.length > 0 && <ul role="alert" style={{ color: T.danger, fontSize: 12, margin: "10px 0 0 18px" }}>{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button disabled={ocupado} style={botao(true)} onClick={async () => {
            const nova = { ...f, chave: gerarChave(f.rotulo), rotulo: f.rotulo.trim(), fonte_valor: f.fonte === "manual" ? null : f.fonte_valor,
              vigente_de: f.vigente_de ? mesComoData(f.vigente_de) : null, vigente_ate: null, ordem: 100 + personalizadas.length, excluida: false };
            const e = validarLinha(nova, linhas);
            setErros(e);
            if (e.length) return;
            if (await salvarLinha(nova, {}, `Linha “${nova.rotulo}” criada.`, { nova: true })) setNovaAberta(false);
          }}>Criar linha</button>
          <button style={botao(false)} onClick={() => setNovaAberta(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  if (migracaoPendente) {
    return (
      <div style={{ ...glass(T), padding: 24 }}>
        <h1 style={{ fontFamily: T.fontDisplay, fontStretch: T.displayStretch, fontSize: 24 }}>Linhas gerenciais</h1>
        <p style={{ color: T.textSub, marginTop: 10, fontSize: 13 }}>Esta tela ainda não foi ativada no banco de dados. Peça à consultoria para rodar o arquivo <b>migracao-linhas-gerenciais.sql</b> no Supabase.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontStretch: T.displayStretch, fontSize: 26, fontWeight: 700 }}>Linhas gerenciais</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginTop: 6, maxWidth: 820, lineHeight: 1.6 }}>
        Aqui a contabilidade liga, desliga e cria as linhas do bloco gerencial, a qualquer momento do mês. A mudança vale para os meses indicados e <b>o histórico não é alterado</b>:
        uma linha desativada em outubro continua mostrando o que tinha até setembro. Depois de salvar, abra a aba DRE para conferir.
      </p>

      {msg && (
        <div role={msg.tipo === "erro" ? "alert" : "status"} style={{ margin: "14px 0", padding: "10px 14px", borderRadius: 12, fontSize: 13, border: `1px solid ${msg.tipo === "erro" ? T.danger : T.leaf}`, background: (msg.tipo === "erro" ? T.danger : T.leaf) + "1E" }}>
          {msg.texto}
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "22px 0 4px" }}>Linhas que já existem</h2>
      <p style={{ color: T.textMuted, fontSize: 12, marginBottom: 10 }}>Nome e sinal dessas linhas são fixos; você controla desde quando e até quando elas valem.</p>
      {originais.map((l) => <CartaoLinha key={l.chave} l={l} />)}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, margin: "26px 0 8px" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Linhas criadas pela contabilidade</h2>
        {!novaAberta && <button style={botao(true)} onClick={() => setNovaAberta(true)}>+ Nova linha</button>}
      </div>
      {novaAberta && <FormNova />}
      {personalizadas.length === 0 && !novaAberta && <p style={{ color: T.textMuted, fontSize: 12 }}>Nenhuma linha criada ainda.</p>}
      {personalizadas.map((l) => <CartaoLinha key={l.chave} l={l} />)}
      {linhas.filter((l) => l.tipo === "personalizada" && l.excluida).map((l) => <CartaoLinha key={l.chave} l={l} />)}

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "26px 0 8px" }}>Últimas alterações</h2>
      <div style={{ ...glass(T), borderRadius: 16, padding: "6px 16px" }}>
        {historico.length === 0 && <div style={{ padding: "12px 0", color: T.textMuted, fontSize: 12 }}>Nenhuma alteração registrada ainda.</div>}
        {historico.map((h) => {
          const acao = h.acao === "INSERT" ? "criou" : h.acao === "DELETE" ? "removeu" : "alterou";
          // chave "pers:xxx @ 2026-09-01" = valor digitado de um mês; senão, a própria linha
          const [chaveLinha, mesValor] = String(h.chave).split(" @ ");
          const nome = linhas.find((l) => l.chave === chaveLinha)?.rotulo || chaveLinha;
          const alvo = mesValor ? `o valor de ${fmtMes(mesValor.slice(0, 7))} da linha “${nome}”` : `a linha “${nome}”`;
          return (
            <div key={h.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.textSub }}>
              <b style={{ color: T.text }}>{h.por_nome || "Sistema"}</b> {acao} {alvo} · {new Date(h.em).toLocaleString("pt-BR")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
