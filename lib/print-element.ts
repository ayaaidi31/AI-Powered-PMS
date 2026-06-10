/**
 * Print a single element as a clean A4 document.
 *
 * Renders the element into a hidden iframe together with the page's stylesheets,
 * so it keeps its styling but drops all application chrome and paginates
 * naturally across A4 pages (one page for a short report, more if longer).
 */
export function printReport(el: HTMLElement | null) {
  if (!el) return

  // Copy the document's stylesheets (Tailwind etc.) — use absolute hrefs so the
  // links resolve inside the iframe.
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) =>
      n.tagName === "LINK"
        ? `<link rel="stylesheet" href="${(n as HTMLLinkElement).href}">`
        : n.outerHTML,
    )
    .join("\n")

  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0",
  })
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) { iframe.remove(); return }

  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8">${styles}` +
      `<style>` +
      `@page{size:A4;margin:16mm}` +
      `html,body{background:#fff;margin:0;padding:0}` +
      `.report-print{box-shadow:none!important;border:none!important;border-radius:0!important;` +
      `padding:0!important;width:100%!important;max-width:none!important;position:static!important}` +
      `</style></head><body>${el.outerHTML}</body></html>`,
  )
  doc.close()

  let done = false
  const run = () => {
    if (done) return
    done = true
    win.focus()
    win.print()
    setTimeout(() => iframe.remove(), 1000)
  }
  // Print once the copied stylesheets have loaded (with a fallback).
  win.addEventListener("load", () => setTimeout(run, 250))
  setTimeout(run, 1500)
}
