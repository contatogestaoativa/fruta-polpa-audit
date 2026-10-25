import { LOGO_SRC, LOGO_PROPORCAO } from "../lib/logoData.js";

// Logo oficial da Fruta Polpa (a fruta já traz o nome). `showText` acrescenta
// o rótulo "Auditoria Gerencial" ao lado, para telas onde a marca aparece sozinha.
export function Logo({ T, height = 34, showText = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <img src={LOGO_SRC} alt="Fruta Polpa" height={height} width={Math.round(height * LOGO_PROPORCAO)} style={{ height, width: "auto", display: "block" }} />
      {showText && height >= 28 && (
        <span style={{ fontFamily: T.fontBody, fontSize: Math.max(11, height * 0.34), fontWeight: 600, color: T.textSub, lineHeight: 1.2 }}>
          Auditoria Gerencial
        </span>
      )}
    </div>
  );
}
