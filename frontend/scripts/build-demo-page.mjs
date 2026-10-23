// Junta o build de demonstração (dist-demo) numa única página HTML, com o
// CSS e o JS embutidos, pronta a publicar em qualquer alojamento estático.
// Uso: npm run build:demo  →  dist-demo/demo.html
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-demo";
const index = readFileSync(join(dir, "index.html"), "utf8");

const asset = (re) => {
  const match = index.match(re);
  if (!match) throw new Error(`Não encontrei ${re} em ${dir}/index.html`);
  return readFileSync(join(dir, match[1]), "utf8");
};
const js = asset(/<script type="module" crossorigin src="\.\/([^"]+)"/);
const css = asset(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)"/);

// Evita que um "</script" dentro do código feche a tag antes do tempo
const safeJs = js.replace(/<\/script/gi, "<\\/script");

const page = `<title>Tarefas e Projectos</title>
<meta name="description" content="Demonstração da gestão de tarefas, projetos, objetivos e KPIs da Direção de Sistemas de Informação">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`;

writeFileSync(join(dir, "demo.html"), page);
console.log(`${dir}/demo.html criado (${(page.length / 1024).toFixed(0)} KB)`);
