export function Logo({ T, height = 34, showText = true }) {
  const largura = height * (164 / 149); // proporção real do arquivo (164x149)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <img src="/logo.png" alt="Fruta Polpa" width={largura} height={height} style={{ display: "block", objectFit: "contain" }} />
      {showText && height >= 28 && (
        <span style={{ fontFamily: T.fontBody, fontSize: height * 0.2, fontWeight: 600, color: T.textMuted, letterSpacing: "1.5px", textTransform: "uppercase" }}>
          Auditoria Gerencial
        </span>
      )}
    </div>
  );
}
