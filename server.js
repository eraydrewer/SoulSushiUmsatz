const express = require("express");
const cors = require("cors");
const XLSX = require("xlsx");
const { Pool } = require("pg");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: "https://eraydrewer.github.io",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const MANAGER_PASSWORD = "SoulChef2026";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id BIGSERIAL PRIMARY KEY,
            mitarbeiter TEXT NOT NULL,
            betrag NUMERIC NOT NULL,
            rabatt NUMERIC DEFAULT 0,
            bestellung JSONB DEFAULT '[]',
            datum TIMESTAMP DEFAULT NOW()
        );
    `);

    console.log("Datenbank bereit ✅");
}

initDatabase().catch(err => {
    console.error("Fehler bei Datenbank-Start:", err);
});

app.post("/order", async (req, res) => {
    try {
        const { mitarbeiter, betrag, rabatt, bestellung } = req.body;

        if (!mitarbeiter || betrag === undefined) {
            return res.status(400).json({
                success: false,
                message: "Mitarbeiter oder Betrag fehlt"
            });
        }

        await pool.query(
            `INSERT INTO orders (mitarbeiter, betrag, rabatt, bestellung, datum)
             VALUES ($1, $2, $3, $4, NOW())`,
            [
                mitarbeiter,
                Number(betrag),
                Number(rabatt || 0),
                JSON.stringify(bestellung || [])
            ]
        );

        console.log("Neue Bestellung gespeichert:", mitarbeiter, betrag);

if (DISCORD_WEBHOOK_URL) {

    const text = (bestellung || []).map(item =>
        `• ${item.name} x${item.menge} = ${item.summe}€`
    ).join("\n");
    
    await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        embeds: [{
            title: "🍣 Neue SoulSushi Quittung",
            color: 3916970,
            fields: [
                {
                    name: "👤 Mitarbeiter",
                    value: mitarbeiter,
                    inline: true
                },
                {
                    name: "💸 Rabatt",
                    value: `${rabatt || 0}%`,
                    inline: true
                },
                {
                    name: "🧾 Bestellung",
                    value: text || "Keine Produkte"
                },
                {
                    name: "💰 Gesamt",
                    value: `${betrag}€`
                }
            ],
            timestamp: new Date().toISOString()
        }]
    })
});
}
res.json({ success: true });

      } catch (err) {
        console.error("Fehler beim Speichern:", err);
        res.status(500).json({
            success: false,
            message: "Fehler beim Speichern"
        });
    }
});

function getFilterSQL(filter) {
    if (filter === "day") {
        return "WHERE datum >= date_trunc('day', NOW())";
    }

    if (filter === "week") {
        return "WHERE datum >= date_trunc('week', NOW())";
    }

    if (filter === "month") {
        return "WHERE datum >= date_trunc('month', NOW())";
    }

    return "";
}

async function getOrders(filter) {
    const filterSQL = getFilterSQL(filter);

    const result = await pool.query(`
        SELECT *
        FROM orders
        ${filterSQL}
        ORDER BY datum DESC
    `);

    return result.rows;
}

function buildStats(orders) {
    let totalRevenue = 17337095;
    const employees = {};
    const products = {};

    orders.forEach(order => {
        const betrag = Number(order.betrag) || 0;
        totalRevenue += betrag;

        if (!employees[order.mitarbeiter]) {
            employees[order.mitarbeiter] = {
                umsatz: 0,
                bestellungen: 0
            };
        }

        employees[order.mitarbeiter].umsatz += betrag;
        employees[order.mitarbeiter].bestellungen++;

        const bestellung = Array.isArray(order.bestellung)
            ? order.bestellung
            : [];

        bestellung.forEach(item => {
            if (!item.name) return;

            if (!products[item.name]) {
                products[item.name] = {
                    menge: 0,
                    umsatz: 0
                };
            }

            products[item.name].menge += Number(item.menge || 0);
            products[item.name].umsatz += Number(item.summe || 0);
        });
    });

    return {
        totalRevenue,
        totalOrders: orders.length,
        employees,
        products,
        lastOrders: orders.slice(0, 10)
    };
}

app.get("/api/stats", async (req, res) => {
    try {
        const filter = req.query.filter || "day";

        const orders = await getOrders(filter);
        res.json(buildStats(orders));

    } catch (err) {
        console.error("Fehler bei Statistiken:", err);
        res.status(500).json({
            success: false,
            message: "Fehler beim Laden der Statistiken"
        });
    }
});

app.get("/export-excel", async (req, res) => {
    try {
        const filter = req.query.filter || "all";
       
        const orders = await getOrders(filter);
        const rows = [];

        orders.forEach(order => {
            const bestellung = Array.isArray(order.bestellung)
                ? order.bestellung
                : [];

            bestellung.forEach(item => {
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

        const buffer = XLSX.write(wb, {
            type: "buffer",
            bookType: "xlsx"
        });

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=SoulSushi-Umsatz.xlsx"
        );

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.send(buffer);

    } catch (err) {
        console.error("Fehler beim Excel Export:", err);
        res.status(500).send("Fehler beim Excel Export");
    }
});

app.get("/dashboard", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>SoulSushi Dashboard</title>
<style>
body{
    margin:0;
    padding:30px;
    background:#090b0d;
    color:white;
    font-family:Arial;
}
.box{
    background:#15191d;
    border:1px solid #273038;
    border-radius:18px;
    padding:20px;
    margin-bottom:20px;
}
.stats-grid{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:18px;
    margin-bottom:20px;
}

.stat-card{
    background:#15191d;
    border:1px solid #273038;
    border-radius:18px;
    padding:22px;
    transition:0.3s;
}

.stat-card:hover{
    transform:translateY(-4px);
    border-color:#39c4aa;
}

.stat-card span{
    display:block;
    color:#8e9aa5;
    font-size:14px;
    margin-bottom:10px;
}

.stat-card strong{
    font-size:30px;
    color:#39c4aa;
}
h1{color:#39c4aa;}
button, select, input{
    padding:12px;
    border-radius:10px;
    border:none;
    margin:5px;
}
button{
    background:#39c4aa;
    color:white;
    font-weight:bold;
    cursor:pointer;
}
table{
    width:100%;
    border-collapse:collapse;
    margin-top:15px;
}
td, th{
    padding:12px;
    border-bottom:1px solid #273038;
    text-align:left;
}
.bar{
    background:#39c4aa;
    height:22px;
    border-radius:10px;
}
.small{
    color:#aaa;
    font-size:14px;
}
</style>
</head>
<body>

<h1>🍣 SoulSushi Management Dashboard</h1>

<div class="box">
    <select id="filter">
        <option value="day">Tagesumsatz</option>
        <option value="week">Wochenumsatz</option>
        <option value="month">Monatsumsatz</option>
        <option value="all">Gesamtumsatz</option>
    </select>
    <button onclick="loadStats()">Anzeigen</button>
    <button onclick="exportExcel()">Excel Export</button>
</div>

<div class="stats-grid">
    <div class="stat-card">
        <span>💰 Gesamtumsatz</span>
        <strong id="gesamtUmsatz">0 €</strong>
    </div>

    <div class="stat-card">
        <span>📦 Bestellungen</span>
        <strong id="gesamtBestellungen">0</strong>
    </div>

    <div class="stat-card">
        <span>👨‍🍳 Mitarbeiter</span>
        <strong id="gesamtMitarbeiter">0</strong>
    </div>

    <div class="stat-card">
        <span>🍣 Produkte</span>
        <strong id="gesamtProdukte">0</strong>
    </div>
</div>

<div class="box">
    <h2>Mitarbeiter Umsatz</h2>
    <table>
        <thead>
            <tr>
                <th>Mitarbeiter</th>
                <th>Bestellungen</th>
                <th>Umsatz</th>
            </tr>
        </thead>
        <tbody id="employees"></tbody>
    </table>
</div>

<div class="box">
    <h2>Produkt Verkäufe</h2>
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

<div class="box">
    <h2>Letzte Bestellungen</h2>
    <table>
        <thead>
            <tr>
                <th>Zeit</th>
                <th>Mitarbeiter</th>
                <th>Rabatt</th>
                <th>Betrag</th>
            </tr>
        </thead>
        <tbody id="lastOrders"></tbody>
    </table>
</div>

<div class="box">
    <h2>Diagramm Mitarbeiter Umsatz</h2>
    <div id="chart"></div>
</div>

<script>
async function loadStats(){
    const filter = document.getElementById("filter").value;

    const res = await fetch("/api/stats?filter=" + filter);

    if(!res.ok){
        alert("Fehler beim Laden der Daten");
        return;
    }

    const data = await res.json();

    document.getElementById("gesamtUmsatz").innerHTML =
    Number(data.totalRevenue).toLocaleString("de-DE") + " €";

document.getElementById("gesamtBestellungen").innerHTML =
    data.totalOrders;

document.getElementById("gesamtMitarbeiter").innerHTML =
    Object.keys(data.employees).length;

document.getElementById("gesamtProdukte").innerHTML =
    Object.keys(data.products).length;

    const employees = document.getElementById("employees");
    employees.innerHTML = "";

    const employeeEntries = Object.entries(data.employees)
        .sort((a,b) => b[1].umsatz - a[1].umsatz);

    employeeEntries.forEach(([name, info]) => {
        employees.innerHTML += \`
            <tr>
                <td>\${name}</td>
                <td>\${info.bestellungen}</td>
                <td>\${info.umsatz.toFixed(2)}€</td>
            </tr>
        \`;
    });

    const products = document.getElementById("products");
    products.innerHTML = "";

    Object.entries(data.products)
        .sort((a,b) => b[1].menge - a[1].menge)
        .forEach(([name, info]) => {
            products.innerHTML += \`
                <tr>
                    <td>\${name}</td>
                    <td>\${info.menge}x</td>
                   <td>\${Number(info.umsatz).toLocaleString("de-DE")} €</td>
                </tr>
            \`;
        });

    const lastOrders = document.getElementById("lastOrders");
    lastOrders.innerHTML = "";

    data.lastOrders.forEach(order => {
        lastOrders.innerHTML += \`
            <tr>
                <td>\${new Date(order.datum).toLocaleString("de-DE")}</td>
                <td>\${order.mitarbeiter}</td>
                <td>\${order.rabatt}%</td>
                <td>\${Number(order.betrag).toFixed(2)}€</td>
            </tr>
        \`;
    });

    const chart = document.getElementById("chart");
    chart.innerHTML = "";

    const max = Math.max(...employeeEntries.map(e => e[1].umsatz), 1);

    employeeEntries.forEach(([name, info]) => {
        const width = (info.umsatz / max) * 100;

        chart.innerHTML += \`
            <p>\${name} - \${info.umsatz.toFixed(2)}€</p>
            <div class="bar" style="width:\${width}%"></div>
        \`;
    });
}

function exportExcel(){ 
    const filter = document.getElementById("filter").value;

    window.location.href =
        "/export-excel?filter=" + filter;
}

// Direkt beim Öffnen laden
loadStats();

// Danach alle 5 Sekunden aktualisieren
setInterval(() => {
    loadStats();
}, 5000);

</script>

</body>
</html>
    `);
});

app.get("/", (req, res) => {
    res.send("SoulSushi Umsatz Server läuft mit Neon Datenbank ✅");
});

app.listen(PORT, () => {
    console.log("Server läuft auf Port " + PORT);
});
