import { defineConfig } from "vite";

// Caminhos relativos: funciona tanto em GitHub Pages de usuário/organização
// quanto de projeto, sem precisar hardcodar o nome do repositório.
export default defineConfig({
  base: "./",
});
