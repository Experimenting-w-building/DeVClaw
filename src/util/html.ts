const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeRe = /[&<>"']/g;

export function escapeHtml(str: string): string {
  return str.replace(escapeRe, (ch) => escapeMap[ch]);
}
