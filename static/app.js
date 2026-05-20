const homeView = document.getElementById("homeView");
const groupView = document.getElementById("groupView");
const groupGrid = document.getElementById("groupGrid");
const groupTitle = document.getElementById("groupTitle");
const groupSupplier = document.getElementById("groupSupplier");
const groupHint = document.getElementById("groupHint");
const itemList = document.getElementById("itemList");
const toast = document.getElementById("toast");

const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const saveBtn = document.getElementById("saveBtn");
const mailBtn = document.getElementById("mailBtn");

let currentGroupName = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error || "Fehler bei der Serveranfrage.";
    throw new Error(errorMessage);
  }

  return data;
}

function renderGroupCards(groups) {
  groupGrid.innerHTML = "";

  if (!groups.length) {
    groupGrid.innerHTML = "<p>Keine Lagergruppen gefunden.</p>";
    return;
  }

  groups.forEach((group) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "group-card";
    card.innerHTML = `
      <h3>${group.name}</h3>
      <p class="group-meta">Lieferant: ${group.supplier_email || "nicht hinterlegt"}</p>
      <p class="group-meta">Artikel: ${group.items_total}</p>
      <span class="badge">Nachbestellung noetig: ${group.items_to_order}</span>
    `;
    card.addEventListener("click", () => openGroup(group.name));
    groupGrid.appendChild(card);
  });
}

function formatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) {
    return "0";
  }
  if (Number.isInteger(n)) {
    return `${n}`;
  }
  return `${n.toFixed(2)}`.replace(/\.00$/, "").replace(/0$/, "");
}

function renderGroup(group) {
  currentGroupName = group.name;
  groupTitle.textContent = group.name;
  groupSupplier.textContent = group.supplier_email
    ? `Lieferantenmail: ${group.supplier_email}`
    : "Lieferantenmail fehlt in B1";
  groupHint.textContent =
    "Trage den aktuellen Bestand ein. Die Bestellmenge wird automatisch aus Soll minus Ist berechnet.";

  itemList.innerHTML = "";
  group.items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-head">
        <h3>${item.article}</h3>
        <p class="item-target">Soll: ${formatNumber(item.target_stock)} ${item.unit}</p>
      </div>
      <div class="input-row">
        <label for="item-${item.row}">Ist</label>
        <input
          id="item-${item.row}"
          type="number"
          step="0.01"
          inputmode="decimal"
          value="${formatNumber(item.current_stock)}"
          data-row="${item.row}"
        />
        <span>${item.unit}</span>
      </div>
    `;
    itemList.appendChild(card);
  });
}

function collectUpdates() {
  const inputs = itemList.querySelectorAll("input[data-row]");
  return Array.from(inputs).map((input) => {
    const row = Number(input.dataset.row);
    const textValue = input.value.replace(",", ".");
    const currentStock = Number(textValue);
    return {
      row,
      current_stock: Number.isNaN(currentStock) ? 0 : currentStock,
    };
  });
}

async function loadGroups() {
  const data = await fetchJson("/api/groups");
  renderGroupCards(data.groups || []);
}

async function openGroup(groupName) {
  const group = await fetchJson(`/api/groups/${encodeURIComponent(groupName)}`);
  renderGroup(group);
  homeView.classList.add("hidden");
  groupView.classList.remove("hidden");
}

async function saveCurrentGroup() {
  if (!currentGroupName) {
    return;
  }

  const payload = { items: collectUpdates() };
  await fetchJson(`/api/groups/${encodeURIComponent(currentGroupName)}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  showToast("Bestand gespeichert");
}

async function createMail() {
  if (!currentGroupName) {
    return;
  }

  const payload = { items: collectUpdates() };
  const data = await fetchJson(`/api/groups/${encodeURIComponent(currentGroupName)}/mail-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  showToast("Mailentwurf wird geoeffnet");
  window.location.href = data.mail.mailto_url;
}

refreshBtn.addEventListener("click", async () => {
  try {
    await loadGroups();
    showToast("Lagergruppen aktualisiert");
  } catch (error) {
    showToast(error.message);
  }
});

backBtn.addEventListener("click", async () => {
  groupView.classList.add("hidden");
  homeView.classList.remove("hidden");
  currentGroupName = null;
  try {
    await loadGroups();
  } catch (error) {
    showToast(error.message);
  }
});

saveBtn.addEventListener("click", async () => {
  try {
    await saveCurrentGroup();
  } catch (error) {
    showToast(error.message);
  }
});

mailBtn.addEventListener("click", async () => {
  try {
    await createMail();
  } catch (error) {
    showToast(error.message);
  }
});

(async function init() {
  try {
    await loadGroups();
  } catch (error) {
    showToast(error.message);
  }
})();
