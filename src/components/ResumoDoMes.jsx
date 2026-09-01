import { useState, useMemo, Fragment } from "react";
import { DRE_NODES } from "../lib/dreNodes.js";
import { calcularResumoDoMes, montarPayloadIA, MAX_JANELA } from "../lib/resumoMensal.js";

// ═══════════════════════════════════════════════════════════════════
// RESUMO DO MÊS (demanda Gerson, 01/09/2026)
// Três camadas na mesma tela, da mais rápida de ler pra mais densa:
//   1. Cards das linhas de resultado — bateu ou não bateu a média
//   2. Itens e variações — as contas que explicam o desvio
//   3. DRE média x mês — a tabela inteira, linha por linha
// E o resumo escrito pela IA em cima desses mesmos números.
// ═══════════════════════════════════════════════════════════════════

const ENDPOINT = "/.netlify/functions/resumo-mensal";

function fmtMoeda(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (n < 0 ? "-R$ " : "R$ ") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoedaCurta(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (n < 0 ? "-R$ " : "R$ ") + Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtPctFracao(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
// Sempre ícone + sinal junto da cor (acessibilidade).
function fmtDeltaMoeda(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sinal = n > 0 ? "▲ +" : n < 0 ? "▼ −" : "= ";
  return sinal + "R$ " + Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function fmtDeltaPP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sinal = n > 0 ? "▲ +" : n < 0 ? "▼ −" : "= ";
  return sinal + Math.abs(n * 100).toFixed(2) + " p.p.";
}
function fmtDeltaPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sinal = n > 0 ? "+" : n < 0 ? "−" : "";
  return sinal + Math.abs(n * 100).toFixed(2) + "%";
}

function agruparSecoes(nodes) {
  const secoes = [];
  let atual = null;
  for (const n of nodes) {
    if (n.level === 0) { atual = { header: n, children: [] }; secoes.push(atual); }
    else if (atual) atual.children.push(n);
  }
  return secoes;
}

export default function ResumoDoMes({ T, meses, mesesLabel, overrides }) {
  const secoes = useMemo(() => agruparSecoes(DRE_NODES), []);
  const [mes, setMes] = useState(meses[meses.length - 1]);
  const [incluirMesAnalisado, setIncluirMesAnalisado] = useState(true);
  const [expandidas, setExpandidas] = useState(() => new Set());

  const [texto, setTexto] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [erroIA, setErroIA] = useState(null);

  const resumo = useMemo(
    () => calcularResumoDoMes({ dreNodes: DRE_NODES, mes, mesesFechados: meses, overrides, incluirMesAnalisado }),
    [mes, meses, overrides, incluirMesAnalisado]
  );

  const toggle = (row) => setExpandidas((prev) => {
    const next = new Set(prev);
    next.has(row) ? next.delete(row) : next.add(row);
    return next;
  });

  async function gerarResumo() {
    setGerando(true); setErroIA(null); setTexto(null);
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarPayloadIA(resumo, mesesLabel)),
      });
      const tipo = r.headers.get("content-type") || "";

      // Vite puro devolve o index.html — a função não existe neste ambiente.
      if (tipo.includes("text/html")) {
        throw new Error("A função de IA não está disponível neste ambiente. Ela só responde no site publicado no Netlify, ou localmente rodando `netlify dev` em vez de `npm run dev`.");
      }
      // Erro estruturado (chave, payload, limite) sai como JSON.
      if (tipo.includes("application/json")) {
        const dados = await r.json();
        throw new Error(dados.mensagem || dados.erro || `Erro ${r.status}`);
      }
      if (!r.ok || !r.body) {
        throw new Error(`O servidor respondeu ${r.status} sem conteúdo utilizável.`);
      }

      // Caminho normal: texto chegando em pedaços. Vai aparecendo na
      // tela enquanto é escrito, em vez de meio minuto em branco.
      const leitor = r.body.getReader();
      const decoder = new TextDecoder();
      let acumulado = "";
      setTexto("");
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decoder.decode(value, { stream: true });
        setTexto(acumulado);
      }
      acumulado += decoder.decode();
      if (!acumulado.trim()) throw new Error("O modelo não devolveu texto.");
      setTexto(acumulado);
    } catch (e) {
      setTexto(null);
      setErroIA(e.message);
    }
    setGerando(false);
  }

  const labelJanela = resumo.janela.length
    ? `${mesesLabel[resumo.janela[0]]}–${mesesLabel[resumo.janela[resumo.janela.length - 1]]}`
    : "—";
  const volumeAcimaDaMedia = resumo.mediaFechamentos !== null && resumo.fechamentosDoMes > resumo.mediaFechamentos;
  const volumeAbaixoDaMedia = resumo.mediaFechamentos !== null && resumo.fechamentosDoMes < resumo.mediaFechamentos;

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Resumo do Mês</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 16, maxWidth: 780 }}>
        Compara o mês escolhido com a <b>DRE média do ano</b> e mostra, conta por conta, o que puxou o resultado pra cima ou pra baixo. A média usa uma janela móvel dos meses já fechados, travada em no máximo {MAX_JANELA}.
      </p>

      {/* ── Controles ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>Mês analisado:
          <select value={mes} onChange={(e) => { setMes(e.target.value); setTexto(null); setErroIA(null); }}
            style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "5px 10px", fontSize: 12 }}>
            {meses.map((m) => <option key={m} value={m}>{mesesLabel[m] || m}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          title="Ligado: a média inclui o próprio mês analisado (hoje, 7 meses). Desligado: a média usa só os meses anteriores a ele (hoje, 6 meses).">
          <input type="checkbox" checked={incluirMesAnalisado} onChange={(e) => { setIncluirMesAnalisado(e.target.checked); setTexto(null); }} />
          Incluir o mês analisado na média
        </label>
        <button onClick={gerarResumo} disabled={gerando} style={{
          background: gerando ? T.surface : T.primary, color: gerando ? T.textMuted : "#fff",
          border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 12,
          cursor: gerando ? "default" : "pointer",
        }}>
          {gerando ? "Escrevendo…" : "✦ Gerar resumo com IA"}
        </button>
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
        Média de <b style={{ color: T.textSub }}>{resumo.mesesNaJanela} mês(es)</b> ({labelJanela}){resumo.incluirMesAnalisado ? ", incluindo o mês analisado" : ", sem o mês analisado"} &nbsp;·&nbsp;
        {mesesLabel[mes]} teve <b style={{ color: T.textSub }}>{resumo.fechamentosDoMes} fechamentos</b> contra média de <b style={{ color: T.textSub }}>{resumo.mediaFechamentos}</b>
      </div>
      {(volumeAcimaDaMedia || volumeAbaixoDaMedia) && (
        <div style={{ fontSize: 11, color: T.warning, border: `1px solid ${T.warning}55`, background: T.goldDim, borderRadius: 6, padding: "6px 10px", marginBottom: 14, maxWidth: 780 }}>
          ⚠ ATENÇÃO — {mesesLabel[mes]} tem {volumeAcimaDaMedia ? "mais" : "menos"} fechamentos que a média da janela. Parte da diferença nas linhas de receita e custo é volume de calendário, não desempenho.
        </div>
      )}

      {/* ── Resumo escrito pela IA ──────────────────────────────── */}
      {erroIA && (
        <div style={{ border: `1px solid ${T.danger}55`, background: T.danger + "12", borderRadius: 8, padding: "12px 14px", marginBottom: 20, fontSize: 12, color: T.textSub, maxWidth: 900 }}>
          <b style={{ color: T.danger }}>✗ Não consegui gerar o resumo.</b> {erroIA}
          <div style={{ marginTop: 6, color: T.textMuted }}>As tabelas abaixo não dependem da IA e continuam corretas.</div>
        </div>
      )}
      {texto && (
        <div style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 10, padding: "18px 22px", marginBottom: 24, maxWidth: 900 }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 10, letterSpacing: 0.5 }}>
            RESUMO DE RESULTADO · {(mesesLabel[mes] || mes).toUpperCase()}
          </div>
          {texto.split(/\n{2,}/).map((par, i) => (
            <p key={i} style={{ fontSize: 13.5, lineHeight: 1.75, color: T.text, marginBottom: 12, textAlign: "justify" }}>{par}</p>
          ))}
          {gerando && <div style={{ fontSize: 11, color: T.primary, fontWeight: 700 }}>✦ escrevendo…</div>}
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
            Texto gerado por IA a partir dos números apurados abaixo. Os números não passam pelo modelo para serem calculados, só para serem narrados. Revise antes de mandar pra diretoria.
          </div>
        </div>
      )}

      {/* ── 1. Linhas de resultado ──────────────────────────────── */}
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Linhas de resultado</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 26 }}>
        {resumo.resultado.map((c) => (
          <CardResultado key={c.row} T={T} c={c} mesLabel={mesesLabel[mes]} />
        ))}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 8 }}>MARGEM BRUTA (% DA RECEITA)</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.text, marginBottom: 2 }}>
            <span>{mesesLabel[mes]}</span><b>{fmtPctFracao(resumo.margemBruta.mes)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, marginBottom: 8 }}>
            <span>Média</span><b>{fmtPctFracao(resumo.margemBruta.media)}</b>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: resumo.margemBruta.deltaPP === null ? T.textMuted : resumo.margemBruta.deltaPP >= 0 ? T.leaf : T.danger }}>
            {fmtDeltaPP(resumo.margemBruta.deltaPP)}
          </div>
        </div>
      </div>

      {/* ── 2. Itens e variações ────────────────────────────────── */}
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Itens e variações que explicam o resultado</h2>
      <p style={{ color: T.textMuted, fontSize: 12, marginBottom: 10, maxWidth: 780 }}>
        As 15 contas analíticas que mais afastaram {mesesLabel[mes]} da média, ordenadas por impacto em R$. É daqui que sai a explicação do mês.
      </p>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "auto", marginBottom: 28 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            <th style={th(T)}>Linha</th><th style={th(T)}>Conta</th>
            <th style={{ ...th(T), textAlign: "right" }}>{mesesLabel[mes]}</th>
            <th style={{ ...th(T), textAlign: "right" }}>Média ({resumo.mesesNaJanela}m)</th>
            <th style={{ ...th(T), textAlign: "right", color: T.gold }}>Diferença (R$)</th>
            <th style={{ ...th(T), textAlign: "right" }}>Var. %</th>
          </tr></thead>
          <tbody>
            {resumo.explicacoes.map((c) => (
              <tr key={c.row}>
                <td style={{ ...td(T), color: T.textMuted }}>{c.row}</td>
                <td style={td(T)}>{c.conta && <span style={{ color: T.textMuted, marginRight: 6, fontSize: 10 }}>{c.conta}</span>}{c.label}</td>
                <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoedaCurta(c.valor)}</td>
                <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: T.textSub }}>{fmtMoedaCurta(c.media)}</td>
                <td style={{ ...td(T), textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", color: c.delta >= 0 ? T.leaf : T.danger }}>{fmtDeltaMoeda(c.delta)}</td>
                <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: T.textMuted }}>{fmtDeltaPct(c.deltaPct)}</td>
              </tr>
            ))}
            {resumo.explicacoes.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: T.textMuted }}>Sem variação relevante contra a média.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── 3. DRE média x mês ──────────────────────────────────── */}
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700, marginBottom: 10 }}>DRE média do ano × {mesesLabel[mes]}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => setExpandidas(new Set(secoes.map((s) => s.header.row)))} style={btnMini(T)}>Expandir tudo (analítico)</button>
        <button onClick={() => setExpandidas(new Set())} style={btnMini(T)}>Recolher tudo (sintético)</button>
      </div>
      <div style={{ maxHeight: "calc(100vh - 240px)", overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            <th style={{ ...th(T), position: "sticky", left: 0, top: 0, background: T.bg, zIndex: 3, width: 320, minWidth: 320 }}>Linha</th>
            <th style={{ ...th(T), textAlign: "right", position: "sticky", top: 0, background: T.bg, zIndex: 2 }}>Média do ano ({resumo.mesesNaJanela}m)</th>
            <th style={{ ...th(T), textAlign: "right", position: "sticky", top: 0, background: T.bg, zIndex: 2 }}>{mesesLabel[mes]}</th>
            <th style={{ ...th(T), textAlign: "right", position: "sticky", top: 0, background: T.primaryDim, zIndex: 2, color: T.primary, borderLeft: `2px solid ${T.primary}` }}>Diferença</th>
            <th style={{ ...th(T), textAlign: "right", position: "sticky", top: 0, background: T.primaryDim, zIndex: 2, color: T.primary }}>Var. %</th>
          </tr></thead>
          <tbody>
            <TituloSecao T={T} texto="DRE CONTÁBIL" />
            {secoes.map((sec) => (
              <SecaoResumo key={sec.header.row} T={T} sec={sec} porRow={resumo.porRow}
                isExpanded={expandidas.has(sec.header.row)} toggle={toggle}
                inserirTituloGerencialAntes={sec.header.row === 201} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardResultado({ T, c, mesLabel }) {
  const bateu = c.delta !== null && c.delta >= 0;
  return (
    <div style={{ background: T.card, border: `1px solid ${bateu ? T.leaf + "55" : T.danger + "55"}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 8 }}>{c.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.text, marginBottom: 2 }}>
        <span>{mesLabel}</span><b>{c.ehPct ? fmtPctFracao(c.valor) : fmtMoedaCurta(c.valor)}</b>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, marginBottom: 8 }}>
        <span>Média</span><b>{c.ehPct ? fmtPctFracao(c.media) : fmtMoedaCurta(c.media)}</b>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: c.delta === null ? T.textMuted : bateu ? T.leaf : T.danger }}>
        {c.ehPct ? fmtDeltaPP(c.delta) : fmtDeltaMoeda(c.delta)}
        {!c.ehPct && c.deltaPct !== null && <span style={{ fontSize: 11, fontWeight: 400, color: T.textMuted }}> &nbsp;({fmtDeltaPct(c.deltaPct)})</span>}
      </div>
      <div style={{ fontSize: 10, color: c.delta === null ? T.textMuted : bateu ? T.leaf : T.danger, marginTop: 4, fontWeight: 700 }}>
        {c.delta === null ? "—" : bateu ? "✓ acima da média" : "✗ abaixo da média"}
      </div>
    </div>
  );
}

function TituloSecao({ T, texto }) {
  return (
    <tr>
      <td colSpan={5} style={{ padding: "10px", background: T.primaryDim, borderTop: `2px solid ${T.primary}`, borderBottom: `1px solid ${T.primary}`, fontWeight: 800, fontSize: 13, color: T.primary, letterSpacing: 0.5, position: "sticky", left: 0 }}>{texto}</td>
    </tr>
  );
}

function Celulas({ T, c, forte }) {
  const cor = c.delta === null ? T.textMuted : c.delta >= 0 ? T.leaf : T.danger;
  return (
    <>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: c.ehPct ? T.gold : T.textSub, fontWeight: forte ? 700 : 400 }}>{c.ehPct ? fmtPctFracao(c.media) : fmtMoeda(c.media)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: c.ehPct ? T.gold : T.text, fontWeight: forte ? 700 : 400 }}>{c.ehPct ? fmtPctFracao(c.valor) : fmtMoeda(c.valor)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: cor, background: T.primaryDim, borderLeft: `2px solid ${T.primary}` }}>{c.ehPct ? fmtDeltaPP(c.delta) : fmtDeltaMoeda(c.delta)}</td>
      <td style={{ ...td(T), textAlign: "right", whiteSpace: "nowrap", color: cor, background: T.primaryDim }}>{c.ehPct ? "—" : fmtDeltaPct(c.deltaPct)}</td>
    </>
  );
}

function SecaoResumo({ T, sec, porRow, isExpanded, toggle, inserirTituloGerencialAntes }) {
  const temFilhos = sec.children.length > 0;
  const c = porRow[sec.header.row];
  const rows = [];
  if (inserirTituloGerencialAntes) rows.push(<TituloSecao key="titulo-gerencial" T={T} texto="DRE GERENCIAL" />);
  if (!c) return rows;
  const isPct = c.ehPct;

  rows.push(
    <tr key={sec.header.row} style={{ background: isPct ? T.goldDim : T.card }}>
      <td style={{ ...td(T), fontWeight: 700, position: "sticky", left: 0, background: isPct ? T.goldDim : T.card, color: isPct ? T.gold : T.text, width: 320, minWidth: 320 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {temFilhos
            ? <button onClick={() => toggle(sec.header.row)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11, padding: 0 }}>{isExpanded ? "▾" : "▸"}</button>
            : <span style={{ width: 12 }} />}
          <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px" }}>{c.row}</span>
          {c.label}
        </span>
      </td>
      <Celulas T={T} c={c} forte />
    </tr>
  );

  if (isExpanded) {
    sec.children.forEach((child) => {
      const cc = porRow[child.row];
      if (!cc) return;
      rows.push(
        <tr key={child.row}>
          <td style={{ ...td(T), paddingLeft: 14 + child.level * 16, position: "sticky", left: 0, background: T.bg, color: T.textSub, fontWeight: child.total ? 700 : 400, width: 320, minWidth: 320 }}>
            {child.conta && <span style={{ color: T.textMuted, marginRight: 6, fontSize: 10 }}>{child.conta}</span>}
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>{child.row}</span>
            {child.label}
          </td>
          <Celulas T={T} c={cc} forte={child.total} />
        </tr>
      );
    });
  }
  return rows;
}

function th(T) { return { padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap" }; }
function td(T) { return { padding: "6px 10px", borderBottom: `1px solid ${T.border}` }; }
function btnMini(T) { return { background: "transparent", border: `1px solid ${T.borderHi}`, color: T.textSub, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }; }
