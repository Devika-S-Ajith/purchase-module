/**
 * Ariel Purchasing Module — prototype UI
 * ---------------------------------------------------------------------------
 * Data comes from the three CSV exports, pre-processed by
 * scripts/build_data.py into js/data.js.
 *
 * Nothing in the planning screens is persisted; containers created in the
 * Planner (concept) page live only for the current browser session.
 */
(function () {
  'use strict';

  const DATA = window.PURCHASING_DATA;
  const main = document.getElementById('main');

  if (!DATA) {
    main.innerHTML =
      '<div class="card"><h1>Data bundle missing</h1>' +
      '<p class="sub">Run <span class="mono">python scripts/build_data.py</span> and reload.</p></div>';
    return;
  }

  const HEALTH = DATA.health;
  const AS_OF = DATA.asOf;
  const AS_OF_LABEL = '2 Nov 2026';

  const SEGMENT_LABELS = {
    import: 'Import',
    domestic: 'Domestic/custom',
    other: 'Other',
  };

  const PURCHASER_ALIASES = {
    Vannesa: 'VannesaM',
    Susan: 'SusanG',
    Jessica: 'jessicab',
    Mayra: 'MayraA',
  };

  const PO_STATUSES = [
    'No lines',
    'Received',
    'Overdue',
    'In transit',
    'Unshipped balance',
    'Partly received',
    'Not shipped yet',
  ];

  const RECEIPT_STATUSES = [
    'Received',
    'In transit',
    'Overdue',
    'No ETA',
    'Unmatched',
    'Invalid data',
  ];

  const RECEIPT_STATUS_LABELS = {
    'Received': 'Received',
    'In transit': 'On the way',
    'Overdue': 'Late',
    'No ETA': 'No ETA',
    'Unmatched': 'No matching PO',
    'Invalid data': 'Invalid data',
  };

  const CONTAINER_TYPES = {
    '40HC': { label: '40HC', capacity: 68 },
    '40ST': { label: '40ST', capacity: 58 },
    '20GP': { label: '20GP', capacity: 28 },
  };

  const CONTAINER_STATUSES = {
    draft: { label: 'Draft', variant: '' },
    booked: { label: 'Booked', variant: 'wn' },
    shipped: { label: 'Shipped', variant: 'info' },
    arrived: { label: 'Arrived', variant: 'ok' },
  };

  /* =========================================================================
     1. Decode the compact data bundle
     ========================================================================= */

  function decodeTable(name) {
    const table = DATA.tables[name];
    const stringColumns = new Set(table.stringCols);

    return table.rows.map((row) => {
      const value = {};
      table.columns.forEach((column, index) => {
        const cell = row[index];
        value[column] = stringColumns.has(index)
          ? (DATA.strings[cell] ?? '')
          : cell;
      });
      return value;
    });
  }

  const poRows = decodeTable('po');
  const lineRows = decodeTable('detail');
  const receiptRows = decodeTable('receipt');

  const poById = new Map();
  const lineById = new Map();

  poRows.forEach((raw) => {
    const po = Object.assign({}, raw, {
      header: Number(raw.header) || 0,
      lines: [],
      receipts: [],
    });

    po.synthetic = po.header === 0;
    po.buyer = displayPurchaser(po.purchaser);
    po.port = po.port || '';
    po.segment = po.segment || segmentFor(po.vendorId, po.fob);
    poById.set(po.po, po);
  });

  lineRows.forEach((raw) => {
    const line = Object.assign({}, raw, {
      id: Number(raw.id),
      ordered: raw.ordered == null ? 0 : Number(raw.ordered),
      balance: raw.balance == null ? 0 : Number(raw.balance),
      price: raw.price == null ? 0 : Number(raw.price),
      boxQty: raw.boxQty == null ? 0 : Number(raw.boxQty),
      cbm: raw.cbm == null ? 0 : Number(raw.cbm),
    });

    line.isCheckData = line.balance < 0 || line.balance > line.ordered;
    line.poRef = poById.get(line.po) || null;
    lineById.set(line.id, line);

    if (line.poRef) line.poRef.lines.push(line);
  });

  receiptRows.forEach((receipt) => {
    receipt.id = Number(receipt.id);
    receipt.invalid = Number(receipt.invalid) || 0;
    receipt.poRef = receipt.matchPo ? (poById.get(receipt.matchPo) || null) : null;
    receipt.buyer = receipt.poRef ? receipt.poRef.buyer : '';
    receipt.groupKey = receipt.containerId || receipt.trackingKey || `R-${receipt.id}`;
    receipt.groupLabel = receipt.containerId || receipt.trackingKey || receipt.tracking || `Receipt ${receipt.id}`;

    if (receipt.poRef) receipt.poRef.receipts.push(receipt);
  });

  /* =========================================================================
     2. Display normalisation helpers
     ========================================================================= */

  function displayPurchaser(raw) {
    return PURCHASER_ALIASES[raw] || raw || '';
  }

  function purchaserTitle(raw) {
    const shown = displayPurchaser(raw);
    if (shown && raw && shown !== raw) {
      return `${raw} → ${shown} (assumed duplicate, confirm with client)`;
    }
    return raw || '';
  }

  function segmentFor(vendorId, fob) {
    const vendor = String(vendorId || '').toUpperCase();
    const rawFob = String(fob || '').trim();

    if (vendor === 'ACH' || rawFob.toUpperCase() === 'LA') return 'domestic';
    if (/ningbo|xiamen|shenzhen|shanghai|qingdao|guangzhou|yantian|dalian/i.test(rawFob)) {
      return 'import';
    }
    return 'other';
  }

  /* =========================================================================
     3. Formatting helpers
     ========================================================================= */

  const numberFormatter = new Intl.NumberFormat('en-US');

  function formatNumber(value) {
    return numberFormatter.format(Math.round(Number(value) || 0));
  }

  function formatValue(value) {
    const number = Number(value) || 0;
    if (Math.abs(number) >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
    if (Math.abs(number) >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
    if (Math.abs(number) >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
    return numberFormatter.format(Math.round(number));
  }

  function formatCbm(value) {
    return `${(Number(value) || 0).toFixed(2)} CBM`;
  }

  function toDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function diffDays(from, to) {
    const a = toDate(from);
    const b = toDate(to);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }

  function addDays(value, days) {
    const date = toDate(value);
    if (!date) return '';
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    const date = toDate(value);
    if (!date) return '—';
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function relativeEta(value) {
    if (!value) return '';
    const days = diffDays(AS_OF, value);
    if (days === null) return '';
    if (days === 0) return 'today';
    return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} late`;
  }

  function daysLate(value) {
    if (!value) return null;
    const days = diffDays(value, AS_OF);
    return days == null ? null : days;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attr(value) {
    return esc(value);
  }

  function renderTag(variant, label, title = '') {
    return `<span class="tag ${variant}"${title ? ` title="${attr(title)}"` : ''}>${esc(label)}</span>`;
  }

  function tagVariantForStatus(status) {
    if (status === 'Received' || status === 'Fully received') return 'ok';
    if (status === 'Overdue' || status === 'Unshipped balance' || status === 'Invalid data') return 'bad';
    if (status === 'In transit' || status === 'Partly received') return 'wn';
    return '';
  }

  function renderStatusTag(status) {
    return renderTag(tagVariantForStatus(status), status);
  }

  function wrapperLabel(vendorId) {
    return vendorId || '—';
  }

  /* =========================================================================
     4. Runtime state and derived model
     ========================================================================= */

  const state = {
    vendorFilter: '',
    buyerFilter: '',
    segmentFilter: 'import',

    searchQuery: '',
    statusFilter: '',
    sortBy: 'eta',
    sortDir: 'asc',
    orderPage: 1,
    orderPageSize: 50,
    includeHeaderOnly: false,
    portFilter: '',
    expandedOrders: new Set(),

    shipmentQuery: '',
    shipmentType: '',
    shipmentStatus: '',
    shipmentPage: 1,
    shipmentPageSize: 20,
    expandedShipmentGroups: new Set(),

    receiveReceiptId: '',
    importGroupKey: '',
    importPreview: null,
    importPreviews: {},
    reminders: [],

    plannerContainers: [],
    plannerContainerSequence: 0,
    plannerSelectedLineId: null,
    plannerAssigned: {},

    simulatedReceipts: {},
    simulatedLineQty: {},
  };

  let summaryCache = new Map();

  function clearSummaryCache() {
    summaryCache = new Map();
  }

  function isReceiptReceived(receipt) {
    return Boolean(receipt.receiptDate) || Boolean(state.simulatedReceipts[receipt.id]);
  }

  function receiptReceivedDate(receipt) {
    if (receipt.receiptDate) return receipt.receiptDate;
    const simulated = state.simulatedReceipts[receipt.id];
    return simulated ? simulated.receivedDate : '';
  }

  function renderReceiptReceivedDate(receipt, emptyLabel = 'Open') {
    const date = receiptReceivedDate(receipt);
    return date ? formatDate(date) : `<span class="sub">${esc(emptyLabel)}</span>`;
  }

  function getReceiptStatus(receipt) {
    if (receipt.invalid) return 'Invalid data';
    if (!receipt.matchPo) return 'Unmatched';
    if (isReceiptReceived(receipt)) return 'Received';
    if (receipt.etaDate && receipt.etaDate < AS_OF) return 'Overdue';
    if (receipt.etaDate && receipt.etaDate >= AS_OF) return 'In transit';
    return 'No ETA';
  }

  function effectiveBalance(line) {
    const raw = line.balance || 0;
    if (raw <= 0) return raw;
    return Math.max(0, raw - (state.simulatedLineQty[line.id] || 0));
  }

  function openUnitsForLine(line) {
    return Math.max(0, effectiveBalance(line));
  }

  function receivedUnitsForLine(line) {
    return Math.max(0, Math.min(line.ordered, line.ordered - effectiveBalance(line)));
  }

  function poHasOpenReceipt(po) {
    return po.receipts.some((receipt) => !receipt.invalid && !isReceiptReceived(receipt));
  }

  function containerStatusKey(container) {
    return CONTAINER_STATUSES[container.status] ? container.status : 'draft';
  }

  function containerIsEditable(container) {
    const key = containerStatusKey(container);
    return key === 'draft' || key === 'booked';
  }

  function containerUnits(container) {
    return container.assignments.reduce((sum, assignment) => sum + assignment.units, 0);
  }

  function plannedUnitsForLine(line) {
    return state.plannerAssigned[line.id] || 0;
  }

  function plannedUnitsForPo(po) {
    return po.lines.reduce((sum, line) => sum + plannedUnitsForLine(line), 0);
  }

  function shippedUnitsForLine(line) {
    return state.plannerContainers.reduce((sum, container) => {
      if (containerStatusKey(container) !== 'shipped') return sum;
      return sum + container.assignments
        .filter((assignment) => assignment.lineId === line.id)
        .reduce((assignmentSum, assignment) => assignmentSum + assignment.units, 0);
    }, 0);
  }

  function shippedUnitsForPo(po) {
    return po.lines.reduce((sum, line) => sum + shippedUnitsForLine(line), 0);
  }

  function plannerContainersForPo(po, statuses) {
    const lineIds = new Set(po.lines.map((line) => line.id));
    return state.plannerContainers.filter((container) =>
      statuses.includes(containerStatusKey(container))
      && container.assignments.some((assignment) => lineIds.has(assignment.lineId))
    );
  }

  function shippedContainersForPo(po) {
    return plannerContainersForPo(po, ['shipped']);
  }

  function arrivedContainersForPo(po) {
    return plannerContainersForPo(po, ['arrived']);
  }

  function unplannedUnitsForLine(line) {
    return Math.max(0, openUnitsForLine(line) - plannedUnitsForLine(line) - shippedUnitsForLine(line));
  }

  function unplannedUnitsForPo(po) {
    return po.lines.reduce((sum, line) => sum + unplannedUnitsForLine(line), 0);
  }

  function poIsAtRisk(po, summary) {
    return summary.balance > 0 && !poHasOpenReceipt(po) && unplannedUnitsForPo(po) > 0;
  }

  function lineStatus(line) {
    if (line.isCheckData) return 'Check data';
    if (openUnitsForLine(line) <= 0) return 'Received';
    if (shippedUnitsForLine(line) > 0) return 'In transit';
    if (receivedUnitsForLine(line) > 0) return 'Partly received';
    return 'Open';
  }

  function getPoSummary(po) {
    const cached = summaryCache.get(po.po);
    if (cached) return cached;

    let ordered = 0;
    let received = 0;
    let countedOrdered = 0;
    let balance = 0;
    let totalValue = 0;
    let openValue = 0;
    let openCbm = 0;
    let missingCbmOpen = 0;
    let checkDataLines = 0;
    let openLines = 0;

    po.lines.forEach((line) => {
      const effective = effectiveBalance(line);
      const open = Math.max(0, effective);

      ordered += line.ordered;
      balance += open;
      totalValue += line.ordered * (line.price || 0);
      openValue += open * (line.price || 0);

      if (line.isCheckData) {
        checkDataLines += 1;
      } else {
        received += receivedUnitsForLine(line);
        countedOrdered += line.ordered;
      }

      if (open > 0) {
        openLines += 1;
        if (line.cbm > 0 && line.ordered > 0) {
          openCbm += line.cbm * Math.min(1, open / line.ordered);
        } else {
          missingCbmOpen += 1;
        }
      }
    });

    const openReceipts = po.receipts
      .filter((receipt) => !receipt.invalid && !isReceiptReceived(receipt))
      .sort((a, b) => (a.etaDate || '9999-12-31').localeCompare(b.etaDate || '9999-12-31'));

    const receivedReceipts = po.receipts
      .filter((receipt) => !receipt.invalid && isReceiptReceived(receipt))
      .sort((a, b) => (b.receiptDate || '').localeCompare(a.receiptDate || ''));

    const nextEta = openReceipts
      .map((receipt) => receipt.etaDate)
      .filter(Boolean)
      .sort()[0] || '';

    const nextReceipt = openReceipts[0] || receivedReceipts[0] || null;
    const ageDays = po.poDate ? diffDays(po.poDate, AS_OF) : null;
    const shippedUnits = shippedUnitsForPo(po);

    let status;
    if (!po.lines.length) {
      status = 'No lines';
    } else if (po.lines.every((line) => effectiveBalance(line) <= 0)) {
      status = 'Received';
    } else if (openReceipts.some((receipt) => receipt.etaDate && receipt.etaDate < AS_OF)) {
      status = 'Overdue';
    } else if (openReceipts.some((receipt) => receipt.etaDate && receipt.etaDate >= AS_OF)) {
      status = 'In transit';
    } else if (shippedUnits > 0) {
      status = 'In transit';
    } else if (balance > 0 && receivedReceipts.length > 0) {
      status = 'Unshipped balance';
    } else if (received > 0 && balance > 0) {
      status = 'Partly received';
    } else if (balance > 0 && po.receipts.length === 0) {
      status = 'Not shipped yet';
    } else if (openReceipts.length > 0) {
      status = 'In transit';
    } else {
      status = balance > 0 ? 'Not shipped yet' : 'Received';
    }

    const summary = {
      ordered,
      received,
      countedOrdered,
      receivedPct: countedOrdered > 0 ? (received / countedOrdered) * 100 : null,
      balance,
      totalValue,
      openValue,
      openCbm,
      missingCbmOpen,
      checkDataLines,
      openLines,
      lineCount: po.lines.length,
      status,
      old: status === 'Not shipped yet' && ageDays != null && ageDays > 90,
      ageDays,
      nextEta,
      nextReceipt,
      openReceipts,
      receivedReceipts,
      receiptCount: po.receipts.length,
    };

    summaryCache.set(po.po, summary);
    return summary;
  }

  function poMatchesGlobal(po) {
    if (state.vendorFilter && po.vendorId !== state.vendorFilter) return false;
    if (state.buyerFilter && po.buyer !== state.buyerFilter) return false;
    if (state.segmentFilter !== 'all' && po.segment !== state.segmentFilter) return false;
    return true;
  }

  function poSearchText(po) {
    if (po._searchText == null) {
      po._searchText = [
        po.po,
        po.vendorId,
        po.purchaser,
        po.buyer,
        po.port,
        po.fob,
        ...po.lines.map((line) => `${line.itemId} ${line.description}`),
      ].join(' ').toLowerCase();
    }
    return po._searchText;
  }

  function filteredOrders(options = {}) {
    const includeHeaderOnly = options.includeHeaderOnly ?? state.includeHeaderOnly;
    const query = String(options.query ?? state.searchQuery ?? '').trim().toLowerCase();
    const status = options.status ?? state.statusFilter;
    const port = options.port ?? state.portFilter;

    const rows = [];

    poById.forEach((po) => {
      if (!includeHeaderOnly && po.lines.length === 0) return;
      if (!poMatchesGlobal(po)) return;
      if (port && po.port !== port) return;
      if (query && !poSearchText(po).includes(query)) return;

      const summary = getPoSummary(po);
      if (status && summary.status !== status) return;
      rows.push({ po, summary });
    });

    const dir = state.sortDir === 'desc' ? -1 : 1;

    rows.sort((a, b) => {
      if (state.sortBy === 'eta') {
        const aEta = a.summary.nextEta;
        const bEta = b.summary.nextEta;
        if (aEta && !bEta) return 1;
        if (!aEta && bEta) return -1;
        if (aEta && bEta && aEta !== bEta) return aEta.localeCompare(bEta) * dir;
        return a.po.po.localeCompare(b.po.po);
      }
      if (state.sortBy === 'age') {
        const aAge = a.summary.ageDays;
        const bAge = b.summary.ageDays;
        if (aAge == null && bAge == null) return a.po.po.localeCompare(b.po.po);
        if (aAge == null) return 1;
        if (bAge == null) return -1;
        return (aAge - bAge) * dir || a.po.po.localeCompare(b.po.po);
      }
      if (state.sortBy === 'value') {
        return (a.summary.openValue - b.summary.openValue) * dir || a.po.po.localeCompare(b.po.po);
      }
      return (a.po.vendorId.localeCompare(b.po.vendorId) * dir) || a.po.po.localeCompare(b.po.po);
    });

    return rows;
  }

  function dashboardOrders() {
    return filteredOrders({ includeHeaderOnly: false, status: '', port: '', query: '' });
  }

  function receiptsForFilter(ignoreSegment = false, ignoreStatus = false) {
    return receiptRows.filter((receipt) => {
      if (!ignoreSegment && state.segmentFilter !== 'all' && receipt.segment !== state.segmentFilter) return false;
      if (state.vendorFilter && receipt.vendorId !== state.vendorFilter) return false;
      if (state.buyerFilter && (!receipt.poRef || receipt.poRef.buyer !== state.buyerFilter)) return false;
      if (state.shipmentType && receipt.type !== state.shipmentType) return false;
      if (!ignoreStatus && state.shipmentStatus && getReceiptStatus(receipt) !== state.shipmentStatus) return false;
      return true;
    });
  }

  /* =========================================================================
     5. Shared render helpers
     ========================================================================= */

  function renderHeader(title, subtitle, extra = '') {
    return `
      <div class="row">
        <div>
          <h1>${esc(title)}</h1>
          <div class="sub">${subtitle}</div>
        </div>
        ${extra}
      </div>`;
  }

  function renderMetricCard(value, label, targetView, isHot = false, note = '') {
    return `
      <div class="card kp${isHot ? ' hot' : ''}" data-action="go:${targetView}">
        <b>${value}</b>
        <span class="sub">${esc(label)}</span>
        ${note ? `<span class="sub">${note}</span>` : ''}
      </div>`;
  }

  function renderCoverageNote() {
    const counts = HEALTH.counts;
    return `
      <div class="card sub">
        <b>Export coverage</b> ·
        ${formatNumber(counts.posWithLines)} POs with lines ·
        ${formatNumber(counts.headerOnlyPos)} header-only POs ·
        ${formatNumber(counts.matchedReceipts)} of ${formatNumber(counts.receipts)} receipts matched ·
        ${formatNumber(counts.detailOnlyPos)} detail-only POs (${formatNumber(counts.detailOnlyLines)} lines) ·
        Data as of ${AS_OF_LABEL}
      </div>`;
  }

  function renderWarehouse(receipt) {
    if (receipt.warehouse) {
      return { label: receipt.warehouse, title: 'WHLocation from export' };
    }
    if (receipt.tracking && /-W$/i.test(receipt.tracking)) {
      return { label: '3 (likely)', title: 'Inferred from the -W tracking suffix; WHLocation is blank' };
    }
    return { label: '—', title: 'WHLocation is blank' };
  }

  function receiptStatusLabel(status) {
    return RECEIPT_STATUS_LABELS[status] || status;
  }

  function renderReceiptStatusTag(receipt) {
    const status = getReceiptStatus(receipt);
    return renderTag(tagVariantForStatus(status), receiptStatusLabel(status));
  }

  function renderEtaCell(summary) {
    if (!summary.nextEta) return '<span class="sub">—</span>';
    const relative = relativeEta(summary.nextEta);
    const late = summary.nextEta < AS_OF;
    return `
      <span class="${late ? 'late' : ''}" title="Earliest open receipt ETA">
        ${formatDate(summary.nextEta)}
        <span class="sub">· ${esc(relative)}</span>
      </span>`;
  }

  function renderShipmentCell(summary, po) {
    const shippedContainers = po ? shippedContainersForPo(po) : [];
    const arrivedContainers = po ? arrivedContainersForPo(po) : [];
    const history = shippedContainers.length
      ? { containers: shippedContainers, label: 'Shipped', dateKey: 'sailingDate' }
      : arrivedContainers.length
        ? { containers: arrivedContainers, label: 'Arrived', dateKey: 'arrivedDate' }
        : null;
    if (history) {
      const first = history.containers[0];
      const extra = history.containers.length > 1 ? ` +${formatNumber(history.containers.length - 1)}` : '';
      const date = first[history.dateKey] ? ` ${formatDate(first[history.dateKey])}` : '';
      return `
        <span class="mono">${esc(first.id)}${extra}</span>
        <span class="sub">· ${history.label}${date}${first.port ? ` · ${esc(first.port)}` : ''}</span>`;
    }
    if (!summary.nextReceipt) return '<span class="sub">No receipt</span>';
    const receipt = summary.nextReceipt;
    const tracking = receipt.tracking || 'No tracking';
    const type = receipt.type || '-';
    return `
      <span class="mono">${esc(tracking)}</span>
      <span class="sub">· ${esc(type)} · ${formatNumber(summary.receiptCount)} shipment${summary.receiptCount === 1 ? '' : 's'}</span>`;
  }

  /* =========================================================================
     6. Dashboard
     ========================================================================= */

  function renderHome() {
    const rows = dashboardOrders();
    const summaries = rows.map((row) => row.summary);

    const totals = {
      openPos: 0,
      openValue: 0,
      inTransit: 0,
      pastEta: 0,
      arriving14: 0,
      nothingComing: 0,
      openCbm: 0,
      missingCbmLines: 0,
      orderedUnits: 0,
      receivedUnits: 0,
      inTransitUnits: 0,
      plannedUnits: 0,
      atRiskUnits: 0,
      atRiskPos: 0,
    };

    const end14 = addDays(AS_OF, 14);
    const statusCounts = {
      Received: 0,
      'In transit': 0,
      'Not shipped yet': 0,
      Overdue: 0,
      'Unshipped balance': 0,
    };

    rows.forEach(({ po, summary }) => {
      if (summary.balance > 0) totals.openPos += 1;
      totals.openValue += summary.openValue;
      if (summary.status === 'In transit') totals.inTransit += 1;
      if (summary.status === 'Overdue') totals.pastEta += 1;
      if (summary.status === 'Unshipped balance') totals.nothingComing += 1;
      if (summary.nextEta && summary.nextEta >= AS_OF && summary.nextEta <= end14) totals.arriving14 += 1;
      totals.openCbm += summary.openCbm;
      totals.missingCbmLines += summary.missingCbmOpen;

      const hasOpenReceipt = poHasOpenReceipt(po);
      if (!hasOpenReceipt && poIsAtRisk(po, summary)) totals.atRiskPos += 1;
      po.lines.forEach((line) => {
        if (line.isCheckData) return;
        const open = openUnitsForLine(line);
        totals.orderedUnits += line.ordered;
        totals.receivedUnits += receivedUnitsForLine(line);
        if (open <= 0) return;
        if (hasOpenReceipt) {
          totals.inTransitUnits += open;
        } else {
          const shipped = Math.min(shippedUnitsForLine(line), open);
          const planned = Math.min(plannedUnitsForLine(line), Math.max(0, open - shipped));
          totals.inTransitUnits += shipped;
          totals.plannedUnits += planned;
          totals.atRiskUnits += Math.max(0, open - shipped - planned);
        }
      });

      if (statusCounts[summary.status] != null) {
        statusCounts[summary.status] += 1;
      } else if (summary.status === 'Partly received') {
        statusCounts['Not shipped yet'] += 1;
      }
    });

    const statusGroups = [
      ['Received', 'Received', '#5b8f4a'],
      ['In transit', 'In transit', '#3b82c4'],
      ['Not shipped yet', 'Not shipped yet', '#e0a030'],
      ['Overdue', 'Overdue', '#e5534b'],
      ['Unshipped balance', 'Unshipped balance', '#8b1a1a'],
    ];
    const statusTotal = Object.values(statusCounts).reduce((sum, value) => sum + value, 0) || 1;

    const upcoming = [];
    rows.forEach(({ po }) => {
      po.receipts.forEach((receipt) => {
        if (receipt.invalid || isReceiptReceived(receipt)) return;
        if (!receipt.etaDate || receipt.etaDate < AS_OF) return;
        upcoming.push({ receipt, po });
      });
    });
    upcoming.sort((a, b) => a.receipt.etaDate.localeCompare(b.receipt.etaDate));
    const nextEtaRows = upcoming.slice(0, 8);

    const vendorMap = new Map();
    rows.forEach(({ po, summary }) => {
      const key = po.vendorId || '(blank)';
      const row = vendorMap.get(key) || {
        vendor: key,
        poCount: 0,
        openValue: 0,
        ordered: 0,
        received: 0,
        overdue: 0,
        nextEta: '',
      };
      row.poCount += 1;
      row.openValue += summary.openValue;
      row.ordered += summary.countedOrdered;
      row.received += summary.received;
      if (summary.status === 'Overdue') row.overdue += 1;
      if (summary.nextEta && (!row.nextEta || summary.nextEta < row.nextEta)) row.nextEta = summary.nextEta;
      vendorMap.set(key, row);
    });

    const vendors = Array.from(vendorMap.values()).sort((a, b) => b.openValue - a.openValue);
    const vendorTotals = vendors.reduce((totalsRow, row) => {
      totalsRow.poCount += row.poCount;
      totalsRow.openValue += row.openValue;
      totalsRow.ordered += row.ordered;
      totalsRow.received += row.received;
      totalsRow.overdue += row.overdue;
      if (row.nextEta && (!totalsRow.nextEta || row.nextEta < totalsRow.nextEta)) totalsRow.nextEta = row.nextEta;
      return totalsRow;
    }, { poCount: 0, openValue: 0, ordered: 0, received: 0, overdue: 0, nextEta: '' });

    const receiptMatches = HEALTH.counts.matchedReceipts;
    const receiptTotal = HEALTH.counts.receipts;

    const coverageTotal =
      totals.receivedUnits + totals.inTransitUnits + totals.plannedUnits + totals.atRiskUnits;
    const coveragePct = (value) => (coverageTotal ? (value / coverageTotal) * 100 : 0);
    const coverage = [
      ['Received', totals.receivedUnits, '#5b8f4a', 'Received in the export, via a simulated receipt or an arrived container'],
      ['In transit', totals.inTransitUnits, '#3b82c4', 'Open balance covered by an open receipt or a shipped container'],
      ['Planned', totals.plannedUnits, '#0f6b6f', 'Assigned to a draft or booked container in the Planner'],
      ['At risk', totals.atRiskUnits, '#e5534b', 'Open balance with no receipt and some balance neither shipped nor planned'],
    ];

    return `
      ${renderHeader(
        'Purchasing dashboard',
        `${formatNumber(rows.length)} POs in the current segment · ${formatNumber(rows.reduce((sum, row) => sum + row.summary.lineCount, 0))} lines · data as of ${AS_OF_LABEL}`,
        `<div class="sub">${SEGMENT_LABELS[state.segmentFilter] || 'All segments'}</div>`
      )}

      <div class="grid">
        ${renderMetricCard(formatNumber(totals.openPos), 'Open POs', 'orders')}
        ${renderMetricCard(formatValue(totals.openValue), 'Open PO value', 'orders')}
        ${renderMetricCard(formatNumber(totals.inTransit), 'In transit', 'shipments', false, 'Open receipts or shipped containers')}
        ${renderMetricCard(formatNumber(totals.pastEta), 'Past ETA', 'followup', totals.pastEta > 0)}
        ${renderMetricCard(formatNumber(totals.arriving14), 'Arriving in 14 days', 'shipments')}
        ${renderMetricCard(formatNumber(totals.nothingComing), 'Unshipped balance', 'followup', totals.nothingComing > 0)}
        ${renderMetricCard(
          `${formatCbm(totals.openCbm)}`,
          'Open CBM',
          'orders',
          false,
          `${formatNumber(totals.missingCbmLines)} open import line${totals.missingCbmLines === 1 ? '' : 's'} with CBM missing`
        )}
        ${renderMetricCard(
          formatNumber(totals.plannedUnits),
          'Planned units',
          'planner',
          false,
          'Open balance in draft or booked containers'
        )}
        ${renderMetricCard(
          formatNumber(totals.atRiskUnits),
          'At risk units',
          'followup',
          totals.atRiskUnits > 0,
          `${formatNumber(totals.atRiskPos)} POs with no receipt and some balance neither shipped nor planned`
        )}
      </div>

      <div class="card">
        <div class="row">
          <div>
            <h2>Order coverage</h2>
            <div class="sub">What has happened to every ordered unit in the current segment.</div>
          </div>
          <span class="sub"><b>${formatNumber(totals.orderedUnits)}</b> ordered units</span>
        </div>
        <div class="pipe">
          ${coverage.map(([label, value, colour]) => value > 0
            ? `<span style="width:${coveragePct(value)}%;background:${colour}" title="${attr(label)}: ${formatNumber(value)} units"></span>`
            : '').join('')}
        </div>
        <div class="lg">
          ${coverage.map(([label, value, colour, note]) => `
            <span title="${attr(note)}">
              <i style="background:${colour}"></i>${esc(label)}
              <b>${formatNumber(value)}</b>
              <span class="sub">${coverageTotal ? `${Math.round(coveragePct(value))}%` : '0%'}</span>
            </span>`).join('')}
        </div>
        <div class="sub" style="margin-top:10px">
          Received is derived as ordered − balance in the export, plus simulated receipts and arrived containers. In transit includes open receipts and containers marked Shipped. Planned is the remaining open balance in draft or booked containers; at risk is the part neither shipped nor planned. Check-data lines are excluded.
        </div>
      </div>

      <div class="card">
        <div class="row">
          <h2>PO status split</h2>
          <span class="sub">${formatNumber(rows.length)} POs</span>
        </div>
        <div class="status-bars">
          ${statusGroups.map(([key, label, colour]) => {
            const count = statusCounts[key];
            const pct = statusTotal ? (count / statusTotal) * 100 : 0;
            return `
              <div class="status-bar-row">
                <div class="status-bar-head">
                  <span><i style="background:${colour}"></i>${esc(label)}</span>
                  <span class="sub"><b>${formatNumber(count)}</b> · ${Math.round(pct)}%</span>
                </div>
                <div class="status-bar-track">
                  <span class="status-bar-fill" style="width:${pct}%;min-width:${count ? '2px' : '0'};background:${colour}"></span>
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="sub" style="margin-top:8px">Partly received POs are grouped under “Not shipped yet” in this chart. “Unshipped balance” means some goods were received, a balance remains, and no receipt is still open. The Order coverage bar above splits the remaining balance into in transit from shipped containers, planned and at risk.</div>
      </div>

      <div class="two">
        <div class="card">
          <div class="row">
            <h2>Upcoming ETAs</h2>
            <button class="s" data-action="go:shipments">Open shipments</button>
          </div>
          ${nextEtaRows.length ? `
            <div class="sc">
              <table style="min-width:420px">
                <thead>
                  <tr>
                    <th>ETA</th>
                    <th>TRACKING</th>
                    <th>VENDOR / PO</th>
                    <th>TYPE</th>
                  </tr>
                </thead>
                <tbody>
                  ${nextEtaRows.map(({ receipt, po }) => `
                    <tr class="lk" data-action="openpo:${esc(po.po)}">
                      <td><b>${formatDate(receipt.etaDate)}</b><br><span class="sub">${esc(relativeEta(receipt.etaDate))}</span></td>
                      <td class="mono">${esc(receipt.tracking || '—')}</td>
                      <td><b>${esc(po.po)}</b><br><span class="sub">${esc(po.vendorId || '—')}</span></td>
                      <td>${renderReceiptStatusTag(receipt)}<br><span class="sub">${esc(receipt.type || '—')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>` : '<div class="sub">No open receipts with a future ETA in this segment.</div>'}
        </div>

        <div class="card">
          <div class="row">
            <h2>Receipt coverage</h2>
            <button class="s" data-action="go:shipments">View receipts</button>
          </div>
          <div class="grid" style="grid-template-columns:repeat(2,minmax(130px,1fr))">
            <div><b>${formatNumber(receiptMatches)}</b><div class="sub">matched receipts</div></div>
            <div><b>${formatNumber(receiptTotal - receiptMatches)}</b><div class="sub">unmatched / invalid</div></div>
            <div><b>${formatNumber(HEALTH.counts.headerOnlyPos)}</b><div class="sub">header-only POs</div></div>
            <div><b>${formatNumber(HEALTH.counts.detailOnlyPos)}</b><div class="sub">PO headers missing</div></div>
          </div>
          <div class="sub" style="margin-top:10px">${formatNumber(HEALTH.importMissingCbm)} of ${formatNumber(HEALTH.importLines)} import lines (${HEALTH.importMissingCbmPct}%) have no CBM. Open CBM excludes those lines.</div>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <h2>Vendors</h2>
          <span class="sub">Open value, received %, overdue POs and next ETA</span>
        </div>
        <div class="sc">
          <table>
            <thead>
              <tr>
                <th>VENDOR</th>
                <th class="n">POs</th>
                <th class="n">OPEN PO VALUE</th>
                <th class="n">RECEIVED %</th>
                <th class="n">OVERDUE POs</th>
                <th>NEXT ETA</th>
              </tr>
            </thead>
            <tbody>
              ${vendors.map((vendor) => `
                <tr>
                  <td><b>${esc(vendor.vendor)}</b></td>
                  <td class="n">${formatNumber(vendor.poCount)}</td>
                  <td class="n">${formatValue(vendor.openValue)}</td>
                  <td class="n">${vendor.ordered ? `${Math.round((vendor.received / vendor.ordered) * 100)}%` : '—'}</td>
                  <td class="n">${vendor.overdue ? `<span class="tag bad">${vendor.overdue}</span>` : '0'}</td>
                  <td>${vendor.nextEta ? `<b>${formatDate(vendor.nextEta)}</b><br><span class="sub">${esc(relativeEta(vendor.nextEta))}</span>` : '<span class="sub">—</span>'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td><b>Total</b></td>
                <td class="n"><b>${formatNumber(vendorTotals.poCount)}</b></td>
                <td class="n"><b>${formatValue(vendorTotals.openValue)}</b></td>
                <td class="n"><b>${vendorTotals.ordered ? `${Math.round((vendorTotals.received / vendorTotals.ordered) * 100)}%` : '—'}</b></td>
                <td class="n"><b>${formatNumber(vendorTotals.overdue)}</b></td>
                <td><b>${vendorTotals.nextEta ? formatDate(vendorTotals.nextEta) : '—'}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      ${renderCoverageNote()}
    `;
  }

  /* =========================================================================
     7. Purchase orders
     ========================================================================= */

  function renderOrders() {
    const portOptions = (DATA.ports || [])
      .map((port) => `<option value="${attr(port)}"${state.portFilter === port ? ' selected' : ''}>${esc(port)}</option>`)
      .join('');

    const statusOptions = PO_STATUSES
      .map((status) => `<option value="${attr(status)}"${state.statusFilter === status ? ' selected' : ''}>${esc(status)}</option>`)
      .join('');

    return `
      ${renderHeader(
        'Purchase orders',
        `Real PO numbers from PurchPO. ETA is the earliest open receipt ETA and is PO-level only. Data as of ${AS_OF_LABEL}.`,
        `<div class="sub">${formatNumber(HEALTH.counts.posWithLines)} POs with lines in export · ${SEGMENT_LABELS[state.segmentFilter] || 'All segments'}</div>`
      )}

      <div class="grid" id="order-kpis"></div>

      <div class="card row" style="justify-content:flex-start">
        <input
          type="search"
          id="order-search"
          placeholder="Search PO, vendor, item or description"
          value="${attr(state.searchQuery)}"
        >
        <select id="order-status">
          <option value="">All statuses</option>
          ${statusOptions}
        </select>
        <select id="order-port">
          <option value="">All ports</option>
          ${portOptions}
        </select>
        <select id="order-sort">
          <option value="eta"${state.sortBy === 'eta' ? ' selected' : ''}>Sort: ETA</option>
          <option value="age"${state.sortBy === 'age' ? ' selected' : ''}>Sort: PO age</option>
          <option value="value"${state.sortBy === 'value' ? ' selected' : ''}>Sort: open value</option>
          <option value="vendor"${state.sortBy === 'vendor' ? ' selected' : ''}>Sort: vendor</option>
        </select>
        <button class="s" data-action="sort-dir" title="Toggle sort direction">${state.sortDir === 'desc' ? '↓ Desc' : '↑ Asc'}</button>
        <select id="order-page-size">
          <option value="25"${state.orderPageSize === 25 ? ' selected' : ''}>25 / page</option>
          <option value="50"${state.orderPageSize === 50 ? ' selected' : ''}>50 / page</option>
          <option value="100"${state.orderPageSize === 100 ? ' selected' : ''}>100 / page</option>
        </select>
        <label class="check" for="include-header-only">
          <input type="checkbox" id="include-header-only"${state.includeHeaderOnly ? ' checked' : ''}>
          Include header-only POs (${formatNumber(HEALTH.counts.headerOnlyPos)})
        </label>
      </div>

      <div class="card" id="order-table"></div>`;
  }

  function renderOrderKpis() {
    const host = document.getElementById('order-kpis');
    if (!host) return;

    // Counts ignore the status filter so the cards stay usable while one is active.
    const rows = filteredOrders({ status: '' });
    const counts = {
      'Overdue': 0,
      'Unshipped balance': 0,
      'Not shipped yet': 0,
      'In transit': 0,
    };
    let oldCount = 0;
    let riskCount = 0;

    rows.forEach(({ po, summary }) => {
      if (counts[summary.status] != null) counts[summary.status] += 1;
      if (summary.old) oldCount += 1;
      if (poIsAtRisk(po, summary)) riskCount += 1;
    });

    const cards = [
      ['Overdue', 'Past ETA', 'Open receipt ETA is before the data date', true],
      ['Unshipped balance', 'Unshipped balance', 'Part received; no shipment left', true],
      ['Not shipped yet', 'Not shipped yet', `${formatNumber(oldCount)} over 90 days old`, oldCount > 0],
      ['In transit', 'In transit', 'Open receipts or shipped containers', false],
    ];

    host.innerHTML = cards.map(([status, label, note, hot]) => `
      <button
        class="card kp${hot ? ' hot' : ''}${state.statusFilter === status ? ' sel' : ''}"
        data-action="status:${attr(status)}"
        title="Show only ${attr(status)} POs"
      >
        <b>${formatNumber(counts[status])}</b>
        <span class="sub">${esc(label)}</span>
        <span class="sub">${esc(note)}</span>
      </button>
    `).join('') + `
      <button
        class="card kp${riskCount ? ' hot' : ''}"
        data-action="go:followup"
        title="Open Follow-ups to see balances with no receipt and some balance not planned"
      >
        <b>${formatNumber(riskCount)}</b>
        <span class="sub">Unplanned balance</span>
        <span class="sub">POs with no open receipt and some balance not planned</span>
      </button>`;
  }

  function paginationButtons(pages, current, action = 'page') {
    const window = 1;
    const numbers = new Set([1, pages]);
    for (let page = current - window; page <= current + window; page += 1) {
      if (page >= 1 && page <= pages) numbers.add(page);
    }

    let html = '';
    let previous = 0;
    Array.from(numbers).sort((a, b) => a - b).forEach((page) => {
      if (previous && page - previous > 1) html += '<span class="sub">…</span>';
      html += `<button class="s${page === current ? ' on' : ''}" data-action="${attr(action)}:${page}"${page === current ? ' disabled' : ''}>${page}</button>`;
      previous = page;
    });
    return html;
  }

  function updateOrderTable() {
    const host = document.getElementById('order-table');
    if (!host) return;

    renderOrderKpis();
    const sortDirButton = document.querySelector('[data-action="sort-dir"]');
    if (sortDirButton) sortDirButton.textContent = state.sortDir === 'desc' ? '↓ Desc' : '↑ Asc';

    const rows = filteredOrders();
    const pageSize = state.orderPageSize;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.orderPage = Math.min(Math.max(1, state.orderPage), pages);
    const start = (state.orderPage - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    host.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <span class="sub">${formatNumber(rows.length)} POs · ${formatNumber(Math.max(0, start + 1))}–${formatNumber(Math.min(rows.length, start + pageSize))} shown</span>
        <span class="sub">Page ${state.orderPage} of ${pages}</span>
      </div>
      ${pageRows.length ? `
        <div class="sc">
          <table class="order-table">
            <thead>
              <tr>
                <th>PO</th>
                <th>VENDOR</th>
                <th>BUYER</th>
                <th class="n">LINES</th>
                <th class="n">ORDERED</th>
                <th class="n">RECEIVED %</th>
                <th class="n">PLANNED</th>
                <th class="n">BALANCE</th>
                <th class="n">UNPLANNED</th>
                <th>ETA</th>
                <th>SHIPMENT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${pageRows.map(({ po, summary }) => renderOrderRow(po, summary)).join('')}
            </tbody>
          </table>
        </div>
        <div class="row" style="margin-top:10px">
          <span class="sub">Showing ${formatNumber(rows.length ? start + 1 : 0)}–${formatNumber(Math.min(rows.length, start + pageSize))} of ${formatNumber(rows.length)} POs</span>
          <span class="row" style="gap:6px">
            <button class="s" data-action="page:1"${state.orderPage <= 1 ? ' disabled' : ''}>« First</button>
            <button class="s" data-action="page:${state.orderPage - 1}"${state.orderPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
            ${paginationButtons(pages, state.orderPage)}
            <button class="s" data-action="page:${state.orderPage + 1}"${state.orderPage >= pages ? ' disabled' : ''}>Next ›</button>
            <button class="s" data-action="page:${pages}"${state.orderPage >= pages ? ' disabled' : ''}>Last »</button>
          </span>
        </div>` : `<div class="sub">No POs match the current filters. Current segment: <b>${esc(SEGMENT_LABELS[state.segmentFilter] || 'All segments')}</b>. Switch to “All segments” to search POs outside it.</div>`}`;
  }

  function renderOrderRow(po, summary) {
    const expanded = state.expandedOrders.has(po.po);
    const hasOpenReceipt = poHasOpenReceipt(po);
    const shipped = shippedUnitsForPo(po);
    const planned = Math.max(0, Math.min(plannedUnitsForPo(po), summary.balance - shipped));
    const unplanned = unplannedUnitsForPo(po);
    const tags = [];

    if (!po.lines.length) tags.push(renderTag('', 'No line items'));
    if (po.synthetic) tags.push(renderTag('bad', 'PO header missing', 'This detail PO has no row in PurchPO. Vendor was inferred from the PO number.'));
    if (summary.old) tags.push(renderTag('wn', 'Old', 'Not shipped yet and PO age is over 90 days'));
    if (shipped > 0) tags.push(renderTag('info', 'In container', 'Some or all open units are on a container marked Shipped.'));
    if (summary.balance > 0 && !hasOpenReceipt && unplanned > 0) {
      tags.push(renderTag('bad', 'Unplanned balance', 'Open balance is not covered by an open receipt, a shipped container or a container plan.'));
    } else if (summary.balance > 0 && !hasOpenReceipt && planned > 0 && unplanned <= 0) {
      tags.push(renderTag('ok', 'Planned', 'All remaining open balance is assigned in the Planner.'));
    }

    return `
      <tr class="lk" data-action="toggle:${attr(po.po)}">
        <td><b>${expanded ? '▾' : '▸'} ${esc(po.po)}</b>${tags.length ? ` ${tags.join(' ')}` : ''}</td>
        <td>${esc(wrapperLabel(po.vendorId))}</td>
        <td title="${attr(purchaserTitle(po.purchaser))}">${esc(po.buyer || '—')}</td>
        <td class="n">${formatNumber(summary.lineCount)}</td>
        <td class="n">${formatNumber(summary.ordered)}</td>
        <td class="n" title="Received is derived as ordered minus PO balance in this export">${summary.receivedPct == null ? '—' : `${summary.receivedPct.toFixed(0)}%`}</td>
        <td class="n">${planned ? formatNumber(planned) : '—'}</td>
        <td class="n">${formatNumber(summary.balance)}</td>
        <td class="n" title="${hasOpenReceipt ? 'Open balance is covered by an open receipt' : shipped > 0 ? 'Open balance is partly or fully on shipped containers' : 'Open balance with no open receipt and some balance not planned'}">${hasOpenReceipt ? '<span class="sub">In transit</span>' : unplanned > 0 ? `<span class="late">${formatNumber(unplanned)}</span>` : shipped > 0 ? '<span class="sub">In transit</span>' : '0'}</td>
        <td>${renderEtaCell(summary)}</td>
        <td>${renderShipmentCell(summary, po)}</td>
        <td>${renderStatusTag(summary.status)}</td>
      </tr>
      ${expanded ? `
        <tr class="sub2">
          <td colspan="12">${renderOrderDetail(po, summary)}</td>
        </tr>` : ''}`;
  }

  function renderOrderDetail(po, summary) {
    const headerFields = [
      ['PO', po.po],
      ['Vendor', po.vendorId || '—'],
      ['Purchaser', `${po.purchaser || '—'}${po.buyer && po.buyer !== po.purchaser ? ` (shown as ${po.buyer})` : ''}`],
      ['PO date', po.poDate ? formatDate(po.poDate) : '—'],
      ['FOB', po.fob ? `${po.fob}${po.port && po.port !== po.fob ? ` → ${po.port}` : ''}` : '—'],
      ['Marking', po.marking || '—'],
      ['Ready date', po.readyDate ? formatDate(po.readyDate) : '—'],
      ['Segment', SEGMENT_LABELS[po.segment] || po.segment || '—'],
      ['PO age', summary.ageDays == null ? '—' : `${formatNumber(summary.ageDays)} days`],
      ['PO value', formatValue(summary.totalValue)],
      ['Open PO value', formatValue(summary.openValue)],
    ];

    const headerGrid = headerFields.map(([label, value]) => `
      <div>
        <div class="sub">${esc(label)}</div>
        <div>${esc(value)}</div>
      </div>`).join('');

    return `
      <div class="detail">
        ${po.synthetic ? `<div class="note bad-note">PO header missing in PurchPO. Vendor “${esc(po.vendorId || 'unknown')}” was inferred from the PO number; treat these values as incomplete.</div>` : ''}
        <div class="detail-grid">${headerGrid}</div>

        <h3>Shipments</h3>
        ${po.receipts.length ? `
          <div class="sc">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>INVOICE</th>
                  <th>STATUS</th>
                  <th>ETA</th>
                  <th>RECEIVED</th>
                  <th>TRACKING / CONTAINER</th>
                  <th>TYPE</th>
                  <th>WAREHOUSE</th>
                  <th>MATCH</th>
                </tr>
              </thead>
              <tbody>
                ${po.receipts.map((receipt) => {
                  const warehouse = renderWarehouse(receipt);
                  return `
                    <tr>
                      <td class="mono">${esc(receipt.invoiceNo)}</td>
                      <td>${renderReceiptStatusTag(receipt)}</td>
                      <td>${receipt.etaDate ? `${formatDate(receipt.etaDate)}<br><span class="sub">${esc(relativeEta(receipt.etaDate))}</span>` : '—'}</td>
                      <td>${renderReceiptReceivedDate(receipt)}</td>
                      <td><span class="mono">${esc(receipt.tracking || '—')}</span>${receipt.containerId ? `<br><span class="sub">Container ${esc(receipt.containerId)}</span>` : ''}</td>
                      <td>${esc(receipt.type || '—')}</td>
                      <td title="${attr(warehouse.title)}">${esc(warehouse.label)}</td>
                      <td>${esc(receipt.matchType || '—')}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">No receipt matched to this PO.</div>'}

        <h3>Lines</h3>
        <div class="sub" style="margin-bottom:8px">
          Received is derived from ordered minus PO balance in this export. Planned is assigned to a draft or booked container. “In container” is on a container marked Shipped. “In transit” also includes open receipts.
        </div>
        ${po.lines.length ? `
          <div class="sc">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th>DESCRIPTION</th>
                  <th class="n">ORDERED</th>
                  <th class="n">RECEIVED</th>
                  <th class="n">PLANNED</th>
                  <th class="n">IN CONTAINER</th>
                  <th class="n">BALANCE</th>
                  <th class="n">UNPLANNED</th>
                  <th class="n">PRICE</th>
                  <th class="n">CBM</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                ${po.lines.map((line) => {
                  const effective = effectiveBalance(line);
                  const status = lineStatus(line);
                  const open = openUnitsForLine(line);
                  const shipped = shippedUnitsForLine(line);
                  const planned = Math.max(0, Math.min(plannedUnitsForLine(line), open - shipped));
                  const unplanned = unplannedUnitsForLine(line);
                  const hasOpenReceipt = poHasOpenReceipt(po);
                  return `
                    <tr>
                      <td class="mono">${esc(line.itemId || '—')}</td>
                      <td>${esc(line.description || '—')}</td>
                      <td class="n">${formatNumber(line.ordered)}</td>
                      <td class="n">${formatNumber(receivedUnitsForLine(line))}</td>
                      <td class="n">${planned ? formatNumber(planned) : '—'}</td>
                      <td class="n">${shipped ? formatNumber(shipped) : '—'}</td>
                      <td class="n">${formatNumber(effective)}</td>
                      <td class="n">${hasOpenReceipt ? '<span class="sub">In transit</span>' : unplanned > 0 ? `<span class="late">${formatNumber(unplanned)}</span>` : shipped > 0 ? '<span class="sub">In transit</span>' : '0'}</td>
                      <td class="n">${line.price ? line.price.toFixed(3) : '—'}</td>
                      <td class="n">${line.cbm > 0 ? formatCbm(line.cbm) : '<span class="sub">—</span>'}</td>
                      <td>${status === 'Check data' ? renderTag('bad', status, 'Balance is negative or greater than ordered quantity') : renderStatusTag(status)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">This PO has no line items in the detail export.</div>'}
      </div>`;
  }

  /* =========================================================================
     8. Shipments
     ========================================================================= */

  function shipmentSearchText(receipt) {
    if (receipt._shipmentSearch == null) {
      receipt._shipmentSearch = [
        receipt.invoiceNo,
        receipt.matchPo,
        receipt.vendorId,
        receipt.tracking,
        receipt.containerId,
        receipt.groupLabel,
        receipt.type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    }
    return receipt._shipmentSearch;
  }

  function shipmentReceipts(ignoreStatus = false) {
    const query = String(state.shipmentQuery || '').trim().toLowerCase();
    return receiptsForFilter(true, ignoreStatus)
      .filter((receipt) => !query || shipmentSearchText(receipt).includes(query));
  }

  function shipmentGroups() {
    const groups = new Map();

    shipmentReceipts().forEach((receipt) => {
      const key = receipt.groupKey;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: receipt.groupLabel,
          isContainer: Boolean(receipt.containerId),
          receipts: [],
        });
      }
      groups.get(key).receipts.push(receipt);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aEta = a.receipts.map((row) => row.etaDate || '9999').sort()[0];
      const bEta = b.receipts.map((row) => row.etaDate || '9999').sort()[0];
      return aEta.localeCompare(bEta) || a.label.localeCompare(b.label);
    });
  }

  function shipmentGroupStatus(group) {
    const rank = {
      Overdue: 5,
      Unmatched: 4,
      'No ETA': 3,
      'In transit': 2,
      'Invalid data': 1,
      Received: 0,
    };
    return group.receipts.reduce((worst, receipt) => {
      const status = getReceiptStatus(receipt);
      return (rank[status] ?? 0) > (rank[worst] ?? 0) ? status : worst;
    }, 'Received');
  }

  function renderShipmentKpis() {
    const host = document.getElementById('shipment-kpis');
    if (!host) return;

    const receipts = shipmentReceipts(true);
    const total = receipts.length;
    const transit = receipts.filter((receipt) => getReceiptStatus(receipt) === 'In transit').length;
    const overdue = receipts.filter((receipt) => getReceiptStatus(receipt) === 'Overdue').length;
    const unmatched = receipts.filter((receipt) => getReceiptStatus(receipt) === 'Unmatched').length;
    const received = receipts.filter((receipt) => getReceiptStatus(receipt) === 'Received').length;

    const cards = [
      ['', 'Receipts in view', `${formatNumber(received)} already received`, false, total],
      ['In transit', 'On the way', 'Future ETA', false, transit],
      ['Overdue', 'Late', 'ETA has passed', true, overdue],
      ['Unmatched', 'No matching PO', 'Cannot be tied to a PO', true, unmatched],
    ];

    host.innerHTML = cards.map(([status, label, note, hot, count]) => `
      <button
        class="card kp${hot ? ' hot' : ''}${state.shipmentStatus === status ? ' sel' : ''}"
        data-action="ship-status:${attr(status)}"
      >
        <b>${formatNumber(count)}</b>
        <span class="sub">${esc(label)}</span>
        <span class="sub">${esc(note)}</span>
      </button>`).join('');
  }

  function renderShipmentGroup(group) {
    const expanded = state.expandedShipmentGroups.has(group.key);
    const status = shipmentGroupStatus(group);
    const etaValues = group.receipts.map((receipt) => receipt.etaDate).filter(Boolean).sort();
    const poIds = new Set(group.receipts.map((receipt) => receipt.matchPo).filter(Boolean));
    const vendors = Array.from(new Set(group.receipts.map((receipt) => receipt.vendorId).filter(Boolean)));
    const etaLabel = etaValues.length
      ? `${formatDate(etaValues[0])}${etaValues.length > 1 ? ` → ${formatDate(etaValues[etaValues.length - 1])}` : ''}`
      : 'No ETA';
    const receiptLabel = `${formatNumber(group.receipts.length)} receipt${group.receipts.length === 1 ? '' : 's'}`;
    const poLabel = `${formatNumber(poIds.size)} PO${poIds.size === 1 ? '' : 's'}`;
    const vendorLabel = vendors.length
      ? ` · ${esc(vendors.slice(0, 2).join(', '))}${vendors.length > 2 ? ` +${vendors.length - 2}` : ''}`
      : '';

    return `
      <div class="ship-group">
        <button class="ship-group-head" data-action="toggle-ship-group:${attr(group.key)}" aria-expanded="${expanded}">
          <span class="ship-group-name">
            <b>${group.isContainer ? 'Container ' : 'Tracking '}${esc(group.label)}</b>
            <span class="sub">${receiptLabel} · ${poLabel}${vendorLabel}</span>
          </span>
          <span class="ship-group-eta">${etaLabel}</span>
          ${renderTag(tagVariantForStatus(status), receiptStatusLabel(status))}
          <span class="ship-caret">${expanded ? '▾' : '▸'}</span>
        </button>
        ${expanded ? `
          <div class="sc">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>INVOICE</th>
                  <th>PO</th>
                  <th>VENDOR</th>
                  <th>ETA</th>
                  <th>RECEIVED</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                ${group.receipts.map((receipt) => {
                  const warehouse = renderWarehouse(receipt);
                  return `
                    <tr>
                      <td class="mono">${esc(receipt.invoiceNo)}<br><span class="sub">${esc(receipt.type || '—')} · ${esc(warehouse.label)}</span></td>
                      <td>${receipt.matchPo ? `<a href="#orders" data-action="openpo:${attr(receipt.matchPo)}"><b>${esc(receipt.matchPo)}</b></a>` : '<span class="sub">—</span>'}</td>
                      <td>${esc(receipt.vendorId || '—')}</td>
                      <td>${receipt.etaDate ? `${formatDate(receipt.etaDate)}<br><span class="sub">${esc(relativeEta(receipt.etaDate))}</span>` : '—'}</td>
                      <td>${renderReceiptReceivedDate(receipt, 'Not yet')}</td>
                      <td>${renderReceiptStatusTag(receipt)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>`;
  }

  function updateShipmentList() {
    const host = document.getElementById('shipment-list');
    if (!host) return;

    renderShipmentKpis();

    const groups = shipmentGroups();
    const pageSize = state.shipmentPageSize;
    const pages = Math.max(1, Math.ceil(groups.length / pageSize));
    state.shipmentPage = Math.min(Math.max(1, state.shipmentPage), pages);
    const start = (state.shipmentPage - 1) * pageSize;
    const pageGroups = groups.slice(start, start + pageSize);
    const receiptsOnPage = pageGroups.reduce((sum, group) => sum + group.receipts.length, 0);
    const receiptWord = receiptsOnPage === 1 ? 'receipt' : 'receipts';
    const groupLabel = groups.length === 1 ? 'group' : 'groups';

    host.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <span class="sub">${formatNumber(groups.length)} container/tracking ${groupLabel} · ${formatNumber(receiptsOnPage)} ${receiptWord} on this page</span>
        <span class="row" style="gap:6px">
          <button class="s" data-action="ship-expand-all"${pageGroups.length ? '' : ' disabled'}>Expand all</button>
          <button class="s" data-action="ship-collapse-all"${state.expandedShipmentGroups.size ? '' : ' disabled'}>Collapse all</button>
        </span>
      </div>
      ${pageGroups.length ? `
        <div class="ship-groups">${pageGroups.map(renderShipmentGroup).join('')}</div>
        <div class="row" style="margin-top:10px">
          <span class="sub">Showing ${formatNumber(start + 1)}–${formatNumber(Math.min(groups.length, start + pageSize))} of ${formatNumber(groups.length)} ${groupLabel}</span>
          <span class="row" style="gap:6px">
            <button class="s" data-action="ship-page:1"${state.shipmentPage <= 1 ? ' disabled' : ''}>« First</button>
            <button class="s" data-action="ship-page:${state.shipmentPage - 1}"${state.shipmentPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
            ${paginationButtons(pages, state.shipmentPage, 'ship-page')}
            <button class="s" data-action="ship-page:${state.shipmentPage + 1}"${state.shipmentPage >= pages ? ' disabled' : ''}>Next ›</button>
            <button class="s" data-action="ship-page:${pages}"${state.shipmentPage >= pages ? ' disabled' : ''}>Last »</button>
          </span>
        </div>` : `
        <div class="card sub">No shipments match the current filters.</div>`}
    `;
  }

  function renderShipments() {
    const typeOptions = Array.from(new Set(receiptRows.map((receipt) => receipt.type).filter(Boolean)))
      .sort()
      .map((type) => `<option value="${attr(type)}"${state.shipmentType === type ? ' selected' : ''}>${esc(type)}</option>`)
      .join('');

    const statusOptions = RECEIPT_STATUSES
      .map((status) => `<option value="${attr(status)}"${state.shipmentStatus === status ? ' selected' : ''}>${esc(receiptStatusLabel(status))}</option>`)
      .join('');

    return `
      ${renderHeader(
        'Shipments',
        `Receipts grouped by container or tracking number. Click a group to see its receipts. Data as of ${AS_OF_LABEL}.`,
        `<div class="row" style="gap:8px">
          <span class="sub">${formatNumber(receiptRows.length)} receipts</span>
          <button class="s" data-action="go:import">Import packing list</button>
        </div>`
      )}

      <div class="grid" id="shipment-kpis"></div>

      <div class="card row" style="justify-content:flex-start">
        <input type="search" id="shipment-search" placeholder="Search invoice, PO, vendor or tracking" value="${attr(state.shipmentQuery)}" style="min-width:280px">
        <select id="shipment-type">
          <option value="">All receipt types</option>
          ${typeOptions}
        </select>
        <select id="shipment-status">
          <option value="">All statuses</option>
          ${statusOptions}
        </select>
      </div>

      <div id="shipment-list"></div>

      <div class="card sub">
        The Segment filter does not apply here: all receipts are shown. Warehouse “3 (likely)” is inferred from a “-W” tracking suffix when the warehouse field is blank.
        <details class="more"><summary>Why some shipments have no matching PO</summary>
          A receipt can exist without a PO line that matches its invoice and item, or its PO may belong to the Other segment. Click a PO number to open it.
        </details>
      </div>`;
  }

  /* =========================================================================
     9. Receive one receipt (simulated)
     ========================================================================= */

  function openReceiveReceipts() {
    return receiptRows
      .filter((receipt) => receipt.matchPo && !receipt.invalid && !isReceiptReceived(receipt) && receipt.poRef)
      .filter((receipt) => poMatchesGlobal(receipt.poRef))
      .sort((a, b) => (a.etaDate || '9999').localeCompare(b.etaDate || '9999'));
  }

  function renderReceive() {
    const receipts = openReceiveReceipts();
    if (!receipts.length) {
      return `
        ${renderHeader('Receive one receipt (simulated)', `No open matched receipts in the current segment. Data as of ${AS_OF_LABEL}.`)}
        <div class="card">${renderTag('wn', 'Simulated import')} <span class="sub">There is no open matched receipt to receive in this filter.</span></div>`;
    }

    let selected = receipts.find((receipt) => String(receipt.id) === String(state.receiveReceiptId));
    if (!selected) {
      selected = receipts[0];
      state.receiveReceiptId = String(selected.id);
    }

    const po = selected.poRef;
    const summary = getPoSummary(po);
    const lines = po.lines.filter((line) => openUnitsForLine(line) > 0);

    return `
      ${renderHeader(
        'Receive one receipt (simulated)',
        `The receipt export has no line quantities. This single-receipt path lets you edit the delivered quantities on one PO and updates only this browser session. For a whole container, use Import packing list. Data as of ${AS_OF_LABEL}.`,
        renderTag('wn', 'Simulated import')
      )}

      <div class="card note">
        <b>No line-level packing list exists in PurchReceipt.</b>
        Choose an open matched receipt, edit the pre-filled quantities if the delivery is partial, then confirm. The in-memory balance changes immediately; nothing is written back to the CSV or Odoo.
      </div>

      <div class="card row" style="justify-content:flex-start">
        <span class="sub">Need to process a whole container or tracking group at once?</span>
        <button class="s" data-action="go:import">Import a multi-PO packing list</button>
      </div>

      <div class="card">
        <label for="receive-receipt" class="field-label">Open matched receipt</label>
        <select id="receive-receipt">
          ${receipts.map((receipt) => `
            <option value="${receipt.id}"${String(receipt.id) === String(selected.id) ? ' selected' : ''}>
              ${esc(receipt.invoiceNo)} · ${esc(receipt.matchPo)} · ETA ${formatDate(receipt.etaDate)}
            </option>
          `).join('')}
        </select>

        <div class="detail-grid" style="margin-top:14px">
          <div><div class="sub">Receipt</div><div class="mono">${esc(selected.invoiceNo)}</div></div>
          <div><div class="sub">PO</div><div><b>${esc(po.po)}</b></div></div>
          <div><div class="sub">Vendor</div><div>${esc(po.vendorId || '—')}</div></div>
          <div><div class="sub">Buyer</div><div title="${attr(purchaserTitle(po.purchaser))}">${esc(po.buyer || '—')}</div></div>
          <div><div class="sub">ETA</div><div>${formatDate(selected.etaDate)} <span class="sub">${esc(relativeEta(selected.etaDate))}</span></div></div>
          <div><div class="sub">Tracking</div><div class="mono">${esc(selected.tracking || '—')}</div></div>
          <div><div class="sub">Type</div><div>${esc(selected.type || '—')}</div></div>
          <div><div class="sub">PO status</div><div>${renderStatusTag(summary.status)}</div></div>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <h2>Open lines</h2>
          <span class="sub">Pre-filled to the current balance. Edit any line for a partial receipt.</span>
        </div>
        ${lines.length ? `
          <div class="sc">
            <table class="compact-table receive-table">
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th>DESCRIPTION</th>
                  <th class="n">ORDERED</th>
                  <th class="n">RECEIVED</th>
                  <th class="n">BALANCE</th>
                  <th class="n">RECEIVE NOW</th>
                </tr>
              </thead>
              <tbody>
                ${lines.map((line) => {
                  const balance = openUnitsForLine(line);
                  return `
                    <tr>
                      <td class="mono">${esc(line.itemId || '—')}</td>
                      <td>${esc(line.description || '—')}</td>
                      <td class="n">${formatNumber(line.ordered)}</td>
                      <td class="n">${formatNumber(receivedUnitsForLine(line))}</td>
                      <td class="n">${formatNumber(balance)}</td>
                      <td class="n">
                        <input class="qty-input" type="number" min="0" max="${balance}" step="1" value="${balance}" data-receive-line="${line.id}">
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="row" style="margin-top:12px">
            <span class="sub">After confirmation, a remaining balance appears in Follow-ups — either as an already-planned remainder or as “At risk — not fully planned”.</span>
            <button class="p" data-action="confirm-receive">Confirm simulated receipt</button>
          </div>` : '<div class="sub">This PO has no open lines.</div>'}
      </div>`;
  }

  function confirmReceive() {
    const receipt = receiptRows.find((row) => String(row.id) === String(state.receiveReceiptId));
    if (!receipt || !receipt.poRef) return;

    const quantities = {};
    document.querySelectorAll('[data-receive-line]').forEach((input) => {
      const lineId = Number(input.dataset.receiveLine);
      const line = lineById.get(lineId);
      if (!line) return;
      const max = openUnitsForLine(line);
      const quantity = Math.max(0, Math.min(max, Number(input.value) || 0));
      if (quantity > 0) {
        quantities[lineId] = quantity;
        state.simulatedLineQty[lineId] = (state.simulatedLineQty[lineId] || 0) + quantity;
      }
    });

    state.simulatedReceipts[receipt.id] = {
      receivedDate: AS_OF,
      quantities,
    };

    clearSummaryCache();
    const summary = getPoSummary(receipt.poRef);
    state.receiveReceiptId = '';
    render();
    showToast(
      `Simulated receipt ${receipt.invoiceNo} confirmed. ${summary.status === 'Unshipped balance'
        ? 'Remaining balance is now an open balance with no shipment.'
        : 'Balances updated in this session.'}`
    );
  }

  /* =========================================================================
     9b. Receipt import (simulated)
     ========================================================================= */

  function importSampleDocuments() {
    const groups = new Map();

    receiptRows.forEach((receipt) => {
      if (!receipt.matchPo || !receipt.poRef || receipt.invalid) return;
      const saved = state.importPreviews[receipt.groupKey];
      if (isReceiptReceived(receipt) && !(saved && saved.applied)) return;

      if (!groups.has(receipt.groupKey)) {
        groups.set(receipt.groupKey, {
          key: receipt.groupKey,
          label: receipt.groupLabel,
          isContainer: Boolean(receipt.containerId),
          receipts: [],
        });
      }
      groups.get(receipt.groupKey).receipts.push(receipt);
    });

    const documents = [];
    groups.forEach((group) => {
      const pos = Array.from(new Set(group.receipts.map((receipt) => receipt.matchPo)))
        .map((poNumber) => poById.get(poNumber))
        .filter(Boolean);
      if (pos.length < 4 || pos.length > 6) return;

      const openLines = pos.reduce(
        (sum, po) => sum + po.lines.filter((line) => !line.isCheckData && openUnitsForLine(line) > 0).length,
        0
      );
      const posWithOpen = pos.filter(
        (po) => po.lines.some((line) => !line.isCheckData && openUnitsForLine(line) > 0)
      ).length;
      const openUnits = pos.reduce(
        (sum, po) => sum + po.lines.reduce(
          (lineSum, line) => lineSum + (line.isCheckData ? 0 : openUnitsForLine(line)),
          0
        ),
        0
      );
      const clearsOpenReceipts = pos.filter((po) => {
        if (!po.lines.some((line) => !line.isCheckData && openUnitsForLine(line) > 0)) return false;
        const openReceipts = po.receipts.filter(
          (receipt) => !receipt.invalid && !isReceiptReceived(receipt)
        );
        return openReceipts.length > 0 && openReceipts.every((receipt) => receipt.groupKey === group.key);
      }).length;
      const saved = state.importPreviews[group.key];
      if (openLines > 30) return;
      if (openLines < 4 && !(saved && saved.applied)) return;
      if (openLines <= 0 && !(saved && saved.applied)) return;

      documents.push({
        key: group.key,
        label: group.label,
        isContainer: group.isContainer,
        receipts: group.receipts,
        pos,
        openLines,
        openUnits,
        posWithOpen,
        clearsOpenReceipts,
      });
    });

    documents.sort((a, b) =>
      b.clearsOpenReceipts - a.clearsOpenReceipts ||
      b.posWithOpen - a.posWithOpen ||
      b.openUnits - a.openUnits ||
      b.openLines - a.openLines ||
      b.pos.length - a.pos.length ||
      a.label.localeCompare(b.label)
    );

    return documents;
  }

  function sampleImportQty(line) {
    const open = openUnitsForLine(line);
    if (open <= 0) return 0;

    const carton = line.boxQty > 0 ? line.boxQty : 1;
    let qty = Math.floor((open * 0.7) / carton) * carton;
    if (qty <= 0) qty = Math.min(open, carton);
    qty = Math.max(1, Math.min(open, qty));
    return qty;
  }

  function buildImportPreview(document) {
    const rows = document.pos.map((po) => {
      const receipts = document.receipts.filter((receipt) => receipt.matchPo === po.po);
      const entries = po.lines
        .filter((line) => !line.isCheckData)
        .map((line) => {
          const before = openUnitsForLine(line);
          const qty = sampleImportQty(line);
          return { line, qty, before, after: Math.max(0, before - qty) };
        })
        .filter((entry) => entry.qty > 0);

      const beforeUnits = entries.reduce((sum, entry) => sum + entry.before, 0);
      const units = entries.reduce((sum, entry) => sum + entry.qty, 0);

      return {
        po,
        receipts,
        entries,
        beforeUnits,
        units,
        afterUnits: Math.max(0, beforeUnits - units),
      };
    }).sort((a, b) => a.po.po.localeCompare(b.po.po));

    const vendors = Array.from(new Set(rows.map((row) => row.po.vendorId).filter(Boolean))).sort();

    return {
      key: document.key,
      label: document.label,
      isContainer: document.isContainer,
      receipts: document.receipts,
      receiptCount: document.receipts.length,
      pos: rows,
      poCount: rows.length,
      vendors,
      totalLines: rows.reduce((sum, row) => sum + row.entries.length, 0),
      totalUnits: rows.reduce((sum, row) => sum + row.units, 0),
      applied: false,
    };
  }

  function getImportPreview(documents) {
    const stored = state.importGroupKey ? state.importPreviews[state.importGroupKey] : null;
    if (stored && stored.applied) return stored;

    let document = documents.find((row) => row.key === state.importGroupKey);
    if (!document && state.importPreview) {
      document = documents.find((row) => row.key === state.importPreview.key);
    }
    if (!document) document = documents[0];
    if (!document) return null;

    const preview = buildImportPreview(document);
    state.importGroupKey = preview.key;
    state.importPreview = preview;
    state.importPreviews[preview.key] = preview;
    return preview;
  }

  function applyImport() {
    const preview = state.importPreview;
    if (!preview || preview.applied) return;

    preview.pos.forEach((row) => {
      const quantities = {};
      row.entries.forEach((entry) => {
        if (entry.qty <= 0) return;
        state.simulatedLineQty[entry.line.id] = (state.simulatedLineQty[entry.line.id] || 0) + entry.qty;
        quantities[entry.line.id] = entry.qty;
      });
      row.receipts.forEach((receipt) => {
        state.simulatedReceipts[receipt.id] = {
          receivedDate: AS_OF,
          quantities,
        };
      });
    });

    preview.applied = true;
    state.importPreviews[preview.key] = preview;
    clearSummaryCache();
    render();
    showToast(
      `Sample packing list applied — ${formatNumber(preview.totalUnits)} units across ${formatNumber(preview.poCount)} POs. Remaining balances are now tracked in this session.`
    );
  }

  function renderImport() {
    const documents = importSampleDocuments();
    const preview = getImportPreview(documents);

    const header = renderHeader(
      'Import packing list (simulated)',
      `Read one packing list and match every PO in the document at once. The sample uses real container/tracking groups and real PO lines; quantities are generated for the demo. Data as of ${AS_OF_LABEL}.`,
      renderTag('wn', 'Simulated import')
    );

    const intro = `
      <div class="card note">
        <b>The receipt export has no line quantities.</b>
        This page takes a real container/tracking group, generates sample shipped quantities for its open PO lines, previews the result for every PO in one table, then applies the quantities to this browser session. Nothing is uploaded, and nothing is written back to the CSV or Odoo.
      </div>`;

    if (!preview) {
      return `
        ${header}
        ${intro}
        <div class="card sub">No container/tracking group with 4–6 matched POs and at least 4 open lines was found. The sample import needs those conditions to show a multi-PO document.</div>`;
    }

    const options = documents.map((document) => {
      const savedPreview = state.importPreviews[document.key];
      const documentName = `${document.isContainer ? 'Container' : 'Tracking'} ${document.label} · ${document.pos.length} POs`;
      return {
        key: document.key,
        label: savedPreview && savedPreview.applied
          ? `${documentName} · applied`
          : `${documentName} · ${formatNumber(document.openLines)} open lines · ${formatNumber(document.openUnits)} units`,
      };
    });
    if (!options.some((option) => option.key === preview.key)) {
      options.unshift({
        key: preview.key,
        label: `${preview.isContainer ? 'Container' : 'Tracking'} ${preview.label} · ${formatNumber(preview.poCount)} POs · applied`,
      });
    }

    const rows = preview.pos.map((row) => {
      const summary = getPoSummary(row.po);
      const matchType = row.receipts[0] ? row.receipts[0].matchType || '—' : '—';
      const afterRisk = preview.applied && row.afterUnits > 0 && poIsAtRisk(row.po, summary);
      return `
        <tr>
          <td><a href="#orders" data-action="openpo:${attr(row.po.po)}"><b>${esc(row.po.po)}</b></a></td>
          <td>${esc(row.po.vendorId || '—')}</td>
          <td class="n">${formatNumber(row.entries.length)}</td>
          <td class="n"><b>${formatNumber(row.units)}</b></td>
          <td class="n">${formatNumber(row.beforeUnits)}</td>
          <td class="n">${row.afterUnits > 0 ? `<span class="late">${formatNumber(row.afterUnits)}</span>` : '0'}</td>
          <td>${esc(matchType)}</td>
          <td>${row.entries.length ? `${renderStatusTag(summary.status)}${afterRisk ? ` ${renderTag('bad', 'At risk')}` : ''}` : renderTag('', 'No open balance')}</td>
        </tr>`;
    }).join('');

    const lineRows = preview.pos.flatMap((row) =>
      row.entries.map((entry) => `
        <tr>
          <td class="mono">${esc(row.po.po)}</td>
          <td class="mono">${esc(entry.line.itemId || '—')}</td>
          <td>${esc(entry.line.description || '—')}</td>
          <td class="n"><b>${formatNumber(entry.qty)}</b></td>
          <td class="n">${formatNumber(entry.before)}</td>
          <td class="n">${formatNumber(entry.after)}</td>
        </tr>`)
    ).join('');

    return `
      ${header}
      ${intro}

      <div class="card">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1 1 320px">
            <label class="field-label" for="import-document">Sample packing list</label>
            <select id="import-document" style="width:100%">
              ${options.map((option) => `<option value="${attr(option.key)}"${option.key === preview.key ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}
            </select>
            <div class="sub" style="margin-top:6px">All vendors and segments are shown so the document stays whole; the global filters do not apply on this page. Receipt documents are not split by PO/FOB segment.</div>
          </div>
          ${preview.applied ? renderTag('ok', 'Applied in this session') : renderTag('wn', 'Ready to apply')}
        </div>

        <div class="detail-grid" style="margin-top:14px">
          <div><div class="sub">Document</div><div class="mono">${esc(preview.label)}</div></div>
          <div><div class="sub">Type</div><div>${preview.isContainer ? 'Container' : 'Tracking number'}</div></div>
          <div><div class="sub">Receipts</div><div>${formatNumber(preview.receiptCount)}</div></div>
          <div><div class="sub">POs in document</div><div><b>${formatNumber(preview.poCount)}</b></div></div>
          <div><div class="sub">Vendors</div><div>${esc(preview.vendors.join(', ') || '—')}</div></div>
          <div><div class="sub">Lines on this list</div><div>${formatNumber(preview.totalLines)}</div></div>
          <div><div class="sub">Units on this list</div><div><b>${formatNumber(preview.totalUnits)}</b></div></div>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <h2>Result for every PO in the document</h2>
            <div class="sub">Every matched PO appears once, including POs with no open balance.</div>
          </div>
          <span class="sub">${formatNumber(preview.totalLines)} lines · ${formatNumber(preview.totalUnits)} units</span>
        </div>
        <div class="sc" style="margin-top:10px">
          <table>
            <thead>
              <tr>
                <th>PO</th>
                <th>VENDOR</th>
                <th class="n">LINES</th>
                <th class="n">THIS LIST</th>
                <th class="n">BALANCE BEFORE</th>
                <th class="n" title="Expected balance after applying this list">BALANCE AFTER</th>
                <th>MATCH</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="row" style="margin-top:12px">
          <span class="sub">Applying updates PO balances in this session only. A real import would validate the file, match every PO, then post the receipt.</span>
          <button class="p" data-action="apply-import"${preview.applied ? ' disabled' : ''}>${preview.applied ? 'Applied' : 'Apply sample import'}</button>
        </div>
      </div>

      ${preview.applied ? `
        <div class="card row" style="justify-content:flex-start">
          <span class="sub">The remaining balances are now tracked. Open the Planner to plan Import remainders, or Follow-ups to see the automatic at-risk flag.</span>
          <button class="s" data-action="go:planner">Open Planner</button>
          <button class="s" data-action="go:followup">Open Follow-ups</button>
        </div>` : ''}

      ${preview.totalLines ? `
        <div class="card">
          <div class="row">
            <h2>Packing list lines</h2>
            <span class="sub">Sample quantities generated for the demo</span>
          </div>
          <div class="sc" style="margin-top:10px">
            <table>
              <thead>
                <tr>
                  <th>PO</th>
                  <th>ITEM</th>
                  <th>DESCRIPTION</th>
                  <th class="n">QTY ON LIST</th>
                  <th class="n">BALANCE BEFORE</th>
                  <th class="n">BALANCE AFTER</th>
                </tr>
              </thead>
              <tbody>${lineRows}</tbody>
            </table>
          </div>
        </div>` : ''}
    `;
  }

  /* =========================================================================
     10. Planner (concept)
     ========================================================================= */

  function plannerItems() {
    const items = [];

    poById.forEach((po) => {
      // Plan any open Import balance that is not already covered by an open
      // receipt. This deliberately includes partially received POs: their
      // remainder is exactly the balance that gets forgotten.
      if (po.segment !== 'import') return;
      if (poHasOpenReceipt(po)) return;
      if (!poMatchesGlobal(po)) return;

      po.lines.forEach((line) => {
        const remaining = plannerRemaining(line);
        if (remaining <= 0) return;
        items.push({ line, po, remaining });
      });
    });

    items.sort((a, b) => {
      const poCompare = a.po.po.localeCompare(b.po.po);
      return poCompare || a.line.itemId.localeCompare(b.line.itemId);
    });

    return items;
  }

  function syncPlannerAssigned() {
    const assigned = {};
    state.plannerContainers.forEach((container) => {
      if (!containerIsEditable(container)) return;
      container.assignments.forEach((assignment) => {
        assigned[assignment.lineId] = (assigned[assignment.lineId] || 0) + assignment.units;
      });
    });
    state.plannerAssigned = assigned;
  }

  function plannerRemaining(line) {
    return Math.max(
      0,
      openUnitsForLine(line) - (state.plannerAssigned[line.id] || 0) - shippedUnitsForLine(line)
    );
  }

  function plannerUsedCbm(container) {
    return container.assignments.reduce((sum, assignment) => sum + (assignment.cbm || 0), 0);
  }

  function plannerMissingCbm(container) {
    return container.assignments.filter((assignment) => assignment.cbm == null).length;
  }

  function addPlannerContainer(type) {
    const key = CONTAINER_TYPES[type] ? type : '40HC';
    const sequence = state.plannerContainerSequence + 1;
    state.plannerContainerSequence = sequence;
    state.plannerContainers.push({
      id: `C-${sequence}`,
      type: key,
      capacity: CONTAINER_TYPES[key].capacity,
      status: 'draft',
      sailingDate: '',
      port: '',
      arrivedDate: '',
      assignments: [],
    });
    render();
    showToast(`${key} container C-${sequence} created (${CONTAINER_TYPES[key].capacity} CBM assumption).`);
  }

  function removePlannerContainer(containerId) {
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!container) return;
    if (!containerIsEditable(container)) {
      showToast(`${container.id} is ${CONTAINER_STATUSES[containerStatusKey(container)].label.toLowerCase()} and locked.`);
      return;
    }
    state.plannerContainers = state.plannerContainers.filter((row) => row.id !== containerId);
    syncPlannerAssigned();
    render();
  }

  function unassignPlanner(containerId, lineId, assignmentIndex) {
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!container) return;
    if (!containerIsEditable(container)) {
      showToast(`${container.id} is ${CONTAINER_STATUSES[containerStatusKey(container)].label.toLowerCase()} and locked.`);
      return;
    }
    const index = Number(assignmentIndex);
    const assignment = container.assignments[index];
    if (!assignment) return;
    container.assignments.splice(index, 1);
    syncPlannerAssigned();
    render();
  }

  function clearPlanner() {
    const removable = state.plannerContainers.filter((container) => containerIsEditable(container));
    if (!removable.length) {
      showToast('No draft or booked planning to clear.');
      return;
    }
    const removedBlocks = removable.reduce((sum, container) => sum + container.assignments.length, 0);
    state.plannerContainers = state.plannerContainers.filter((container) => !containerIsEditable(container));
    state.plannerSelectedLineId = null;
    syncPlannerAssigned();
    render();
    showToast(
      `Cleared ${formatNumber(removedBlocks)} draft/booked block${removedBlocks === 1 ? '' : 's'}. ` +
      'Shipped and arrived containers were kept.'
    );
  }

  function updateContainerFieldFromEvent(event) {
    const dataset = event.target.dataset || {};
    const containerId = dataset.containerSailing || dataset.containerPort;
    if (!containerId) return false;
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (container) {
      if (dataset.containerSailing) container.sailingDate = event.target.value;
      if (dataset.containerPort) container.port = event.target.value;
    }
    return true;
  }

  function syncContainerFieldsFromDom(containerId) {
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!container) return null;
    const sailing = document.querySelector(`[data-container-sailing="${containerId}"]`);
    if (sailing) container.sailingDate = sailing.value;
    const port = document.querySelector(`[data-container-port="${containerId}"]`);
    if (port) container.port = port.value;
    return container;
  }

  function markContainerBooked(containerId) {
    const container = syncContainerFieldsFromDom(containerId);
    if (!container) return;
    const statusKey = containerStatusKey(container);
    if (!containerIsEditable(container)) {
      showToast(`${container.id} is already ${CONTAINER_STATUSES[statusKey].label.toLowerCase()}.`);
      return;
    }
    if (!container.assignments.length) {
      showToast('Add at least one block before booking this container.');
      return;
    }
    if (statusKey === 'booked') {
      showToast(`${container.id} is already booked.`);
      return;
    }
    container.status = 'booked';
    render();
    showToast(`${container.id} marked booked${container.sailingDate ? ` · sailing ${formatDate(container.sailingDate)}` : ''}.`);
  }

  function markContainerShipped(containerId) {
    const container = syncContainerFieldsFromDom(containerId);
    if (!container) return;
    const statusKey = containerStatusKey(container);
    if (statusKey === 'shipped' || statusKey === 'arrived') {
      showToast(`${container.id} is already ${CONTAINER_STATUSES[statusKey].label.toLowerCase()}.`);
      return;
    }
    if (!container.assignments.length) {
      showToast('Add at least one block before shipping this container.');
      return;
    }
    if (!container.sailingDate) container.sailingDate = AS_OF;
    container.status = 'shipped';
    syncPlannerAssigned();
    clearSummaryCache();
    render();
    const units = containerUnits(container);
    showToast(
      `${container.id} marked shipped — ${formatNumber(units)} units moved to In transit` +
      `${container.sailingDate ? ` (sailing ${formatDate(container.sailingDate)})` : ''}.`
    );
  }

  function markContainerArrived(containerId) {
    const container = syncContainerFieldsFromDom(containerId);
    if (!container) return;
    const statusKey = containerStatusKey(container);
    if (statusKey !== 'shipped') {
      showToast('Mark the container as shipped before marking it arrived.');
      return;
    }
    if (!container.assignments.length) {
      showToast('This container has no blocked units to receive.');
      return;
    }
    const units = containerUnits(container);
    container.status = 'arrived';
    container.arrivedDate = AS_OF;
    container.assignments.forEach((assignment) => {
      state.simulatedLineQty[assignment.lineId] =
        (state.simulatedLineQty[assignment.lineId] || 0) + assignment.units;
    });
    syncPlannerAssigned();
    clearSummaryCache();
    render();
    showToast(
      `${container.id} marked arrived — ${formatNumber(units)} units added to received balances in this session.`
    );
  }

  function requestedBlockUnits(lineId) {
    const input = document.querySelector(`[data-block-qty="${lineId}"]`);
    const value = input ? Number(input.value) : null;
    return value && value > 0 ? value : null;
  }

  function planLine(lineId, containerId, requestedUnits = null) {
    const line = lineById.get(Number(lineId));
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!line || !container) return;

    if (!containerIsEditable(container)) {
      showToast(`${container.id} is ${CONTAINER_STATUSES[containerStatusKey(container)].label.toLowerCase()} and locked.`);
      return;
    }

    const remaining = plannerRemaining(line);
    if (remaining <= 0) {
      showToast('This line is already fully planned or shipped.');
      return;
    }

    const carton = line.boxQty > 0 ? line.boxQty : 1;
    const cbmPerUnit = line.cbm > 0 && line.ordered > 0 ? line.cbm / line.ordered : null;
    let units = requestedUnits != null && requestedUnits > 0 ? Math.min(remaining, requestedUnits) : remaining;

    if (cbmPerUnit != null) {
      const availableCbm = Math.max(0, container.capacity - plannerUsedCbm(container));
      const maxUnits = Math.floor(availableCbm / cbmPerUnit);
      units = Math.min(units, maxUnits);
    }

    const requested = units;
    const snapped = Math.floor(units / carton) * carton;
    if (snapped > 0) {
      units = snapped;
    } else if (remaining < carton && requested === remaining) {
      // A final balance smaller than one carton can be planned as a partial
      // block; otherwise a sub-carton remainder would be impossible to plan.
      units = remaining;
    } else {
      units = 0;
    }

    if (units <= 0) {
      const capacityUnits = cbmPerUnit == null
        ? null
        : Math.floor(Math.max(0, container.capacity - plannerUsedCbm(container)) / cbmPerUnit);
      const cbmLimited = capacityUnits != null && capacityUnits < carton;
      showToast(
        cbmLimited
          ? `Not enough CBM left in ${container.id} for this block.`
          : `Block qty must be at least one full carton (${formatNumber(carton)} units).`
      );
      return;
    }

    const cbm = cbmPerUnit == null ? null : units * cbmPerUnit;
    const blockNumber = state.plannerContainers
      .flatMap((row) => row.assignments)
      .filter((assignment) => assignment.lineId === line.id).length + 1;
    container.assignments.push({ lineId: line.id, units, cbm, carton, block: `B${blockNumber}` });
    syncPlannerAssigned();
    state.plannerSelectedLineId = null;
    render();
    showToast(`${formatNumber(units)} units of ${line.itemId} planned into ${container.id} as block B${blockNumber}${cbm == null ? ' — CBM missing' : ''}.`);
  }

  function renderPlannerLine(item) {
    const { line, remaining } = item;
    const carton = line.boxQty > 0 ? line.boxQty : 1;
    const cbm = line.cbm > 0 && line.ordered > 0 ? line.cbm * (remaining / line.ordered) : null;
    const selected = Number(state.plannerSelectedLineId) === line.id;
    const tags = [];

    if (line.cbm <= 0) tags.push(renderTag('bad', 'CBM missing', 'This line cannot be counted in the container fill.'));
    if (line.boxQty <= 0) tags.push(renderTag('wn', 'Box qty missing', 'Carton snapping falls back to one unit.'));
    if (line.boxQty > 0 && remaining < carton) tags.push(renderTag('wn', 'Final partial carton', 'The remaining balance is smaller than one carton; it can be planned as a partial block.'));
    if (line.isCheckData) tags.push(renderTag('bad', 'Check data'));

    return `
      <div
        class="blk${selected ? ' sel' : ''}"
        draggable="true"
        data-planner-line="${line.id}"
        title="Drag into a container, or tap to select then tap a container"
      >
        <b class="mono">${esc(line.itemId || '—')}</b> · ${esc(line.description || '—')}
        <div class="sub">
          ${formatNumber(remaining)} u remaining · ${formatNumber(Math.floor(remaining / carton))} carton${Math.floor(remaining / carton) === 1 ? '' : 's'} ·
          ${cbm == null ? 'CBM missing' : formatCbm(cbm)}
        </div>
        ${tags.length ? `<div>${tags.join(' ')}</div>` : ''}
        <div class="block-split">
          <span class="sub">Block qty</span>
          <input
            class="qty-input block-qty"
            type="number"
            min="1"
            max="${remaining}"
            step="1"
            value="${remaining}"
            data-block-qty="${line.id}"
            title="Set a smaller quantity to split this line across containers"
          >
        </div>
      </div>`;
  }

  function renderPlanner() {
    const items = plannerItems();
    const byPo = new Map();
    items.forEach((item) => {
      if (!byPo.has(item.po.po)) byPo.set(item.po.po, { po: item.po, items: [] });
      byPo.get(item.po.po).items.push(item);
    });

    const missingCbmAssignments = state.plannerContainers
      .reduce((sum, container) => sum + plannerMissingCbm(container), 0);

    const typeOptions = Object.entries(CONTAINER_TYPES)
      .map(([key, value]) => `<option value="${key}">${value.label} · ${value.capacity} CBM</option>`)
      .join('');

    const blockLabels = new Map();
    const blockCounts = new Map();
    state.plannerContainers.forEach((container) => {
      container.assignments.forEach((assignment, index) => {
        const number = (blockCounts.get(assignment.lineId) || 0) + 1;
        blockCounts.set(assignment.lineId, number);
        blockLabels.set(`${container.id}:${index}`, `B${number}`);
      });
    });

    const plannedUnits = state.plannerContainers
      .filter((container) => containerIsEditable(container))
      .reduce((sum, container) => sum + containerUnits(container), 0);
    const plannedBlocks = state.plannerContainers
      .filter((container) => containerIsEditable(container))
      .reduce((sum, container) => sum + container.assignments.length, 0);
    const shippedUnits = state.plannerContainers
      .filter((container) => containerStatusKey(container) === 'shipped')
      .reduce((sum, container) => sum + containerUnits(container), 0);
    const shippedBlocks = state.plannerContainers
      .filter((container) => containerStatusKey(container) === 'shipped')
      .reduce((sum, container) => sum + container.assignments.length, 0);
    const arrivedUnits = state.plannerContainers
      .filter((container) => containerStatusKey(container) === 'arrived')
      .reduce((sum, container) => sum + containerUnits(container), 0);
    const statusCounts = Object.keys(CONTAINER_STATUSES).reduce((counts, key) => {
      counts[key] = state.plannerContainers.filter((container) => containerStatusKey(container) === key).length;
      return counts;
    }, {});
    const remainingUnits = items.reduce((sum, item) => sum + item.remaining, 0);

    return `
      ${renderHeader(
        'Planner (concept)',
        `Open Import balances that are not covered by an open receipt — including remainders of partly received POs. Plans live only in this browser session. Data as of ${AS_OF_LABEL}.`,
        renderTag('wn', 'Concept')
      )}

      <div class="card banner">
        <b>Concept: planning data does not exist in today’s systems. Plans live only in this session.</b>
        <div class="sub">Container types and capacities are assumptions: 40HC 68 CBM, 40ST 58 CBM, 20GP 28 CBM. They are not in the CSV exports. Set a smaller <b>Block qty</b> before assigning to split one PO line across containers. Set a sailing date and port, then <b>Mark as shipped</b> to move assigned units into In transit. <b>Mark arrived</b> adds them to received balances in this session.</div>
      </div>

      <div class="card row" style="justify-content:flex-start">
        <select id="planner-container-type">${typeOptions}</select>
        <button class="p" data-action="add-container">Add container</button>
        ${statusCounts.draft + statusCounts.booked ? `<button class="s" data-action="clear-plan" title="Removes draft and booked containers only. Shipped and arrived containers stay.">Clear draft/booked</button>` : ''}
        <span class="sub">${formatNumber(items.length)} open line${items.length === 1 ? '' : 's'} awaiting a plan</span>
        <span class="sub">${formatNumber(plannedBlocks)} active block${plannedBlocks === 1 ? '' : 's'} · ${formatNumber(plannedUnits)} units planned · ${formatNumber(shippedBlocks)} shipped block${shippedBlocks === 1 ? '' : 's'} (${formatNumber(shippedUnits)} units) · ${formatNumber(arrivedUnits)} units arrived · ${formatNumber(remainingUnits)} units still unplanned</span>
        <span class="sub">Containers: ${formatNumber(statusCounts.draft)} draft · ${formatNumber(statusCounts.booked)} booked · ${formatNumber(statusCounts.shipped)} shipped · ${formatNumber(statusCounts.arrived)} arrived</span>
        ${missingCbmAssignments ? renderTag('bad', `${missingCbmAssignments} assigned line${missingCbmAssignments === 1 ? '' : 's'} with CBM missing`, 'The fill bar excludes CBM-missing assignments.') : ''}
      </div>

      <div class="cols">
        <div class="card">
          <h2>Unplanned Import lines (${formatNumber(items.length)})</h2>
          <div class="zone big" data-planner-zone="">
            ${Array.from(byPo.values()).map((group) => `
              <div class="gh">${esc(group.po.po)} · ${esc(group.po.vendorId || '—')}</div>
              ${group.items.map(renderPlannerLine).join('')}
            `).join('') || '<div class="sub">No open Import balances without an open receipt in this filter.</div>'}
          </div>
        </div>

        <div class="ctns">
          ${state.plannerContainers.map((container) => {
            const used = plannerUsedCbm(container);
            const fill = (used / container.capacity) * 100;
            const missing = plannerMissingCbm(container);
            const statusKey = containerStatusKey(container);
            const status = CONTAINER_STATUSES[statusKey];
            const editable = containerIsEditable(container);
            const units = containerUnits(container);
            const hasBlocks = container.assignments.length > 0;
            const locked = !editable || fill > 100;
            const sailingLabel = container.sailingDate ? formatDate(container.sailingDate) : '';
            const portLabel = container.port ? esc(container.port) : '';
            const statusNote = statusKey === 'draft'
              ? 'Draft — not booked yet.'
              : statusKey === 'booked'
                ? `Booked${sailingLabel ? ` · sailing ${sailingLabel}` : ''}${portLabel ? ` · ${portLabel}` : ''} — waiting to sail.`
                : statusKey === 'shipped'
                  ? `Shipped${sailingLabel ? ` · sailing ${sailingLabel}` : ''}${portLabel ? ` · ${portLabel}` : ''} — units are in transit.`
                  : `Arrived${container.arrivedDate ? ` ${formatDate(container.arrivedDate)}` : ''}${portLabel ? ` · ${portLabel}` : ''} — units added to received balances.`;
            return `
              <div class="card">
                <div class="row">
                  <div><b>${esc(container.id)} · ${esc(container.type)}</b> ${renderTag(status.variant, status.label)}</div>
                  <div class="container-actions">
                    ${statusKey === 'draft' ? `<button class="s" data-action="book-container:${attr(container.id)}"${hasBlocks ? '' : ' disabled'} title="Mark this container as booked. Units stay planned.">Mark booked</button>` : ''}
                    ${statusKey === 'draft' || statusKey === 'booked' ? `<button class="p" data-action="ship-container:${attr(container.id)}"${hasBlocks ? '' : ' disabled'} title="Move this container's planned units into In transit.">Mark as shipped</button>` : ''}
                    ${statusKey === 'shipped' ? `<button class="p" data-action="arrive-container:${attr(container.id)}" title="Add this container's units to received balances in this session.">Mark arrived</button>` : ''}
                    ${editable ? `<button class="s" data-action="remove-container:${attr(container.id)}" title="Remove this draft or booked container.">Remove</button>` : ''}
                  </div>
                </div>
                <div class="sub">${formatCbm(used)} of ${container.capacity} CBM · ${formatNumber(units)} units</div>
                <div class="container-meta">
                  <label>
                    <span class="field-label">Sailing date</span>
                    <input type="date" data-container-sailing="${attr(container.id)}" value="${attr(container.sailingDate || '')}">
                  </label>
                  <label>
                    <span class="field-label">Port</span>
                    <input type="text" data-container-port="${attr(container.id)}" value="${attr(container.port || '')}" placeholder="e.g. Los Angeles">
                  </label>
                </div>
                <div class="sub container-note">${statusNote}</div>
                <div class="bar">
                  <i class="${fill > 100 ? 'r' : ''}" style="width:${Math.min(100, fill)}%"></i>
                </div>
                <div class="sub">
                  ${fill.toFixed(1)}% full${fill > 100 ? ' · OVER CAPACITY' : ''}
                  ${missing ? ` · ${missing} CBM-missing assignment${missing === 1 ? '' : 's'}` : ''}
                </div>
                <div class="zone${locked ? ' lock' : ''}" data-planner-zone="${attr(container.id)}">
                  ${container.assignments.map((assignment, index) => {
                    const line = lineById.get(assignment.lineId);
                    const block = blockLabels.get(`${container.id}:${index}`) || 'B1';
                    return `
                      <div class="blk l2">
                        ${renderTag('', block)} <b class="mono">${esc(line ? line.itemId : '—')}</b>
                        ${line && line.poRef ? `<span class="sub">· ${esc(line.poRef.po)}</span>` : ''}
                        · ${formatNumber(assignment.units)} u
                        · ${assignment.cbm == null ? 'CBM missing' : formatCbm(assignment.cbm)}
                        ${editable ? `<button class="s" data-action="unassign:${attr(container.id)}:${assignment.lineId}:${index}">Remove</button>` : ''}
                      </div>`;
                  }).join('') || `<div class="sub">${editable ? 'Drop lines here, or tap a line then tap this container.' : 'No blocks on this container.'}</div>`}
                  ${editable && container.assignments.length ? '<div class="sub">Drop more lines here, or tap a line then tap this container.</div>' : ''}
                  ${!editable ? `<div class="sub">${statusKey === 'shipped' ? 'Locked — assigned units are in transit.' : 'Locked — assigned units have arrived.'}</div>` : ''}
                </div>
              </div>`;
          }).join('') || '<div class="card sub">No containers yet. Add one to start planning.</div>'}
        </div>
      </div>

      <div class="card sub">
        Plans are not saved and are not sent to any system. Container statuses, sailing dates and ports are session-only simulations. Quantities snap down to whole cartons using BoxQty, except a final balance smaller than one carton, which can be planned as a partial block. ${formatNumber(HEALTH.cartonMultiple.ok)} of ${formatNumber(HEALTH.cartonMultiple.total)} Import lines are exact carton multiples, ${formatNumber(HEALTH.cartonMultiple.missingBoxQty)} have no BoxQty, and ${formatNumber(HEALTH.cartonMultiple.total - HEALTH.cartonMultiple.ok - HEALTH.cartonMultiple.missingBoxQty)} are not exact multiples. Planned quantities reduce the red <b>Unplanned</b> balances on Purchase orders. Marking a container shipped moves its units from Planned to In transit; marking it arrived adds them to Received.
      </div>`;
  }

  /* =========================================================================
     11. Follow-ups
     ========================================================================= */

  function followUpBuckets() {
    const rows = dashboardOrders();
    const buckets = {
      unplanned: [],
      nothing: [],
      overdue: [],
      old: [],
      unmatched: [],
    };

    rows.forEach((row) => {
      const { po, summary } = row;
      const atRisk = poIsAtRisk(po, summary);
      const hasOpenReceipt = poHasOpenReceipt(po);
      const shipped = shippedUnitsForPo(po);
      const planned = plannedUnitsForPo(po);
      if (atRisk) buckets.unplanned.push(row);
      if (
        summary.balance > 0
        && !hasOpenReceipt
        && !atRisk
        && planned > 0
        && summary.balance > shipped
      ) {
        buckets.nothing.push(row);
      }
      if (summary.status === 'Overdue') buckets.overdue.push(row);
      if (summary.status === 'Not shipped yet' && summary.old) buckets.old.push(row);
    });

    // Unmatched receipts have no PO and therefore no FOB segment. They are a
    // data-quality category, not an Import/Other planning list, so show them in
    // every segment (vendor search still applies).
    buckets.unmatched = receiptRows
      .filter((receipt) => !receipt.matchPo && !receipt.invalid)
      .filter((receipt) => !state.vendorFilter || receipt.vendorId === state.vendorFilter);

    return buckets;
  }

  function followUpTotal(buckets) {
    const poKeys = new Set();
    ['unplanned', 'nothing', 'overdue', 'old'].forEach((key) => {
      buckets[key].forEach((row) => poKeys.add(row.po.po));
    });
    return poKeys.size + buckets.unmatched.length;
  }

  function groupByVendor(rows) {
    const grouped = new Map();
    rows.forEach(({ po, summary }) => {
      const key = po.vendorId || '(blank)';
      if (!grouped.has(key)) grouped.set(key, { vendor: key, rows: [] });
      grouped.get(key).rows.push({ po, summary });
    });
    return Array.from(grouped.values()).sort((a, b) => a.vendor.localeCompare(b.vendor));
  }

  function renderFollowUpPoTable(rows) {
    return `
      <div class="sc">
        <table>
          <thead>
            <tr>
              <th>PO</th>
              <th>BUYER</th>
              <th class="n">OPEN LINES</th>
              <th class="n">OPEN VALUE</th>
              <th class="n">BALANCE</th>
              <th class="n">PLANNED</th>
              <th class="n">UNPLANNED</th>
              <th>ETA</th>
              <th class="n">DAYS LATE</th>
              <th class="n">PO AGE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ po, summary }) => {
              const late = summary.nextEta ? daysLate(summary.nextEta) : null;
              const hasOpenReceipt = poHasOpenReceipt(po);
              const shipped = shippedUnitsForPo(po);
              const planned = Math.max(0, Math.min(plannedUnitsForPo(po), summary.balance - shipped));
              const unplanned = unplannedUnitsForPo(po);
              return `
                <tr>
                  <td><b>${esc(po.po)}</b>${summary.old ? ` ${renderTag('wn', 'Old')}` : ''}${shipped > 0 ? ` ${renderTag('info', 'In container', 'Some or all open units are on a container marked Shipped.')}` : ''}</td>
                  <td title="${attr(purchaserTitle(po.purchaser))}">${esc(po.buyer || '—')}</td>
                  <td class="n">${formatNumber(summary.openLines)}</td>
                  <td class="n">${formatValue(summary.openValue)}</td>
                  <td class="n">${formatNumber(summary.balance)}</td>
                  <td class="n">${planned ? formatNumber(planned) : '—'}</td>
                  <td class="n">${hasOpenReceipt ? '<span class="sub" title="Covered by an open receipt">In transit</span>' : unplanned > 0 ? `<span class="late">${formatNumber(unplanned)}</span>` : '0'}</td>
                  <td>${summary.nextEta ? `${formatDate(summary.nextEta)}<br><span class="sub">${esc(relativeEta(summary.nextEta))}</span>` : '—'}</td>
                  <td class="n">${late != null && late > 0 ? renderTag('bad', late) : '—'}</td>
                  <td class="n">${summary.ageDays == null ? '—' : formatNumber(summary.ageDays)}</td>
                  <td>${renderStatusTag(summary.status)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderFollowUpCategory(title, description, groups, renderGroup) {
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    return `
      <div class="card">
        <div class="row">
          <div>
            <h2>${esc(title)}</h2>
            <div class="sub">${description}</div>
          </div>
          <span class="sub">${formatNumber(total)} item${total === 1 ? '' : 's'}</span>
        </div>
        ${groups.length ? groups.map(renderGroup).join('') : '<div class="sub" style="margin-top:10px">Nothing in this category.</div>'}
      </div>`;
  }

  function renderReminderLog() {
    if (!state.reminders.length) return '';
    return `
      <div class="card">
        <div class="row">
          <div>
            <h2>Reminder log</h2>
            <div class="sub">Prototype actions recorded in this browser session. No email is actually sent.</div>
          </div>
          <button class="s" data-action="clear-reminders">Clear log</button>
        </div>
        <div class="sc" style="margin-top:10px">
          <table style="min-width:480px">
            <thead>
              <tr>
                <th>VENDOR</th>
                <th class="n">ITEMS</th>
                <th>CHANNEL</th>
                <th>TIME</th>
              </tr>
            </thead>
            <tbody>
              ${state.reminders.map((reminder) => `
                <tr>
                  <td><b>${esc(reminder.vendor)}</b></td>
                  <td class="n">${formatNumber(reminder.count)}</td>
                  <td>${esc(reminder.channel)}</td>
                  <td>${esc(reminder.time)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function renderFollowUps() {
    const buckets = followUpBuckets();
    const unplannedGroups = groupByVendor(buckets.unplanned);
    const nothingGroups = groupByVendor(buckets.nothing);
    const overdueGroups = groupByVendor(buckets.overdue);
    const oldGroups = groupByVendor(buckets.old);

    const unmatchedGroups = new Map();
    buckets.unmatched.forEach((receipt) => {
      const key = receipt.vendorId || '(blank)';
      if (!unmatchedGroups.has(key)) unmatchedGroups.set(key, { vendor: key, rows: [] });
      unmatchedGroups.get(key).rows.push(receipt);
    });
    const unmatched = Array.from(unmatchedGroups.values()).sort((a, b) => a.vendor.localeCompare(b.vendor));

    const renderPoGroup = (group) => `
      <div class="vendor-block">
        <div class="row">
          <h3>${esc(group.vendor)} · ${formatNumber(group.rows.length)} PO${group.rows.length === 1 ? '' : 's'}</h3>
          <button class="s p" data-action="remind:${attr(group.vendor)}:${group.rows.length}">Send reminder</button>
        </div>
        ${renderFollowUpPoTable(group.rows)}
      </div>`;

    const renderUnmatchedGroup = (group) => `
      <div class="vendor-block">
        <div class="row">
          <h3>${esc(group.vendor)} · ${formatNumber(group.rows.length)} unmatched receipt${group.rows.length === 1 ? '' : 's'}</h3>
          <button class="s p" data-action="remind:${attr(group.vendor)}:${group.rows.length}">Send reminder</button>
        </div>
        <div class="sc">
          <table>
            <thead>
              <tr>
                <th>INVOICE</th>
                <th>ETA</th>
                <th>RECEIPT DATE</th>
                <th>TRACKING</th>
                <th>TYPE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${group.rows.map((receipt) => `
                <tr>
                  <td class="mono">${esc(receipt.invoiceNo)}</td>
                  <td>${receipt.etaDate ? `${formatDate(receipt.etaDate)}<br><span class="sub">${esc(relativeEta(receipt.etaDate))}</span>` : '—'}</td>
                  <td>${renderReceiptReceivedDate(receipt)}</td>
                  <td class="mono">${esc(receipt.tracking || '—')}</td>
                  <td>${esc(receipt.type || '—')}</td>
                  <td>${renderReceiptStatusTag(receipt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    const total = followUpTotal(buckets);

    return `
      ${renderHeader(
        'Follow-ups',
        `${formatNumber(total)} unique items in the current filters. Categories overlap; a PO can appear in more than one lens. Unmatched receipts are shown across all segments. Reminders are prototype actions logged in this session.`,
        `<div class="sub">${SEGMENT_LABELS[state.segmentFilter] || 'All segments'}</div>`
      )}

      ${renderReminderLog()}

      ${renderFollowUpCategory(
        '1. At risk — not fully planned',
        'A balance remains, no receipt is still open, and some balance is neither on a shipped container nor assigned to a draft or booked container. This includes POs that never shipped, remainders of partly received POs and remainders of partly shipped containers — the balance nobody is tracking.',
        unplannedGroups,
        renderPoGroup
      )}

      ${renderFollowUpCategory(
        '2. Open balance — already planned',
        'A balance remains and no receipt is still open. The part not already shipped is assigned to a draft or booked container. This is the “waiting for the next container” list.',
        nothingGroups,
        renderPoGroup
      )}

      ${renderFollowUpCategory(
        '3. Past ETA',
        'At least one open receipt has an ETA before the 2 Nov 2026 data date.',
        overdueGroups,
        renderPoGroup
      )}

      ${renderFollowUpCategory(
        '4. Not shipped yet and Old',
        'No receipt at all and the PO is more than 90 days old.',
        oldGroups,
        renderPoGroup
      )}

      ${renderFollowUpCategory(
        '5. Receipts unmatched',
        'Receipts with no exact or suffix-normalised PO match. They are not forced onto a PO and are shown across all segments because they have no PO/FOB segment.',
        unmatched,
        renderUnmatchedGroup
      )}`;
  }

  /* =========================================================================
     12. Application shell
     ========================================================================= */

  const NAVIGATION = [
    ['WORKSPACE', [['home', 'Dashboard']]],
    ['PROCURE', [
      ['orders', 'Purchase orders'],
      ['shipments', 'Shipments'],
      ['planner', 'Planner (concept)'],
    ]],
    ['RECEIVE', [
      ['receive', 'Receive one receipt'],
      ['import', 'Import packing list'],
    ]],
    ['ACT', [['followup', 'Follow-ups']]],
  ];

  function followUpCount() {
    return followUpTotal(followUpBuckets());
  }

  function renderNavigation(currentView) {
    const followUpTotal = followUpCount();
    const groups = NAVIGATION.map(([heading, links]) => `
      <h4>${esc(heading)}</h4>
      ${links.map(([view, label]) => {
        const badge = view === 'followup' && followUpTotal
          ? `<span class="bd">${formatNumber(followUpTotal)}</span>`
          : '';
        return `<a href="#${view}" class="${view === currentView ? 'on' : ''}">${esc(label)}${badge}</a>`;
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

  const VIEWS = {
    home: renderHome,
    orders: renderOrders,
    shipments: renderShipments,
    planner: renderPlanner,
    receive: renderReceive,
    import: renderImport,
    followup: renderFollowUps,
  };

  let toastTimer = null;

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'on';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.className = '';
    }, 2400);
  }

  function currentView() {
    const key = location.hash.slice(1);
    return VIEWS[key] ? key : 'home';
  }

  function setView(view) {
    if (location.hash === `#${view}`) {
      render();
    } else {
      location.hash = view;
    }
  }

  function syncGlobalFilters() {
    const vendor = document.getElementById('vendor-filter');
    const buyer = document.getElementById('buyer-filter');
    const segment = document.getElementById('segment-filter');
    if (vendor) vendor.value = state.vendorFilter;
    if (buyer) buyer.value = state.buyerFilter;
    if (segment) segment.value = state.segmentFilter;
  }

  function render() {
    const viewKey = currentView();

    renderNavigation(viewKey);
    syncGlobalFilters();

    document.getElementById('meta').textContent =
      `Data as of ${AS_OF_LABEL} · ${formatNumber(HEALTH.counts.poHeaders)} POs · ` +
      `${formatNumber(HEALTH.counts.detailLines)} lines · ${formatNumber(HEALTH.counts.receipts)} receipts`;

    main.innerHTML = VIEWS[viewKey]();

    if (viewKey === 'orders') {
      updateOrderTable();
      const statusSelect = document.getElementById('order-status');
      const sortSelect = document.getElementById('order-sort');
      const portSelect = document.getElementById('order-port');
      if (statusSelect) statusSelect.value = state.statusFilter;
      if (sortSelect) sortSelect.value = state.sortBy;
      if (portSelect) portSelect.value = state.portFilter;
    }

    if (viewKey === 'shipments') {
      updateShipmentList();
    }

    if (viewKey === 'planner') bindPlannerDragAndDrop();
  }

  /* =========================================================================
     13. Interaction
     ========================================================================= */

  function bindPlannerDragAndDrop() {
    document.querySelectorAll('[data-planner-line]').forEach((element) => {
      element.ondragstart = (event) => {
        event.dataTransfer.setData('text/plain', element.dataset.plannerLine);
      };
    });

    document.querySelectorAll('[data-planner-zone]').forEach((zone) => {
      zone.ondragover = (event) => {
        event.preventDefault();
        zone.classList.add('hot');
      };
      zone.ondragleave = () => {
        zone.classList.remove('hot');
      };
      zone.ondrop = (event) => {
        event.preventDefault();
        zone.classList.remove('hot');
        const containerId = zone.dataset.plannerZone;
        if (!containerId) return;
        const lineId = Number(event.dataTransfer.getData('text/plain'));
        planLine(lineId, containerId, requestedBlockUnits(lineId));
      };
    });
  }

  function handleAction(action, args) {
    switch (action) {
      case 'go':
        setView(args[0]);
        break;

      case 'openpo': {
        const po = args[0] ? poById.get(args[0]) : null;
        // Shipments shows all receipts, including Other/Domestic POs. If the
        // link points outside the current segment, move to that PO's segment so
        // the explicit navigation never lands on an empty order list.
        if (po && state.segmentFilter !== 'all' && po.segment !== state.segmentFilter) {
          state.segmentFilter = po.segment;
        }
        state.searchQuery = args[0] || '';
        state.statusFilter = '';
        state.portFilter = '';
        state.orderPage = 1;
        state.includeHeaderOnly = true;
        if (args[0]) state.expandedOrders.add(args[0]);
        setView('orders');
        break;
      }

      case 'toggle': {
        const po = args[0];
        if (state.expandedOrders.has(po)) state.expandedOrders.delete(po);
        else state.expandedOrders.add(po);
        updateOrderTable();
        break;
      }

      case 'page':
        state.orderPage = Number(args[0]) || 1;
        updateOrderTable();
        break;

      case 'ship-status': {
        const status = args[0] || '';
        state.shipmentStatus = state.shipmentStatus === status ? '' : status;
        state.shipmentPage = 1;
        updateShipmentList();
        const select = document.getElementById('shipment-status');
        if (select) select.value = state.shipmentStatus;
        break;
      }

      case 'ship-page':
        state.shipmentPage = Number(args[0]) || 1;
        updateShipmentList();
        break;

      case 'toggle-ship-group': {
        const key = args.join(':');
        if (state.expandedShipmentGroups.has(key)) state.expandedShipmentGroups.delete(key);
        else state.expandedShipmentGroups.add(key);
        updateShipmentList();
        break;
      }

      case 'ship-expand-all': {
        const groups = shipmentGroups();
        const start = (state.shipmentPage - 1) * state.shipmentPageSize;
        groups.slice(start, start + state.shipmentPageSize).forEach((group) => {
          state.expandedShipmentGroups.add(group.key);
        });
        updateShipmentList();
        break;
      }

      case 'ship-collapse-all':
        state.expandedShipmentGroups.clear();
        updateShipmentList();
        break;

      case 'status': {
        const status = args.join(':');
        state.statusFilter = state.statusFilter === status ? '' : status;
        state.orderPage = 1;
        updateOrderTable();
        const select = document.getElementById('order-status');
        if (select) select.value = state.statusFilter;
        break;
      }

      case 'sort-dir':
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'add-container':
        addPlannerContainer(document.getElementById('planner-container-type')?.value || '40HC');
        break;

      case 'book-container':
        markContainerBooked(args[0]);
        break;

      case 'ship-container':
        markContainerShipped(args[0]);
        break;

      case 'arrive-container':
        markContainerArrived(args[0]);
        break;

      case 'remove-container':
        removePlannerContainer(args[0]);
        break;

      case 'unassign':
        unassignPlanner(args[0], Number(args[1]), Number(args[2]));
        break;

      case 'clear-plan':
        clearPlanner();
        break;

      case 'confirm-receive':
        confirmReceive();
        break;

      case 'apply-import':
        applyImport();
        break;

      case 'remind': {
        const vendor = args[0] || 'vendor';
        const count = Number(args[1]) || 0;
        state.reminders.unshift({
          vendor,
          count,
          channel: 'Email (mock)',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        render();
        showToast(`Reminder logged for ${vendor} · ${count} item${count === 1 ? '' : 's'} (prototype).`);
        break;
      }

      case 'clear-reminders':
        state.reminders = [];
        render();
        showToast('Reminder log cleared.');
        break;

      default:
        break;
    }
  }

  document.addEventListener('click', (event) => {
    /* Planner: select a line, then tap a container. */
    const plannerLine = event.target.closest('[data-planner-line]');
    if (plannerLine && !event.target.closest('[data-action]') && !event.target.closest('input, select, textarea')) {
      const id = Number(plannerLine.dataset.plannerLine);
      state.plannerSelectedLineId = state.plannerSelectedLineId === id ? null : id;
      render();
      return;
    }

    /* Editing a block quantity also selects that line, without re-rendering
       and losing the value or focus. */
    const blockQtyInput = event.target.closest('[data-block-qty]');
    if (blockQtyInput) {
      const id = Number(blockQtyInput.dataset.blockQty);
      state.plannerSelectedLineId = id;
      document.querySelectorAll('[data-planner-line]').forEach((element) => {
        element.classList.toggle('sel', Number(element.dataset.plannerLine) === id);
      });
      return;
    }

    const plannerZone = event.target.closest('[data-planner-zone]');
    if (plannerZone && state.plannerSelectedLineId !== null && !event.target.closest('[data-action]')) {
      const containerId = plannerZone.dataset.plannerZone;
      if (containerId) {
        planLine(state.plannerSelectedLineId, containerId, requestedBlockUnits(state.plannerSelectedLineId));
        return;
      }
    }

    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const [action, ...args] = actionElement.dataset.action.split(':');
    handleAction(action, args);
  });

  let searchTimer = null;
  let shipmentSearchTimer = null;

  document.addEventListener('input', (event) => {
    if (updateContainerFieldFromEvent(event)) return;

    if (event.target.id === 'order-search') {
      clearTimeout(searchTimer);
      const value = event.target.value;
      searchTimer = setTimeout(() => {
        state.searchQuery = value;
        state.orderPage = 1;
        updateOrderTable();
      }, 200);
      return;
    }

    if (event.target.id !== 'shipment-search') return;
    clearTimeout(shipmentSearchTimer);
    const value = event.target.value;
    shipmentSearchTimer = setTimeout(() => {
      state.shipmentQuery = value;
      state.shipmentPage = 1;
      updateShipmentList();
    }, 200);
  });

  document.addEventListener('change', (event) => {
    if (updateContainerFieldFromEvent(event)) return;

    switch (event.target.id) {
      case 'vendor-filter':
        state.vendorFilter = event.target.value;
        state.orderPage = 1;
        render();
        break;

      case 'buyer-filter':
        state.buyerFilter = event.target.value;
        state.orderPage = 1;
        render();
        break;

      case 'segment-filter':
        state.segmentFilter = event.target.value;
        state.orderPage = 1;
        state.receiveReceiptId = '';
        render();
        break;

      case 'order-status':
        state.statusFilter = event.target.value;
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'order-sort':
        state.sortBy = event.target.value;
        state.sortDir = state.sortBy === 'age' || state.sortBy === 'value' ? 'desc' : 'asc';
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'order-page-size':
        state.orderPageSize = Number(event.target.value) || 50;
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'order-port':
        state.portFilter = event.target.value;
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'include-header-only':
        state.includeHeaderOnly = event.target.checked;
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'shipment-type':
        state.shipmentType = event.target.value;
        state.shipmentPage = 1;
        updateShipmentList();
        break;

      case 'shipment-status':
        state.shipmentStatus = event.target.value;
        state.shipmentPage = 1;
        updateShipmentList();
        break;

      case 'receive-receipt':
        state.receiveReceiptId = event.target.value;
        render();
        break;

      case 'import-document':
        state.importGroupKey = event.target.value;
        state.importPreview = null;
        render();
        break;

      default:
        break;
    }
  });

  /* =========================================================================
     14. Start-up
     ========================================================================= */

  function populateFilters() {
    const vendors = Array.from(new Set(poRows.map((po) => po.vendorId).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));

    const buyers = Array.from(new Set(poRows.map((po) => displayPurchaser(po.purchaser)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));

    document.getElementById('vendor-filter').innerHTML =
      '<option value="">All vendors</option>' +
      vendors.map((vendor) => `<option value="${attr(vendor)}"${state.vendorFilter === vendor ? ' selected' : ''}>${esc(vendor)}</option>`).join('');

    document.getElementById('buyer-filter').innerHTML =
      '<option value="">All buyers</option>' +
      buyers.map((buyer) => `<option value="${attr(buyer)}"${state.buyerFilter === buyer ? ' selected' : ''}>${esc(buyer)}</option>`).join('');

    const segment = document.getElementById('segment-filter');
    segment.innerHTML = `
      <option value="import"${state.segmentFilter === 'import' ? ' selected' : ''}>Import</option>
      <option value="domestic"${state.segmentFilter === 'domestic' ? ' selected' : ''}>Domestic/custom</option>
      <option value="other"${state.segmentFilter === 'other' ? ' selected' : ''}>Other</option>
      <option value="all"${state.segmentFilter === 'all' ? ' selected' : ''}>All segments</option>`;
  }

  window.addEventListener('hashchange', () => {
    state.expandedOrders = new Set(state.expandedOrders);
    render();
  });

  populateFilters();
  render();
})();
