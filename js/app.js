/**
 * Ariel Purchasing Module — prototype UI
 * ---------------------------------------------------------------------------
 * A single-page demo that answers one question for every ordered unit:
 * is it unplanned, in a draft/booked container, in transit, or arrived?
 *
 * All sample data is generated from a fixed seed, so every reload shows the
 * same vendors, purchase orders, containers and blocks.
 */
(function () {
  'use strict';

  /* =========================================================================
     1. Sample data
     ========================================================================= */

  const VENDOR_NAMES = [
    'ACS', 'HEN', 'YUH', 'CES', 'PWR',
    'WOR', 'UDG', 'VTP', 'JSN', 'ASP',
    'DFT', 'KLM', 'RBX', 'TGN', 'MXL',
    'OPR', 'SNY', 'BDL', 'QRT', 'ZEN',
  ];

  const BUYERS = ['Niki', 'Marco', 'Dana', 'Raj', 'Elena', 'Tom', 'Priya', 'Luis'];

  const SKU_PREFIXES = ['DBT', 'DMU', 'DTM', 'LAA', 'LFF', 'LGS', 'LMT', 'LFR'];
  const ITEM_NAMES = [
    'Bottle', 'Enamel Mug', 'Tumbler', 'Stress Reliever',
    'Block Set', 'Lunch Box', 'Tote Bag', 'Water Jug',
  ];
  const COLOURS = ['Clear', 'Green', 'Red', 'Blue', 'Teal', 'Black', 'Silver', 'Pink'];
  const SKU_LETTERS = 'ABCDEFGHJKLMNPRSTVWXYZ'.split('');

  const ITEMS_PER_VENDOR = 18;
  const PURCHASE_ORDER_COUNT = 64;
  const UNITS_PER_BLOCK_STEP = 500;
  const CBM_PER_UNIT_DIVISOR = 1000;

  const CONTAINER_STATUSES = [
    'Arrived', 'Arrived', 'Arrived',
    'Shipped', 'Shipped', 'Shipped', 'Shipped',
    'Booked', 'Booked', 'Booked', 'Booked',
    'Draft', 'Draft', 'Draft', 'Draft', 'Draft',
  ];

  /** Status a container moves to when the user presses "Mark as ...". */
  const NEXT_CONTAINER_STATUS = {
    Draft: 'Booked',
    Booked: 'Shipped',
    Shipped: 'Arrived',
  };

  const TODAY = new Date(2026, 9, 30);

  /**
   * Deterministic pseudo-random generator (mulberry32).
   * Returns a function that yields numbers in the range [0, 1).
   */
  function createRandom(seed) {
    return function random() {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = createRandom(7);
  const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (items) => items[randomInt(0, items.length - 1)];

  const makeSku = () =>
    `${pick(SKU_PREFIXES)}-${pick(SKU_LETTERS)}${pick(SKU_LETTERS)}` +
    `${randomInt(10, 99)}${pick(SKU_LETTERS)}${pick(SKU_LETTERS)}`;

  /* --- Vendors and their catalogue items --------------------------------- */

  const vendors = VENDOR_NAMES.map((name) => ({
    name,
    items: Array.from({ length: ITEMS_PER_VENDOR }, () => ({
      sku: makeSku(),
      name: `${pick(COLOURS)} ${pick(ITEM_NAMES)}`,
      cost: Number((random() * 5.5 + 0.8).toFixed(2)),
      cbmFactor: Number((random() * 0.4 + 0.2).toFixed(2)),
    })),
  }));

  /* --- Containers --------------------------------------------------------- */

  const containers = [];
  const containersById = {};

  CONTAINER_STATUSES.forEach((status, index) => {
    const isHighCube = random() < 0.8;

    const daysOffset =
      status === 'Arrived' ? -randomInt(35, 70) :
      status === 'Shipped' ? -randomInt(3, 25) :
      status === 'Booked' ? randomInt(3, 14) :
      randomInt(15, 60);

    const container = {
      id: `C-${101 + index}`,
      type: isHighCube ? '40HC' : '40ST',
      capacity: isHighCube ? 68 : 58,
      status,
      daysOffset,
      load: 0,
    };

    containersById[container.id] = container;
    containers.push(container);
  });

  /* --- Purchase orders and lines ----------------------------------------- */

  const purchaseOrders = [];
  const purchaseOrdersById = {};
  const lines = [];
  const blocks = [];

  for (let index = 0; index < PURCHASE_ORDER_COUNT; index += 1) {
    const vendor = vendors[Math.floor(Math.pow(random(), 1.6) * vendors.length)];

    const order = {
      id: `PO-${2001 + index}`,
      vendor: vendor.name,
      buyer: pick(BUYERS),
      ageDays: randomInt(2, 120),
      lineIds: [],
    };

    const shuffledItems = vendor.items.slice().sort(() => random() - 0.5);
    const lineCount = randomInt(2, 10);

    shuffledItems.slice(0, lineCount).forEach((item) => {
      const line = {
        id: lines.length,
        poId: order.id,
        sku: item.sku,
        name: item.name,
        ordered: randomInt(2, 20) * UNITS_PER_BLOCK_STEP,
        cost: item.cost,
        cbmFactor: item.cbmFactor,
      };

      lines.push(line);
      order.lineIds.push(line.id);
    });

    purchaseOrders.push(order);
    purchaseOrdersById[order.id] = order;
  }

  /* --- Split every line into blocks and plan most of them ---------------- */

  purchaseOrders.forEach((order) => {
    const candidateStatuses =
      order.ageDays > 70 ? ['Arrived', 'Shipped'] :
      order.ageDays > 35 ? ['Shipped', 'Booked'] :
      ['Booked', 'Draft'];

    const candidateContainers = containers.filter((container) =>
      candidateStatuses.includes(container.status)
    );

    order.lineIds.forEach((lineId) => {
      const line = lines[lineId];
      const remainingBlocks = line.ordered / UNITS_PER_BLOCK_STEP;

      // Most lines travel as one block; some are split across up to three.
      const blockCount = Math.min(
        random() < 0.7 ? 1 : random() < 0.8 ? 2 : 3,
        remainingBlocks
      );

      let blocksLeft = remainingBlocks;
      const blockSizes = [];

      for (let blockIndex = 0; blockIndex < blockCount - 1; blockIndex += 1) {
        const size = randomInt(1, blocksLeft - (blockCount - 1 - blockIndex));
        blockSizes.push(size);
        blocksLeft -= size;
      }
      blockSizes.push(blocksLeft);

      blockSizes.forEach((size, blockIndex) => {
        const units = size * UNITS_PER_BLOCK_STEP;

        // The first block of a line is more likely to be planned than later ones.
        const isPlanned = random() > (blockIndex ? 0.22 : 0.06);
        let containerId = null;

        if (isPlanned) {
          const target = candidateContainers
            .slice()
            .sort((a, b) => a.load / a.capacity - b.load / b.capacity)[0];

          target.load += (units / CBM_PER_UNIT_DIVISOR) * line.cbmFactor;
          containerId = target.id;
        }

        blocks.push({ id: blocks.length, lineId, units, containerId });
      });
    });
  });

  /* =========================================================================
     2. Application state and derived data
     ========================================================================= */

  const state = {
    vendorFilter: '',
    buyerFilter: '',
    selectedBlockId: null,
    expandedOrders: {},
    searchQuery: '',
    statusFilter: '',
    sortBy: 'age',
    receiptContainerId: 'C-104',
    receiptImported: false,
  };

  /** Per-line totals: planned, shipped and unplanned units. */
  let lineStats = [];

  function isContainerShipped(containerId) {
    const container = containersById[containerId];
    return Boolean(container) && (container.status === 'Shipped' || container.status === 'Arrived');
  }

  function calculateLineStats() {
    lineStats = lines.map(() => ({ planned: 0, shipped: 0, unplanned: 0 }));

    blocks.forEach((block) => {
      const stats = lineStats[block.lineId];

      if (block.containerId) {
        stats.planned += block.units;
        if (isContainerShipped(block.containerId)) {
          stats.shipped += block.units;
        }
      } else {
        stats.unplanned += block.units;
      }
    });
  }

  /** Status tag for a single line, based on its shipping balance. */
  function getLineStatus(line) {
    const stats = lineStats[line.id];
    const balance = line.ordered - stats.shipped;

    if (balance === 0) return ['ok', 'Shipped'];
    if (stats.unplanned > 0) return ['bad', 'Not planned'];
    if (stats.shipped > 0) return ['ok', 'Balance planned'];
    return ['', 'Planned'];
  }

  /** Roll the line-level numbers up to a purchase order. */
  function aggregateOrder(order) {
    const totals = {
      ordered: 0,
      shipped: 0,
      unplanned: 0,
      value: 0,
      balanceValue: 0,
      unplannedValue: 0,
      followUpLines: 0,
      lineCount: order.lineIds.length,
    };

    order.lineIds.forEach((lineId) => {
      const line = lines[lineId];
      const stats = lineStats[lineId];
      const balance = line.ordered - stats.shipped;

      totals.ordered += line.ordered;
      totals.shipped += stats.shipped;
      totals.value += line.ordered * line.cost;
      totals.balanceValue += balance * line.cost;

      if (balance > 0 && stats.unplanned > 0) {
        totals.followUpLines += 1;
        totals.unplannedValue += stats.unplanned * line.cost;
        totals.unplanned += stats.unplanned;
      }
    });

    totals.balance = totals.ordered - totals.shipped;
    return totals;
  }

  function getOrderStatus(totals) {
    if (totals.followUpLines) return ['bad', 'Needs follow-up'];
    if (totals.balance === 0) return ['ok', 'Fully shipped'];
    if (totals.shipped > 0) return ['wn', 'Partly shipped'];
    return ['', 'Planned'];
  }

  /** Containers that hold blocks from a given line. */
  function getLineContainerIds(lineId) {
    const containerIds = [];

    blocks.forEach((block) => {
      if (block.lineId !== lineId) return;

      const id = block.containerId || 'none';
      if (!containerIds.includes(id)) containerIds.push(id);
    });

    return containerIds;
  }

  /** Volume, lines, POs and vendors loaded into one container. */
  function getContainerInfo(container) {
    let cbm = 0;
    const lineIds = new Set();
    const poIds = new Set();
    const vendorNames = new Set();

    blocks.forEach((block) => {
      if (block.containerId !== container.id) return;

      const line = lines[block.lineId];
      cbm += (block.units / CBM_PER_UNIT_DIVISOR) * line.cbmFactor;
      lineIds.add(block.lineId);
      poIds.add(line.poId);
      vendorNames.add(purchaseOrdersById[line.poId].vendor);
    });

    return {
      cbm,
      lineCount: lineIds.size,
      poCount: poIds.size,
      vendorCount: vendorNames.size,
    };
  }

  function getFilteredOrders() {
    return purchaseOrders.filter((order) =>
      (!state.vendorFilter || order.vendor === state.vendorFilter) &&
      (!state.buyerFilter || order.buyer === state.buyerFilter)
    );
  }

  /* =========================================================================
     3. Shared rendering helpers
     ========================================================================= */

  const formatNumber = (value) => Math.round(value).toLocaleString('en-US');

  function formatMoney(value) {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${Math.round(value)}`;
  }

  function formatDate(offsetDays) {
    const date = new Date(TODAY);
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function renderTag([variant, label]) {
    return `<span class="tag ${variant}">${label}</span>`;
  }

  function renderContainerTag(container) {
    const variant =
      container.status === 'Arrived' || container.status === 'Shipped' ? 'ok' :
      container.status === 'Booked' ? 'wn' :
      '';

    return renderTag([variant, container.status]);
  }

  function renderHeader(title, subtitle, extra = '') {
    return `
      <div class="row">
        <div>
          <h1>${title}</h1>
          <div class="sub">${subtitle}</div>
        </div>
        ${extra}
      </div>`;
  }

  function renderMetricCard(value, label, targetView, isHot = false) {
    return `
      <div class="card kp${isHot ? ' hot' : ''}" data-action="go:${targetView}">
        <b>${value}</b>
        <span class="sub">${label}</span>
      </div>`;
  }

  function renderBlock(block) {
    const line = lines[block.lineId];
    const isLocked = Boolean(block.containerId && isContainerShipped(block.containerId));
    const isSelected = state.selectedBlockId === block.id;
    const cbm = (block.units / CBM_PER_UNIT_DIVISOR) * line.cbmFactor;

    const dragAttributes = isLocked
      ? ''
      : ` draggable="true" data-block="${block.id}"`;

    return `
      <div class="blk${isLocked ? ' l2' : ''}${isSelected ? ' sel' : ''}"${dragAttributes}>
        <b class="mono">${line.sku}</b> · ${line.poId.slice(3)} · ${formatNumber(block.units)} u · ${cbm.toFixed(1)} CBM
      </div>`;
  }

  function renderContainerCard(container) {
    const info = getContainerInfo(container);
    const fillPercent = (info.cbm / container.capacity) * 100;
    const isLocked = container.status === 'Shipped' || container.status === 'Arrived';
    const nextStatus = NEXT_CONTAINER_STATUS[container.status];

    const dateLabel =
      container.daysOffset < 0
        ? (container.status === 'Arrived' ? 'Arrived ' : 'Left ')
        : 'Ships ';

    const blocksInContainer = blocks.filter((block) => block.containerId === container.id);

    return `
      <div class="card">
        <div class="row">
          <b>${container.id} · ${container.type}</b>
          ${renderContainerTag(container)}
        </div>

        <div class="sub">
          ${dateLabel}${formatDate(container.daysOffset)} ·
          ${info.vendorCount} vendors · ${info.poCount} POs · ${info.lineCount} lines
        </div>

        <div class="bar">
          <i class="${fillPercent > 100 ? 'r' : ''}" style="width:${Math.min(100, fillPercent)}%"></i>
        </div>

        <div class="sub">
          ${info.cbm.toFixed(1)} of ${container.capacity} CBM${fillPercent > 100 ? ' · OVER CAPACITY' : ''}
        </div>

        ${nextStatus
          ? `<button class="s" style="margin-top:8px" data-action="advance:${container.id}">
               Mark as ${nextStatus.toLowerCase()}
             </button>`
          : ''}

        <div class="zone${isLocked ? ' lock' : ''}" data-zone="${isLocked ? 'x' : container.id}">
          ${blocksInContainer.map(renderBlock).join('')}
        </div>
      </div>`;
  }

  /* =========================================================================
     4. Views
     ========================================================================= */

  /* --- Dashboard ---------------------------------------------------------- */

  function renderHome() {
    const orders = getFilteredOrders();
    const visibleOrderIds = {};
    const totals = {
      openOrders: 0,
      balanceUnits: 0,
      balanceValue: 0,
      unplannedValue: 0,
      followUpLines: 0,
    };

    const vendorTotals = {};
    const followUpRows = [];

    orders.forEach((order) => {
      visibleOrderIds[order.id] = true;
      const summary = aggregateOrder(order);

      totals.balanceUnits += summary.balance;
      totals.balanceValue += summary.balanceValue;
      totals.unplannedValue += summary.unplannedValue;
      totals.followUpLines += summary.followUpLines;
      if (summary.balance > 0) totals.openOrders += 1;

      const vendor = vendorTotals[order.vendor] || (vendorTotals[order.vendor] = {
        name: order.vendor,
        orderCount: 0,
        value: 0,
        shipped: 0,
        ordered: 0,
        balanceValue: 0,
        unplannedValue: 0,
        followUpLines: 0,
      });

      vendor.orderCount += 1;
      vendor.value += summary.value;
      vendor.shipped += summary.shipped;
      vendor.ordered += summary.ordered;
      vendor.balanceValue += summary.balanceValue;
      vendor.unplannedValue += summary.unplannedValue;
      vendor.followUpLines += summary.followUpLines;

      order.lineIds.forEach((lineId) => {
        const line = lines[lineId];
        const stats = lineStats[lineId];

        if (line.ordered - stats.shipped > 0 && stats.unplanned > 0) {
          followUpRows.push({ line, order, units: stats.unplanned });
        }
      });
    });

    /* Units grouped by where they are in the pipeline. */
    const pipeline = { unplanned: 0, draft: 0, booked: 0, shipped: 0, arrived: 0 };
    const pipelineKeyByStatus = {
      Draft: 'draft',
      Booked: 'booked',
      Shipped: 'shipped',
      Arrived: 'arrived',
    };

    blocks.forEach((block) => {
      if (!visibleOrderIds[lines[block.lineId].poId]) return;

      const key = block.containerId
        ? pipelineKeyByStatus[containersById[block.containerId].status]
        : 'unplanned';

      pipeline[key] += block.units;
    });

    const pipelineTotal = Object.values(pipeline).reduce((sum, units) => sum + units, 0) || 1;

    const pipelineGroups = [
      ['unplanned', 'Not planned', '#e5534b'],
      ['draft', 'In draft containers', '#e0a030'],
      ['booked', 'Booked', '#3b82c4'],
      ['shipped', 'In transit', '#0f6b6f'],
      ['arrived', 'Arrived', '#5b8f4a'],
    ];

    const rankedVendors = Object.values(vendorTotals)
      .sort((a, b) => b.unplannedValue - a.unplannedValue)
      .slice(0, 10);

    followUpRows.sort((a, b) => b.order.ageDays - a.order.ageDays);

    const sailings = containers
      .filter((container) => container.status === 'Draft' || container.status === 'Booked')
      .sort((a, b) => a.daysOffset - b.daysOffset)
      .slice(0, 6);

    return `
      ${renderHeader(
        'Purchasing dashboard',
        `Where every ordered unit is right now · ${orders.length} POs · ${lines.length} lines`
      )}

      <div class="grid">
        ${renderMetricCard(`${totals.openOrders} <span class="sub">of ${orders.length}</span>`, 'Open POs', 'orders')}
        ${renderMetricCard(formatNumber(totals.balanceUnits), 'Units still to ship', 'orders')}
        ${renderMetricCard(formatMoney(totals.balanceValue), 'Open PO value', 'orders')}
        ${renderMetricCard(
          containers.filter((container) => container.status === 'Shipped').length,
          'Containers in transit',
          'planner'
        )}
        ${renderMetricCard(totals.followUpLines, 'Lines with no container', 'followup', totals.followUpLines)}
        ${renderMetricCard(formatMoney(totals.unplannedValue), '$ not planned', 'followup', totals.followUpLines)}
      </div>

      <div class="card">
        <h2>Order pipeline (units)</h2>
        <div class="pipe">
          ${pipelineGroups.map(([key, , colour]) => `
            <span style="width:${(pipeline[key] / pipelineTotal) * 100}%;background:${colour}"></span>
          `).join('')}
        </div>
        <div class="lg">
          ${pipelineGroups.map(([key, label, colour]) => `
            <span class="sub">
              <i style="background:${colour}"></i>${label}:
              <b>${formatNumber(pipeline[key])}</b>
              (${Math.round((pipeline[key] / pipelineTotal) * 100)}%)
            </span>
          `).join('')}
        </div>
      </div>

      <div class="two">
        <div class="card">
          <div class="row">
            <h2>Needs attention (oldest first)</h2>
            <button class="s" data-action="go:followup">See all ${followUpRows.length}</button>
          </div>
          <div class="sc">
            <table style="min-width:420px">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>ITEM</th>
                  <th class="n">UNITS</th>
                  <th class="n">DAYS</th>
                </tr>
              </thead>
              <tbody>
                ${followUpRows.slice(0, 6).map(({ line, order, units }) => `
                  <tr class="lk" data-action="go:planner">
                    <td><b>${order.id}</b> <span class="sub">${order.vendor}</span></td>
                    <td class="mono">${line.sku}</td>
                    <td class="n">${formatNumber(units)}</td>
                    <td class="n">${renderTag(['bad', order.ageDays])}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="row">
            <h2>Next sailings</h2>
            <button class="s" data-action="go:planner">Open planner</button>
          </div>
          ${sailings.map((container) => {
            const info = getContainerInfo(container);
            const fillPercent = (info.cbm / container.capacity) * 100;

            return `
              <div style="padding:8px 0;border-top:1px solid var(--line)">
                <div class="row">
                  <span>
                    <b>${container.id}</b> · ${container.type} · ${formatDate(container.daysOffset)}
                    <span class="sub">(in ${container.daysOffset} days)</span>
                  </span>
                  ${renderContainerTag(container)}
                </div>
                <div class="bar">
                  <i style="width:${Math.min(100, fillPercent)}%"></i>
                </div>
                <div class="sub">
                  ${Math.round(fillPercent)}% full · ${info.vendorCount} vendors · ${info.poCount} POs
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <h2>Vendors ranked by $ not planned</h2>
        <div class="sc">
          <table>
            <thead>
              <tr>
                <th>VENDOR</th>
                <th class="n">POs</th>
                <th class="n">PO VALUE</th>
                <th class="n">SHIPPED %</th>
                <th class="n">BALANCE $</th>
                <th class="n">NOT PLANNED $</th>
                <th class="n">LINES TO CHASE</th>
              </tr>
            </thead>
            <tbody>
              ${rankedVendors.map((vendor) => `
                <tr>
                  <td><b>${vendor.name}</b></td>
                  <td class="n">${vendor.orderCount}</td>
                  <td class="n">${formatMoney(vendor.value)}</td>
                  <td class="n">${Math.round((vendor.shipped / vendor.ordered) * 100)}%</td>
                  <td class="n">${formatMoney(vendor.balanceValue)}</td>
                  <td class="n">${formatMoney(vendor.unplannedValue)}</td>
                  <td class="n">${vendor.followUpLines ? renderTag(['bad', vendor.followUpLines]) : '0'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* --- Purchase orders ---------------------------------------------------- */

  function renderOrders() {
    return `
      ${renderHeader(
        'Purchase orders',
        'Click a PO to open its lines. Status is calculated from the lines.'
      )}

      <div class="card row" style="justify-content:flex-start">
        <input
          type="search"
          id="order-search"
          placeholder="Search PO or vendor"
          value="${state.searchQuery}"
        >
        <select id="order-status">
          <option value="">All statuses</option>
          <option>Needs follow-up</option>
          <option>Partly shipped</option>
          <option>Planned</option>
          <option>Fully shipped</option>
        </select>
        <select id="order-sort">
          <option value="age">Oldest first</option>
          <option value="value">Highest value</option>
          <option value="unplanned">Most $ not planned</option>
        </select>
      </div>

      <div class="card" id="order-table"></div>`;
  }

  function renderOrderRow(order, summary) {
    const isOpen = Boolean(state.expandedOrders[order.id]);

    let html = `
      <tr class="lk" data-action="toggle:${order.id}">
        <td><b>${isOpen ? '▾' : '▸'} ${order.id}</b></td>
        <td>${order.vendor}</td>
        <td>${order.buyer}</td>
        <td class="n">${summary.lineCount}</td>
        <td class="n">${formatNumber(summary.ordered)}</td>
        <td class="n">${formatMoney(summary.value)}</td>
        <td class="n">${Math.round((summary.shipped / summary.ordered) * 100)}%</td>
        <td class="n">${formatNumber(summary.balance)}</td>
        <td class="n">${order.ageDays}</td>
        <td>${renderTag(getOrderStatus(summary))}</td>
      </tr>`;

    if (!isOpen) return html;

    html += order.lineIds.map((lineId) => {
      const line = lines[lineId];
      const stats = lineStats[lineId];

      const containerLabels = getLineContainerIds(lineId)
        .map((id) => (id === 'none' ? '—' : id))
        .join(', ');

      return `
        <tr class="sub2">
          <td></td>
          <td colspan="2"><span class="mono">${line.sku}</span> ${line.name}</td>
          <td class="n">${formatNumber(line.ordered)}</td>
          <td class="n">pl ${formatNumber(stats.planned)}</td>
          <td class="n">sh ${formatNumber(stats.shipped)}</td>
          <td class="n">un ${formatNumber(stats.unplanned)}</td>
          <td class="n">${formatNumber(line.ordered - stats.shipped)}</td>
          <td class="sub">${containerLabels}</td>
          <td>${renderTag(getLineStatus(line))}</td>
        </tr>`;
    }).join('');

    return html;
  }

  function updateOrderTable() {
    const tableHost = document.getElementById('order-table');
    if (!tableHost) return;

    const query = state.searchQuery.toLowerCase();

    const rows = getFilteredOrders()
      .map((order) => ({ order, summary: aggregateOrder(order) }))
      .filter(({ order, summary }) => {
        const matchesQuery = !query || `${order.id}${order.vendor}`.toLowerCase().includes(query);
        const matchesStatus = !state.statusFilter || getOrderStatus(summary)[1] === state.statusFilter;
        return matchesQuery && matchesStatus;
      });

    rows.sort((a, b) => {
      if (state.sortBy === 'age') return b.order.ageDays - a.order.ageDays;
      if (state.sortBy === 'value') return b.summary.value - a.summary.value;
      return b.summary.unplannedValue - a.summary.unplannedValue;
    });

    tableHost.innerHTML = `
      <div class="sub" style="margin-bottom:8px">${rows.length} POs</div>
      <div class="sc">
        <table>
          <thead>
            <tr>
              <th>PO</th>
              <th>VENDOR</th>
              <th>BUYER</th>
              <th class="n">LINES</th>
              <th class="n">UNITS</th>
              <th class="n">VALUE</th>
              <th class="n">SHIPPED %</th>
              <th class="n">BALANCE</th>
              <th class="n">DAYS</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ order, summary }) => renderOrderRow(order, summary)).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* --- Container planner -------------------------------------------------- */

  function renderPlanner() {
    const visibleOrderIds = {};
    getFilteredOrders().forEach((order) => {
      visibleOrderIds[order.id] = true;
    });

    const unplannedByOrder = {};
    let unplannedCount = 0;

    blocks.forEach((block) => {
      if (block.containerId) return;

      const orderId = lines[block.lineId].poId;
      if (!visibleOrderIds[orderId]) return;

      (unplannedByOrder[orderId] = unplannedByOrder[orderId] || []).push(block);
      unplannedCount += 1;
    });

    const unplannedHtml = Object.keys(unplannedByOrder).map((orderId) => `
      <div class="gh">${orderId} · ${purchaseOrdersById[orderId].vendor}</div>
      ${unplannedByOrder[orderId].map(renderBlock).join('')}
    `).join('') || '<div class="sub">Everything is planned</div>';

    return `
      ${renderHeader(
        'Container planner',
        'Drag a block into a Draft or Booked container, or tap a block then tap a container. ' +
        'Shipped containers are locked.'
      )}

      <div class="cols">
        <div class="card">
          <h2>Unplanned blocks (${unplannedCount})</h2>
          <div class="zone big" data-zone="">${unplannedHtml}</div>
        </div>
        <div class="ctns">
          ${containers.map(renderContainerCard).join('')}
        </div>
      </div>`;
  }

  /* --- Receipt import ----------------------------------------------------- */

  function renderReceipts() {
    const shippedContainers = containers.filter((container) =>
      isContainerShipped(container.id)
    );

    let html = `
      ${renderHeader(
        'Receipt import',
        'Pick a shipped container, import its packing list, and see every PO and line at once.'
      )}

      <div class="card row" style="justify-content:flex-start">
        <select id="receipt-container">
          ${shippedContainers.map((container) => `
            <option value="${container.id}"${container.id === state.receiptContainerId ? ' selected' : ''}>
              ${container.id}
            </option>
          `).join('')}
        </select>
        <button class="p" data-action="import">Import packing list</button>
      </div>`;

    if (!state.receiptImported) return html;

    /* Group the blocks of the selected container by line. */
    const receiptLines = {};

    blocks.forEach((block) => {
      if (block.containerId !== state.receiptContainerId) return;

      if (!receiptLines[block.lineId]) {
        receiptLines[block.lineId] = { line: lines[block.lineId], units: 0 };
      }
      receiptLines[block.lineId].units += block.units;
    });

    const rows = Object.values(receiptLines).sort((a, b) => {
      if (a.line.poId < b.line.poId) return -1;
      if (a.line.poId > b.line.poId) return 1;
      return 0;
    });

    const counts = { shipped: 0, planned: 0, notPlanned: 0 };
    const poIds = {};

    rows.forEach(({ line }) => {
      poIds[line.poId] = true;

      const status = getLineStatus(line)[1];
      if (status === 'Shipped') counts.shipped += 1;
      else if (status === 'Not planned') counts.notPlanned += 1;
      else counts.planned += 1;
    });

    let lastPoId = '';

    const tableRows = rows.map(({ line, units }) => {
      const stats = lineStats[line.id];
      const isFirstOfPo = line.poId !== lastPoId;
      lastPoId = line.poId;

      return `
        <tr>
          <td>${isFirstOfPo ? `<b>${line.poId}</b>` : ''}</td>
          <td>${isFirstOfPo ? purchaseOrdersById[line.poId].vendor : ''}</td>
          <td><span class="mono">${line.sku}</span> ${line.name}</td>
          <td class="n">${formatNumber(units)}</td>
          <td class="n">${formatNumber(line.ordered)}</td>
          <td class="n">${formatNumber(stats.shipped)}</td>
          <td class="n">${formatNumber(line.ordered - stats.shipped)}</td>
          <td>${renderTag(getLineStatus(line))}</td>
        </tr>`;
    }).join('');

    html += `
      <div class="grid">
        ${renderMetricCard(Object.keys(poIds).length, 'POs in this document', 'orders')}
        ${renderMetricCard(rows.length, 'Lines matched', 'orders')}
        ${renderMetricCard(counts.shipped, 'Lines fully shipped', 'orders')}
        ${renderMetricCard(counts.planned, 'Balance planned', 'planner')}
        ${renderMetricCard(counts.notPlanned, 'Not planned: chase', 'followup', counts.notPlanned)}
      </div>

      <div class="card">
        <div class="sc">
          <table>
            <thead>
              <tr>
                <th>PO</th>
                <th>VENDOR</th>
                <th>ITEM</th>
                <th class="n">IN THIS RECEIPT</th>
                <th class="n">ORDERED</th>
                <th class="n">SHIPPED TOTAL</th>
                <th class="n">BALANCE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>

      <div class="row card">
        <span class="sub">Checks done: item on PO, quantity within balance, price vs PO</span>
        <button class="p" data-action="confirm">Confirm import</button>
      </div>`;

    return html;
  }

  /* --- Follow-ups --------------------------------------------------------- */

  function renderFollowUps() {
    const vendorsWithFollowUps = {};
    let totalLines = 0;

    getFilteredOrders().forEach((order) => {
      order.lineIds.forEach((lineId) => {
        const line = lines[lineId];
        const stats = lineStats[lineId];

        if (line.ordered - stats.shipped > 0 && stats.unplanned > 0) {
          const vendor = vendorsWithFollowUps[order.vendor] ||
            (vendorsWithFollowUps[order.vendor] = { name: order.vendor, rows: [], value: 0 });

          vendor.rows.push({ line, order, units: stats.unplanned });
          vendor.value += stats.unplanned * line.cost;
          totalLines += 1;
        }
      });
    });

    const vendors = Object.values(vendorsWithFollowUps)
      .sort((a, b) => b.value - a.value);

    const intro =
      `${totalLines} lines across ${vendors.length} vendors have a balance and no container. ` +
      'One reminder per vendor lists all their lines.';

    const cards = vendors.map((vendor) => {
      const rows = vendor.rows
        .slice()
        .sort((a, b) => b.order.ageDays - a.order.ageDays);

      return `
        <div class="card">
          <div class="row">
            <h2>${vendor.name} · ${rows.length} lines · ${formatMoney(vendor.value)}</h2>
            <button class="s p" data-action="remind:${vendor.name}:${rows.length}">
              Send reminder (${rows.length} lines)
            </button>
          </div>
          <div class="sc">
            <table>
              <thead>
                <tr>
                  <th>PO</th>
                  <th>ITEM</th>
                  <th class="n">UNPLANNED UNITS</th>
                  <th class="n">VALUE</th>
                  <th class="n">DAYS OPEN</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(({ line, order, units }) => `
                  <tr>
                    <td><b>${order.id}</b></td>
                    <td><span class="mono">${line.sku}</span> ${line.name}</td>
                    <td class="n">${formatNumber(units)}</td>
                    <td class="n">${formatMoney(units * line.cost)}</td>
                    <td class="n">${order.ageDays > 60 ? renderTag(['bad', order.ageDays]) : order.ageDays}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    return `
      ${renderHeader('Follow-ups', intro)}
      ${cards || '<div class="card sub">No open follow-ups.</div>'}`;
  }

  const VIEWS = {
    home: renderHome,
    orders: renderOrders,
    planner: renderPlanner,
    receipts: renderReceipts,
    followup: renderFollowUps,
  };

  /* =========================================================================
     5. Application shell
     ========================================================================= */

  const NAVIGATION = [
    ['WORKSPACE', [['home', 'Dashboard']]],
    ['PROCURE', [['orders', 'Purchase orders'], ['planner', 'Container planner']]],
    ['RECEIVE', [['receipts', 'Receipt import']]],
    ['ACT', [['followup', 'Follow-ups']]],
  ];

  function renderNavigation(currentView) {
    let followUpCount = 0;
    getFilteredOrders().forEach((order) => {
      followUpCount += aggregateOrder(order).followUpLines;
    });

    const groups = NAVIGATION.map(([heading, links]) => `
      <h4>${heading}</h4>
      ${links.map(([view, label]) => {
        const badge = view === 'followup' && followUpCount
          ? `<span class="bd">${followUpCount}</span>`
          : '';

        return `<a href="#${view}" class="${view === currentView ? 'on' : ''}">${label}${badge}</a>`;
      }).join('')}
    `).join('');

    document.getElementById('nav').innerHTML = `
      <div class="brand">
        <span>AP</span>
        <div>
          <b>Purchasing</b>
          <small>Ariel · China imports</small>
        </div>
      </div>
      ${groups}
      <div class="sp"></div>
      <a class="dis">← Back to Ariel Analytics</a>`;
  }

  let toastTimer = null;

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'on';

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.className = '';
    }, 2200);
  }

  function render() {
    calculateLineStats();

    let viewKey = location.hash.slice(1);
    if (!VIEWS[viewKey]) viewKey = 'home';

    renderNavigation(viewKey);

    document.getElementById('meta').textContent =
      `${purchaseOrders.length} POs · ${lines.length} lines · ` +
      `${blocks.length} blocks · ${containers.length} containers · sample data`;

    document.getElementById('main').innerHTML = VIEWS[viewKey]();

    if (viewKey === 'orders') {
      updateOrderTable();
      document.getElementById('order-status').value = state.statusFilter;
      document.getElementById('order-sort').value = state.sortBy;
    }

    bindDragAndDrop();
  }

  /* =========================================================================
     6. Interaction
     ========================================================================= */

  function moveBlock(blockId, containerId) {
    const block = blocks[blockId];

    // 'x' marks a locked (shipped) container zone.
    if (!block || containerId === 'x') return;

    block.containerId = containerId || null;
    state.selectedBlockId = null;
    render();
    showToast(containerId ? `Moved to ${containerId}` : 'Moved to unplanned');
  }

  function bindDragAndDrop() {
    document.querySelectorAll('[data-block]').forEach((element) => {
      element.ondragstart = (event) => {
        event.dataTransfer.setData('text/plain', element.dataset.block);
      };
    });

    document.querySelectorAll('[data-zone]').forEach((zone) => {
      zone.ondragover = (event) => {
        event.preventDefault();
        zone.classList.add('hot');
      };

      zone.ondragleave = () => {
        zone.classList.remove('hot');
      };

      zone.ondrop = (event) => {
        event.preventDefault();
        moveBlock(Number(event.dataTransfer.getData('text/plain')), zone.dataset.zone);
      };
    });
  }

  function handleAction(action, args) {
    switch (action) {
      case 'go':
        location.hash = args[0];
        break;

      case 'toggle': {
        const orderId = args[0];
        state.expandedOrders[orderId] = !state.expandedOrders[orderId];
        updateOrderTable();
        break;
      }

      case 'advance': {
        const container = containersById[args[0]];
        container.status = NEXT_CONTAINER_STATUS[container.status];
        render();
        showToast(
          `${container.id} is now ${container.status}` +
          (isContainerShipped(container.id) ? '. PO balances updated.' : '')
        );
        break;
      }

      case 'remind':
        showToast(`Reminder sent to ${args[0]} for ${args[1]} lines`);
        break;

      case 'import':
        state.receiptImported = true;
        render();
        break;

      case 'confirm':
        showToast('Receipt confirmed. Odoo push comes in phase 2');
        break;

      default:
        break;
    }
  }

  document.addEventListener('click', (event) => {
    /* Select / deselect a block (tap-to-move flow). */
    const blockElement = event.target.closest('[data-block]');
    if (blockElement) {
      const blockId = Number(blockElement.dataset.block);
      state.selectedBlockId = state.selectedBlockId === blockId ? null : blockId;
      render();
      return;
    }

    /* Tap a container zone while a block is selected. */
    const zone = event.target.closest('[data-zone]');
    if (zone && state.selectedBlockId !== null && !event.target.closest('[data-action]')) {
      moveBlock(state.selectedBlockId, zone.dataset.zone);
      return;
    }

    /* Buttons, cards and table rows. */
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const [action, ...args] = actionElement.dataset.action.split(':');
    handleAction(action, args);
  });

  document.addEventListener('input', (event) => {
    if (event.target.id !== 'order-search') return;

    state.searchQuery = event.target.value;
    updateOrderTable();
  });

  document.addEventListener('change', (event) => {
    switch (event.target.id) {
      case 'order-status':
        state.statusFilter = event.target.value;
        updateOrderTable();
        break;

      case 'order-sort':
        state.sortBy = event.target.value;
        updateOrderTable();
        break;

      case 'receipt-container':
        state.receiptContainerId = event.target.value;
        state.receiptImported = false;
        render();
        break;

      case 'vendor-filter':
        state.vendorFilter = event.target.value;
        render();
        break;

      case 'buyer-filter':
        state.buyerFilter = event.target.value;
        render();
        break;

      default:
        break;
    }
  });

  /* =========================================================================
     7. Start-up
     ========================================================================= */

  function populateFilters() {
    document.getElementById('vendor-filter').innerHTML =
      '<option value="">All vendors</option>' +
      VENDOR_NAMES.map((name) => `<option>${name}</option>`).join('');

    document.getElementById('buyer-filter').innerHTML =
      '<option value="">All buyers</option>' +
      BUYERS.map((name) => `<option>${name}</option>`).join('');
  }

  window.addEventListener('hashchange', render);

  populateFilters();
  render();
})();
