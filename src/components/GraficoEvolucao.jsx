import { useState, useMemo, useEffect, useRef } from "react";
import { MESES_LABEL } from "../lib/dreReference.js";

// ═══════════════════════════════════════════════════════════════════
// GRÁFICO DE EVOLUÇÃO — uma linha por item ao longo dos meses
//
// Serve tanto ao Mix de Vendas (item = sabor, com filtro de categoria)
// quanto ao Faturamento por Cliente (item = cliente, com busca por
// nome). Quem chama monta o catálogo e a série; aqui só se desenha.
//
// Sem biblioteca de gráfico: SVG puro, como o resto do sistema. Menos
// peso no bundle e nada de CDN sem versão.
//
// ACESSIBILIDADE: nenhuma série é identificada só pela cor. Cada uma
// tem, além da cor, um MARCADOR de forma própria e um TRACEJADO
// próprio, repetidos na legenda e no fim da linha. Dá para ler o
// gráfico inteiro em preto e branco.
// ═══════════════════════════════════════════════════════════════════

const INDICADORES = [
  { id: "quantidade", label: "Qtd.", eixo: "unidades" },
  { id: "faturamento", label: "Faturamento", eixo: "R$" },
  { id: "precoMedio", label: "Preço Médio", eixo: "R$" },
];

// Paleta Okabe-Ito (segura para daltonismo), combinada com forma e traço.
const CORES = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#8C5E10", "#7A7A7A"];
const FORMAS = ["circulo", "quadrado", "triangulo", "losango", "cruz", "triangulo-baixo"];
const TRACOS = ["", "6 4", "2 3", "9 3 2 3", "12 4", "1 4"];

const VB_W = 980, VB_H = 400;
const M = { top: 18, right: 168, bottom: 46, left: 78 };
const PLOT_W = VB_W - M.left - M.right;
const PLOT_H = VB_H - M.top - M.bottom;

const MAX_SERIES = 8;        // acima disso o gráfico vira espaguete
const MAX_OPCOES_LISTA = 60; // catálogo grande (clientes) sem travar a tela

function estiloSerie(indice) {
  return {
    cor: CORES[indice % CORES.length],
    forma: FORMAS[indice % FORMAS.length],
    traco: TRACOS[Math.floor(indice / CORES.length) % TRACOS.length],
  };
}

function Marcador({ forma, x, y, cor, r = 4.2 }) {
  const comum = { fill: cor, stroke: cor, strokeWidth: 1 };
  if (forma === "quadrado") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...comum} />;
  if (forma === "triangulo") return <polygon points={`${x},${y - r * 1.2} ${x + r * 1.1},${y + r * 0.9} ${x - r * 1.1},${y + r * 0.9}`} {...comum} />;
  if (forma === "triangulo-baixo") return <polygon points={`${x},${y + r * 1.2} ${x + r * 1.1},${y - r * 0.9} ${x - r * 1.1},${y - r * 0.9}`} {...comum} />;
  if (forma === "losango") return <polygon points={`${x},${y - r * 1.3} ${x + r * 1.1},${y} ${x},${y + r * 1.3} ${x - r * 1.1},${y}`} {...comum} />;
  if (forma === "cruz") return (
    <g stroke={cor} strokeWidth={2.2} strokeLinecap="round">
      <line x1={x - r} y1={y} x2={x + r} y2={y} /><line x1={x} y1={y - r} x2={x} y2={y + r} />
    </g>
  );
  return <circle cx={x} cy={y} r={r} {...comum} />;
}

export function formatarValor(valor, indicador) {
  if (valor == null) return "—";
  if (indicador === "quantidade") return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return "R$ " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rótulo curto para caber colado no ponto. */
function formatarCurto(valor, indicador) {
  if (valor == null) return "—";
  const abs = Math.abs(valor);
  if (indicador === "precoMedio") return "R$ " + valor.toFixed(2);
  const p = indicador === "quantidade" ? "" : "R$ ";
  if (abs >= 1e6) return `${p}${(valor / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1e4) return `${p}${(valor / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${p}${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/**
 * Escala do eixo Y. A unidade é escolhida UMA vez, pelo maior valor do
 * eixo, e vale para todos os traços — senão o eixo mistura "R$ 1,5 mi"
 * com "R$ 1.000 mil" na mesma coluna.
 */
function escalaEixo(topo, indicador) {
  const prefixo = indicador === "quantidade" ? "" : "R$ ";
  if (topo >= 1e6) return { divisor: 1e6, sufixo: " mi", casas: 1, prefixo };
  if (topo >= 1e4) return { divisor: 1e3, sufixo: " mil", casas: 0, prefixo };
  return { divisor: 1, sufixo: "", casas: indicador === "precoMedio" ? 2 : 0, prefixo };
}

function formatarEixo(valor, escala) {
  if (valor === 0) return `${escala.prefixo}0`;
  const n = (valor / escala.divisor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: escala.casas });
  return `${escala.prefixo}${n}${escala.sufixo}`;
}

/** Afasta rótulos que cairiam um por cima do outro, sem sair do gráfico. */
function espalhar(itens, altura, limiteBaixo, limiteAlto) {
  const ord = [...itens].sort((a, b) => a.alvo - b.alvo);
  for (let k = 1; k < ord.length; k++) {
    if (ord[k].y - ord[k - 1].y < altura) ord[k].y = ord[k - 1].y + altura;
  }
  for (let k = ord.length - 1; k >= 0; k--) {
    if (ord[k].y > limiteBaixo) ord[k].y = limiteBaixo - (ord.length - 1 - k) * altura;
    if (k < ord.length - 1 && ord[k + 1].y - ord[k].y < altura) ord[k].y = ord[k + 1].y - altura;
    if (ord[k].y < limiteAlto) ord[k].y = limiteAlto + k * altura;
  }
  return ord;
}

/**
 * @param {Array<{chave,rotulo,grupo?}>} catalogo  itens disponíveis
 * @param {Map<string, Record<string,{quantidade,faturamento,precoMedio}>>} valores
 * @param {Array<{id,label}>} [grupos]  se vier, mostra filtro de categoria
 */
export default function GraficoEvolucao({
  T, meses, catalogo, valores, grupos, titulo, descricao, nomeItem = "itens", comBusca = false,
}) {
  const [indicador, setIndicador] = useState("faturamento");
  const [gruposAtivos, setGruposAtivos] = useState(() => (grupos || []).map((g) => g.id));
  const [selecionados, setSelecionados] = useState([]);
  const [busca, setBusca] = useState("");
  const [mesFoco, setMesFoco] = useState(null);
  const svgRef = useRef(null);

  const disponiveis = useMemo(() => {
    if (!grupos) return catalogo;
    return catalogo.filter((s) => gruposAtivos.includes(s.grupo));
  }, [catalogo, grupos, gruposAtivos.join(",")]);

  // Padrão: os maiores em faturamento no mês mais recente, para o
  // gráfico já abrir dizendo alguma coisa em vez de abrir vazio.
  useEffect(() => {
    const ultimo = meses[meses.length - 1];
    const ranking = [...disponiveis].sort(
      (a, b) => (valores.get(b.chave)?.[ultimo]?.faturamento || 0) - (valores.get(a.chave)?.[ultimo]?.faturamento || 0)
    );
    setSelecionados(ranking.slice(0, 5).map((s) => s.chave));
  }, [gruposAtivos.join(","), catalogo.length, meses.length]);

  const series = useMemo(() => selecionados
    .map((chave) => disponiveis.find((s) => s.chave === chave))
    .filter(Boolean)
    .slice(0, MAX_SERIES)
    .map((item, i) => ({
      ...item,
      ...estiloSerie(i),
      pontos: meses.map((mes) => {
        const v = valores.get(item.chave)?.[mes];
        return { mes, valor: v ? v[indicador] : null };
      }),
    })), [selecionados, disponiveis, meses, indicador, valores]);

  const listaOpcoes = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    const filtrada = alvo ? disponiveis.filter((s) => s.rotulo.toLowerCase().includes(alvo)) : disponiveis;
    return { visiveis: filtrada.slice(0, MAX_OPCOES_LISTA), total: filtrada.length };
  }, [disponiveis, busca]);

  if (!meses.length) return null;

  const vals = series.flatMap((s) => s.pontos.map((p) => p.valor)).filter((v) => v != null);
  const topo = vals.length && Math.max(...vals) > 0 ? Math.max(...vals) * 1.1 : 1;
  const x = (i) => M.left + (meses.length === 1 ? PLOT_W / 2 : (i * PLOT_W) / (meses.length - 1));
  const y = (v) => M.top + PLOT_H - (v / topo) * PLOT_H;
  const ticks = Array.from({ length: 5 }, (_, i) => (topo / 4) * i);
  const escala = escalaEixo(topo, indicador);
  const rotuloInd = INDICADORES.find((i) => i.id === indicador);

  const rotulosFim = espalhar(
    series.map((s) => {
      const ultimo = [...s.pontos].map((p, i) => ({ ...p, i })).reverse().find((p) => p.valor != null);
      if (!ultimo) return null;
      return { chave: s.chave, cor: s.cor, alvo: y(ultimo.valor), y: y(ultimo.valor), texto: s.rotulo.length > 20 ? s.rotulo.slice(0, 19) + "…" : s.rotulo };
    }).filter(Boolean),
    13, M.top + PLOT_H, M.top
  );

  // Rótulo de dados: aparece no ponto do mês sob o cursor.
  const iFoco = mesFoco ? meses.indexOf(mesFoco) : -1;
  const rotulosPonto = iFoco < 0 ? [] : espalhar(
    series.map((s) => {
      const p = s.pontos[iFoco];
      if (p?.valor == null) return null;
      return { chave: s.chave, cor: s.cor, forma: s.forma, alvo: y(p.valor), y: y(p.valor), texto: formatarCurto(p.valor, indicador) };
    }).filter(Boolean),
    15, M.top + PLOT_H, M.top + 8
  );
  // À esquerda do ponto quando o mês está na metade direita, para o
  // rótulo não sair pela borda.
  const ladoEsquerdo = iFoco >= 0 && x(iFoco) > M.left + PLOT_W * 0.6;

  function aoMover(evento) {
    const caixa = svgRef.current?.getBoundingClientRect();
    if (!caixa) return;
    const vx = ((evento.clientX - caixa.left) / caixa.width) * VB_W;
    let melhor = 0, menor = Infinity;
    meses.forEach((_, i) => { const d = Math.abs(x(i) - vx); if (d < menor) { menor = d; melhor = i; } });
    setMesFoco(meses[melhor]);
  }

  function alternar(lista, valor, setter) {
    setter(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  const btn = (ativo) => ({
    background: ativo ? T.primary : T.surface,
    color: ativo ? "#fff" : T.textSub,
    border: `1px solid ${ativo ? T.primary : T.borderHi}`,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: ativo ? 700 : 400, cursor: "pointer",
  });
  const tituloBloco = { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: T.textMuted };

  return (
    <div style={{ marginTop: 32, border: `1px solid ${T.border}`, borderRadius: 10, background: T.card, padding: 18 }}>
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 19, fontWeight: 700, margin: 0 }}>{titulo}</h2>
      <p style={{ color: T.textSub, fontSize: 12, margin: "6px 0 16px", maxWidth: 720 }}>{descricao}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={tituloBloco}>Indicador</span>
        {INDICADORES.map((ind) => (
          <button key={ind.id} onClick={() => setIndicador(ind.id)} style={btn(indicador === ind.id)}>
            {indicador === ind.id ? "✓ " : ""}{ind.label}
          </button>
        ))}
      </div>

      {grupos && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={tituloBloco}>Categorias</span>
          {grupos.map((g) => (
            <button key={g.id} onClick={() => alternar(gruposAtivos, g.id, setGruposAtivos)} style={btn(gruposAtivos.includes(g.id))}>
              {gruposAtivos.includes(g.id) ? "✓ " : "○ "}{g.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={tituloBloco}>{nomeItem} no gráfico — {series.length} de no máximo {MAX_SERIES}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {comBusca && (
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${nomeItem.toLowerCase()}…`}
                style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 6, color: T.text, padding: "5px 10px", fontSize: 12, minWidth: 200 }} />
            )}
            <button onClick={() => setSelecionados(listaOpcoes.visiveis.slice(0, MAX_SERIES).map((s) => s.chave))} style={btn(false)}>
              Primeiros {MAX_SERIES}
            </button>
            <button onClick={() => setSelecionados([])} style={btn(false)}>Limpar</button>
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", maxHeight: 132, overflowY: "auto" }}>
          {listaOpcoes.visiveis.map((s) => {
            const marcado = selecionados.includes(s.chave);
            const cheio = !marcado && selecionados.length >= MAX_SERIES;
            return (
              <label key={s.chave} title={cheio ? `Desmarque um antes (limite de ${MAX_SERIES})` : s.rotulo}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: cheio ? "not-allowed" : "pointer", opacity: cheio ? 0.45 : 1 }}>
                <input type="checkbox" checked={marcado} disabled={cheio} onChange={() => alternar(selecionados, s.chave, setSelecionados)} />
                {s.rotulo}
              </label>
            );
          })}
          {listaOpcoes.total === 0 && <span style={{ fontSize: 12, color: T.textMuted }}>Nada encontrado.</span>}
        </div>
        {listaOpcoes.total > MAX_OPCOES_LISTA && (
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
            Mostrando {MAX_OPCOES_LISTA} de {listaOpcoes.total.toLocaleString("pt-BR")} — refine a busca para achar o resto.
          </div>
        )}
      </div>

      {series.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 13 }}>
          Marque pelo menos um item para desenhar o gráfico.
        </div>
      ) : (
        <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: "100%", height: "auto", display: "block" }}
          onMouseMove={aoMover} onMouseLeave={() => setMesFoco(null)} role="img"
          aria-label={`Evolução de ${rotuloInd.label}, de ${MESES_LABEL[meses[0]] || meses[0]} a ${MESES_LABEL[meses[meses.length - 1]] || meses[meses.length - 1]}`}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={M.left} y1={y(t)} x2={M.left + PLOT_W} y2={y(t)} stroke={T.border} strokeWidth={1} />
              <text x={M.left - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill={T.textMuted}>{formatarEixo(t, escala)}</text>
            </g>
          ))}
          {meses.map((mes, i) => (
            <text key={mes} x={x(i)} y={M.top + PLOT_H + 22} textAnchor="middle" fontSize={11}
              fill={mes === mesFoco ? T.text : T.textMuted} fontWeight={mes === mesFoco ? 700 : 400}>
              {MESES_LABEL[mes] || mes}
            </text>
          ))}
          <text x={M.left} y={VB_H - 8} fontSize={10} fill={T.textMuted}>{rotuloInd.label} ({rotuloInd.eixo})</text>

          {iFoco >= 0 && <line x1={x(iFoco)} y1={M.top} x2={x(iFoco)} y2={M.top + PLOT_H} stroke={T.borderHi} strokeWidth={1} strokeDasharray="3 3" />}

          {series.map((s) => {
            const segmentos = []; let atual = [];
            s.pontos.forEach((p, i) => {
              if (p.valor == null) { if (atual.length) segmentos.push(atual); atual = []; }
              else atual.push([x(i), y(p.valor)]);
            });
            if (atual.length) segmentos.push(atual);
            return (
              <g key={s.chave}>
                {segmentos.map((seg, i) => (
                  <polyline key={i} points={seg.map(([px, py]) => `${px},${py}`).join(" ")} fill="none"
                    stroke={s.cor} strokeWidth={2} strokeDasharray={s.traco || undefined} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {s.pontos.map((p, i) => p.valor != null && (
                  <Marcador key={i} forma={s.forma} x={x(i)} y={y(p.valor)} cor={s.cor} r={mesFoco === p.mes ? 6 : 4.2} />
                ))}
              </g>
            );
          })}

          {/* rótulo de dados no ponto do mês sob o cursor */}
          {rotulosPonto.map((r) => {
            // O rotulo carrega a FORMA do marcador, nao so a cor: quando
            // dois rotulos sao afastados para nao se sobrepor, e a forma
            // que diz de qual linha cada um veio.
            const largura = r.texto.length * 6.1 + 26;
            const px = ladoEsquerdo ? x(iFoco) - 14 - largura : x(iFoco) + 14;
            const ancora = ladoEsquerdo ? px + largura : px;
            return (
              <g key={r.chave}>
                <line x1={x(iFoco)} y1={r.alvo} x2={ancora} y2={r.y} stroke={r.cor} strokeWidth={1} opacity={0.55} />
                <rect x={px} y={r.y - 9} width={largura} height={18} rx={4} fill={T.bg} stroke={r.cor} strokeWidth={1.2} opacity={0.97} />
                <Marcador forma={r.forma} x={px + 10} y={r.y} cor={r.cor} r={3.6} />
                <text x={px + 20} y={r.y + 4} fontSize={11} fontWeight={700} fill={r.cor}>{r.texto}</text>
              </g>
            );
          })}

          {/* rótulos no fim da linha, já espalhados */}
          {rotulosFim.map((r) => (
            <g key={r.chave}>
              <line x1={M.left + PLOT_W + 3} y1={r.alvo} x2={M.left + PLOT_W + 10} y2={r.y} stroke={r.cor} strokeWidth={1} opacity={0.6} />
              <text x={M.left + PLOT_W + 13} y={r.y + 4} fontSize={10.5} fill={r.cor} fontWeight={700}>{r.texto}</text>
            </g>
          ))}
        </svg>
      )}

      {series.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <div style={{ ...tituloBloco, marginBottom: 8 }}>
            Legenda {mesFoco ? `· valores de ${MESES_LABEL[mesFoco] || mesFoco}` : "· passe o mouse no gráfico para ver os valores do mês"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
            {series.map((s) => {
              const ponto = mesFoco ? s.pontos.find((p) => p.mes === mesFoco) : null;
              return (
                <span key={s.chave} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                  <svg width={34} height={14} aria-hidden="true">
                    <line x1={1} y1={7} x2={33} y2={7} stroke={s.cor} strokeWidth={2} strokeDasharray={s.traco || undefined} />
                    <Marcador forma={s.forma} x={17} y={7} cor={s.cor} r={4} />
                  </svg>
                  <span style={{ color: T.text }}>{s.rotulo}</span>
                  {mesFoco && <b style={{ color: T.textSub }}>{formatarValor(ponto?.valor, indicador)}</b>}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
