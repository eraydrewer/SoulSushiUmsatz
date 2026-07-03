const express = require("express");
const cors = require("cors");
const fs = require("fs");
const XLSX = require("xlsx");

const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1517721854809342222/-URchBn7bkaHkmRuZzQ5ztiwV1ISPzNJQvQuLeheCXZuUNo0W-4nuh4WSLjuaoiJMgCS";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS für GitHub Pages erlauben
app.use(cors({
    origin: "https://eraydrewer.github.io",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const MANAGER_PASSWORD = "SoulChef2026";

function loadOrders() {
    if (!fs.existsSync("orders.json")) {
        fs.writeFileSync("orders.json", "[]");
    }
    return JSON.parse(fs.readFileSync("orders.json"));
}

function saveOrders(orders) {
    fs.writeFileSync("orders.json", JSON.stringify(orders, null, 2));
}

app.post("/order", async (req, res) => {
    const { mitarbeiter, betrag, rabatt, bestellung } = req.body;

    const orders = loadOrders();

    orders.push({
        id: Date.now(),
        mitarbeiter,
        betrag: Number(betrag),
        rabatt: rabatt || 0,
        bestellung: bestellung || [],
        datum: new Date().toISOString()
    });

    saveOrders(orders);

    console.log("Neue Bestellung gespeichert:", mitarbeiter, betrag);

    const itemsText = (bestellung || [])
        .map(item => `• ${item.name} x${item.menge} = ${item.summe}€`)
        .join("\n");

    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                embeds: [{
                    title: "🍣 Neue SoulSushi Quittung",
                    color: 0x39c4aa,
                    fields: [
                        {
                            name: "👤 Mitarbeiter",
                            value: mitarbeiter || "Unbekannt",
                            inline: true
                        },
                        {
                            name: "💸 Rabatt",
                            value: `${rabatt || 0}%`,
                            inline: true
                        },
                        {
                            name: "🧾 Bestellung",
                            value: itemsText || "Keine Produkte"
                        },
                        {
                            name: "💰 Gesamt",
                            value: `${betrag}€`,
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                }]
            })
        });

        console.log("Discord Quittung gesendet");
    } catch (err) {
        console.error("Discord Fehler:", err);
    }

    res.json({ success: true });
});

function filterOrders(orders, filter) {
    const now = new Date();
    let start = null;

    if (filter === "day") {
        start = new Date();
        start.setHours(0, 0, 0, 0);
    }

    if (filter === "week") {
        start = new Date();
        const day = start.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start.setDate(start.getDate() + diff);
        start.setHours(0, 0, 0, 0);
    }

    if (filter === "month") {
        start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    }

    if (!start || filter === "all") return orders;

    return orders.filter(order => new Date(order.datum) >= start);
}

function buildStats(orders) {
    let totalRevenue = 0;
    const employees = {};
    const products = {};

    orders.forEach(order => {
        totalRevenue += Number(order.betrag);

        if (!employees[order.mitarbeiter]) {
            employees[order.mitarbeiter] = {
                umsatz: 0,
                bestellungen: 0
            };
        }

        employees[order.mitarbeiter].umsatz += Number(order.betrag);
        employees[order.mitarbeiter].bestellungen++;

        order.bestellung.forEach(item => {
            if (!products[item.name]) {
                products[item.name] = {
                    menge: 0,
                    umsatz: 0
                };
            }

            products[item.name].menge += Number(item.menge);
            products[item.name].umsatz += Number(item.summe);
        });
    });

    return {
        totalRevenue,
        totalOrders: orders.length,
        employees,
        products
    };
}

app.get("/api/stats", (req, res) => {
    const filter = req.query.filter || "day";
    const password = req.query.password;

   

    const orders = filterOrders(loadOrders(), filter);
    res.json(buildStats(orders));
});

app.get("/export-excel", (req, res) => {
    const filter = req.query.filter || "all";
    const password = req.query.password;

   

    const orders = filterOrders(loadOrders(), filter);
    const rows = [];

    orders.forEach(order => {
        order.bestellung.forEach(item => {
            rows.push({
                Datum: new Date(order.datum).toLocaleString("de-DE"),
                Mitarbeiter: order.mitarbeiter,
                Produkt: item.name,
                Menge: item.menge,
                Einzelpreis: item.preis,
                Summe: item.summe,
                Rabatt: order.rabatt + "%",
                Gesamtbestellung: order.betrag
            });
        });
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    XLSX.utils.book_append_sheet(wb, ws, "SoulSushi Umsatz");

    const filePath = "SoulSushi-Umsatz.xlsx";
    XLSX.writeFile(wb, filePath);

    res.download(filePath);
});

app.get("/dashboard", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>SoulSushi Dashboard</title>
<style>
*{
    box-sizing:border-box;
}

body{
    margin:0;
    min-height:100vh;
    background:
        radial-gradient(circle at top left, rgba(57,196,170,0.25), transparent 35%),
        radial-gradient(circle at bottom right, rgba(255,140,0,0.12), transparent 30%),
        linear-gradient(135deg,#050607,#0b1114,#050607);
    color:white;
    font-family:Arial, sans-serif;
    padding:35px;
}

.header{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:30px;
}

.header h1{
    margin:0;
    font-size:38px;
    color:#39c4aa;
}

.header p{
    margin:6px 0 0;
    color:#9aa7aa;
}

.live{
    background:rgba(57,196,170,0.15);
    border:1px solid #39c4aa;
    color:#39c4aa;
    padding:12px 20px;
    border-radius:999px;
    font-weight:bold;
    box-shadow:0 0 25px rgba(57,196,170,0.25);
}

.panel{
    background:rgba(18,24,28,0.82);
    border:1px solid rgba(57,196,170,0.22);
    border-radius:24px;
    padding:22px;
    margin-bottom:24px;
    box-shadow:0 18px 45px rgba(0,0,0,0.35);
    backdrop-filter:blur(12px);
}

.controls{
    display:flex;
    gap:12px;
    flex-wrap:wrap;
}

input, select{
    background:#0b1114;
    color:white;
    border:1px solid #27383d;
    padding:14px 16px;
    border-radius:14px;
    outline:none;
    font-size:15px;
}

button{
    background:linear-gradient(135deg,#39c4aa,#2cae97);
    color:white;
    border:none;
    padding:14px 20px;
    border-radius:14px;
    cursor:pointer;
    font-weight:bold;
    font-size:15px;
    box-shadow:0 10px 25px rgba(57,196,170,0.22);
}

button:hover{
    transform:translateY(-2px);
}

.cards{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:18px;
    margin-bottom:24px;
}

.card{
    background:linear-gradient(145deg,rgba(21,28,33,0.95),rgba(10,14,17,0.95));
    border:1px solid rgba(57,196,170,0.22);
    border-radius:22px;
    padding:22px;
    box-shadow:0 14px 35px rgba(0,0,0,0.35);
}

.card small{
    color:#9aa7aa;
    font-size:13px;
}

.card h2{
    margin:12px 0 0;
    font-size:28px;
    color:white;
}

.grid{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:24px;
}

h2{
    margin-top:0;
    color:#39c4aa;
}

table{
    width:100%;
    border-collapse:collapse;
}

td, th{
    padding:14px 10px;
    border-bottom:1px solid rgba(255,255,255,0.08);
    text-align:left;
}

th{
    color:#9aa7aa;
    font-size:13px;
    text-transform:uppercase;
}

.rank{
    font-weight:bold;
    color:#39c4aa;
}

.bar-wrap{
    background:#0b1114;
    border-radius:999px;
    overflow:hidden;
    height:18px;
    margin-top:8px;
}

.bar{
    height:100%;
    background:linear-gradient(90deg,#39c4aa,#7fffe6);
    border-radius:999px;
    animation:grow 0.8s ease;
}

@keyframes grow{
    from{width:0;}
}

.empty{
    color:#9aa7aa;
    padding:15px 0;
}

@media(max-width:900px){
    .cards{
        grid-template-columns:1fr 1fr;
    }

    .grid{
        grid-template-columns:1fr;
    }
}

@media(max-width:600px){
    body{
        padding:18px;
    }

    .cards{
        grid-template-columns:1fr;
    }

    .header{
        flex-direction:column;
        align-items:flex-start;
        gap:15px;
    }
}
</style>
</head>
<body>

<div class="header">
    <div>
        <h1>SoulSushi</h1>
        <p>Management Dashboard</p>
    </div>
    <div>
    <div class="live">🟢 LIVE</div>
    <p id="lastUpdate" style="color:#9aa7aa;text-align:right;margin-top:8px;">
        Wird geladen...
    </p>
</div>
</div>

<div class="panel">
    <div class="controls">
      <select id="filter">
            <option value="day">Heute</option>
            <option value="week">Diese Woche</option>
            <option value="month">Dieser Monat</option>
            <option value="all">Gesamt</option>
        </select>
        <button onclick="exportExcel()">Excel Export</button>
    </div>
</div>

<div class="cards">
    <div class="card">
        <small>💰 Gesamtumsatz</small>
        <h2 id="cardRevenue">0€</h2>
    </div>

    <div class="card">
        <small>📦 Bestellungen</small>
        <h2 id="cardOrders">0</h2>
    </div>

    <div class="card">
        <small>👨‍🍳 Bester Mitarbeiter</small>
        <h2 id="cardEmployee">-</h2>
    </div>

    <div class="card">
        <small>🍣 Top Produkt</small>
        <h2 id="cardProduct">-</h2>
    </div>
</div>

<div class="grid">
    <div class="panel">
        <h2>🏆 Mitarbeiter Ranking</h2>
        <table>
            <thead>
                <tr>
                    <th>Rang</th>
                    <th>Mitarbeiter</th>
                    <th>Bestellungen</th>
                    <th>Umsatz</th>
                </tr>
            </thead>
            <tbody id="employees"></tbody>
            <tbody id="employeeCards"></tbody>
        </table>
    </div>

    <div class="panel">
        <h2>🍣 Produkt Ranking</h2>
        <table>
            <thead>
                <tr>
                    <th>Produkt</th>
                    <th>Verkauft</th>
                    <th>Umsatz</th>
                </tr>
            </thead>
            <tbody id="products"></tbody>
        </table>
    </div>
</div>

<div class="panel">
    <h2>📊 Umsatz Diagramm</h2>
    <div id="chart"></div>
</div>

<script>
async function loadStats(){
    const password = "SoulChef2026";
    const filter = document.getElementById("filter").value;

    const res = await fetch("/api/stats?filter=" + filter + "&password=" + password);

    if(!res.ok){
        alert("Falsches Passwort oder kein Zugriff");
        return;
    }

    const data = await res.json();

    const employeeEntries = Object.entries(data.employees)
        .sort((a,b) => b[1].umsatz - a[1].umsatz);

    const productEntries = Object.entries(data.products)
        .sort((a,b) => b[1].menge - a[1].menge);

    const startUmsatz = 16000000;
    const gesamtMitStart = startUmsatz + data.totalRevenue;

    document.getElementById("cardRevenue").innerText =
        gesamtMitStart.toLocaleString("de-DE") + "€";

    document.getElementById("cardOrders").innerText = data.totalOrders;
    document.getElementById("cardEmployee").innerText = employeeEntries[0] ? employeeEntries[0][0] : "-";
    document.getElementById("cardProduct").innerText = productEntries[0] ? productEntries[0][0] : "-";

    const employees = document.getElementById("employees");
    employees.innerHTML = "";

    employeeEntries.forEach(([name, info], index) => {
        const medal =
            index === 0 ? "🥇" :
            index === 1 ? "🥈" :
            index === 2 ? "🥉" :
            index + 1;

        employees.innerHTML += \`
            <tr>
                <td class="rank">\${medal}</td>
                <td>\${name}</td>
                <td>\${info.bestellungen}</td>
                <td>\${info.umsatz}€</td>
            </tr>
        \`;
    });

    if(employeeEntries.length === 0){
        employees.innerHTML = '<tr><td colspan="4" class="empty">Noch keine Daten vorhanden</td></tr>';
    }

    const products = document.getElementById("products");
    products.innerHTML = "";

    productEntries.forEach(([name, info]) => {
        products.innerHTML += \`
            <tr>
                <td>\${name}</td>
                <td>\${info.menge}x</td>
                <td>\${info.umsatz}€</td>
            </tr>
        \`;
    });

    if(productEntries.length === 0){
        products.innerHTML = '<tr><td colspan="3" class="empty">Noch keine Produkte verkauft</td></tr>';
    }

    const chart = document.getElementById("chart");
    chart.innerHTML = "";

    const max = Math.max(...employeeEntries.map(e => e[1].umsatz), 1);

    employeeEntries.forEach(([name, info]) => {
        const width = (info.umsatz / max) * 100;

        chart.innerHTML += \`
            <p><b>\${name}</b> - \${info.umsatz}€</p>
            <div class="bar-wrap">
                <div class="bar" style="width:\${width}%"></div>
            </div>
        \`;
    });
}

function exportExcel(){
    const password = "SoulChef2026";
    const filter = document.getElementById("filter").value;

    window.location.href =
        "/export-excel?filter=" + filter + "&password=" + password;
}

function updateTime(){
    const now = new Date();
    document.getElementById("lastUpdate").innerText =
        "Letzte Aktualisierung: " + now.toLocaleTimeString("de-DE");
}

async function liveUpdate(){
    await loadStats();
    updateTime();
}

liveUpdate();
setInterval(liveUpdate, 10000);
</script>

</body>
</html>
    `);
});

app.get("/", (req, res) => {
    res.send("SoulSushi Umsatz Server läuft ✅");
});

app.listen(PORT, () => {
    console.log("Server läuft auf http://localhost:" + PORT);
});
