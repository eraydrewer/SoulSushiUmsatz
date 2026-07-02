const express = require("express");
const cors = require("cors");
const fs = require("fs");
const XLSX = require("xlsx");

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

app.post("/order", (req, res) => {
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
</style>
</head>
<body>

<h1>🍣 SoulSushi Management Dashboard</h1>

<div class="box">
    <input type="password" id="password" placeholder="Manager Passwort">
    <select id="filter">
        <option value="day">Tagesumsatz</option>
        <option value="week">Wochenumsatz</option>
        <option value="month">Monatsumsatz</option>
        <option value="all">Gesamtumsatz</option>
    </select>
    <button onclick="loadStats()">Anzeigen</button>
    <button onclick="exportExcel()">Excel Export</button>
</div>

<div class="box">
    <h2>Gesamt</h2>
    <p id="gesamt">Noch keine Daten geladen</p>
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
    <h2>Diagramm Mitarbeiter Umsatz</h2>
    <div id="chart"></div>
</div>

<script>
async function loadStats(){
    const password = document.getElementById("password").value;
    const filter = document.getElementById("filter").value;

    const res = await fetch("/api/stats?filter=" + filter + "&password=" + password);

    if(!res.ok){
        alert("Falsches Passwort oder kein Zugriff");
        return;
    }

    const data = await res.json();

    document.getElementById("gesamt").innerHTML =
        "Gesamtumsatz: <b>" + data.totalRevenue + "€</b><br>" +
        "Bestellungen: <b>" + data.totalOrders + "</b>";

    const employees = document.getElementById("employees");
    employees.innerHTML = "";

    const employeeEntries = Object.entries(data.employees)
        .sort((a,b) => b[1].umsatz - a[1].umsatz);

    employeeEntries.forEach(([name, info]) => {
        employees.innerHTML += \`
            <tr>
                <td>\${name}</td>
                <td>\${info.bestellungen}</td>
                <td>\${info.umsatz}€</td>
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
                    <td>\${info.umsatz}€</td>
                </tr>
            \`;
        });

    const chart = document.getElementById("chart");
    chart.innerHTML = "";

    const max = Math.max(...employeeEntries.map(e => e[1].umsatz), 1);

    employeeEntries.forEach(([name, info]) => {
        const width = (info.umsatz / max) * 100;

        chart.innerHTML += \`
            <p>\${name} - \${info.umsatz}€</p>
            <div class="bar" style="width:\${width}%"></div>
        \`;
    });
}

function exportExcel(){
    const password = document.getElementById("password").value;
    const filter = document.getElementById("filter").value;

    window.location.href =
        "/export-excel?filter=" + filter + "&password=" + password;
}
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
