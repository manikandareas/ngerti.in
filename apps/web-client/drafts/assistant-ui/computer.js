// A simulated computer view for the draft. No machine or browser connection.
import { icons } from "./icons.js";

export function computerScreen({ step, stage }) {
  const searching = step === 0;
  const details = step === 2;
  return `<div class="machine-screen" data-step="${step}" data-working="${stage === "working"}" role="img" aria-label="Layar computer contoh: ${searching ? "agent mencari waffle cone" : details ? "agent membaca rincian produk" : "agent meninjau katalog pemasok"}">
    <div class="machine-browser-bar">${icons.Globe02}<span>supply.scoop.example/${details ? "waffle-cones" : "catalog"}</span><span class="machine-tab-status"></span></div>
    <div class="machine-page">
      <div class="machine-site-nav"><span class="machine-brand-mark">C</span><strong>Cone King</strong><span>Catalog</span><span>Orders</span></div>
      <div class="machine-site-content">
        <span class="machine-site-context">Supplies for your next scoop.</span>
        <h4>${details ? "Classic waffle cones" : "Make every scoop count."}</h4>
        <p>${details ? "Crisp, golden cones. Made fresh, delivered to your store." : "Cones, cups, and everything your counter needs."}</p>
        <div class="machine-search">${icons.Search01}<span>${searching ? "Search your supplies…" : "waffle cone"}</span>${searching ? '<span class="machine-caret"></span>' : ""}</div>
        ${details ? `<div class="machine-product-detail"><div class="machine-cone" aria-hidden="true"><span></span></div><div><span class="machine-stock">In stock</span><h5>Waffle cone · Classic</h5><p>250 pieces · 7 day delivery</p><strong>Rp1.250.000</strong><span class="machine-site-button">View order details</span></div></div>` : `<div class="machine-products"><div class="machine-table-heading"><span>Product</span><span>Pack size</span><span>Delivery</span></div><div class="machine-product-row ${searching ? "" : "active"}"><span><i class="mini-cone"></i>Classic waffle cones</span><span>250 pcs</span><span>7 days</span></div><div class="machine-product-row"><span><i class="mini-cone lighter"></i>Mini waffle cones</span><span>500 pcs</span><span>5 days</span></div><div class="machine-product-row"><span><i class="mini-cup"></i>Paper cups</span><span>200 pcs</span><span>3 days</span></div></div>`}
      </div>
    </div>
    <span class="machine-cursor" aria-hidden="true">${icons.Cursor01}<span>Tobi</span></span>
  </div>`;
}

export function computerBubble(computer) {
  if (!computer.ready)
    return `<p class="computer-starting">${icons.Computer}<span>${computer.stage === "starting" ? "Starting computer…" : "Computer stopped."}</span></p>`;
  const label = { working: "Working", finished: "Finished", stopped: "Stopped" }[computer.stage];
  return `<header class="computer-card-heading"><span class="computer-card-icon">${icons.Globe02}</span><div><strong>Browser</strong><p>${label}</p></div></header>${computerScreen(computer)}<button type="button" class="open-computer-button" data-action="open-computer">Open computer</button>`;
}
