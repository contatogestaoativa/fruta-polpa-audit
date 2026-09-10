import { useState, useMemo, useEffect, useRef } from "react";
import { DEPARTAMENTOS, LABEL_DEPARTAMENTO, classificarDepartamento, ordenarPorDescricao } from "../lib/departamentos.js";
import { MESES_LABEL } from "../lib/dreReference.js";

// ═══════════════════════════════════════════════════════════════════
// EVOLUÇÃO DO MIX — gráfico de linha, uma linha por sabor
//
// Sem biblioteca de gráfico: SVG puro, do mesmo jeito que o resto do
// sistema é escrito. Menos peso no bundle e nada de CDN sem versão.
//
// ACESSIBILIDADE: nenhuma série é identificada só pela cor. Cada sabor
// tem, além da cor, um MARCADOR de forma própria (círculo, quadrado,
// triângulo...) e um TRACEJADO próprio, repetidos na legenda e no fim
// da linha. Dá para ler o gráfico inteiro em preto e branco.
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

const MAX_SERIES = 8; // acima disso o gráfico vira espaguete

function estiloSerie(indice) {
  return {
    cor: CORES[indice % CORES.length],
    forma: FORMAS[indice % FORMAS.length],
    traco: TRACOS[Math.floor(indice / CORES.length) % TRACOS.length],
  };
}

/** Marcador de forma — é ele que identifica a série sem depender de cor. */
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

function formatar(valor, indicador) {
  if (valor == null) return "—";
  if (indicador === "quantidade") return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return "R$ " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Escala do eixo Y. A unidade e escolhida UMA vez, pelo maior valor do
 * eixo, e vale para todos os tracos — senao o eixo mistura "R$ 1,5 mi"
 * com "R$ 1.000 mil" na mesma coluna e o leitor tem que converter de
 * cabeca para comparar dois tracos vizinhos.
 */
function escalaEixo(topo, indicador) {
  const prefixo = indicador === "quantidade" ? "" : "R$ ";
  if (topo >= 1e6) return { divisor: 1e6, sufixo: " mi", casas: 1, prefixo };
  if (topo >= 1e4) return { divisor: 1e3, sufixo: " mil", casas: 0, prefixo };
  return { divisor: 1, sufixo: "", casas: indicador === "precoMedio" ? 2 : 0, prefixo };
}

function formatarEixo(valor, escala) {
  if (valor === 0) return `${escala.prefixo}0`;  // "R$ 0 mi" nao existe
  const n = (valor / escala.divisor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: escala.casas });
  return `${escala.prefixo}${n}${escala.sufixo}`;
}

/**
 * Monta, a partir do histórico de todos os meses, o catálogo de sabores
 * (código -> descrição + departamento) e a série de cada um por mês.
 * Se o mesmo código aparecer duas vezes no mês, soma — e o preço médio
 * é recalculado do agregado, nunca a média de duas médias.
 */
function montarBase(dados1464) {
  const meses = Object.keys(dados1464 || {}).sort();
  const catalogo = new Map();
  const porSabor = new Map();

  for (const mes of meses) {
    const produtos = dados1464[mes]?.extra?.produtos;
    if (!Array.isArray(produtos)) continue;
    for (const p of produtos) {
      const chave = String(p.codigo ?? p.descricao);
      if (!catalogo.has(chave)) {
        catalogo.set(chave, { chave, codigo: p.codigo, descricao: p.descricao, departamento: classificarDepartamento(p) });
      } else {
        // a descrição mais recente prevalece (mudança de embalagem, etc.)
        const atual = catalogo.get(chave);
        atual.descricao = p.descricao || atual.descricao;
        atual.departamento = classificarDepartamento({ codigo: p.codigo, descricao: atual.descricao });
      }
      if (!porSabor.has(chave)) porSabor.set(chave, {});
      const serie = porSabor.get(chave);
      const anterior = serie[mes] || { quantidade: 0, faturamento: 0 };
      const quantidade = anterior.quantidade + (p.quantidade || 0);
      const faturamento = anterior.faturamento + (p.faturamento || 0);
      serie[mes] = { quantidade, faturamento, precoMedio: quantidade ? faturamento / quantidade : null };
    }
  }
  return { meses, catalogo: [...catalogo.values()], porSabor };
}

export default function MixEvolucao({ T, dados1464 }) {
  const { meses, catalogo, porSabor } = useMemo(() => montarBase(dados1464), [dados1464]);

  const [indicador, setIndicador] = useState("faturamento");
  const [categorias, setCategorias] = useState(() => DEPARTAMENTOS.map((d) => d.id));
  const [selecionados, setSelecionados] = useState([]);
  const [mesFoco, setMesFoco] = useState(null);
  const svgRef = useRef(null);

  const doCatalogoNasCategorias = useMemo(
    () => ordenarPorDescricao(catalogo.filter((s) => categorias.includes(s.departamento))),
    [catalogo, categorias]
  );

  // Padrão: os maiores em faturamento no mês mais recente, para o gráfico
  // já abrir dizendo alguma coisa em vez de abrir vazio.
  useEffect(() => {
    const ultimoMes = meses[meses.length - 1];
    const ranking = [...doCatalogoNasCategorias].sort(
      (a, b) => (porSabor.get(b.chave)?.[ultimoMes]?.faturamento || 0) - (porSabor.get(a.chave)?.[ultimoMes]?.faturamento || 0)
    );
    setSelecionados(ranking.slice(0, Math.min(5, MAX_SERIES)).map((s) => s.chave));
  }, [categorias.join(","), catalogo.length, meses.length]);

  const series = useMemo(() => {
    return selecionados
      .map((chave) => doCatalogoNasCategorias.find((s) => s.chave === chave))
      .filter(Boolean)
      .slice(0, MAX_SERIES)
      .map((sabor, i) => ({
        ...sabor,
        ...estiloSerie(i),
        pontos: meses.map((mes) => {
          const v = porSabor.get(sabor.chave)?.[mes];
          return { mes, valor: v ? v[indicador] : null };
        }),
      }));
  }, [selecionados, doCatalogoNasCategorias, meses, indicador, porSabor]);

  if (meses.length === 0) return null;

  const valores = series.flatMap((s) => s.pontos.map((p) => p.valor)).filter((v) => v != null);
  const maxValor = valores.length ? Math.max(...valores) : 0;
  const topo = maxValor > 0 ? maxValor * 1.1 : 1;

  const x = (i) => M.left + (meses.length === 1 ? PLOT_W / 2 : (i * PLOT_W) / (meses.length - 1));
  const y = (v) => M.top + PLOT_H - (v / topo) * PLOT_H;

  const ticks = Array.from({ length: 5 }, (_, i) => (topo / 4) * i);
  const escala = escalaEixo(topo, indicador);

  function aoMover(evento) {
    const caixa = svgRef.current?.getBoundingClientRect();
    if (!caixa || meses.length === 0) return;
    const vx = ((evento.clientX - caixa.left) / caixa.width) * VB_W;
    let melhor = 0, menorDistancia = Infinity;
    meses.forEach((_, i) => {
      const d = Math.abs(x(i) - vx);
      if (d < menorDistancia) { menorDistancia = d; melhor = i; }
    });
    setMesFoco(meses[melhor]);
  }

  // Rotulos no fim da linha: quando dois sabores terminam o mes com
  // valores parecidos, os textos se sobrepoem e viram borrao. Empurra
  // um por vez ate garantir espaco minimo, sem sair da area do grafico.
  const ALTURA_ROTULO = 13;
  const rotulosFim = series
    .map((s) => {
      const ultimo = [...s.pontos].map((p, i) => ({ ...p, i })).reverse().find((p) => p.valor != null);
      if (!ultimo) return null;
      return { chave: s.chave, cor: s.cor, alvo: y(ultimo.valor), y: y(ultimo.valor), texto: s.descricao.length > 20 ? s.descricao.slice(0, 19) + "…" : s.descricao };
    })
    .filter(Boolean)
    .sort((a, b) => a.alvo - b.alvo);
  for (let k = 1; k < rotulosFim.length; k++) {
    if (rotulosFim[k].y - rotulosFim[k - 1].y < ALTURA_ROTULO) rotulosFim[k].y = rotulosFim[k - 1].y + ALTURA_ROTULO;
  }
  const limiteBaixo = M.top + PLOT_H;
  for (let k = rotulosFim.length - 1; k >= 0; k--) {
    if (rotulosFim[k].y > limiteBaixo) rotulosFim[k].y = limiteBaixo - (rotulosFim.length - 1 - k) * ALTURA_ROTULO;
    if (k < rotulosFim.length - 1 && rotulosFim[k + 1].y - rotulosFim[k].y < ALTURA_ROTULO) rotulosFim[k].y = rotulosFim[k + 1].y - ALTURA_ROTULO;
  }

  const iFoco = mesFoco ? meses.indexOf(mesFoco) : -1;
  const rotulo = INDICADORES.find((i) => i.id === indicador);

  function alternar(lista, valor, setter) {
    setter(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  const btn = (ativo) => ({
    background: ativo ? T.primary : T.surface,
    color: ativo ? "#fff" : T.textSub,
    border: `1px solid ${ativo ? T.primary : T.borderHi}`,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: ativo ? 700 : 400, cursor: "pointer",
  });

  return (
    <div style={{ marginTop: 32, border: `1px solid ${T.border}`, borderRadius: 10, background: T.card, padding: 18 }}>
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 19, fontWeight: 700, margin: 0 }}>Evolução por sabor</h2>
      <p style={{ color: T.textSub, fontSize: 12, margin: "6px 0 16px", maxWidth: 700 }}>
        Uma linha por sabor ao longo dos meses importados. Escolha o indicador, filtre por categoria e marque os sabores.
        Cada sabor tem cor, <b>forma de marcador</b> e <b>tipo de traço</b> próprios — a leitura não depende de enxergar a cor.
      </p>

      {/* Indicador */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: T.textMuted }}>Indicador</span>
        {INDICADORES.map((ind) => (
          <button key={ind.id} onClick={() => setIndicador(ind.id)} style={btn(indicador === ind.id)}>
            {indicador === ind.id ? "✓ " : ""}{ind.label}
          </button>
        ))}
      </div>

      {/* Categorias */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: T.textMuted }}>Categorias</span>
        {DEPARTAMENTOS.map((dep) => (
          <button key={dep.id} onClick={() => alternar(categorias, dep.id, setCategorias)} style={btn(categorias.includes(dep.id))}>
            {categorias.includes(dep.id) ? "✓ " : "○ "}{dep.label}
          </button>
        ))}
      </div>

      {/* Sabores */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: T.textMuted }}>
            Sabores no gráfico — {series.length} de no máximo {MAX_SERIES}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSelecionados(doCatalogoNasCategorias.slice(0, MAX_SERIES).map((s) => s.chave))} style={btn(false)}>
              Primeiros {MAX_SERIES} (A→Z)
            </button>
            <button onClick={() => setSelecionados([])} style={btn(false)}>Limpar</button>
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", maxHeight: 132, overflowY: "auto" }}>
          {doCatalogoNasCategorias.map((s) => {
            const marcado = selecionados.includes(s.chave);
            const cheio = !marcado && selecionados.length >= MAX_SERIES;
            return (
              <label key={s.chave} title={cheio ? `Desmarque um sabor antes (limite de ${MAX_SERIES})` : LABEL_DEPARTAMENTO[s.departamento]}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: cheio ? "not-allowed" : "pointer", opacity: cheio ? 0.45 : 1 }}>
                <input type="checkbox" checked={marcado} disabled={cheio} onChange={() => alternar(selecionados, s.chave, setSelecionados)} />
                {s.descricao}
              </label>
            );
          })}
          {doCatalogoNasCategorias.length === 0 && (
            <span style={{ fontSize: 12, color: T.textMuted }}>Nenhuma categoria marcada.</span>
          )}
        </div>
      </div>

      {series.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 13 }}>
          Marque pelo menos um sabor para desenhar o gráfico.
        </div>
      ) : (
        <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: "100%", height: "auto", display: "block" }}
          onMouseMove={aoMover} onMouseLeave={() => setMesFoco(null)} role="img"
          aria-label={`Evolução de ${rotulo.label} por sabor, de ${MESES_LABEL[meses[0]] || meses[0]} a ${MESES_LABEL[meses[meses.length - 1]] || meses[meses.length - 1]}`}>
          {/* grade + eixo Y */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={M.left} y1={y(t)} x2={M.left + PLOT_W} y2={y(t)} stroke={T.border} strokeWidth={1} />
              <text x={M.left - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill={T.textMuted}>{formatarEixo(t, escala)}</text>
            </g>
          ))}
          {/* eixo X */}
          {meses.map((mes, i) => (
            <text key={mes} x={x(i)} y={M.top + PLOT_H + 22} textAnchor="middle" fontSize={11}
              fill={mes === mesFoco ? T.text : T.textMuted} fontWeight={mes === mesFoco ? 700 : 400}>
              {MESES_LABEL[mes] || mes}
            </text>
          ))}
          <text x={M.left} y={VB_H - 8} fontSize={10} fill={T.textMuted}>{rotulo.label} ({rotulo.eixo})</text>

          {/* guia do mês sob o cursor */}
          {iFoco >= 0 && <line x1={x(iFoco)} y1={M.top} x2={x(iFoco)} y2={M.top + PLOT_H} stroke={T.borderHi} strokeWidth={1} strokeDasharray="3 3" />}

          {/* séries */}
          {series.map((s) => {
            const segmentos = [];
            let atual = [];
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

          {/* rotulos no fim da linha, ja espalhados */}
          {rotulosFim.map((r) => (
            <g key={r.chave}>
              <line x1={M.left + PLOT_W + 3} y1={r.alvo} x2={M.left + PLOT_W + 10} y2={r.y} stroke={r.cor} strokeWidth={1} opacity={0.6} />
              <text x={M.left + PLOT_W + 13} y={r.y + 4} fontSize={10.5} fill={r.cor} fontWeight={700}>{r.texto}</text>
            </g>
          ))}
        </svg>
      )}

      {/* Legenda + valores do mês sob o cursor (a legenda repete forma e traço) */}
      {series.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: T.textMuted, marginBottom: 8 }}>
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
                  <span style={{ color: T.text }}>{s.descricao}</span>
                  {mesFoco && <b style={{ color: T.textSub }}>{formatar(ponto?.valor, indicador)}</b>}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
