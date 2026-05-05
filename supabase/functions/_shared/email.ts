// Plain HTML email rendering. No JSX, no React Email — keeps the Deno bundle
// small.

export type Match = {
  rohlik_product_id: number;
  name: string;
  image_url: string | null;
  url: string | null;
  sale_price: number | null;
  original_price: number | null;
  discount_pct: number | null;
  sale_text: string | null;
  sale_valid_till: string | null;
};

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Rohlík exposes the last-minute price view of a product via ?lm=1; without
// it the regular (non-discounted) price often shows. Append the param so the
// click-through lands on the discounted view.
const lmUrl = (u: string | null) =>
  !u ? null : `${u}${u.includes("?") ? "&" : "?"}lm=1`;

const fmtCzk = (n: number | null) =>
  n == null ? "" : `${n.toFixed(2).replace(".", ",")} Kč`;

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Prague",
  });
};

export function renderEmail(matches: Match[], appUrl: string): string {
  const cards = matches
    .map((m) => {
      const img = m.image_url
        ? `<img src="${escape(m.image_url)}" alt="" width="120" `
          + `style="border-radius:8px;display:block;margin-right:16px;flex-shrink:0">`
        : "";
      const before = m.original_price
        ? `<span style="color:#888;text-decoration:line-through;margin-right:8px">`
          + `${fmtCzk(m.original_price)}</span>`
        : "";
      const sale = m.discount_pct
        ? `<span style="background:#FFE55A;color:#1C2529;border-radius:4px;`
          + `padding:2px 6px;font-weight:600">-${m.discount_pct} %</span>`
        : "";
      const until = m.sale_valid_till
        ? `<div style="color:#666;font-size:12px;margin-top:4px">`
          + `Sleva platí do ${escape(fmtDate(m.sale_valid_till))}</div>`
        : "";
      const href = lmUrl(m.url);
      const link = href
        ? `<a href="${escape(href)}" style="color:#1C2529;text-decoration:none">`
        : "<span>";
      const linkClose = m.url ? "</a>" : "</span>";
      return `
        <tr><td style="padding:12px 0;border-bottom:1px solid #eee">
          <table width="100%"><tr>
            <td width="120" valign="top">${img}</td>
            <td valign="top">
              ${link}<div style="font-size:16px;font-weight:600;margin-bottom:6px">
                ${escape(m.name)}</div>${linkClose}
              <div>
                <span style="font-size:18px;font-weight:600;margin-right:8px">
                  ${fmtCzk(m.sale_price)}</span>${before}${sale}
              </div>
              ${until}
            </td>
          </tr></table>
        </td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<title>Rohlík: oblíbené ve slevě</title></head>
<body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1C2529">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
    <h1 style="margin:0 0 8px;font-size:20px">Dnes ve slevě na Rohlíku</h1>
    <p style="margin:0 0 16px;color:#666;font-size:14px">
      ${matches.length} ${matches.length === 1 ? "oblíbená položka" :
        matches.length < 5 ? "oblíbené položky" : "oblíbených položek"} odpovídá tvému seznamu.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">${cards}</table>
    <p style="margin-top:24px;font-size:12px;color:#888">
      <a href="${escape(appUrl)}" style="color:#888">Spravovat seznam</a>
    </p>
  </div>
</body></html>`;
}
