"use client";
/** Scrolls the notebook to an element and highlights it briefly. */
export function scrollToAnchor(anchor: string | null) {
  if (!anchor) return;
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.setAttribute("data-highlighted", "true");
  setTimeout(() => el.removeAttribute("data-highlighted"), 2500);
}
