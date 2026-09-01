import { useState, useCallback, useMemo, useEffect, Component } from "react";
import * as XLSX from "xlsx";
import { THEMES } from "./theme.js";
import { Logo } from "./components/Logo.jsx";
import { AnomalyBadge, StatCard } from "./components/AnomalyBadge.jsx";
import DreHierarquica from "./components/DreHierarquica.jsx";
import AnaliseTrimestral from "./components/AnaliseTrimestral.jsx";
import ComparativoPeriodos from "./components/ComparativoPeriodos.jsx";
import { parseAnaliseTrimestral, ehArquivoAnaliseTrimestral } from "./lib/parsers/analiseTrimestral.js";
import { parseDescontosConcedidos, detectarNotasDuplicadas } from "./lib/parsers/descontosConcedidos.js";
import { parseGrupo222, detectarMesPredominante } from "./lib/parsers/grupo222.js";
import { parseGrupo750Termo1Lote, parseGrupo750Termo2Lote, ehLoteMultiMes } from "./lib/parsers/grupo750.js";
import { parseProdutos1464, calcularTicketMedio } from "./lib/parsers/produtos1464.js";
import { detectarAnomalia } from "./lib/parsers/anomalyDetection.js";
import {
  persistenceEnabled, signIn, signOut, getSessaoEPerfil, onAuthChange,
  importarLoteEGravarLinha, carregarHistoricoDre,
} from "./lib/supabaseClient.js";
import { MESES, MESES_LABEL, OFICIAL, montarDreDoMes, calcularCargaTributaria, detectarAnomaliasTodasLinhas, REF } from "./lib/dreReference.js";
import { fechamentosNoMes } from "./lib/fechamentos.js";
import { DRE_NODES } from "./lib/dreNodes.js";

const TABS = [
  { id: "import", label: "Importar" },
  { id: "dre", label: "DRE" },
  { id: "comparativo", label: "Comparativo" },
  { id: "reconciliacao", label: "Reconciliação" },
  { id: "anomalias", label: "Anomalias" },
  { id: "impostos", label: "Receita x Lucro x Impostos" },
  { id: "produtos", label: "Mix de Vendas" },
  { id: "trimestral", label: "Análise Trimestral" },
  { id: "rastreabilidade", label: "Rastreabilidade" },
];

// mapeia rotina do app -> linha numérica da DRE (usado ao gravar no Supabase)
const LINHA_POR_ROTINA = { "2107": 138, "750-222": 209, "124-750": 211, "750-caixa10": 211 };

function fmt(n) { if (n == null) return "—"; return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function podeImportar(perfil) { return !persistenceEnabled || (perfil && (perfil.papel === "importador" || perfil.papel === "admin")); }

// ═══════════════════════════════════════════════════════════════════
// REDE DE SEGURANÇA — se qualquer aba tiver um erro inesperado, mostra
// uma mensagem em vez de derrubar o site inteiro pra tela preta/branca.
// ═══════════════════════════════════════════════════════════════════
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  render() {
    if (this.state.erro) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "'Segoe UI', sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Algo deu errado nesta tela.</div>
          <div style={{ color: "#888", fontSize: 13, marginBottom: 16, maxWidth: 500, margin: "0 auto 16px" }}>{String(this.state.erro?.message || this.state.erro)}</div>
          <button onClick={() => this.setState({ erro: null })} style={{ background: "#E8500D", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}>Tentar de novo</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [tema, setTema] = useState("dark");
  const T = THEMES[tema];
  const [activeTab, setActiveTab] = useState("import");
  const [historico, setHistorico] = useState({});
  const [loading, setLoading] = useState(null);
  const [limiarPct, setLimiarPct] = useState(20);
  const [regime, setRegime] = useState("competencia");

  // ── Autenticação ──
  const [authLoading, setAuthLoading] = useState(persistenceEnabled);
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    if (!persistenceEnabled) { setAuthLoading(false); return; }
    let ativo = true;
    (async () => {
      const { user, perfil: p } = await getSessaoEPerfil();
      if (!ativo) return;
      setSession(user ? { user } : null);
      setPerfil(p);
      setAuthLoading(false);
      if (user) {
        const h = await carregarHistoricoDre();
        if (ativo) setHistorico(h);
      }
    })();
    const unsubscribe = onAuthChange(async (sess) => {
      setSession(sess ? { user: sess.user } : null);
      if (sess) {
        const { perfil: p } = await getSessaoEPerfil();
        setPerfil(p);
        const h = await carregarHistoricoDre();
        setHistorico(h);
      } else {
        setPerfil(null);
        setHistorico({});
      }
    });
    return () => { ativo = false; unsubscribe(); };
  }, []);

  const gravar = useCallback((rotina, mes, arquivo, valor, extra) => {
    if (!mes) return;
    setHistorico((prev) => {
      const jaExiste = prev[rotina]?.[mes];
      return { ...prev, [rotina]: { ...(prev[rotina] || {}), [mes]: { arquivo, valor, extra, substituiu: Boolean(jaExiste) } } };
    });
    if (persistenceEnabled) {
      importarLoteEGravarLinha({
        rotina, mesReferencia: `${mes}-01`, nomeArquivo: arquivo,
        linhaNumero: LINHA_POR_ROTINA[rotina], valor, regime, extra,
      });
    }
  }, [regime]);

  // ── Import handlers (iguais a antes) ──
  const handleFile2107 = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    setLoading("2107");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const serieMensal = parseDescontosConcedidos(rows);
        const duplicadas = detectarNotasDuplicadas(rows);
        serieMensal.forEach((l) => gravar("2107", l.mes, file.name, l.saldoCompetencia, { saldoCompetencia: l.saldoCompetencia, saldoCaixa: l.saldoCaixa, duplicadas: duplicadas.length }));
      } catch (err) { alert("Erro ao processar arquivo: " + err.message); }
      setLoading(null); setActiveTab("dre"); e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  }, [gravar]);

  const handleFilesGrupo222 = useCallback((e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    setLoading("750-222");
    let pendentes = files.length;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
          const mes = detectarMesPredominante(rows);
          gravar("750-222", mes, file.name, parseGrupo222(rows).total);
        } catch (err) { alert(`Erro em "${file.name}": ` + err.message); }
        pendentes -= 1;
        if (pendentes === 0) { setLoading(null); setActiveTab("dre"); }
      };
      reader.readAsArrayBuffer(file);
    });
    e.target.value = "";
  }, [gravar]);

  const handleFileLote = useCallback((rotinaId, parseLote) => (e) => {
    const file = e.target.files[0]; if (!file) return;
    setLoading(rotinaId);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        if (ehLoteMultiMes(wb)) {
          const resultado = parseLote(wb);
          Object.entries(resultado).forEach(([mes, dados]) => {
            const valor = rotinaId === "124-750" ? dados.valorHistoricoAdotado : dados.total;
            gravar(rotinaId, mes, file.name, valor);
          });
        } else {
          alert("Este arquivo não parece estar no formato 'uma aba por mês' (lote).");
        }
      } catch (err) { alert("Erro ao processar arquivo: " + err.message); }
      setLoading(null); setActiveTab("dre"); e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  }, [gravar]);

  const handleFileProdutos1464 = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    setLoading("1464-produtos");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { range: 3 });
        const resultado = parseProdutos1464(rows, 2026);
        Object.entries(resultado).forEach(([mes, dados]) => {
          gravar("1464-produtos", mes, file.name, dados.totalFaturamento, dados);
        });
        if (Object.keys(resultado).length === 0) alert("Não encontrei nenhum mês reconhecível neste arquivo. Confirme se é o relatório 1464 (Faturamento por Produto) no formato esperado.");
      } catch (err) { alert("Erro ao processar arquivo: " + err.message); }
      setLoading(null); setActiveTab("produtos"); e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  }, [gravar]);

  const [dadosTrimestral, setDadosTrimestral] = useState({});
  const handleFileTrimestral = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    setLoading("trimestral");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        if (!ehArquivoAnaliseTrimestral(wb)) {
          alert("Não reconheci nenhuma aba com nome de mês (JAN, FEV, MAR...) neste arquivo.");
        } else {
          const resultado = parseAnaliseTrimestral(wb, XLSX.utils, 2026);
          setDadosTrimestral((prev) => ({ ...prev, ...resultado, __arquivo: file.name }));
        }
      } catch (err) { alert("Erro ao processar arquivo: " + err.message); }
      setLoading(null); setActiveTab("trimestral"); e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ── Recalcula a DRE completa por mês ──
  const { dre, overrides, importedFlags } = useMemo(() => {
    const overridesAcc = {}, flagsAcc = {}, dreAcc = [];
    MESES.forEach((mes) => {
      const h138 = historico["2107"]?.[mes];
      const h209 = historico["750-222"]?.[mes];
      const h211a = historico["124-750"]?.[mes];
      const h211b = historico["750-caixa10"]?.[mes];

      const linha138 = h138 ? (regime === "competencia" ? h138.extra?.saldoCompetencia : h138.extra?.saldoCaixa) : undefined;
      const linha209 = h209 ? h209.valor : undefined;
      const linha211 = (h211a || h211b) ? Math.round(((h211a?.valor || 0) + (h211b?.valor || 0)) * 100) / 100 : undefined;

      const d = montarDreDoMes(mes, { linha138, linha209, linha211 });
      dreAcc.push({ ...d, linha138Live: Boolean(h138), linha209Live: Boolean(h209), linha211Live: Boolean(h211a || h211b), linha211Parcial: Boolean(h211a) !== Boolean(h211b) });

      overridesAcc[mes] = {
        13: d.receitaLiquida, 58: d.lucroBruto, 61: d.despesasOperacionais,
        138: d.linha138, 179: d.lucroOperacionalContabil, 191: d.resultadoAntesCsll,
        198: d.resultadoLiquido, 203: d.lucroOperacionalContabil, 204: d.lucratividadeContabil / 100,
        209: d.linha209, 211: d.linha211, 213: d.lucroOperacionalGerencial,
        214: d.lucratividadeGerencial / 100, 218: d.lucroComSubvencoes, 219: d.lucratividadeComSubvencoes / 100,
      };
      flagsAcc[mes] = { 138: Boolean(h138), 209: Boolean(h209), 211: Boolean(h211a || h211b) };
    });
    return { dre: dreAcc, overrides: overridesAcc, importedFlags: flagsAcc };
  }, [historico, regime]);

  const hasData = Object.values(historico).some((h) => Object.keys(h).length > 0);
  const podeGerenciarImportacao = podeImportar(perfil);

  // ── Portões de tela: carregando / login ──
  if (authLoading) {
    return <TelaCarregando T={T} />;
  }
  if (persistenceEnabled && !session) {
    return <TelaLogin T={T} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.fontBody, transition: "background .15s, color .15s" }}>
      <div style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 20px", minHeight: 60,
        display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", columnGap: 16,
        position: "sticky", top: 0, zIndex: 1000, boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        <div style={{ flexShrink: 0 }}><Logo T={T} height={32} /></div>

        <div style={{ display: "flex", justifyContent: "center", minWidth: 0, padding: "8px 0" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: activeTab === tab.id ? T.primaryDim : "transparent",
                border: `1px solid ${activeTab === tab.id ? T.primary : "transparent"}`,
                borderRadius: 6, padding: "6px 14px", color: activeTab === tab.id ? T.primary : T.textSub,
                fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
              }}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", justifySelf: "end", padding: "8px 0" }}>
          <div style={{ display: "flex", background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 20, padding: 2, flexShrink: 0 }}>
            {["competencia", "caixa"].map((r) => (
              <button key={r} onClick={() => setRegime(r)} style={{ border: "none", borderRadius: 18, padding: "6px 14px", fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "pointer", whiteSpace: "nowrap", background: regime === r ? T.primary : "transparent", color: regime === r ? "#fff" : T.textSub }}>
                {r === "competencia" ? "Competência" : "Caixa"}
              </button>
            ))}
          </div>
          <button onClick={() => setTema(tema === "dark" ? "light" : "dark")} title="Alternar tema claro/escuro" style={{ border: `1px solid ${T.borderHi}`, borderRadius: 20, padding: "6px 14px", fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, background: T.surface, color: T.textSub }}>
            {tema === "dark" ? "☀ Claro" : "● Escuro"}
          </button>
          {persistenceEnabled && (
            <span style={{ fontSize: 11, color: T.textSub, display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
              {perfil?.nome || session?.user?.email} <span style={{ fontSize: 9, fontWeight: 700, color: T.gold, border: `1px solid ${T.gold}55`, borderRadius: 10, padding: "1px 6px" }}>{perfil?.papel || "?"}</span>
              <button onClick={signOut} style={{ background: "transparent", border: `1px solid ${T.borderHi}`, borderRadius: 6, padding: "6px 14px", color: T.textSub, fontSize: 11, lineHeight: 1, cursor: "pointer", whiteSpace: "nowrap" }}>Sair</button>
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, padding: "6px 14px", lineHeight: 1, borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0, background: persistenceEnabled ? T.leaf + "1E" : T.warning + "1E", color: persistenceEnabled ? T.leaf : T.warning, border: `1px solid ${(persistenceEnabled ? T.leaf : T.warning)}55` }}>
            {persistenceEnabled ? "● Supabase conectado" : "○ Modo local"}
          </span>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1280, margin: "0 auto" }}>
      <ErrorBoundary key={activeTab}>
        {activeTab === "import" && (
          podeGerenciarImportacao ? (
            <ImportTab T={T} historico={historico} loading={loading}
              handleFile2107={handleFile2107} handleFilesGrupo222={handleFilesGrupo222}
              handleFileTermo1={handleFileLote("124-750", parseGrupo750Termo1Lote)}
              handleFileTermo2={handleFileLote("750-caixa10", parseGrupo750Termo2Lote)}
              handleFileProdutos1464={handleFileProdutos1464}
              handleFileTrimestral={handleFileTrimestral} mesesTrimestral={Object.keys(dadosTrimestral).filter((k) => k !== "__arquivo")} />
          ) : (
            <div style={{ textAlign: "center", padding: "60px 0", color: T.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
              <div>Seu papel (<b>{perfil?.papel}</b>) tem acesso só de consulta. Fale com um importador ou administrador para importar novos arquivos.</div>
            </div>
          )
        )}
        {activeTab === "dre" && (
          <div>
            <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 4 }}>DRE — Jan a Jul/2026</h1>
            <p style={{ color: T.textSub, fontSize: 12, marginBottom: 4 }}>Regime: <b style={{ color: T.text }}>{regime === "competencia" ? "Competência" : "Caixa"}</b> — afeta a linha 138. Demais linhas ainda não têm regra de caixa definida.</p>
            <p style={{ color: T.textMuted, fontSize: 11, marginBottom: 4 }}><span style={{ color: T.leaf }}>■</span> ao vivo (importado) &nbsp; <span style={{ color: T.textSub }}>■</span> referência &nbsp; <span style={{ color: T.gold }}>■</span> lucratividade (%)</p>
            <p style={{ color: T.textMuted, fontSize: 11, marginBottom: 16 }}>💬 = comentário original da contabilidade sobre aquela conta.</p>
            <DreHierarquica T={T} meses={MESES} mesesLabel={MESES_LABEL} overrides={overrides} importedFlags={importedFlags} />
          </div>
        )}
        {activeTab === "comparativo" && <ComparativoPeriodos T={T} meses={MESES} mesesLabel={MESES_LABEL} overrides={overrides} />}
        {activeTab === "reconciliacao" && (hasData ? <ReconciliacaoTab T={T} historico={historico} regime={regime} /> : <EmptyState T={T} onGoImport={() => setActiveTab("import")} />)}
        {activeTab === "anomalias" && <AnomaliasTab T={T} limiarPct={limiarPct} setLimiarPct={setLimiarPct} overrides={overrides} />}
        {activeTab === "impostos" && <ImpostosTab T={T} overrides={overrides} />}
        {activeTab === "produtos" && <ProdutosTab T={T} historico={historico} overrides={overrides} />}
        {activeTab === "trimestral" && <AnaliseTrimestral T={T} overrides={overrides} dadosImportados={dadosTrimestral} />}
        {activeTab === "rastreabilidade" && <RastreabilidadeTab T={T} />}
      </ErrorBoundary>
      </div>

      <div style={{ marginTop: 40, padding: "20px 28px", borderTop: `1px solid ${T.border}`, opacity: 0.6, display: "flex", justifyContent: "space-between" }}>
        <Logo T={T} height={18} showText={false} />
        <div style={{ fontSize: 10, color: T.textMuted }}>FRUTA POLPA · SISTEMA DE AUDITORIA GERENCIAL</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function TelaCarregando({ T }) {
  return <div style={{ minHeight: "100vh", background: T.bg, color: T.textSub, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontBody }}>Carregando…</div>;
}

function TelaLogin({ T }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null); setEnviando(true);
    const r = await signIn(email, senha);
    setEnviando(false);
    if (!r.ok) setErro(r.motivo === "Invalid login credentials" ? "E-mail ou senha incorretos." : r.motivo);
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.fontBody, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 32, width: 320 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><Logo T={T} height={40} /></div>
        <label style={{ fontSize: 12, color: T.textSub, display: "block", marginBottom: 6 }}>E-mail</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "8px 10px", marginBottom: 14, boxSizing: "border-box" }} />
        <label style={{ fontSize: 12, color: T.textSub, display: "block", marginBottom: 6 }}>Senha</label>
        <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)}
          style={{ width: "100%", background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "8px 10px", marginBottom: 18, boxSizing: "border-box" }} />
        {erro && <div style={{ color: T.danger, fontSize: 12, marginBottom: 14 }}>{erro}</div>}
        <button type="submit" disabled={enviando} style={{ width: "100%", background: T.primary, color: "#fff", border: "none", borderRadius: 6, padding: "10px 0", fontWeight: 700, cursor: "pointer" }}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function ImportTab({ T, historico, loading, handleFile2107, handleFilesGrupo222, handleFileTermo1, handleFileTermo2, handleFileProdutos1464, handleFileTrimestral, mesesTrimestral }) {
  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Importar relatórios</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 24, maxWidth: 680 }}>
        3 linhas já automatizadas (138, 209, 211) + Mix de Vendas (rotina 1464). As demais linhas da DRE usam valor de referência da auditoria manual até termos os imports de 2122/etc.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
        <ImportCard T={T} nome="Descontos Concedidos" desc="Rotina 2107+1008 · linha 138 · 1 arquivo, todos os meses" badge="AUTOMÁTICO" badgeColor={T.leaf} meses={Object.keys(historico["2107"] || {})} loading={loading === "2107"}>
          <label style={botaoStyle(T, false)}>{loading === "2107" ? "Processando…" : "📂 Carregar arquivo"}<input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile2107} /></label>
        </ImportCard>
        <ImportCard T={T} nome="Grupo 222" desc="Rotina 750 · linha 209 · vários arquivos, mês detectado automaticamente" badge="AUTOMÁTICO" badgeColor={T.leaf} meses={Object.keys(historico["750-222"] || {})} loading={loading === "750-222"}>
          <label style={botaoStyle(T, false)}>{loading === "750-222" ? "Processando…" : "📂 Carregar 1+ arquivos"}<input type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={handleFilesGrupo222} /></label>
        </ImportCard>
        <ImportCard T={T} nome="Grupo 750 — Termo 1" desc="Relatório 124 · linha 211 · arquivo em lote (aba por mês)" badge="AUTOMÁTICO" badgeColor={T.leaf} meses={Object.keys(historico["124-750"] || {})} loading={loading === "124-750"}>
          <label style={botaoStyle(T, false)}>{loading === "124-750" ? "Processando…" : "📂 Carregar em lote"}<input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileTermo1} /></label>
        </ImportCard>
        <ImportCard T={T} nome="Grupo 750 — Termo 2 (Caixa 10)" desc="Tesouraria 538+750 · linha 211 · arquivo em lote" badge="MANUAL PARCIAL" badgeColor={T.warning} meses={Object.keys(historico["750-caixa10"] || {})} loading={loading === "750-caixa10"}>
          <label style={botaoStyle(T, false)}>{loading === "750-caixa10" ? "Processando…" : "📂 Carregar em lote"}<input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileTermo2} /></label>
        </ImportCard>
        <ImportCard T={T} nome="Mix de Vendas" desc="Rotina 1464 · Faturamento por Produto · 1 arquivo, todos os meses" badge="AUTOMÁTICO" badgeColor={T.leaf} meses={Object.keys(historico["1464-produtos"] || {})} loading={loading === "1464-produtos"}>
          <label style={botaoStyle(T, false)}>{loading === "1464-produtos" ? "Processando…" : "📂 Carregar arquivo"}<input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileProdutos1464} /></label>
        </ImportCard>
        <ImportCard T={T} nome="Comparativo 2025 x 2026" desc="Rotina 2122 · uma aba por mês (JAN, FEV...) · alimenta a Análise Trimestral" badge="AUTOMÁTICO" badgeColor={T.leaf} meses={mesesTrimestral || []} loading={loading === "trimestral"}>
          <label style={botaoStyle(T, false)}>{loading === "trimestral" ? "Processando…" : "📂 Carregar arquivo"}<input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileTrimestral} /></label>
        </ImportCard>
      </div>
    </div>
  );
}
function ImportCard({ T, nome, desc, badge, badgeColor, meses, loading, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{nome}</div>
        <span style={{ fontSize: 9, color: badgeColor, fontWeight: 700 }}>{badge}</span>
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, marginBottom: 10 }}>{desc}</div>
      <div style={{ fontSize: 11, color: T.textSub, marginBottom: 12 }}>{meses.length === 0 ? "Nenhum mês importado ainda" : `${meses.length} mês(es): ${meses.sort().map((m) => MESES_LABEL[m] || m).join(", ")}`}</div>
      {children}
    </div>
  );
}
function botaoStyle(T, destaque) {
  return { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, background: destaque ? T.gold + "1E" : T.primary, color: destaque ? T.gold : "#fff", border: destaque ? `1px solid ${T.gold}55` : "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer" };
}

// ═══════════════════════════════════════════════════════════════════
function ReconciliacaoTab({ T, historico, regime }) {
  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Reconciliação Jan-Jul/2026</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 22, maxWidth: 680 }}>Cada valor importado é comparado ao número já validado na auditoria manual (13-20/08/2026).</p>
      <ReconciliacaoSecao T={T} titulo="Linha 138 — Descontos Concedidos" hist={historico["2107"]} getValor={(h) => regime === "competencia" ? h.extra?.saldoCompetencia : h.extra?.saldoCaixa} oficial={OFICIAL["138"]} soComparaCompetencia={regime === "competencia"} />
      <ReconciliacaoSecao T={T} titulo="Linha 209 — Despesas Grupo 222" hist={historico["750-222"]} getValor={(h) => h.valor} oficial={OFICIAL["209"]} soComparaCompetencia />
      <ReconciliacaoSecao T={T} titulo="Linha 211 — Grupo 750 (termo 1 + termo 2)" hist={combinarTermos(historico["124-750"], historico["750-caixa10"])} getValor={(h) => h.valor} oficial={OFICIAL["211"]} soComparaCompetencia />
    </div>
  );
}
function combinarTermos(t1, t2) {
  if (!t1 && !t2) return null;
  const meses = new Set([...Object.keys(t1 || {}), ...Object.keys(t2 || {})]);
  const out = {};
  meses.forEach((mes) => {
    const a = t1?.[mes], b = t2?.[mes];
    if (!a && !b) return;
    out[mes] = { valor: Math.round(((a?.valor || 0) + (b?.valor || 0)) * 100) / 100, arquivo: [a?.arquivo, b?.arquivo].filter(Boolean).join(" + "), parcial: !a || !b };
  });
  return out;
}
function ReconciliacaoSecao({ T, titulo, hist, getValor, oficial, soComparaCompetencia }) {
  if (!hist || Object.keys(hist).length === 0) return <div style={{ marginBottom: 22 }}><h2 style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{titulo}</h2><div style={{ color: T.textMuted, fontSize: 12 }}>Ainda não importado.</div></div>;
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{titulo}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["Mês", "Importado", "Oficial", "Status", "Arquivo"].map((h) => <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>
            {MESES.map((mes) => {
              const h = hist[mes]; if (!h) return null;
              const valor = getValor(h);
              const of = oficial[mes];
              const bate = soComparaCompetencia && of !== undefined && Math.abs(Math.abs(valor) - Math.abs(of)) < 0.5;
              return (
                <tr key={mes}>
                  <td style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, fontWeight: 700 }}>{MESES_LABEL[mes]} {h.substituiu && <span style={{ color: T.gold }}>↻</span>} {h.parcial && <span style={{ color: T.warning }}>½</span>}</td>
                  <td style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}` }}>{fmt(valor)}</td>
                  <td style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, color: T.textMuted }}>{soComparaCompetencia ? fmt(of) : "n/a (caixa)"}</td>
                  <td style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}` }}>{!soComparaCompetencia ? "—" : bate ? <span style={{ color: T.leaf, fontWeight: 700 }}>✅</span> : <span style={{ color: T.danger, fontWeight: 700 }}>❌</span>}</td>
                  <td style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontSize: 10 }}>{h.arquivo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function AnomaliasTab({ T, limiarPct, setLimiarPct, overrides }) {
  const [mesFiltro, setMesFiltro] = useState("todos");
  const [valorMinimo, setValorMinimo] = useState(0);
  const [porFechamento, setPorFechamento] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState("delta");
  const [ordemDesc, setOrdemDesc] = useState(true);

  const todosAchados = useMemo(
    () => detectarAnomaliasTodasLinhas(DRE_NODES, overrides, limiarPct, { porFechamento }),
    [overrides, limiarPct, porFechamento]
  );

  const achados = useMemo(() => {
    let lista = mesFiltro === "todos" ? todosAchados : todosAchados.filter((a) => a.mes === mesFiltro);
    if (valorMinimo > 0) lista = lista.filter((a) => Math.abs(a.delta) >= valorMinimo);
    lista = [...lista].sort((a, b) => {
      const va = ordenarPor === "valor" ? a.valor : Math.abs(a[ordenarPor]);
      const vb = ordenarPor === "valor" ? b.valor : Math.abs(b[ordenarPor]);
      return ordemDesc ? vb - va : va - vb;
    });
    return lista;
  }, [todosAchados, mesFiltro, valorMinimo, ordenarPor, ordemDesc]);

  const ocultadasPeloValor = useMemo(() => {
    if (valorMinimo <= 0) return 0;
    const base = mesFiltro === "todos" ? todosAchados : todosAchados.filter((a) => a.mes === mesFiltro);
    return base.length - achados.length;
  }, [todosAchados, mesFiltro, valorMinimo, achados.length]);

  function ordenarColuna(campo) {
    if (ordenarPor === campo) setOrdemDesc((v) => !v);
    else { setOrdenarPor(campo); setOrdemDesc(true); }
  }
  function setaOrdenacao(campo) {
    if (ordenarPor !== campo) return "";
    return ordemDesc ? " \u25be" : " \u25b4";
  }

  const mesesComDados = useMemo(() => Array.from(new Set(todosAchados.map((a) => a.mes))).sort(), [todosAchados]);
  const sufixo = porFechamento ? " / fech." : "";

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Anomalias — fora da curva</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 10, maxWidth: 760 }}>
        Cada uma das 186 linhas da DRE (totais e contas sintéticas — inclusive as que ficam ocultas por padrão na árvore) é comparada mês a mês com a <b>média dos 3 meses anteriores</b>. Só aparecem aqui as contas cuja variação passou do limite de sensibilidade definido abaixo — isso serve para a contabilidade antecipar justificativas antes da diretoria perguntar.
      </p>
      <p style={{ color: T.textMuted, fontSize: 12, marginBottom: 16, maxWidth: 760 }}>
        Use os dois filtros juntos: a <b>sensibilidade (%)</b> diz o quanto a conta se moveu; o <b>impacto mínimo (R$)</b> diz se esse movimento vale a conversa. Uma conta de média R$ 93 que foi para R$ 500 varia +438%, mas move só R$ 407 — com impacto mínimo em R$ 5.000 ela some da lista.
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {achados.length} conta(s) fora da curva {mesFiltro !== "todos" && `em ${MESES_LABEL[mesFiltro]}`}
          {ocultadasPeloValor > 0 && <span style={{ fontWeight: 400, color: T.textMuted }}> &nbsp;·&nbsp; {ocultadasPeloValor} ocultada(s) por impacto abaixo de {fmtR(valorMinimo)}</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>Mês:
            <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "4px 8px", fontSize: 12 }}>
              <option value="todos">Todos</option>
              {mesesComDados.map((m) => <option key={m} value={m}>{MESES_LABEL[m]}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8 }} title="Esconde as anomalias cuja diferença em R$ (mês − média dos 3 meses) for menor que este valor. Evita alarme de % alto sobre base pequena.">Impacto mínimo:
            <span>R$</span>
            <input type="number" min={0} step={1000} value={valorMinimo} onChange={(e) => setValorMinimo(Math.max(0, Number(e.target.value) || 0))} style={{ width: 90, background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "4px 8px" }} />
          </label>
          <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8 }}>Sensibilidade:
            <input type="number" value={limiarPct} onChange={(e) => setLimiarPct(Number(e.target.value))} style={{ width: 56, background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "4px 8px" }} /> %
          </label>
          <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="Compara valor por fechamento (÷ nº de sextas-feiras do mês) em vez do valor cheio — evita acusar anomalia só porque o mês teve 5 fechamentos contra 4 dos anteriores.">
            <input type="checkbox" checked={porFechamento} onChange={(e) => setPorFechamento(e.target.checked)} />
            Por fechamento
          </label>
        </div>
      </div>

      {porFechamento && (
        <div style={{ fontSize: 11, color: T.gold, marginBottom: 10 }}>
          ⚙ Valores divididos pelo nº de fechamentos (sextas-feiras) de cada mês — {MESES.map((m) => `${MESES_LABEL[m]} ${fechamentosNoMes(m)}`).join(" · ")}
        </div>
      )}

      <div style={{ maxHeight: "calc(100vh - 360px)", overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            <th style={{ ...thAnomalia(T) }}>Mês</th>
            <th style={{ ...thAnomalia(T) }}>Linha</th>
            <th style={{ ...thAnomalia(T) }}>Conta</th>
            <th style={{ ...thAnomalia(T) }}>Tipo</th>
            <th style={{ ...thAnomalia(T), cursor: "pointer" }} onClick={() => ordenarColuna("valor")}>Valor{sufixo}{setaOrdenacao("valor")}</th>
            <th style={{ ...thAnomalia(T) }}>Média 3 meses{sufixo}</th>
            <th style={{ ...thAnomalia(T), cursor: "pointer", color: T.gold }} onClick={() => ordenarColuna("delta")} title="Diferença em R$ entre o valor do mês e a média dos 3 meses anteriores. É o tamanho real do impacto.">Diferença (R$){setaOrdenacao("delta")}</th>
            <th style={{ ...thAnomalia(T), cursor: "pointer" }} onClick={() => ordenarColuna("variacaoPct")}>Variação{setaOrdenacao("variacaoPct")}</th>
            <th style={{ ...thAnomalia(T) }}>Nível</th>
          </tr></thead>
          <tbody>
            {achados.map((a, i) => (
              <tr key={i} style={{ background: a.isTotal ? T.goldDim : "transparent" }}>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, fontWeight: 700 }}>{MESES_LABEL[a.mes]}</td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: T.textMuted }}>{a.row}</td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}` }}>{a.label}</td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}` }}>
                  {a.isTotal ? <span style={{ fontSize: 9, fontWeight: 700, color: T.gold, border: `1px solid ${T.gold}55`, borderRadius: 4, padding: "1px 5px" }}>TOTAL</span> : <span style={{ fontSize: 9, color: T.textMuted }}>detalhe</span>}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{fmtR(a.valor)}</td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: T.textMuted, whiteSpace: "nowrap" }}>{fmtR(a.media)}</td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, whiteSpace: "nowrap", color: a.delta > 0 ? T.leaf : T.danger }}>
                  {fmtDelta(a.delta)}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, color: a.variacaoPct > 0 ? T.leaf : T.danger }}>{a.variacaoPct > 0 ? "+" : ""}{a.variacaoPct.toFixed(2)}%</td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}` }}><AnomalyBadge T={T} nivel={a.nivel} variacaoPct={null} /></td>
              </tr>
            ))}
            {achados.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: T.textMuted }}>
                Nenhuma conta fora da curva com esses filtros{mesFiltro !== "todos" ? " neste mês" : ""}.
                {valorMinimo > 0 && " Tente baixar o impacto mínimo."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function thAnomalia(T) {
  return { textAlign: "left", padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.bg, zIndex: 1 };
}
function fmtR(n) { if (n == null) return "—"; return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
// Delta em R$ sempre com ícone + sinal (nunca só cor — acessibilidade).
function fmtDelta(n) {
  if (n == null) return "—";
  const sinal = n > 0 ? "▲ +" : n < 0 ? "▼ −" : "= ";
  return sinal + "R$ " + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ═══════════════════════════════════════════════════════════════════
function ImpostosTab({ T, overrides }) {
  const linhas = useMemo(() => MESES.map((mes) => calcularCargaTributaria(mes, DRE_NODES, overrides)), [overrides]);
  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Receita × Lucro × Impostos</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 20, maxWidth: 680 }}>
        Comparativo direto entre os três: quanto entra (Receita Bruta), quanto sobra (Lucro com Subvenções) e quanto vai para impostos (ICMS s/venda + PIS + COFINS + Despesas Tributárias + Provisão CSLL/IRPJ), mês a mês.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}` }}></th>
            {MESES.map((m) => <th key={m} style={{ textAlign: "right", padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}` }}>{MESES_LABEL[m]}</th>)}
          </tr></thead>
          <tbody>
            <tr style={{ background: T.card }}>
              <td style={{ padding: "8px 10px", fontWeight: 700, borderBottom: `1px solid ${T.border}` }}>Receita Bruta</td>
              {linhas.map((l) => <td key={l.mes} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{fmtR(l.receita)}</td>)}
            </tr>
            <tr>
              <td style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.danger }}>(−) Total de Impostos</td>
              {linhas.map((l) => <td key={l.mes} style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${T.border}`, color: T.danger, whiteSpace: "nowrap" }}>{fmtR(l.impostos)}</td>)}
            </tr>
            <tr style={{ background: T.card }}>
              <td style={{ padding: "8px 10px", fontWeight: 700, borderBottom: `1px solid ${T.border}`, color: T.leaf }}>(=) Lucro com Subvenções</td>
              {linhas.map((l) => <td key={l.mes} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, borderBottom: `1px solid ${T.border}`, color: T.leaf, whiteSpace: "nowrap" }}>{fmtR(l.lucro)}</td>)}
            </tr>
            <tr>
              <td style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontSize: 11 }}>% Impostos / Receita</td>
              {linhas.map((l) => <td key={l.mes} style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontSize: 11, whiteSpace: "nowrap" }}>{l.pctImpostoReceita?.toFixed(2)}%</td>)}
            </tr>
            <tr>
              <td style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.gold, fontSize: 11 }}>% Lucro / Receita</td>
              {linhas.map((l) => <td key={l.mes} style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${T.border}`, color: T.gold, fontSize: 11, whiteSpace: "nowrap" }}>{l.pctLucroReceita?.toFixed(2)}%</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════
function ProdutosTab({ T, historico, overrides }) {
  const dados1464 = historico["1464-produtos"] || {};
  const mesesDisponiveis = Object.keys(dados1464).sort();
  const [mesSelecionado, setMesSelecionado] = useState(mesesDisponiveis[mesesDisponiveis.length - 1] || null);
  useEffect(() => {
    if (mesesDisponiveis.length && !mesesDisponiveis.includes(mesSelecionado)) {
      setMesSelecionado(mesesDisponiveis[mesesDisponiveis.length - 1]);
    }
  }, [mesesDisponiveis.join(",")]);

  if (mesesDisponiveis.length === 0) {
    return (
      <div>
        <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Mix de Vendas</h1>
        <p style={{ color: T.textSub, fontSize: 13, marginBottom: 20, maxWidth: 640 }}>
          Quantidade vendida, preço médio e participação por sabor (Rotina 1464), com ticket médio da empresa e comparativo visual com a lucratividade do mês.
        </p>
        <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted }}>Nenhum dado importado ainda — vá em "Importar" e carregue o arquivo "Mix de Vendas".</div>
      </div>
    );
  }

  const registroMes = dados1464[mesSelecionado];
  const dadosMes = registroMes?.extra;
  if (!dadosMes || !Array.isArray(dadosMes.produtos)) {
    return (
      <div>
        <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Mix de Vendas</h1>
        <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted }}>Não consegui carregar os dados desse mês. Tenta reimportar o arquivo "Mix de Vendas" na aba Importar.</div>
      </div>
    );
  }
  const fatGerencial = REF.faturamentoGerencial[mesSelecionado];
  const ticketMedio = calcularTicketMedio(fatGerencial, dadosMes.totalQuantidade);
  const lucratividadeGerencial = overrides?.[mesSelecionado]?.[214] != null ? overrides[mesSelecionado][214] * 100 : null;
  const lucratividadeContabil = overrides?.[mesSelecionado]?.[204] != null ? overrides[mesSelecionado][204] * 100 : null;
  const maiorFaturamento = Math.max(1, ...dadosMes.produtos.map((p) => p.faturamento || 0));

  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Mix de Vendas</h1>
      <p style={{ color: T.textSub, fontSize: 13, marginBottom: 8, maxWidth: 680 }}>
        Quantidade vendida, preço médio e participação por sabor (Rotina 1464). O painel abaixo é <b>comparativo visual</b>, não um coeficiente estatístico — com 7 meses de histórico, uma correlação formal seria pouco confiável; aqui o objetivo é permitir enxergar o padrão a olho.
      </p>
      <label style={{ fontSize: 12, color: T.textSub, display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>Mês:
        <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "5px 10px", fontSize: 12 }}>
          {mesesDisponiveis.map((m) => <option key={m} value={m}>{MESES_LABEL[m] || m}</option>)}
        </select>
      </label>

      {/* Painel comparativo */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard T={T} label="Ticket Médio" value={ticketMedio != null ? `R$ ${ticketMedio.toFixed(2)}` : "—"} sub="Fat. Gerencial ÷ qtd. total vendida" accent={T.primary} />
        <StatCard T={T} label="Lucratividade Gerencial" value={lucratividadeGerencial != null ? `${lucratividadeGerencial.toFixed(2)}%` : "—"} accent={T.gold} />
        <StatCard T={T} label="Lucratividade Contábil" value={lucratividadeContabil != null ? `${lucratividadeContabil.toFixed(2)}%` : "—"} accent={T.textSub} />
        <StatCard T={T} label="Qtd. Total Vendida" value={dadosMes.totalQuantidade.toLocaleString("pt-BR")} sub="unidades no mês" accent={T.leaf} />
      </div>

      {/* Tabela de produtos com barra de participação */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            {["Sabor", "Qtd.", "Faturamento", "Preço Médio", "% Participação", "Mix"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: T.textMuted, fontWeight: 700, fontSize: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {dadosMes.produtos.map((p) => (
              <tr key={p.codigo}>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}` }}>{p.descricao}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{p.quantidade.toLocaleString("pt-BR")}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>R$ {p.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>R$ {p.precoMedio?.toFixed(2)}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{p.pctParticipacao.toFixed(2)}%</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.border}`, minWidth: 140 }}>
                  <div style={{ background: T.border, borderRadius: 3, height: 8, width: "100%" }}>
                    <div style={{ background: T.primary, borderRadius: 3, height: 8, width: `${(p.faturamento / maiorFaturamento) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RastreabilidadeTab({ T }) {
  return (
    <div>
      <h1 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Rastreabilidade</h1>
      <p style={{ color: T.textSub, fontSize: 13, maxWidth: 640 }}>
        {persistenceEnabled
          ? "O histórico completo de lotes por mês/rotina já é gravado no Supabase, incluindo versões substituídas. Uma consulta detalhada por lote será adicionada em uma próxima etapa."
          : "Depende do Supabase estar conectado para consultar o histórico completo de lotes por mês/rotina."}
      </p>
    </div>
  );
}
function EmptyState({ T, onGoImport }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: T.textMuted }}>
      <div style={{ marginBottom: 12 }}>Nenhum dado importado ainda.</div>
      <button onClick={onGoImport} style={{ background: T.primary, color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}>Ir para Importar</button>
    </div>
  );
}
