import { useState } from "react";
import { setToken } from "../api";

/** Aviso de demonstração com opção de repor os dados de exemplo. */
export function DemoBanner() {
  const [confirming, setConfirming] = useState(false);

  async function reset() {
    const { resetDemoData } = await import("./mockApi");
    resetDemoData();
    // Recomeça do início: dados originais e escolha de perfil
    setToken(null);
    window.location.reload();
  }

  return (
    <div className="demo-banner">
      <span>
        <strong>Demonstração</strong> · dados de exemplo; as alterações ficam só neste aparelho.
      </span>
      {confirming ? (
        <span className="actions">
          <button className="btn danger" onClick={reset}>
            Sim, repor
          </button>
          <button className="btn secondary" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </span>
      ) : (
        <button className="link-button" onClick={() => setConfirming(true)}>
          Repor dados de exemplo
        </button>
      )}
    </div>
  );
}
