// ═══════════════════════════════════════════════════════════════════
// FRUTA POLPA — AUDIT SYSTEM — DESIGN TOKENS (dark + light)
//
// Linguagem visual: "vidro líquido sobre breu". Fundo quase preto com um
// feixe de luz laranja vindo do topo, painéis de vidro com contorno fino
// de brasa, tipografia larga e pesada nos títulos (TikTok Sans
// SemiExpanded ExtraBold) e Inter Tight no corpo. Tabelas e números ficam
// sóbrios e opacos — o brilho é só moldura.
//
// IMPORTANTE: tokens que o código concatena com sufixo hex (primary,
// primaryDim, gold, leaf, danger, warning) precisam continuar em #RRGGBB.
// Os demais (border, borderHi, glass…) podem ser rgba.
// ═══════════════════════════════════════════════════════════════════

const SHARED = {
  gold: "#F2A71B",       // "laranjinha" — destaque das linhas de % (214/219)
  goldDim: "#F2A71B22",
  leaf: "#4C9A2A",
  danger: "#E23D3D",
  warning: "#F2A71B",
  fontDisplay: "'TikTok Sans', 'Inter Tight', system-ui, sans-serif",
  // largura SemiExpanded (eixo wdth da TikTok Sans) — aplicada junto com fontDisplay
  displayStretch: "112.5%",
  fontBody: "'Inter Tight', 'Segoe UI', system-ui, sans-serif",
  // raios: painel grande de vidro / controle / pílula
  rCard: 22,
  rCtl: 12,
};

export const THEMES = {
  dark: {
    ...SHARED,
    primary: "#FF5A1A",
    primaryDim: "#FF5A1A22",
    onPrimary: "#1E0800",       // texto sobre laranja (branco só dá 3:1 aqui)
    primaryText: "#FF7A3D",     // laranja legível sobre fundo escuro (texto/ícone)
    gradient: "linear-gradient(180deg, #FF5A1A 0%, #FF9A5C 100%)",
    bg: "#0E0400", surface: "#160803", card: "#1B0C06",
    border: "rgba(255,130,70,0.16)", borderHi: "rgba(255,130,70,0.38)",
    text: "#FFF0E6", textSub: "#C4B0A4", textMuted: "#8F7A70",
    // vidro: preenchimento translúcido + contorno de brasa + halo
    glass: "linear-gradient(160deg, rgba(255,140,80,0.09) 0%, rgba(255,255,255,0.025) 55%, rgba(255,90,26,0.05) 100%)",
    glassBorder: "rgba(255,130,70,0.30)",
    glassShadow: "0 24px 60px -28px rgba(255,90,26,0.45), inset 0 1px 0 rgba(255,200,160,0.10)",
    // cenário (feixe de luz / grade de pontos / palavra-fantasma)
    beam: "radial-gradient(55% 100% at 50% 0%, rgba(255,96,30,0.52) 0%, rgba(255,90,26,0.16) 42%, transparent 72%)",
    beamCore: "radial-gradient(12% 58% at 50% 0%, rgba(255,150,80,0.70) 0%, transparent 100%)",
    dots: "rgba(255,170,120,0.30)",
    ghost: "rgba(255,106,40,0.07)",
    headerGlass: "rgba(14,4,0,0.72)",
  },
  light: {
    ...SHARED,
    primary: "#D4470A",
    primaryDim: "#D4470A1A",
    onPrimary: "#FFFFFF",
    primaryText: "#C03F08",
    gradient: "linear-gradient(180deg, #E8500D 0%, #F58445 100%)",
    bg: "#FFF3EA", surface: "#FFFFFF", card: "#FFFFFF",
    border: "rgba(170,80,25,0.14)", borderHi: "rgba(170,80,25,0.32)",
    text: "#1E0B00", textSub: "#6B4F40", textMuted: "#977E70",
    glass: "linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(255,236,222,0.62) 100%)",
    glassBorder: "rgba(232,80,13,0.22)",
    glassShadow: "0 22px 50px -26px rgba(232,80,13,0.38), inset 0 1px 0 rgba(255,255,255,0.9)",
    beam: "radial-gradient(60% 100% at 50% 0%, rgba(255,120,60,0.34) 0%, rgba(255,150,90,0.12) 45%, transparent 75%)",
    beamCore: "radial-gradient(14% 55% at 50% 0%, rgba(255,210,170,0.65) 0%, transparent 100%)",
    dots: "rgba(232,80,13,0.22)",
    ghost: "rgba(232,80,13,0.07)",
    headerGlass: "rgba(255,243,234,0.78)",
  },
};

// Painel de vidro: use com spread — style={{ ...glass(T), padding: 18 }}
export function glass(T, extra = {}) {
  return {
    background: T.glass,
    border: `1px solid ${T.glassBorder}`,
    borderRadius: T.rCard,
    boxShadow: T.glassShadow,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    ...extra,
  };
}

export function riskColor(T, level) {
  if (level === "critico") return T.danger;
  if (level === "atencao") return T.warning;
  return T.leaf;
}
