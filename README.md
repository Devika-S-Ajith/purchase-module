# Ariel Purchasing Module

Prototype UI for tracking purchase orders, unplanned units, containers and receipts.

## Structure

```
index.html              Page shell (toolbar + empty mount points)
css/styles.css          All styling, design tokens and responsive rules
js/app.js               Sample data, calculations, views and event handling
```

## Running

Open `index.html` in a browser. No build step or server is required.

## How the code is organised (`js/app.js`)

1. **Sample data** — seeded random generator, vendors, containers, purchase orders,
   lines and shipment blocks. A fixed seed keeps the demo identical on every reload.
2. **State and derived data** — filters, per-line totals, order roll-ups and statuses.
3. **Rendering helpers** — number/date formatting, tags, metric cards, blocks and
   container cards.
4. **Views** — dashboard, purchase orders, container planner, receipt import, follow-ups.
5. **Application shell** — sidebar navigation and the main render loop.
6. **Interaction** — drag and drop, tap-to-move, filters, search and actions.
7. **Start-up** — populate the vendor/buyer filters and render the first view.
