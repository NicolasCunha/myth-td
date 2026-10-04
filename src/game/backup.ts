// Exportar/importar o save completo como um arquivo JSON — pra levar o
// progresso pra outra máquina ou compartilhar com amigos. Junta numa
// estrutura só tudo que o jogo guarda no localStorage.
import { META_KEY } from "./meta";
import { TEAM_KEY } from "./team";
import { STORAGE_KEY } from "./save";
import { SETTINGS_KEY } from "./settings";

const FORMAT = "myth-td-save";
const FORMAT_VERSION = 1;

// Chave no arquivo -> chave no localStorage.
const SECTIONS = {
  meta: META_KEY, // Ambrosia, melhorias, torres compradas
  team: TEAM_KEY, // equipe montada
  run: STORAGE_KEY, // run salva em andamento (pode não existir)
  settings: SETTINGS_KEY,
} as const;

type Section = keyof typeof SECTIONS;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  data: Partial<Record<Section, unknown>>;
}

export function exportBackup(): string {
  const data: BackupFile["data"] = {};
  for (const [section, key] of Object.entries(SECTIONS) as [Section, string][]) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[section] = JSON.parse(raw);
    } catch {
      // valor corrompido no localStorage — fica de fora do arquivo
    }
  }
  const file: BackupFile = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
  return JSON.stringify(file, null, 2);
}

// Valida e grava o conteúdo do arquivo no localStorage, substituindo o
// progresso atual. Lança Error com mensagem legível se o arquivo for inválido.
// Seções ausentes no arquivo são apagadas (ex.: arquivo sem run salva).
export function importBackup(text: string): void {
  let file: BackupFile;
  try {
    file = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  if (!file || file.format !== FORMAT || typeof file.data !== "object" || file.data === null) {
    throw new Error("Esse arquivo não é um save do Myth TD.");
  }
  if (typeof file.version !== "number" || file.version > FORMAT_VERSION) {
    throw new Error("Esse save é de uma versão mais nova do jogo.");
  }
  if (!file.data.meta) {
    throw new Error("O save não tem os dados de progresso (meta).");
  }

  for (const [section, key] of Object.entries(SECTIONS) as [Section, string][]) {
    const value = file.data[section];
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  }
}

export function backupFileName(): string {
  return `myth-td-save-${new Date().toISOString().slice(0, 10)}.json`;
}
