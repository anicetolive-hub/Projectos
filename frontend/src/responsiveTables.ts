// Em ecrãs estreitos (telemóvel) as tabelas passam a cartões empilhados via
// CSS (App.css): cada célula mostra o nome da sua coluna, lido do atributo
// data-label. Este observador preenche data-label a partir dos cabeçalhos,
// para não ser preciso repeti-lo à mão em cada tabela.

function labelTables(root: HTMLElement) {
  root.querySelectorAll("table").forEach((table) => {
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    table.querySelectorAll("tbody tr").forEach((tr) => {
      let column = 0;
      for (const cell of tr.children) {
        const span = (cell as HTMLTableCellElement).colSpan || 1;
        const label = span === 1 ? (headers[column] ?? "") : "";
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
        column += span;
      }
    });
  });
}

export function installResponsiveTables(root: HTMLElement) {
  labelTables(root);
  // Só observa nós adicionados/removidos, por isso mudar data-label não volta a disparar
  new MutationObserver(() => labelTables(root)).observe(root, { childList: true, subtree: true });
}
