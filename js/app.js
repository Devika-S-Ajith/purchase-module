/**
 * Ariel Purchasing Module — prototype UI
 * ---------------------------------------------------------------------------
 * Data comes from the three CSV exports, pre-processed by
 * scripts/build_data.py into js/data.js.
 *
 * Containers merge planning, real receipt shipments and vendor details. Demo
 * edits are persisted in this browser under a single localStorage key.
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

  const VENDOR_UPDATE_STATUSES = [
    'In production',
    'Ready to ship',
    'Booked',
    'Sailing',
    'Delayed',
    'Arrived',
    'Documents pending',
    'Other',
  ];

  const VENDOR_UPDATE_SOURCES = [
    'Email',
    'WhatsApp',
    'Phone',
    'Vendor portal',
    'Other',
  ];

  const VENDOR_UPDATE_STORAGE_KEY = 'ariel.vendorUpdates.v1';
  const DEMO_STORAGE_KEY = 'ariel.containers.v1';

  const VENDOR_CONFIRMATION_STATUSES = [
    'Not sent',
    'Sent',
    'Confirmed',
    'Changed',
    'Rejected',
  ];

  const RECEIPT_STATUS_LABELS = {
    'Received': 'Received',
    'In transit': 'On the way',
    'Overdue': 'Past ETA',
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

  const WAREHOUSE_LABELS = {
    '1': 'WC',
    '3': '1825',
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

  function todayIso() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
    return renderTag(tagVariantForStatus(status), status === 'Overdue' ? 'Past ETA' : status);
  }

  function wrapperLabel(vendorId) {
    return vendorId || '—';
  }

  function normalizeTracking(value) {
    return String(value || '').trim().replace(/-W$/i, '').toUpperCase();
  }

  function isContainerShaped(value) {
    return /^[A-Z]{4}\d{7}$/.test(normalizeTracking(value));
  }

  function receiptContainerKey(receipt) {
    return normalizeTracking(receipt.tracking) || `R-${receipt.id}`;
  }

  /* =========================================================================
     4. Runtime state and derived model
     ========================================================================= */

  const state = {
    vendorFilter: '',
    buyerFilter: '',
    segmentFilter: 'all',

    searchQuery: '',
    statusFilter: '',
    orderBucketFilter: '',
    orderPage: 1,
    orderPageSize: 50,
    includeHeaderOnly: false,
    portFilter: '',
    expandedOrders: new Set(),

    containersView: 'plan',
    containersQuery: '',
    containersType: '',
    containersStatus: '',
    containersPage: 1,
    containersPageSize: 20,
    expandedContainerGroups: new Set(),
    containersReturnScroll: null,
    lastRenderedDetailId: '',
    shippingLineEdit: '',
    containerDocuments: {},
    vendorDetails: {},
    poConfirmations: {},

    reminders: [],
    followUpOpenCategories: new Set(['unplanned']),
    followUpOpenVendors: new Set(),
    followUpReminderDraft: null,

    vendorUpdates: [],

    plannerContainers: [],
    plannerContainerSequence: 0,
    plannerSelectedLineId: null,
    plannerAssigned: {},
    plannerLineQuery: '',
    plannerPendingAssignment: null,

    simulatedReceipts: {},
    simulatedLineQty: {},
  };

  let summaryCache = new Map();

  function loadVendorUpdates() {
    try {
      const raw = window.localStorage.getItem(VENDOR_UPDATE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((row) => row && typeof row === 'object')
        .map((row, index) => Object.assign({}, row, { id: row.id || `vu-loaded-${index}` }));
    } catch (error) {
      return [];
    }
  }

  function normalizePlannerContainer(raw, index) {
    const id = String(raw && raw.id ? raw.id : `C-${index + 1}`);
    const type = String((raw && raw.type) || '40HC');
    const capacity = Number(raw && raw.capacity) || (CONTAINER_TYPES[type] ? CONTAINER_TYPES[type].capacity : CONTAINER_TYPES['40HC'].capacity);
    const assignments = Array.isArray(raw && raw.assignments) ? raw.assignments : [];

    return {
      id,
      name: String((raw && (raw.name || raw.containerName)) || (id.startsWith('C-') ? `Container ${id.slice(2)}` : id)),
      type,
      capacity,
      status: CONTAINER_STATUSES[raw && raw.status] ? raw.status : 'draft',
      sailingDate: String((raw && raw.sailingDate) || ''),
      port: String((raw && raw.port) || ''),
      etaDate: String((raw && raw.etaDate) || ''),
      arrivedDate: String((raw && raw.arrivedDate) || ''),
      assignments: assignments.map((assignment) => {
        const line = lineById.get(Number(assignment.lineId));
        const units = Math.max(0, Number(assignment.units) || 0);
        const plannedUnits = Math.max(units, Number(assignment.plannedUnits) || units);
        const cbmPerUnit = assignment.cbmPerUnit != null
          ? Number(assignment.cbmPerUnit)
          : (line && line.cbm > 0 && line.ordered > 0 ? line.cbm / line.ordered : null);
        const cbm = assignment.cbm == null
          ? (cbmPerUnit == null ? null : units * cbmPerUnit)
          : Number(assignment.cbm) || 0;
        return {
          lineId: Number(assignment.lineId),
          units,
          plannedUnits,
          cbm,
          cbmPerUnit,
          carton: Number(assignment.carton) || (line && line.boxQty > 0 ? line.boxQty : 1),
          block: String(assignment.block || 'B1'),
        };
      }),
    };
  }

  function loadDemoState() {
    let parsed = null;
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
      parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') return;

    state.plannerContainers = Array.isArray(parsed.plannerContainers)
      ? parsed.plannerContainers.filter((row) => row && typeof row === 'object').map(normalizePlannerContainer)
      : [];
    state.plannerContainerSequence = Math.max(
      Number(parsed.plannerContainerSequence) || 0,
      ...state.plannerContainers.map((container) => {
        const match = /^C-(\d+)$/.exec(container.id);
        return match ? Number(match[1]) : 0;
      }),
      0
    );
    state.simulatedReceipts = parsed.simulatedReceipts && typeof parsed.simulatedReceipts === 'object'
      ? parsed.simulatedReceipts
      : {};
    state.simulatedLineQty = parsed.simulatedLineQty && typeof parsed.simulatedLineQty === 'object'
      ? parsed.simulatedLineQty
      : {};
    state.poConfirmations = parsed.poConfirmations && typeof parsed.poConfirmations === 'object'
      ? parsed.poConfirmations
      : {};
    state.vendorDetails = parsed.vendorDetails && typeof parsed.vendorDetails === 'object'
      ? parsed.vendorDetails
      : {};
    state.containerDocuments = parsed.containerDocuments && typeof parsed.containerDocuments === 'object'
      ? parsed.containerDocuments
      : {};
  }

  function persistDemoState() {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
        version: 1,
        plannerContainers: state.plannerContainers,
        plannerContainerSequence: state.plannerContainerSequence,
        simulatedReceipts: state.simulatedReceipts,
        simulatedLineQty: state.simulatedLineQty,
        poConfirmations: state.poConfirmations,
        vendorDetails: state.vendorDetails,
        containerDocuments: state.containerDocuments,
      }));
    } catch (error) {
      /* The prototype still works in memory when storage is unavailable. */
    }
  }

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
    return summary.balance > 0
      && !poHasOpenReceipt(po)
      && unplannedUnitsForPo(po) > 0
      && (summary.ageDays > 90 || summary.receivedReceipts.length > 0);
  }

  function orderCoverageBucket(po, summary) {
    if (summary.balance <= 0) return 'Received';
    if (poIsAtRisk(po, summary)) return 'At risk';
    if (poHasOpenReceipt(po) || shippedUnitsForPo(po) > 0 || summary.status === 'In transit') return 'In transit';
    if (plannedUnitsForPo(po) > 0) return 'Planned';
    return 'Not yet planned';
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
    const bucket = options.bucket ?? state.orderBucketFilter;
    const port = options.port ?? state.portFilter;

    const rows = [];

    poById.forEach((po) => {
      if (!includeHeaderOnly && po.lines.length === 0) return;
      if (!poMatchesGlobal(po)) return;
      if (port && po.port !== port) return;
      if (query && !poSearchText(po).includes(query)) return;

      const summary = getPoSummary(po);
      if (status && summary.status !== status) return;
      if (bucket === 'Open POs' && summary.balance <= 0) return;
      if (bucket && bucket !== 'Open POs' && orderCoverageBucket(po, summary) !== bucket) return;
      rows.push({ po, summary });
    });

    rows.sort((a, b) => {
      const aEta = a.summary.nextEta;
      const bEta = b.summary.nextEta;
      if (aEta && !bEta) return 1;
      if (!aEta && bEta) return -1;
      if (aEta && bEta && aEta !== bEta) return aEta.localeCompare(bEta);
      return a.po.po.localeCompare(b.po.po);
    });

    return rows;
  }

  function dashboardOrders() {
    return filteredOrders({ includeHeaderOnly: false, status: '', port: '', query: '' });
  }

  /* =========================================================================
     5. Shared render helpers
     ========================================================================= */

  function renderHeader(title, subtitle, extra = '') {
    return `
      <div class="row">
        <div>
          <h1>${esc(title)}</h1>
          ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}
        </div>
        ${extra}
      </div>`;
  }

  function renderWarehouse(receipt) {
    const raw = String(receipt.warehouse || '').trim();
    if (raw) {
      const key = raw.replace(/^(\d+)\.0+$/, '$1');
      const label = WAREHOUSE_LABELS[key] || raw;
      return {
        label,
        title: label === raw
          ? 'WHLocation from export'
          : `WHLocation ${raw} from export (shown as ${label})`,
      };
    }
    if (receipt.tracking && /-W$/i.test(receipt.tracking)) {
      return { label: '1825 (likely)', title: 'Inferred from the -W tracking suffix; WHLocation is blank' };
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
        <a class="mono" href="#containers/${encodeURIComponent(first.id)}" data-action="open-container:${attr(first.id)}">${esc(first.name || first.id)}${extra}</a>
        <span class="sub">· ${history.label}${date}${first.port ? ` · ${esc(first.port)}` : ''}</span>`;
    }
    if (!summary.nextReceipt) return '<span class="sub">No receipt</span>';
    const receipt = summary.nextReceipt;
    const key = receiptContainerKey(receipt);
    const tracking = normalizeTracking(receipt.tracking) || 'No tracking no.';
    const type = receipt.type || '-';
    return `
      <a class="mono" href="#containers/${encodeURIComponent(key)}" data-action="open-container:${attr(key)}">${esc(tracking)}</a>
      <span class="sub">· ${esc(type)} · ${formatNumber(summary.receiptCount)} shipment${summary.receiptCount === 1 ? '' : 's'}</span>`;
  }

  function vendorStats(rows) {
    const vendorMap = new Map();

    rows.forEach(({ po, summary }) => {
      const key = po.vendorId || '(blank)';
      const vendor = vendorMap.get(key) || {
        vendor: key,
        poCount: 0,
        openPos: 0,
        openValue: 0,
        receivedPos: 0,
        needsAction: 0,
        nextEta: '',
      };
      const atRisk = poIsAtRisk(po, summary);
      const received = summary.balance <= 0;

      vendor.poCount += 1;
      if (summary.balance > 0) vendor.openPos += 1;
      vendor.openValue += summary.openValue;
      if (received) vendor.receivedPos += 1;
      if (atRisk || summary.status === 'Overdue' || summary.status === 'Unshipped balance') {
        vendor.needsAction += 1;
      }
      if (summary.nextEta && (!vendor.nextEta || summary.nextEta < vendor.nextEta)) vendor.nextEta = summary.nextEta;
      vendorMap.set(key, vendor);
    });

    return Array.from(vendorMap.values())
      .sort((a, b) => b.openValue - a.openValue || a.vendor.localeCompare(b.vendor));
  }

  /* =========================================================================
     6. Dashboard
     ========================================================================= */

  function renderHome() {
    const rows = dashboardOrders();
    const end14 = addDays(AS_OF, 14);
    const totals = {
      openPos: 0,
      openValue: 0,
      arriving14: 0,
      atRiskPos: 0,
      receivedPos: 0,
      inTransitPos: 0,
      plannedPos: 0,
      notYetPlannedPos: 0,
    };

    rows.forEach(({ po, summary }) => {
      const bucket = orderCoverageBucket(po, summary);

      if (summary.balance > 0) {
        totals.openPos += 1;
        totals.openValue += summary.openValue;
      }
      if (bucket !== 'Received' && summary.nextEta && summary.nextEta >= AS_OF && summary.nextEta <= end14) {
        totals.arriving14 += 1;
      }

      /* Each PO is counted once in the order-coverage split. */
      if (bucket === 'Received') {
        totals.receivedPos += 1;
      } else if (bucket === 'At risk') {
        totals.atRiskPos += 1;
      } else if (bucket === 'In transit') {
        totals.inTransitPos += 1;
      } else if (bucket === 'Planned') {
        totals.plannedPos += 1;
      } else {
        totals.notYetPlannedPos += 1;
      }
    });

    const vendors = vendorStats(rows);
    const topVendors = vendors.slice(0, 8);

    const coverageTotal = rows.length;
    const coveragePct = (value) => (coverageTotal ? (value / coverageTotal) * 100 : 0);
    const coverage = [
      ['Received', totals.receivedPos, '#5b8f4a'],
      ['In transit', totals.inTransitPos, '#3b82c4'],
      ['Planned', totals.plannedPos, '#e0a030'],
      ['Not yet planned', totals.notYetPlannedPos, '#aeb7c2'],
      ['At risk', totals.atRiskPos, '#e5534b'],
    ];
    const notYetPlannedPct = totals.openPos
      ? Math.round((totals.notYetPlannedPos / totals.openPos) * 100)
      : 0;
    const openValueLabel = `$${(totals.openValue / 1e6).toFixed(2)}M open value`;
    const coverageExplanation = 'Each PO is counted once. Received POs are fully received. In transit POs have an open receipt or shipped units. At risk POs have an unplanned balance with no open receipt and are over 90 days old or previously received. Planned POs have their remaining balance in draft/booked containers; all other open POs are not yet planned.';

    return `
      <div class="dashboard">
        <div class="row dashboard-title"><h1>Purchasing dashboard</h1></div>

        <div class="grid home-kpis">
          <button class="card kp" data-action="open-open-orders">
            <b>${formatNumber(totals.openPos)}</b>
            <span class="sub">Open POs</span>
            <span class="sub">${esc(openValueLabel)}</span>
          </button>
          <button class="card kp" data-action="ship-on-way">
            <b>${formatNumber(totals.inTransitPos)}</b>
            <span class="sub">In transit</span>
            <span class="sub">${formatNumber(totals.arriving14)} arriving in 14 days</span>
          </button>
          <button class="card kp${totals.atRiskPos > 0 ? ' hot' : ''}" data-action="go:followup">
            <b>${formatNumber(totals.atRiskPos)}</b>
            <span class="sub">At risk</span>
            <span class="sub">No open receipt · unplanned balance</span>
          </button>
          <button class="card kp neutral" data-action="containers-plan">
            <b>${formatNumber(totals.notYetPlannedPos)}</b>
            <span class="sub">Not yet planned</span>
            <span class="sub">${notYetPlannedPct}% of open POs</span>
          </button>
        </div>

        <section class="card coverage-card">
          <div class="row">
            <h2>Order coverage <span class="info-icon" tabindex="0" title="${attr(coverageExplanation)}" aria-label="Order coverage definition">i</span></h2>
            <span class="sub"><b>${formatNumber(coverageTotal)}</b> POs · <b>${formatNumber(totals.openPos)}</b> open</span>
          </div>
          <div class="pipe" role="img" aria-label="Order coverage split across five PO segments">
            ${coverage.map(([label, value, colour]) => value > 0
              ? `<span style="width:${coveragePct(value)}%;background:${colour}" title="${attr(label)}: ${formatNumber(value)} POs"></span>`
              : '').join('')}
          </div>
          <div class="coverage-legend">
            ${coverage.map(([label, value, colour]) => `
              <span><i style="background:${colour}"></i>${esc(label)} <b>${formatNumber(value)}</b> <span class="sub">${coveragePct(value).toFixed(1)}%</span></span>`).join('')}
          </div>
        </section>

        <section class="card vendors-card">
          <div class="row section-head">
            <h2>Top 8 vendors</h2>
            <button class="s" data-action="vendors-all">View all vendors</button>
          </div>
          <div class="sc">
            <table class="dashboard-table vendors-table">
              <thead><tr><th>Vendor</th><th class="n">Open value</th><th class="n">Received %</th><th class="n">Needs action</th><th>Next ETA</th></tr></thead>
              <tbody>
                ${topVendors.map((vendor) => `
                  <tr>
                    <td><b>${esc(vendor.vendor)}</b></td>
                    <td class="n">$${formatValue(vendor.openValue)}</td>
                    <td class="n">${vendor.poCount ? `${Math.round((vendor.receivedPos / vendor.poCount) * 100)}%` : '—'}</td>
                    <td class="n">${formatNumber(vendor.needsAction)}</td>
                    <td>${vendor.nextEta ? `<b>${formatDate(vendor.nextEta)}</b><span class="sub">${esc(relativeEta(vendor.nextEta))}</span>` : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>`;
  }

  function renderVendors() {
    const rows = filteredOrders({ includeHeaderOnly: false, status: '', port: '', query: '' });
    const vendors = vendorStats(rows);
    const openValue = vendors.reduce((sum, vendor) => sum + vendor.openValue, 0);

    return `
      ${renderHeader(
        'Vendors',
        `All vendors in the current filters. Received % is the share of POs fully received. Data as of ${AS_OF_LABEL}.`,
        `<div class="sub">${formatNumber(vendors.length)} vendors · $${formatValue(openValue)} open value</div>`
      )}

      <section class="card vendors-card">
        <div class="row section-head">
          <h2>All vendors</h2>
          <span class="sub">Select a vendor to open its purchase orders</span>
        </div>
        <div class="sc">
          <table class="dashboard-table vendors-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th class="n">POs</th>
                <th class="n">Open POs</th>
                <th class="n">Open value</th>
                <th class="n">Received %</th>
                <th class="n">Needs action</th>
                <th>Next ETA</th>
              </tr>
            </thead>
            <tbody>
              ${vendors.map((vendor) => `
                <tr${vendor.vendor === '(blank)' ? '' : ` class="lk" data-action="vendor-orders:${attr(vendor.vendor)}"`}>
                  <td><b>${esc(vendor.vendor)}</b></td>
                  <td class="n">${formatNumber(vendor.poCount)}</td>
                  <td class="n">${formatNumber(vendor.openPos)}</td>
                  <td class="n">$${formatValue(vendor.openValue)}</td>
                  <td class="n">${vendor.poCount ? `${Math.round((vendor.receivedPos / vendor.poCount) * 100)}%` : '—'}</td>
                  <td class="n">${formatNumber(vendor.needsAction)}</td>
                  <td>${vendor.nextEta ? `<b>${formatDate(vendor.nextEta)}</b><span class="sub">${esc(relativeEta(vendor.nextEta))}</span>` : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  /* =========================================================================
     7. Purchase orders
     ========================================================================= */

  function orderStatusLabel(status) {
    return status === 'Overdue' ? 'Past ETA' : status;
  }

  function availableOrderStatuses() {
    const present = new Set(filteredOrders({ status: '' }).map(({ summary }) => summary.status));
    if (state.statusFilter && !present.has(state.statusFilter)) state.statusFilter = '';
    return PO_STATUSES.filter((status) => present.has(status));
  }

  function orderStatusOptionsMarkup(statuses) {
    return `<option value="">All statuses</option>${statuses
      .map((status) => `<option value="${attr(status)}"${state.statusFilter === status ? ' selected' : ''}>${esc(orderStatusLabel(status))}</option>`)
      .join('')}`;
  }

  function renderOrders() {
    const portOptions = (DATA.ports || [])
      .map((port) => `<option value="${attr(port)}"${state.portFilter === port ? ' selected' : ''}>${esc(port)}</option>`)
      .join('');

    const statusOptions = orderStatusOptionsMarkup(availableOrderStatuses());

    return `
      ${renderHeader(
        'Purchase orders',
        `Real PO numbers from PurchPO. ETA is the earliest open receipt ETA and is PO-level only. Data as of ${AS_OF_LABEL}.`,
        `<div class="sub">${formatNumber(HEALTH.counts.posWithLines)} POs with lines in export · ${SEGMENT_LABELS[state.segmentFilter] || 'All segments'}</div>`
      )}

      <div class="card row" style="justify-content:flex-start">
        <input
          type="search"
          id="order-search"
          placeholder="Search PO, vendor, item or description"
          value="${attr(state.searchQuery)}"
        >
        <select id="order-status">${statusOptions}</select>
        <select id="order-port">
          <option value="">All ports</option>
          ${portOptions}
        </select>
        <select id="order-page-size">
          <option value="25"${state.orderPageSize === 25 ? ' selected' : ''}>25 / page</option>
          <option value="50"${state.orderPageSize === 50 ? ' selected' : ''}>50 / page</option>
          <option value="100"${state.orderPageSize === 100 ? ' selected' : ''}>100 / page</option>
        </select>
        <label class="check" for="include-header-only">
          <input type="checkbox" id="include-header-only"${state.includeHeaderOnly ? ' checked' : ''}>
          Include header-only POs (${formatNumber(HEALTH.counts.headerOnlyPos)})
        </label>
        ${state.orderBucketFilter ? `
          <span class="row" style="gap:6px">
            <span class="tag info">${esc(state.orderBucketFilter)} filter</span>
            <button class="s" data-action="clear-order-bucket">Clear</button>
          </span>` : ''}
      </div>

      <div class="card" id="order-table"></div>`;
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

  function orderPager(rows, start, pageSize, pages, position = '') {
    const first = rows.length ? start + 1 : 0;
    const last = Math.min(rows.length, start + pageSize);
    return `
      <div class="row order-pager ${attr(position)}">
        <span class="sub">Showing ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(rows.length)} POs · Page ${state.orderPage} of ${pages}</span>
        <span class="row pager-buttons">
          <button class="s" data-action="page:1"${state.orderPage <= 1 ? ' disabled' : ''}>« First</button>
          <button class="s" data-action="page:${state.orderPage - 1}"${state.orderPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
          ${paginationButtons(pages, state.orderPage)}
          <button class="s" data-action="page:${state.orderPage + 1}"${state.orderPage >= pages ? ' disabled' : ''}>Next ›</button>
          <button class="s" data-action="page:${pages}"${state.orderPage >= pages ? ' disabled' : ''}>Last »</button>
        </span>
      </div>`;
  }

  function updateOrderTable(options = {}) {
    const host = document.getElementById('order-table');
    if (!host) return;
    const scrollHost = options.preserveScroll && host.querySelector
      ? host.querySelector('.order-table-scroll')
      : null;
    const previousScroll = scrollHost
      ? { top: scrollHost.scrollTop, left: scrollHost.scrollLeft }
      : null;

    const statusSelect = document.getElementById('order-status');
    if (statusSelect) {
      const statuses = availableOrderStatuses();
      statusSelect.innerHTML = orderStatusOptionsMarkup(statuses);
      statusSelect.value = state.statusFilter;
    }

    const rows = filteredOrders();
    const pageSize = state.orderPageSize;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.orderPage = Math.min(Math.max(1, state.orderPage), pages);
    const start = (state.orderPage - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    host.innerHTML = pageRows.length ? `
      ${orderPager(rows, start, pageSize, pages, 'top')}
      <div class="sc order-table-scroll">
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
              <th>CONTAINERS</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.map(({ po, summary }) => renderOrderRow(po, summary)).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="row" style="margin-bottom:8px">
        <span class="sub">0 POs</span>
        <span class="sub">Page 1 of 1</span>
      </div>
      <div class="sub">No POs match the current filters.</div>`;

    if (previousScroll && host.querySelector) {
      const nextScrollHost = host.querySelector('.order-table-scroll');
      if (nextScrollHost) {
        nextScrollHost.scrollTop = previousScroll.top;
        nextScrollHost.scrollLeft = previousScroll.left;
      }
    }
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
    if (summary.balance > 0 && !hasOpenReceipt && unplanned > 0 && poIsAtRisk(po, summary)) {
      tags.push(renderTag('bad', 'At risk', 'Unplanned open balance on a PO over 90 days old or with a received receipt.'));
    } else if (summary.balance > 0 && !hasOpenReceipt && unplanned > 0) {
      tags.push(renderTag('', 'Not yet planned', 'Young PO balance that is not yet planned for shipment.'));
    } else if (summary.balance > 0 && !hasOpenReceipt && planned > 0 && unplanned <= 0) {
      tags.push(renderTag('ok', 'Planned', 'All remaining open balance is assigned to a Draft or Booked container.'));
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
    const hasOpenReceipt = poHasOpenReceipt(po);

    return `
      <div class="detail">
        ${po.synthetic ? `<div class="note bad-note">PO header missing in PurchPO. Vendor “${esc(po.vendorId || 'unknown')}” was inferred from the PO number; treat these values as incomplete.</div>` : ''}
        <div class="detail-grid">${headerGrid}</div>

        ${renderPoVendorConfirmation(po)}
        ${renderPoContainers(po)}

        <h3>Receipts</h3>
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
                      <td><a class="mono" href="#containers/${encodeURIComponent(receiptContainerKey(receipt))}" data-action="open-container:${attr(receiptContainerKey(receipt))}">${esc(normalizeTracking(receipt.tracking) || 'No tracking no.')}</a>${receipt.containerId ? `<br><span class="sub">Container ${esc(receipt.containerId)}</span>` : ''}</td>
                      <td>${esc(receipt.type || '—')}</td>
                      <td title="${attr(warehouse.title)}">${esc(warehouse.label)}</td>
                      <td>${esc(receipt.matchType || '—')}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">No receipt matched to this PO.</div>'}

        <h3>Lines</h3>
        <div class="row detail-lines-header" style="margin-bottom:8px">
          <div class="sub">
            Received is derived from ordered minus PO balance in this export. Planned is assigned to a draft or booked container. “In container” is on a container marked Shipped. “In transit” also includes open receipts.
          </div>
          ${po.lines.length ? `<span class="sub">${formatNumber(po.lines.length)} lines · all shown; scroll the line table to review.</span>` : ''}
        </div>
        ${po.lines.length ? `
          <div class="sc detail-lines-scroll" tabindex="0" aria-label="Line items for PO ${attr(po.po)}">
            <table class="compact-table detail-lines-table">
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
     10. Container planning
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

  function filterPlannerItems(items) {
    const query = String(state.plannerLineQuery || '').trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [
      item.po.po,
      item.po.vendorId,
      item.line.itemId,
    ].join(' ').toLowerCase().includes(query));
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

  function resolvePlannerContainer(value) {
    const typed = String(value || '').trim();
    if (!typed) return null;

    const direct = Object.keys(CONTAINER_TYPES)
      .find((key) => key.toLowerCase() === typed.toLowerCase());
    if (direct) return { label: direct, capacity: CONTAINER_TYPES[direct].capacity };

    const compact = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const embedded = Object.keys(CONTAINER_TYPES).find((key) => compact.includes(key));
    if (embedded) return { label: typed, capacity: CONTAINER_TYPES[embedded].capacity };

    return { label: typed, capacity: CONTAINER_TYPES['40HC'].capacity };
  }

  function addPlannerContainer(value) {
    const typed = String(value || '').trim();
    const resolved = resolvePlannerContainer(typed);
    if (!resolved) {
      showToast('Type a container (for example 40HC) before adding.');
      document.getElementById('planner-container-type')?.focus();
      return;
    }

    const compact = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const typeKey = Object.keys(CONTAINER_TYPES).find((key) => compact.includes(key)) || '40HC';
    const type = CONTAINER_TYPES[typeKey].label;
    const defaultName = `Container ${state.plannerContainerSequence + 1}`;
    const name = !typed || Object.keys(CONTAINER_TYPES).some((key) => typed.toLowerCase() === key.toLowerCase())
      ? defaultName
      : typed;

    const sequence = state.plannerContainerSequence + 1;
    state.plannerContainerSequence = sequence;
    state.plannerContainers.push({
      id: `C-${sequence}`,
      name,
      type,
      capacity: CONTAINER_TYPES[typeKey].capacity,
      status: 'draft',
      sailingDate: '',
      port: '',
      etaDate: '',
      arrivedDate: '',
      assignments: [],
    });
    clearSummaryCache();
    persistDemoState();
    render();
    showToast(`${name} added (${type}, ${CONTAINER_TYPES[typeKey].capacity} CBM).`);
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
    clearSummaryCache();
    persistDemoState();
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
    clearSummaryCache();
    persistDemoState();
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
    clearSummaryCache();
    persistDemoState();
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
      if (event.type === 'change') {
        clearSummaryCache();
        persistDemoState();
      }
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
    clearSummaryCache();
    persistDemoState();
    render();
    showToast(`${container.name} marked booked${container.sailingDate ? ` · sailing ${formatDate(container.sailingDate)}` : ''}.`);
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
    persistDemoState();
    render();
    const units = containerUnits(container);
    showToast(
      `${container.name} marked shipped - ${formatNumber(units)} units moved to In transit` +
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
    persistDemoState();
    render();
    showToast(
      `${container.name} marked arrived — ${formatNumber(units)} units added to received balances.`
    );
  }

  function requestPlanLine(lineId, containerId) {
    const line = lineById.get(Number(lineId));
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!line || !container) return false;

    if (!containerIsEditable(container)) {
      showToast(`${container.id} is ${CONTAINER_STATUSES[containerStatusKey(container)].label.toLowerCase()} and locked.`);
      return false;
    }

    if (plannerRemaining(line) <= 0) {
      showToast('This line is already fully planned or shipped.');
      return false;
    }

    state.plannerSelectedLineId = null;
    state.plannerPendingAssignment = { lineId: line.id, containerId: container.id };
    render();
    setTimeout(() => {
      const input = document.getElementById('planner-assignment-qty');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
    return true;
  }

  function cancelPlannerAssignment() {
    if (!state.plannerPendingAssignment) return;
    state.plannerPendingAssignment = null;
    render();
  }

  function confirmPlannerAssignment() {
    const pending = state.plannerPendingAssignment;
    if (!pending) return;
    const input = document.getElementById('planner-assignment-qty');
    const requested = Number(input ? input.value : '');
    if (!Number.isFinite(requested) || requested <= 0) {
      showToast('Enter a quantity greater than 0.');
      if (input) input.focus();
      return;
    }
    planLine(pending.lineId, pending.containerId, requested);
  }

  function planLine(lineId, containerId, requestedUnits = null) {
    const line = lineById.get(Number(lineId));
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!line || !container) return false;

    if (!containerIsEditable(container)) {
      showToast(`${container.id} is ${CONTAINER_STATUSES[containerStatusKey(container)].label.toLowerCase()} and locked.`);
      return false;
    }

    const remaining = plannerRemaining(line);
    if (remaining <= 0) {
      showToast('This line is already fully planned or shipped.');
      return false;
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
          : `Quantity must be at least one full carton (${formatNumber(carton)} units).`
      );
      return false;
    }

    const cbm = cbmPerUnit == null ? null : units * cbmPerUnit;
    const blockNumber = state.plannerContainers
      .flatMap((row) => row.assignments)
      .filter((assignment) => assignment.lineId === line.id).length + 1;
    container.assignments.push({
      lineId: line.id,
      units,
      plannedUnits: units,
      cbm,
      cbmPerUnit,
      carton,
      block: `B${blockNumber}`,
    });
    syncPlannerAssigned();
    clearSummaryCache();
    persistDemoState();
    state.plannerSelectedLineId = null;
    state.plannerPendingAssignment = null;
    render();
    showToast(`${formatNumber(units)} units of ${line.itemId} planned into ${container.name || container.id} as block B${blockNumber}${cbm == null ? ' — CBM missing' : ''}.`);
    return true;
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
      </div>`;
  }

  function renderPlannerLineGroups(items) {
    const byPo = new Map();
    items.forEach((item) => {
      if (!byPo.has(item.po.po)) byPo.set(item.po.po, { po: item.po, items: [] });
      byPo.get(item.po.po).items.push(item);
    });

    return Array.from(byPo.values()).map((group) => `
      <div class="gh">${esc(group.po.po)} · ${esc(group.po.vendorId || '—')}</div>
      ${group.items.map(renderPlannerLine).join('')}
    `).join('') || `<div class="sub">${state.plannerLineQuery ? 'No import lines match this search.' : 'No open Import balances without an open receipt in this filter.'}</div>`;
  }

  function updatePlannerLines() {
    const host = document.getElementById('planner-lines-zone');
    if (!host) return;
    const items = filterPlannerItems(plannerItems());
    host.innerHTML = renderPlannerLineGroups(items);
    const count = document.getElementById('planner-lines-count');
    if (count) count.textContent = formatNumber(items.length);
    bindPlannerDragAndDrop();
  }

  function renderPlannerAssignmentDialog() {
    const pending = state.plannerPendingAssignment;
    if (!pending) return '';

    const line = lineById.get(Number(pending.lineId));
    const container = state.plannerContainers.find((row) => row.id === pending.containerId);
    if (!line || !container) return '';

    const remaining = plannerRemaining(line);
    if (remaining <= 0) return '';
    const carton = line.boxQty > 0 ? line.boxQty : 1;

    return `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="planner-assignment-title">
          <div>
            <h2 id="planner-assignment-title">Add quantity</h2>
            <div class="sub">${esc(container.id)} · ${esc(container.type)}</div>
          </div>
          <div class="assignment-summary">
            <b class="mono">${esc(line.itemId || '—')}</b> · ${esc(line.description || '—')}
            <div class="sub">
              ${line.poRef ? `${esc(line.poRef.po)} · ` : ''}${formatNumber(remaining)} units available ·
              carton size ${formatNumber(carton)}
            </div>
          </div>
          <label class="field-label" for="planner-assignment-qty">Quantity to add</label>
          <input
            id="planner-assignment-qty"
            class="qty-input assignment-qty"
            type="number"
            min="1"
            max="${remaining}"
            step="1"
            value="${remaining}"
          >
          <div class="modal-actions">
            <button class="s" data-action="cancel-planner-assignment">Cancel</button>
            <button class="p" data-action="confirm-planner-assignment">Add to container</button>
          </div>
        </div>
      </div>`;
  }

  /* =========================================================================
     10b. Containers
     ========================================================================= */

  function realContainerGroups() {
    const groups = new Map();

    receiptRows.forEach((receipt) => {
      const key = receiptContainerKey(receipt);
      if (!groups.has(key)) {
        const tracking = normalizeTracking(receipt.tracking);
        groups.set(key, {
          key,
          tracking,
          label: tracking || 'No tracking no.',
          isContainer: isContainerShaped(tracking),
          isBlank: !tracking,
          receipts: [],
        });
      }
      groups.get(key).receipts.push(receipt);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aEta = realGroupEta(a) || '9999-12-31';
      const bEta = realGroupEta(b) || '9999-12-31';
      return aEta.localeCompare(bEta) || a.label.localeCompare(b.label);
    });
  }

  function realGroupEta(group) {
    return group.receipts
      .map((receipt) => receipt.etaDate)
      .filter(Boolean)
      .sort()[0] || '';
  }

  function realGroupReceived(group) {
    return group.receipts.length > 0 && group.receipts.every((receipt) => isReceiptReceived(receipt));
  }

  function realGroupStatus(group) {
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

  function realGroupPos(group) {
    return Array.from(new Set(group.receipts.map((receipt) => receipt.matchPo).filter(Boolean)))
      .map((poNumber) => poById.get(poNumber))
      .filter(Boolean);
  }

  function realGroupVendors(group) {
    return Array.from(new Set(group.receipts.map((receipt) => receipt.vendorId).filter(Boolean))).sort();
  }

  function plannerContainerPos(container) {
    const seen = new Set();
    const rows = [];
    container.assignments.forEach((assignment) => {
      const line = lineById.get(assignment.lineId);
      const po = line && line.poRef;
      if (!po || seen.has(po.po)) return;
      seen.add(po.po);
      rows.push(po);
    });
    return rows.sort((a, b) => a.po.localeCompare(b.po));
  }

  function plannerContainerVendors(container) {
    return Array.from(new Set(plannerContainerPos(container).map((po) => po.vendorId).filter(Boolean))).sort();
  }

  function realGroupSearchText(group) {
    return [
      group.key,
      group.label,
      ...group.receipts.flatMap((receipt) => [
        receipt.invoiceNo,
        receipt.matchPo,
        receipt.vendorId,
        receipt.type,
      ]),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function plannerContainerSearchText(container) {
    return [
      container.id,
      container.name,
      container.type,
      container.port,
      ...plannerContainerVendors(container),
      ...plannerContainerPos(container).map((po) => po.po),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function containerViewCounts() {
    const groups = realContainerGroups();
    return {
      plan: state.plannerContainers.filter((container) => containerIsEditable(container)).length,
      water: state.plannerContainers.filter((container) => containerStatusKey(container) === 'shipped').length
        + groups.filter((group) => !group.isBlank && !realGroupReceived(group)).length,
      arrived: state.plannerContainers.filter((container) => containerStatusKey(container) === 'arrived').length
        + groups.filter((group) => !group.isBlank && realGroupReceived(group)).length,
    };
  }

  function containerRecordsForView(view) {
    const rows = [];
    if (view === 'plan') {
      state.plannerContainers
        .filter((container) => containerIsEditable(container))
        .forEach((container) => rows.push({ kind: 'planner', key: container.id, container }));
      return rows;
    }

    state.plannerContainers
      .filter((container) => containerStatusKey(container) === (view === 'arrived' ? 'arrived' : 'shipped'))
      .forEach((container) => rows.push({ kind: 'planner', key: container.id, container }));

    realContainerGroups()
      .filter((group) => !group.isBlank && (view === 'arrived' ? realGroupReceived(group) : !realGroupReceived(group)))
      .forEach((group) => rows.push({ kind: 'real', key: group.key, group }));

    return rows;
  }

  function findContainerRecord(key) {
    const decoded = decodeURIComponent(String(key || ''));
    const container = state.plannerContainers.find((row) => row.id === decoded);
    if (container) return { kind: 'planner', key: container.id, container };
    const normalized = normalizeTracking(decoded);
    const group = realContainerGroups().find((row) =>
      row.key === decoded || row.label === decoded || (normalized && row.tracking === normalized));
    if (group) return { kind: 'real', key: group.key, group };
    return null;
  }

  function containerRecordLabel(record) {
    if (record.kind === 'planner') return record.container.name || record.container.id;
    return record.group.isContainer ? `Container ${record.group.label}` : `Tracking no. ${record.group.label}`;
  }

  function containerRecordHeaderLabel(record) {
    if (record.kind === 'planner') return 'Container ID';
    return record.group.isContainer ? 'Container' : 'Tracking no.';
  }

  function containerRecordType(record) {
    if (record.kind === 'planner') return record.container.type;
    return Array.from(new Set(record.group.receipts.map((receipt) => receipt.type).filter(Boolean))).join(', ') || '—';
  }

  function containerRecordVendors(record) {
    return record.kind === 'planner' ? plannerContainerVendors(record.container) : realGroupVendors(record.group);
  }

  function containerRecordPos(record) {
    return record.kind === 'planner' ? plannerContainerPos(record.container) : realGroupPos(record.group);
  }

  function containerRecordWarehouse(record) {
    if (record.kind === 'planner') return '';
    const receipt = record.group.receipts.find((row) => row.warehouse) || record.group.receipts[0];
    return receipt ? renderWarehouse(receipt).label : '';
  }

  function containerRecordPort(record) {
    if (record.kind === 'planner') return record.container.port || '';
    const ports = Array.from(new Set(containerRecordPos(record)
      .map((po) => po.port || po.fob)
      .filter(Boolean)));
    return ports.join(', ');
  }

  function inferredVendorDetails(record) {
    if (record.kind === 'planner') {
      const container = record.container;
      return {
        tracking: container.name || container.id,
        invoice: '',
        vessel: '',
        etd: container.sailingDate || '',
        eta: container.etaDate || '',
        port: container.port || '',
        warehouse: '',
        cartons: null,
        grossWeight: null,
        cbm: Number(plannerUsedCbm(container).toFixed(2)),
        status: CONTAINER_STATUSES[containerStatusKey(container)].label,
        source: '',
        contact: '',
        notes: '',
      };
    }

    const group = record.group;
    return {
      tracking: group.tracking || '',
      invoice: Array.from(new Set(group.receipts.map((receipt) => receipt.invoiceNo).filter(Boolean))).join(', '),
      vessel: '',
      etd: '',
      eta: realGroupEta(group),
      port: containerRecordPort(record),
      warehouse: containerRecordWarehouse(record),
      cartons: null,
      grossWeight: null,
      cbm: null,
      status: receiptStatusLabel(realGroupStatus(group)),
      source: '',
      contact: '',
      notes: '',
    };
  }

  function vendorDetailsFor(record) {
    const saved = state.vendorDetails[record.key];
    return Object.assign(inferredVendorDetails(record), saved && typeof saved === 'object' ? saved : {});
  }

  function containerNextAction(record) {
    if (record.kind === 'planner') {
      const container = record.container;
      const key = containerStatusKey(container);
      if (key === 'draft') {
        return `<button class="p" data-action="book-container:${attr(container.id)}">Mark booked</button>`;
      }
      if (key === 'booked') {
        return `<button class="p" data-action="confirm-ship-as-planned:${attr(container.id)}">Shipped as planned</button>`;
      }
      if (key === 'shipped') {
        return `<button class="p" data-action="arrive-container:${attr(container.id)}">Mark arrived</button>`;
      }
      return '<span class="tag ok">Arrived</span>';
    }

    if (!realGroupReceived(record.group)) {
      return `<button class="p" data-action="arrive-real:${attr(record.key)}">Mark arrived</button>`;
    }
    return '<span class="tag ok">Arrived</span>';
  }

  function renderContainerStepper(record) {
    const statusKey = record.kind === 'planner'
      ? containerStatusKey(record.container)
      : (realGroupReceived(record.group) ? 'arrived' : 'shipped');
    const current = ['draft', 'booked', 'shipped', 'arrived'].indexOf(statusKey);
    const labels = ['Draft', 'Booked', 'Shipped', 'Arrived'];
    return `
      <div class="container-stepper" aria-label="Container status ${attr(labels[current])}">
        ${labels.map((label, index) => `
          <span class="container-step${index < current ? ' done' : ''}${index === current ? ' current' : ''}">
            <i>${index < current ? '✓' : index + 1}</i>${esc(label)}
          </span>`).join('')}
      </div>`;
  }

  function renderContainerDetailHeader(record) {
    const details = vendorDetailsFor(record);
    const vendors = containerRecordVendors(record);
    const pos = containerRecordPos(record);
    const sailing = details.etd || (record.kind === 'planner' ? record.container.sailingDate : '');
    const trackingTag = record.kind === 'real' && !record.group.isContainer
      ? renderTag('wn', 'LCL / carrier reference', 'This receipt export value is not a standard container number.')
      : '';
    const nameField = record.kind === 'planner'
      ? `
        <label class="container-name-field">
          <span class="field-label">Container ID</span>
          <input type="text" data-container-name="${attr(record.container.id)}" value="${attr(record.container.name)}">
        </label>`
      : `
        <div>
          <div class="sub">${esc(containerRecordHeaderLabel(record))}</div>
          <div class="container-id-value"><b class="mono">${esc(record.group.label)}</b> ${trackingTag}</div>
        </div>`;

    return `
      <div class="container-detail-header">
        <div class="row">
          <div>
            <div class="sub">${record.kind === 'planner' ? 'Planned container' : 'Shipment record'}</div>
            <h2>${esc(containerRecordLabel(record))}</h2>
          </div>
          <div class="row container-detail-actions">
            ${containerNextAction(record)}
            <button class="s" data-action="close-container">Close</button>
          </div>
        </div>

        <div class="detail-grid container-detail-grid">
          <div>${nameField}</div>
          <div><div class="sub">Type</div><div>${esc(containerRecordType(record))}</div></div>
          <div><div class="sub">Vendors</div><div>${formatNumber(vendors.length)}${vendors.length ? `<div class="sub">${esc(vendors.join(', '))}</div>` : ''}</div></div>
          <div><div class="sub">POs</div><div>${formatNumber(pos.length)}${pos.length ? `<div class="sub">${esc(pos.map((po) => po.po).join(', '))}</div>` : ''}</div></div>
          <div><div class="sub">Port</div><div>${esc(details.port || '—')}</div></div>
          <div><div class="sub">Sailing date</div><div>${sailing ? formatDate(sailing) : '—'}</div></div>
          <div><div class="sub">ETA</div><div>${details.eta ? `${formatDate(details.eta)} <span class="sub">${esc(relativeEta(details.eta))}</span>` : '—'}</div></div>
          <div><div class="sub">Warehouse</div><div>${esc(details.warehouse || '—')}</div></div>
        </div>

        ${renderContainerStepper(record)}
      </div>`;
  }

  function plannerAssignmentSummary(container) {
    const rows = new Map();

    container.assignments.forEach((assignment) => {
      const line = lineById.get(assignment.lineId);
      if (!line) return;
      if (!rows.has(line.id)) {
        rows.set(line.id, {
          line,
          po: line.poRef,
          units: 0,
          plannedUnits: 0,
          cbm: 0,
          blocks: [],
        });
      }
      const row = rows.get(line.id);
      row.units += assignment.units;
      row.plannedUnits += assignment.plannedUnits == null ? assignment.units : assignment.plannedUnits;
      row.cbm += assignment.cbm || 0;
      row.blocks.push(assignment.block || 'B1');
    });

    const status = containerStatusKey(container);
    const result = Array.from(rows.values()).map((row) => {
      const open = openUnitsForLine(row.line);
      const balanceAfter = status === 'arrived' ? open : Math.max(0, open - row.units);
      let otherPlanning = plannedUnitsForLine(row.line) + shippedUnitsForLine(row.line);
      if (containerIsEditable(container) || status === 'shipped') otherPlanning -= row.units;
      otherPlanning = Math.max(0, otherPlanning);
      const shortfall = Math.max(0, row.plannedUnits - row.units);
      const unplanned = unplannedUnitsForLine(row.line);
      let resultLabel = 'Not planned';
      let resultVariant = 'wn';
      if (shortfall > 0) {
        resultLabel = `Short by ${formatNumber(shortfall)}`;
        resultVariant = 'bad';
      } else if (balanceAfter <= 0) {
        resultLabel = 'Done';
        resultVariant = 'ok';
      } else if (otherPlanning > 0) {
        resultLabel = 'Balance planned elsewhere';
        resultVariant = 'info';
      }
      return {
        ...row,
        open,
        balanceAfter,
        shortfall,
        unplanned,
        resultLabel,
        resultVariant,
      };
    }).sort((a, b) => {
      const aPo = a.po ? a.po.po : '';
      const bPo = b.po ? b.po.po : '';
      return aPo.localeCompare(bPo) || a.line.itemId.localeCompare(b.line.itemId);
    });

    return {
      rows: result,
      poCount: new Set(result.map((row) => row.po && row.po.po).filter(Boolean)).size,
      lineCount: result.length,
      balanceLeft: result.filter((row) => row.balanceAfter > 0).length,
      notPlanned: result.filter((row) => row.resultLabel === 'Not planned').length,
    };
  }

  function renderShippedLineEditor(container, row) {
    const editKey = `${container.id}:${row.line.id}`;
    if (state.shippingLineEdit !== editKey) return '';
    return `
      <div class="shipped-line-editor">
        <label class="field-label" for="shipped-line-qty">Actually shipped</label>
        <div class="row">
          <input id="shipped-line-qty" class="qty-input" type="number" min="0" max="${row.plannedUnits}" step="1" value="${row.units}" data-shipped-line-input>
          <button class="p s" data-action="save-shipped-line:${attr(container.id)}:${row.line.id}">Save</button>
          <button class="s" data-action="cancel-shipped-line">Cancel</button>
        </div>
        <div class="sub">Planned ${formatNumber(row.plannedUnits)}. Any shortfall returns to the PO as unplanned.</div>
      </div>`;
  }

  function renderPlannerContainerContents(container) {
    const summary = plannerAssignmentSummary(container);
    const statusKey = containerStatusKey(container);
    const canEditShipped = statusKey === 'booked' || statusKey === 'shipped';

    return `
      <section class="container-detail-section">
        <div class="row">
          <div>
            <h3>Contents</h3>
            <div class="sub">${formatNumber(summary.poCount)} POs, ${formatNumber(summary.lineCount)} lines, ${formatNumber(summary.balanceLeft)} with balance left, ${formatNumber(summary.notPlanned)} not planned.</div>
          </div>
          ${statusKey === 'booked' ? '<span class="tag wn">Booked · confirm shipment when ready</span>' : ''}
        </div>
        ${summary.rows.length ? `
          <div class="sc container-contents-scroll">
            <table class="compact-table container-contents-table">
              <thead>
                <tr>
                  <th>VENDOR</th>
                  <th>PO</th>
                  <th>ITEM</th>
                  <th class="n">ORDERED</th>
                  <th class="n">IN THIS CONTAINER</th>
                  <th class="n">BALANCE AFTER</th>
                  <th>RESULT</th>
                </tr>
              </thead>
              <tbody>
                ${summary.rows.map((row) => `
                  <tr>
                    <td>${esc(row.po ? row.po.vendorId || '—' : '—')}</td>
                    <td>${row.po ? `<a href="#orders" data-action="openpo:${attr(row.po.po)}"><b>${esc(row.po.po)}</b></a>` : '—'}</td>
                    <td><span class="mono">${esc(row.line.itemId || '—')}</span><div class="sub">${esc(row.line.description || '—')}</div></td>
                    <td class="n">${formatNumber(row.line.ordered)}</td>
                    <td class="n">
                      <b>${formatNumber(row.units)}</b>
                      ${row.plannedUnits !== row.units ? `<div class="sub">of ${formatNumber(row.plannedUnits)} planned</div>` : ''}
                      ${canEditShipped ? `<button class="link-btn" data-action="edit-shipped-line:${attr(container.id)}:${row.line.id}">Shipped differently</button>` : ''}
                      ${renderShippedLineEditor(container, row)}
                    </td>
                    <td class="n">${formatNumber(row.balanceAfter)}</td>
                    <td>${renderTag(row.resultVariant, row.resultLabel)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">No blocks assigned to this container.</div>'}
        ${statusKey === 'booked' ? `
          <div class="card note container-confirm-note">
            <b>Shipped as planned</b> is the default: confirming does not change quantities. Use “Shipped differently” on a line only if the vendor shipped less.
          </div>` : statusKey === 'shipped' ? `
          <div class="sub">Shipped containers are locked except for “Shipped differently” until this container is marked arrived.</div>` : ''}
      </section>`;
  }

  function renderRealContainerContents(group) {
    const pos = realGroupPos(group);
    const unmatched = group.receipts.filter((receipt) => !receipt.matchPo);

    return `
      <section class="container-detail-section">
        <div class="row">
          <div>
            <h3>Contents</h3>
            <div class="sub">${formatNumber(pos.length)} matched POs, ${formatNumber(group.receipts.length)} vendor shipments. Real shipment contents are not in the export.</div>
          </div>
          ${renderTag('wn', 'Contents are not in the export')}
        </div>

        ${pos.length ? `
          <div class="sc">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>VENDOR</th>
                  <th>PO</th>
                  <th>ITEM</th>
                  <th class="n">ORDERED</th>
                  <th class="n">IN THIS CONTAINER</th>
                  <th class="n">BALANCE AFTER</th>
                  <th>RESULT</th>
                </tr>
              </thead>
              <tbody>
                ${pos.map((po) => {
                  const summary = getPoSummary(po);
                  let label = 'Not planned';
                  let variant = 'wn';
                  if (summary.balance <= 0) {
                    label = 'Done';
                    variant = 'ok';
                  } else if (plannedUnitsForPo(po) > 0 || shippedUnitsForPo(po) > 0) {
                    label = 'Balance planned elsewhere';
                    variant = 'info';
                  }
                  return `
                    <tr>
                      <td>${esc(po.vendorId || '—')}</td>
                      <td><a href="#orders" data-action="openpo:${attr(po.po)}"><b>${esc(po.po)}</b></a></td>
                      <td><span class="sub">Contents are not in the export</span></td>
                      <td class="n">${formatNumber(summary.ordered)}</td>
                      <td class="n"><span class="sub">—</span></td>
                      <td class="n">${formatNumber(summary.balance)}</td>
                      <td>${renderTag(variant, label)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">No receipt in this container matches a PO.</div>'}

        ${unmatched.length ? `
          <div class="unmatched-container-block">
            <h3>No matching PO</h3>
            ${unmatched.map((receipt) => `
              <div class="row">
                <span class="mono">${esc(receipt.invoiceNo || 'Receipt')}</span>
                <span class="sub">${esc(receipt.vendorId || '—')} · ${esc(receipt.type || '—')}</span>
                ${renderReceiptStatusTag(receipt)}
              </div>`).join('')}
          </div>` : ''}

        <div class="sc container-receipts-scroll">
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
              ${group.receipts.map((receipt) => `
                <tr>
                  <td class="mono">${esc(receipt.invoiceNo)}</td>
                  <td>${receipt.matchPo ? `<a href="#orders" data-action="openpo:${attr(receipt.matchPo)}"><b>${esc(receipt.matchPo)}</b></a>` : '<span class="sub">No matching PO</span>'}</td>
                  <td>${esc(receipt.vendorId || '—')}</td>
                  <td>${receipt.etaDate ? `${formatDate(receipt.etaDate)}<div class="sub">${esc(relativeEta(receipt.etaDate))}</div>` : '—'}</td>
                  <td>${renderReceiptReceivedDate(receipt, 'Not yet')}</td>
                  <td>${renderReceiptStatusTag(receipt)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function containerRecordMatchesLegacyUpdate(record, update) {
    const tracking = normalizeTracking(update.tracking);
    if (record.kind === 'planner') {
      if (tracking && (tracking === normalizeTracking(record.container.name) || tracking === normalizeTracking(record.container.id))) {
        return true;
      }
      return Boolean(update.po && plannerContainerPos(record.container).some((po) => po.po === update.po));
    }
    if (tracking && tracking === record.group.tracking) return true;
    return Boolean(update.po && record.group.receipts.some((receipt) => receipt.matchPo === update.po));
  }

  function legacyUpdatesForRecord(record) {
    return state.vendorUpdates.filter((update) => containerRecordMatchesLegacyUpdate(record, update));
  }

  function migrateLegacyVendorUpdates() {
    const records = [
      ...state.plannerContainers.map((container) => ({ kind: 'planner', key: container.id, container })),
      ...realContainerGroups().filter((group) => !group.isBlank).map((group) => ({ kind: 'real', key: group.key, group })),
    ];

    state.vendorUpdates.forEach((update) => {
      const record = records.find((row) => containerRecordMatchesLegacyUpdate(row, update));
      if (!record || state.vendorDetails[record.key]) return;
      state.vendorDetails[record.key] = {
        tracking: update.tracking || '',
        invoice: update.invoice || '',
        vessel: update.vessel || '',
        etd: update.etd || '',
        eta: update.eta || '',
        port: update.port || '',
        warehouse: update.warehouse || '',
        cartons: update.cartons == null ? null : update.cartons,
        grossWeight: update.grossWeight == null ? null : update.grossWeight,
        cbm: update.cbm == null ? null : update.cbm,
        status: update.status || '',
        source: update.source || '',
        contact: update.contact || '',
        notes: update.notes || '',
      };
    });
  }

  function updateFromVendorDetailsForm(form) {
    const key = form.dataset.containerKey;
    const record = findContainerRecord(key);
    if (!record) return;

    const value = (field) => {
      const input = form.querySelector(`[data-vd="${field}"]`);
      return input ? String(input.value || '').trim() : '';
    };
    const number = (field) => {
      const raw = value(field);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const details = {
      tracking: value('tracking'),
      invoice: value('invoice'),
      vessel: value('vessel'),
      etd: value('etd'),
      eta: value('eta'),
      port: value('port'),
      warehouse: value('warehouse'),
      cartons: number('cartons'),
      grossWeight: number('grossWeight'),
      cbm: number('cbm'),
      status: value('status'),
      source: value('source'),
      contact: value('contact'),
      notes: value('notes'),
      updatedAt: todayIso(),
    };

    state.vendorDetails[key] = details;

    if (record.kind === 'planner') {
      record.container.etaDate = details.eta || record.container.etaDate || '';
      record.container.port = details.port || record.container.port || '';
      if (details.etd) record.container.sailingDate = details.etd;
    }

    persistDemoState();
    render();
    showToast(`Vendor details saved for ${containerRecordLabel(record)}.`);
  }

  function renderContainerVendorDetails(record) {
    const details = vendorDetailsFor(record);
    const portOptions = Array.from(new Set([details.port, ...(DATA.ports || [])].filter(Boolean)))
      .map((port) => `<option value="${attr(port)}"${details.port === port ? ' selected' : ''}>${esc(port)}</option>`)
      .join('');
    const statusOptions = VENDOR_UPDATE_STATUSES
      .map((status) => `<option value="${attr(status)}"${details.status === status ? ' selected' : ''}>${esc(status)}</option>`)
      .join('');
    const sourceOptions = VENDOR_UPDATE_SOURCES
      .map((source) => `<option value="${attr(source)}"${details.source === source ? ' selected' : ''}>${esc(source)}</option>`)
      .join('');
    const legacy = legacyUpdatesForRecord(record);

    return `
      <section class="container-detail-section">
        <div class="row">
          <div>
            <h3>Vendor details</h3>
            <div class="sub">Moved from Vendor updates. Saved in this browser for this container.</div>
          </div>
          <span class="tag">${formatNumber(legacy.length)} old update${legacy.length === 1 ? '' : 's'}</span>
        </div>

        <form id="container-vendor-form" class="container-form" data-container-key="${attr(record.key)}">
          <div class="container-form-grid">
            <label class="cf"><span>Tracking / container</span><input data-vd="tracking" type="text" value="${attr(details.tracking || '')}" placeholder="Container or booking ref"></label>
            <label class="cf"><span>Invoice / booking no.</span><input data-vd="invoice" type="text" value="${attr(details.invoice || '')}" placeholder="Vendor invoice or booking no."></label>
            <label class="cf"><span>Vessel / carrier</span><input data-vd="vessel" type="text" value="${attr(details.vessel || '')}" placeholder="Vessel or carrier"></label>
            <label class="cf"><span>Port</span><select data-vd="port"><option value="">Select port…</option>${portOptions}</select></label>
            <label class="cf"><span>ETD</span><input data-vd="etd" type="date" value="${attr(details.etd || '')}"></label>
            <label class="cf"><span>ETA</span><input data-vd="eta" type="date" value="${attr(details.eta || '')}"></label>
            <label class="cf"><span>Warehouse</span><input data-vd="warehouse" type="text" value="${attr(details.warehouse || '')}" placeholder="Destination warehouse"></label>
            <label class="cf"><span>Cartons</span><input data-vd="cartons" type="number" min="0" step="1" value="${details.cartons == null ? '' : attr(details.cartons)}" placeholder="0"></label>
            <label class="cf"><span>Gross weight (kg)</span><input data-vd="grossWeight" type="number" min="0" step="0.01" value="${details.grossWeight == null ? '' : attr(details.grossWeight)}" placeholder="0"></label>
            <label class="cf"><span>CBM</span><input data-vd="cbm" type="number" min="0" step="0.01" value="${details.cbm == null ? '' : attr(details.cbm)}" placeholder="0"></label>
            <label class="cf"><span>Status</span><select data-vd="status"><option value="">Select status…</option>${statusOptions}</select></label>
            <label class="cf"><span>Source</span><select data-vd="source"><option value="">Select source…</option>${sourceOptions}</select></label>
            <label class="cf"><span>Received from</span><input data-vd="contact" type="text" value="${attr(details.contact || '')}" placeholder="Vendor contact name"></label>
          </div>
          <label class="cf"><span>Other details / notes</span><textarea data-vd="notes" rows="3" placeholder="Packaging, documents, delays, partial shipment, other POs in the same container…">${esc(details.notes || '')}</textarea></label>
          <div class="row">
            <span class="sub">Browser-local · ${details.updatedAt ? `saved ${formatDate(details.updatedAt)}` : 'not edited yet'}</span>
            <button class="p" type="submit">Save vendor details</button>
          </div>
        </form>

        ${legacy.length ? `
          <div class="legacy-updates">
            <div class="sub">Carried over from the old Vendor updates store</div>
            ${legacy.map((update) => `
              <div class="legacy-update-row">
                <b>${esc(update.status || 'Update')}</b>
                <span class="sub">${esc(update.tracking || update.po || '—')} · ${esc(update.loggedAt ? formatDate(update.loggedAt) : '—')}</span>
                ${update.notes ? `<div>${esc(update.notes)}</div>` : ''}
              </div>`).join('')}
          </div>` : ''}
      </section>`;
  }

  function renderContainerDocuments(record) {
    const documents = state.containerDocuments[record.key] || [];
    return `
      <section class="container-detail-section">
        <div class="row">
          <div>
            <h3>Documents</h3>
            <div class="sub">Packing list, invoice, booking confirmation. File metadata is kept in this browser only; nothing is uploaded or parsed.</div>
          </div>
        </div>
        <div class="container-doc-input">
          <label class="field-label" for="container-doc-input">Attach file</label>
          <input id="container-doc-input" type="file" multiple data-container-document="${attr(record.key)}">
        </div>
        ${documents.length ? `
          <div class="sc">
            <table class="compact-table container-doc-table">
              <thead><tr><th>FILE</th><th>TYPE</th><th>DATE</th><th></th></tr></thead>
              <tbody>
                ${documents.map((document, index) => `
                  <tr>
                    <td>${esc(document.name)}</td>
                    <td>${esc(document.type || '—')}</td>
                    <td>${formatDate(document.date)}</td>
                    <td class="n"><button class="s" data-action="remove-container-document:${attr(record.key)}:${index}">Remove</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">No documents attached.</div>'}
      </section>`;
  }

  function renderContainerDetail(record) {
    return `
      <button class="container-detail-backdrop" data-action="close-container" aria-label="Close container detail"></button>
      <section class="container-detail" role="dialog" aria-modal="true" aria-labelledby="container-detail-title">
        <div class="container-detail-mobile-bar">
          <button class="s" data-action="close-container">← Back to containers</button>
        </div>
        <div id="container-detail-title">${renderContainerDetailHeader(record)}</div>
        ${record.kind === 'planner'
          ? renderPlannerContainerContents(record.container)
          : renderRealContainerContents(record.group)}
        ${renderContainerVendorDetails(record)}
        ${renderContainerDocuments(record)}
      </section>`;
  }

  function renderContainerSegmentedControl() {
    const counts = containerViewCounts();
    const views = [
      ['plan', 'Plan'],
      ['water', 'In transit'],
      ['arrived', 'Arrived'],
    ];
    return `
      <div class="segmented-control" role="tablist" aria-label="Container views">
        ${views.map(([key, label]) => `
          <button class="${state.containersView === key ? 'on' : ''}" data-action="container-view:${key}" role="tab" aria-selected="${state.containersView === key}">
            ${esc(label)} <span class="seg-count">(${formatNumber(counts[key])})</span>
          </button>`).join('')}
      </div>`;
  }

  function renderPlannerContainerCard(container) {
    const used = plannerUsedCbm(container);
    const fill = (used / container.capacity) * 100;
    const missing = plannerMissingCbm(container);
    const statusKey = containerStatusKey(container);
    const status = CONTAINER_STATUSES[statusKey];
    const editable = containerIsEditable(container);
    const units = containerUnits(container);
    const hasBlocks = container.assignments.length > 0;
    const locked = !editable || fill > 100;
    const blockLabels = new Map();
    const blockCounts = new Map();
    state.plannerContainers.forEach((row) => {
      row.assignments.forEach((assignment, index) => {
        const number = (blockCounts.get(assignment.lineId) || 0) + 1;
        blockCounts.set(assignment.lineId, number);
        blockLabels.set(`${row.id}:${index}`, `B${number}`);
      });
    });

    return `
      <div class="card" data-container-card="${attr(container.id)}">
        <div class="row">
          <div>
            <button class="container-title-btn" data-action="open-container:${attr(container.id)}">
              <b>${esc(container.name)}</b> · ${esc(container.type)}
            </button>
            ${renderTag(status.variant, status.label)}
            ${container.name !== container.id ? `<div class="sub mono">${esc(container.id)}</div>` : ''}
          </div>
          <div class="container-actions">
            <button class="s" data-action="open-container:${attr(container.id)}">Open</button>
            ${statusKey === 'draft' ? `<button class="s" data-action="book-container:${attr(container.id)}"${hasBlocks ? '' : ' disabled'} title="Mark this container as booked. Units stay planned.">Mark booked</button>` : ''}
            ${statusKey === 'draft' || statusKey === 'booked' ? `<button class="p" data-action="ship-container:${attr(container.id)}"${hasBlocks ? '' : ' disabled'} title="Move this container's planned units into In transit.">Mark as shipped</button>` : ''}
            ${statusKey === 'shipped' ? `<button class="p" data-action="arrive-container:${attr(container.id)}" title="Add this container's units to received balances in this session.">Mark arrived</button>` : ''}
            ${editable ? `<button class="s" data-action="remove-container:${attr(container.id)}" title="Remove this draft or booked container.">Remove</button>` : ''}
          </div>
        </div>
        <div class="container-summary">
          <span class="sub">${formatCbm(used)} of ${container.capacity} CBM · ${formatNumber(units)} units</span>
          <div class="container-meta">
            <label>
              <span class="field-label">Sailing</span>
              <input type="date" data-container-sailing="${attr(container.id)}" value="${attr(container.sailingDate || '')}">
            </label>
            <label>
              <span class="field-label">Port</span>
              <input type="text" data-container-port="${attr(container.id)}" value="${attr(container.port || '')}" placeholder="Port">
            </label>
          </div>
        </div>
        <div class="bar">
          <i class="${fill > 100 ? 'r' : ''}" style="width:${Math.min(100, fill)}%"></i>
        </div>
        <div class="sub">
          ${fill.toFixed(1)}% full${fill > 100 ? ' · OVER CAPACITY' : ''}
          ${missing ? ` · ${missing} CBM-missing assignment${missing === 1 ? '' : 's'}` : ''}
        </div>
        <div class="zone container-drop${locked ? ' lock' : ''}" data-planner-zone="${attr(container.id)}">
          ${container.assignments.map((assignment, index) => {
            const line = lineById.get(assignment.lineId);
            const block = blockLabels.get(`${container.id}:${index}`) || assignment.block || 'B1';
            return `
              <div class="blk l2">
                ${renderTag('', block)} <b class="mono">${esc(line ? line.itemId : '—')}</b>
                ${line && line.poRef ? `<span class="sub">· ${esc(line.poRef.po)}</span>` : ''}
                · ${formatNumber(assignment.units)} u
                · ${assignment.cbm == null ? 'CBM missing' : formatCbm(assignment.cbm)}
                ${editable ? `<button class="s" data-action="unassign:${attr(container.id)}:${assignment.lineId}:${index}">Remove</button>` : ''}
              </div>`;
          }).join('') || `<div class="sub">${editable ? 'Drop lines here.' : 'No blocks.'}</div>`}
        </div>
      </div>`;
  }

  function renderContainersPlan() {
    const allItems = plannerItems();
    const items = filterPlannerItems(allItems);
    const containers = state.plannerContainers.filter((container) => containerIsEditable(container));
    const missingCbmAssignments = containers.reduce((sum, container) => sum + plannerMissingCbm(container), 0);
    const typeOptions = Object.entries(CONTAINER_TYPES)
      .map(([key, value]) => `<option value="${key}">${value.label} · ${value.capacity} CBM</option>`)
      .join('');
    const plannedUnits = containers.reduce((sum, container) => sum + containerUnits(container), 0);
    const remainingUnits = allItems.reduce((sum, item) => sum + item.remaining, 0);

    return `
      <div class="card row" style="justify-content:flex-start">
        <input
          id="planner-container-type"
          class="planner-container-input"
          type="text"
          list="planner-container-types"
          placeholder="Container name or type (e.g. 40HC)"
          autocomplete="off"
        >
        <datalist id="planner-container-types">${typeOptions}</datalist>
        <button class="p" data-action="add-container">Add container</button>
        ${containers.length ? `<button class="s" data-action="clear-plan" title="Removes draft and booked containers only. Shipped and arrived containers stay.">Clear draft/booked</button>` : ''}
        <span class="sub">${formatNumber(allItems.length)} open line${allItems.length === 1 ? '' : 's'}</span>
        <span class="sub">${formatNumber(plannedUnits)} units planned · ${formatNumber(remainingUnits)} unplanned</span>
        ${missingCbmAssignments ? renderTag('bad', `${missingCbmAssignments} assigned line${missingCbmAssignments === 1 ? '' : 's'} with CBM missing`, 'The fill bar excludes CBM-missing assignments.') : ''}
      </div>

      <div class="cols">
        <div class="card">
          <h2>Not yet planned and At risk import lines (<span id="planner-lines-count">${formatNumber(items.length)}</span>)</h2>
          <div class="row" style="justify-content:flex-start; margin-bottom:8px">
            <input
              type="search"
              id="planner-line-search"
              placeholder="Search vendor, PO or item ID"
              value="${attr(state.plannerLineQuery)}"
            >
          </div>
          <div class="zone big" id="planner-lines-zone" data-planner-zone="">
            ${renderPlannerLineGroups(items)}
          </div>
        </div>

        <div class="ctns">
          ${containers.map(renderPlannerContainerCard).join('') || '<div class="card sub">No draft or booked containers. Add one to start planning.</div>'}
        </div>
      </div>`;
  }

  function realGroupMatchesStatus(group, status) {
    if (!status) return true;
    return group.receipts.some((receipt) => getReceiptStatus(receipt) === status);
  }

  function filteredContainerRows(view) {
    const query = String(state.containersQuery || '').trim().toLowerCase();
    const type = state.containersType;
    const status = state.containersStatus;

    return containerRecordsForView(view).filter((record) => {
      if (record.kind === 'planner') {
        const container = record.container;
        if (type) return false;
        if (status && !(view === 'water' && status === 'In transit') && !(view === 'arrived' && status === 'Received')) return false;
        if (state.vendorFilter && !plannerContainerVendors(container).includes(state.vendorFilter)) return false;
        if (state.buyerFilter && !plannerContainerPos(container).some((po) => po.buyer === state.buyerFilter)) return false;
        return !query || plannerContainerSearchText(container).includes(query);
      }

      const group = record.group;
      if (type && !group.receipts.some((receipt) => receipt.type === type)) return false;
      if (!realGroupMatchesStatus(group, status)) return false;
      if (state.vendorFilter && !group.receipts.some((receipt) => receipt.vendorId === state.vendorFilter)) return false;
      if (state.buyerFilter && !group.receipts.some((receipt) => receipt.poRef && receipt.poRef.buyer === state.buyerFilter)) return false;
      return !query || realGroupSearchText(group).includes(query);
    });
  }

  function renderRealContainerRow(group) {
    const expanded = state.expandedContainerGroups.has(group.key);
    const vendors = realGroupVendors(group);
    const pos = realGroupPos(group);
    const eta = realGroupEta(group);
    const status = realGroupStatus(group);
    const trackingTag = group.isContainer
      ? ''
      : renderTag('wn', 'LCL / carrier reference', 'This receipt export value is not a standard container number.');
    const shared = group.receipts.length > 1;

    return `
      <div class="ship-group">
        <div class="ship-group-head">
          <button class="ship-group-open" data-action="open-container:${attr(group.key)}">
            <span class="ship-group-name">
              <b>${esc(group.isContainer ? `Container ${group.label}` : `Tracking no. ${group.label}`)}</b>
              ${trackingTag}
              <span class="sub">${formatNumber(group.receipts.length)} vendor shipment${group.receipts.length === 1 ? '' : 's'} · ${formatNumber(pos.length)} PO${pos.length === 1 ? '' : 's'}${vendors.length ? ` · ${esc(vendors.slice(0, 2).join(', '))}${vendors.length > 2 ? ` +${vendors.length - 2}` : ''}` : ''}</span>
            </span>
            <span class="ship-group-eta">${eta ? formatDate(eta) : 'No ETA'}</span>
            ${shared ? renderTag('info', `Shared · ${formatNumber(group.receipts.length)}`) : ''}
            ${renderTag(tagVariantForStatus(status), receiptStatusLabel(status))}
          </button>
          <button class="s ship-expand-btn" data-action="toggle-container-group:${attr(group.key)}" aria-expanded="${expanded}">
            ${expanded ? '▾ Hide shipments' : '▸ Show shipments'}
          </button>
        </div>
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
                ${group.receipts.map((receipt) => `
                  <tr>
                    <td class="mono">${esc(receipt.invoiceNo)}<div class="sub">${esc(receipt.type || '—')}</div></td>
                    <td>${receipt.matchPo ? `<a href="#orders" data-action="openpo:${attr(receipt.matchPo)}"><b>${esc(receipt.matchPo)}</b></a>` : '<span class="sub">No matching PO</span>'}</td>
                    <td>${esc(receipt.vendorId || '—')}</td>
                    <td>${receipt.etaDate ? `${formatDate(receipt.etaDate)}<div class="sub">${esc(relativeEta(receipt.etaDate))}</div>` : '—'}</td>
                    <td>${renderReceiptReceivedDate(receipt, 'Not yet')}</td>
                    <td>${renderReceiptStatusTag(receipt)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>`;
  }

  function renderPlannerContainerRow(container) {
    const statusKey = containerStatusKey(container);
    const status = CONTAINER_STATUSES[statusKey];
    const vendors = plannerContainerVendors(container);
    const pos = plannerContainerPos(container);
    const eta = vendorDetailsFor({ kind: 'planner', key: container.id, container }).eta;
    return `
      <div class="ship-group">
        <div class="ship-group-head">
          <button class="ship-group-open" data-action="open-container:${attr(container.id)}">
            <span class="ship-group-name">
              <b>${esc(container.name)}</b>
              <span class="sub">${esc(container.type)} · ${formatNumber(vendors.length)} vendor${vendors.length === 1 ? '' : 's'} · ${formatNumber(pos.length)} PO${pos.length === 1 ? '' : 's'} · ${formatNumber(containerUnits(container))} units</span>
            </span>
            <span class="ship-group-eta">${eta ? formatDate(eta) : 'No ETA'}</span>
            ${renderTag(status.variant, status.label)}
          </button>
        </div>
      </div>`;
  }

  function renderUntrackedReceipts(view) {
    const query = String(state.containersQuery || '').trim().toLowerCase();
    const groups = realContainerGroups().filter((group) => group.isBlank
      && (view === 'arrived' ? realGroupReceived(group) : !realGroupReceived(group))
      && (!state.containersType || group.receipts.some((receipt) => receipt.type === state.containersType))
      && realGroupMatchesStatus(group, state.containersStatus)
      && (!state.vendorFilter || group.receipts.some((receipt) => receipt.vendorId === state.vendorFilter))
      && (!state.buyerFilter || group.receipts.some((receipt) => receipt.poRef && receipt.poRef.buyer === state.buyerFilter))
      && (!query || realGroupSearchText(group).includes(query)));
    if (!groups.length) return '';

    return `
      <section class="card untracked-receipts">
        <div class="row">
          <div>
            <h2>Receipts without a tracking number</h2>
            <div class="sub">Kept from the receipt export. They are receipts, not containers, so they are excluded from the container counts.</div>
          </div>
          ${renderTag('wn', `${formatNumber(groups.reduce((sum, group) => sum + group.receipts.length, 0))} receipts`)}
        </div>
        <div class="sc">
          <table class="compact-table">
            <thead><tr><th>INVOICE</th><th>PO</th><th>VENDOR</th><th>ETA</th><th>RECEIVED</th><th>STATUS</th></tr></thead>
            <tbody>
              ${groups.flatMap((group) => group.receipts.map((receipt) => `
                <tr>
                  <td class="mono">${esc(receipt.invoiceNo)}<div class="sub">${esc(receipt.type || '—')}</div></td>
                  <td>${receipt.matchPo ? `<a href="#orders" data-action="openpo:${attr(receipt.matchPo)}"><b>${esc(receipt.matchPo)}</b></a>` : '<span class="sub">No matching PO</span>'}</td>
                  <td>${esc(receipt.vendorId || '—')}</td>
                  <td>${receipt.etaDate ? `${formatDate(receipt.etaDate)}<div class="sub">${esc(relativeEta(receipt.etaDate))}</div>` : '—'}</td>
                  <td>${renderReceiptReceivedDate(receipt, 'Not yet')}</td>
                  <td>${renderReceiptStatusTag(receipt)}</td>
                </tr>`)).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderContainersList(view) {
    const allRows = filteredContainerRows(view);
    const pageSize = state.containersPageSize;
    const pages = Math.max(1, Math.ceil(allRows.length / pageSize));
    state.containersPage = Math.min(Math.max(1, state.containersPage), pages);
    const start = (state.containersPage - 1) * pageSize;
    const pageRows = allRows.slice(start, start + pageSize);
    const realOnPage = pageRows.filter((row) => row.kind === 'real');
    const receiptsOnPage = realOnPage.reduce((sum, row) => sum + row.group.receipts.length, 0);
    const shared = allRows.filter((row) => row.kind === 'real' && row.group.receipts.length > 1).length;

    return `
      <div class="row" style="margin-bottom:8px">
        <span class="sub">${formatNumber(allRows.length)} container/tracking row${allRows.length === 1 ? '' : 's'} · ${formatNumber(shared)} shared · ${formatNumber(receiptsOnPage)} vendor shipment${receiptsOnPage === 1 ? '' : 's'} on this page</span>
        <span class="row" style="gap:6px">
          <button class="s" data-action="containers-expand-all"${pageRows.some((row) => row.kind === 'real') ? '' : ' disabled'}>Expand all</button>
          <button class="s" data-action="containers-collapse-all"${state.expandedContainerGroups.size ? '' : ' disabled'}>Collapse all</button>
        </span>
      </div>

      ${pageRows.length ? `
        <div class="ship-groups">
          ${pageRows.map((row) => row.kind === 'planner' ? renderPlannerContainerRow(row.container) : renderRealContainerRow(row.group)).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <span class="sub">Showing ${formatNumber(start + 1)}–${formatNumber(Math.min(allRows.length, start + pageSize))} of ${formatNumber(allRows.length)} rows</span>
          <span class="row" style="gap:6px">
            <button class="s" data-action="containers-page:1"${state.containersPage <= 1 ? ' disabled' : ''}>« First</button>
            <button class="s" data-action="containers-page:${state.containersPage - 1}"${state.containersPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
            ${paginationButtons(pages, state.containersPage, 'containers-page')}
            <button class="s" data-action="containers-page:${state.containersPage + 1}"${state.containersPage >= pages ? ' disabled' : ''}>Next ›</button>
            <button class="s" data-action="containers-page:${pages}"${state.containersPage >= pages ? ' disabled' : ''}>Last »</button>
          </span>
        </div>` : '<div class="card sub">No containers match the current filters.</div>'}
      ${renderUntrackedReceipts(view)}
    `;
  }

  function renderContainersShipments(view) {
    const statusOptions = view === 'arrived'
      ? [['Received', 'Received']]
      : [
        ['In transit', 'On the way'],
        ['Overdue', 'Past ETA'],
        ['No ETA', 'No ETA'],
        ['Unmatched', 'No matching PO'],
        ['Invalid data', 'Invalid data'],
      ];
    const typeOptions = ['ContRec', 'LCL', 'CustCon', 'Internal'];

    return `
      <div class="card row" style="justify-content:flex-start">
        <input type="search" id="containers-search" placeholder="Container, invoice, PO or vendor" value="${attr(state.containersQuery)}" style="min-width:280px">
        <select id="containers-type">
          <option value="">All receipt types</option>
          ${typeOptions.map((type) => `<option value="${attr(type)}"${state.containersType === type ? ' selected' : ''}>${esc(type)}</option>`).join('')}
        </select>
        <select id="containers-status">
          <option value="">All statuses</option>
          ${statusOptions.map(([value, label]) => `<option value="${attr(value)}"${state.containersStatus === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
      </div>
      <div id="containers-list-host">${renderContainersList(view)}</div>`;
  }

  function updateContainersList() {
    const host = document.getElementById('containers-list-host');
    if (!host) return;
    host.innerHTML = renderContainersList(state.containersView);
  }

  function unmatchedLegacyVendorUpdates() {
    const records = [
      ...state.plannerContainers.map((container) => ({ kind: 'planner', key: container.id, container })),
      ...realContainerGroups().filter((group) => !group.isBlank).map((group) => ({ kind: 'real', key: group.key, group })),
    ];
    return state.vendorUpdates.filter((update) =>
      !records.some((record) => containerRecordMatchesLegacyUpdate(record, update)));
  }

  function renderLegacyVendorUpdates() {
    const updates = unmatchedLegacyVendorUpdates();
    if (!updates.length) return '';
    return `
      <details class="card">
        <summary><b>Vendor updates not yet attached to a container</b> <span class="sub">${formatNumber(updates.length)} kept from the old page</span></summary>
        <div class="sc" style="margin-top:10px">
          <table class="compact-table">
            <thead><tr><th>PO</th><th>TRACKING</th><th>STATUS</th><th>NOTES</th><th>LOGGED</th></tr></thead>
            <tbody>
              ${updates.map((update) => `
                <tr>
                  <td>${esc(update.po || '—')}</td>
                  <td class="mono">${esc(update.tracking || '—')}</td>
                  <td>${esc(update.status || '—')}</td>
                  <td>${esc(update.notes || '—')}</td>
                  <td>${update.loggedAt ? formatDate(update.loggedAt) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>`;
  }

  function renderContainers() {
    const detailId = currentContainerDetailId();
    const record = detailId ? findContainerRecord(detailId) : null;
    if (detailId && record) {
      state.containersView = record.kind === 'real'
        ? (realGroupReceived(record.group) ? 'arrived' : 'water')
        : (containerStatusKey(record.container) === 'arrived'
          ? 'arrived'
          : containerStatusKey(record.container) === 'shipped' ? 'water' : 'plan');
    }
    const detailMarkup = detailId
      ? (record
        ? renderContainerDetail(record)
        : `<section class="container-detail"><div class="container-detail-mobile-bar"><button class="s" data-action="close-container">← Back to containers</button></div><div class="card">Container “${esc(detailId)}” was not found. <button class="s" data-action="close-container">Back to containers</button></div></section>`)
      : '';

    let body;
    if (state.containersView === 'plan') body = renderContainersPlan();
    else body = renderContainersShipments(state.containersView);

    return `
      ${renderHeader(
        'Containers',
        `The container is the source of truth: contents come from planning, and real shipment balances come from the PO export. Data as of ${AS_OF_LABEL}.`,
        `<div class="row"><span class="sub">Browser-local demo data</span><button class="s" data-action="reset-demo">Reset demo data</button></div>`
      )}
      ${renderContainerSegmentedControl()}
      <div class="containers-page${detailId ? ' has-detail' : ''}">
        ${body}
        ${renderLegacyVendorUpdates()}
      </div>
      ${detailMarkup}
      ${state.containersView === 'plan' ? renderPlannerAssignmentDialog() : ''}`;
  }

  function confirmContainerShipping(containerId) {
    const container = syncContainerFieldsFromDom(containerId);
    if (!container) return;
    if (containerStatusKey(container) !== 'booked') {
      showToast('Confirm shipment is available on booked containers.');
      return;
    }
    if (!container.assignments.length) {
      showToast('Add at least one block before confirming this shipment.');
      return;
    }
    if (!container.sailingDate) container.sailingDate = AS_OF;
    container.status = 'shipped';
    state.shippingLineEdit = '';
    syncPlannerAssigned();
    clearSummaryCache();
    persistDemoState();
    render();
    showToast(`${container.name} shipped as planned — no quantities changed.`);
  }

  function editShippedLine(containerId, lineId) {
    const container = state.plannerContainers.find((row) => row.id === containerId);
    if (!container) return;
    const status = containerStatusKey(container);
    if (status !== 'booked' && status !== 'shipped') {
      showToast('Shipped differently is only available before arrival.');
      return;
    }
    state.shippingLineEdit = `${containerId}:${Number(lineId)}`;
    const scrollY = window.scrollY;
    render();
    window.scrollTo({ top: scrollY });
    setTimeout(() => {
      const input = document.querySelector('[data-shipped-line-input]');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function saveShippedLine(containerId, lineId) {
    const container = state.plannerContainers.find((row) => row.id === containerId);
    const lineNumber = Number(lineId);
    if (!container) return;
    const status = containerStatusKey(container);
    if (status !== 'booked' && status !== 'shipped') {
      showToast('Shipped differently is only available before arrival.');
      return;
    }
    const assignmentRows = container.assignments.filter((assignment) => assignment.lineId === lineNumber);
    if (!assignmentRows.length) return;
    const input = document.querySelector('[data-shipped-line-input]');
    const requested = Number(input ? input.value : '');
    if (!Number.isFinite(requested) || requested < 0) {
      showToast('Enter a shipped quantity of 0 or more.');
      if (input) input.focus();
      return;
    }
    const planned = assignmentRows.reduce((sum, assignment) => sum + (assignment.plannedUnits == null ? assignment.units : assignment.plannedUnits), 0);
    const actual = Math.min(planned, Math.floor(requested));
    let remaining = actual;
    assignmentRows.forEach((assignment) => {
      assignment.plannedUnits = assignment.plannedUnits == null ? assignment.units : assignment.plannedUnits;
      const nextUnits = Math.min(remaining, assignment.plannedUnits);
      assignment.units = nextUnits;
      remaining -= nextUnits;
      if (assignment.cbmPerUnit != null) assignment.cbm = nextUnits * assignment.cbmPerUnit;
    });
    state.shippingLineEdit = '';
    syncPlannerAssigned();
    clearSummaryCache();
    persistDemoState();
    const line = lineById.get(lineNumber);
    render();
    showToast(`${line ? line.itemId : 'Line'} updated to ${formatNumber(actual)} shipped${planned > actual ? ` · short by ${formatNumber(planned - actual)}` : ''}.`);
  }

  function markRealContainerArrived(groupKey) {
    const group = realContainerGroups().find((row) => row.key === groupKey);
    if (!group) return;
    let marked = 0;
    group.receipts.forEach((receipt) => {
      if (isReceiptReceived(receipt)) return;
      state.simulatedReceipts[receipt.id] = { receivedDate: AS_OF, quantities: {} };
      marked += 1;
    });
    clearSummaryCache();
    persistDemoState();
    render();
    showToast(`${group.label} marked arrived — ${formatNumber(marked)} vendor shipment${marked === 1 ? '' : 's'} updated. Real receipts carry no line quantities.`);
  }

  function addContainerDocuments(key, files) {
    const record = findContainerRecord(key);
    if (!record) return;
    const existing = state.containerDocuments[key] || [];
    Array.from(files || []).forEach((file) => {
      existing.push({
        name: file.name,
        type: file.type || (file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'File'),
        date: todayIso(),
      });
    });
    state.containerDocuments[key] = existing;
    persistDemoState();
    render();
    showToast(`${formatNumber(files ? files.length : 0)} document${files && files.length === 1 ? '' : 's'} attached.`);
  }

  function removeContainerDocument(key, index) {
    const record = findContainerRecord(key);
    if (!record) return;
    const documents = state.containerDocuments[key] || [];
    documents.splice(Number(index), 1);
    state.containerDocuments[key] = documents;
    persistDemoState();
    render();
  }

  function resetDemoData() {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch (error) {
      /* Reset still applies in memory. */
    }
    state.plannerContainers = [];
    state.plannerContainerSequence = 0;
    state.plannerAssigned = {};
    state.plannerSelectedLineId = null;
    state.plannerPendingAssignment = null;
    state.simulatedReceipts = {};
    state.simulatedLineQty = {};
    state.poConfirmations = {};
    state.vendorDetails = {};
    state.containerDocuments = {};
    state.shippingLineEdit = '';
    state.expandedContainerGroups = new Set();
    state.containersPage = 1;
    clearSummaryCache();
    render();
    showToast('Demo data reset. The old Vendor updates store was left untouched.');
  }

  function poConfirmation(poNumber) {
    if (!state.poConfirmations[poNumber]) {
      state.poConfirmations[poNumber] = {
        status: 'Not sent',
        notes: '',
        readyDates: {},
      };
    }
    const record = state.poConfirmations[poNumber];
    if (!record.readyDates || typeof record.readyDates !== 'object') record.readyDates = {};
    if (!VENDOR_CONFIRMATION_STATUSES.includes(record.status)) record.status = 'Not sent';
    return record;
  }

  function savePoConfirmation(poNumber, field, value) {
    const record = poConfirmation(poNumber);
    if (field === 'status') record.status = value;
    if (field === 'notes') record.notes = value;
    persistDemoState();
  }

  function savePoLineReadyDate(poNumber, lineId, value) {
    const record = poConfirmation(poNumber);
    if (value) record.readyDates[lineId] = value;
    else delete record.readyDates[lineId];
    persistDemoState();
  }

  function followUpPlanningTags(po) {
    const confirmation = state.poConfirmations[po.po] || { readyDates: {} };
    const tags = [];
    let needsPlan = false;
    let needsChase = false;
    po.lines.forEach((line) => {
      if (unplannedUnitsForLine(line) <= 0) return;
      const readyDate = (confirmation.readyDates && confirmation.readyDates[line.id]) || '';
      if (readyDate && readyDate >= AS_OF) needsPlan = true;
      else needsChase = true;
    });
    if (needsPlan) tags.push(renderTag('wn', 'Ariel needs to plan', 'At least one unplanned line has a ready date set.'));
    if (needsChase) tags.push(renderTag('bad', 'Vendor needs a chase', 'At least one unplanned line has no ready date, or its ready date has passed.'));
    return tags;
  }

  function renderPoVendorConfirmation(po) {
    const confirmation = poConfirmation(po.po);
    return `
      <div class="po-confirmation-block">
        <div class="row">
          <h3>Vendor confirmation</h3>
          <span class="sub">Saved in this browser</span>
        </div>
        <div class="po-confirmation-grid">
          <label class="cf">
            <span>Confirmation</span>
            <select data-po-confirmation="${attr(po.po)}">
              ${VENDOR_CONFIRMATION_STATUSES.map((status) => `<option value="${attr(status)}"${confirmation.status === status ? ' selected' : ''}>${esc(status)}</option>`).join('')}
            </select>
          </label>
          <label class="cf po-confirmation-notes">
            <span>Notes</span>
            <textarea data-po-notes="${attr(po.po)}" rows="2" placeholder="Vendor confirmation notes…">${esc(confirmation.notes || '')}</textarea>
          </label>
        </div>
        ${po.lines.length ? `
          <div class="sc po-ready-scroll">
            <table class="compact-table">
              <thead><tr><th>ITEM</th><th>DESCRIPTION</th><th>READY DATE</th><th>UNPLANNED</th></tr></thead>
              <tbody>
                ${po.lines.map((line) => {
                  const readyDate = confirmation.readyDates[line.id] || '';
                  const unplanned = unplannedUnitsForLine(line);
                  return `
                    <tr>
                      <td class="mono">${esc(line.itemId || '—')}</td>
                      <td>${esc(line.description || '—')}</td>
                      <td><input type="date" data-po-line-ready="${attr(po.po)}:${line.id}" value="${attr(readyDate)}"></td>
                      <td class="n">${unplanned > 0 ? `<span class="late">${formatNumber(unplanned)}</span>` : '0'}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>`;
  }

  function renderPoContainers(po) {
    const blocks = [];
    state.plannerContainers.forEach((container) => {
      const matching = container.assignments
        .map((assignment, index) => {
          const line = lineById.get(assignment.lineId);
          return line && line.po === po.po ? { assignment, index } : null;
        })
        .filter(Boolean);
      if (!matching.length) return;
      blocks.push({
        container,
        assignments: matching,
      });
    });

    return `
      <div class="po-containers-block">
        <div class="row">
          <h3>Containers</h3>
          <span class="sub">Blocks assigned to this PO</span>
        </div>
        ${blocks.length ? `
          <div class="sc">
            <table class="compact-table">
              <thead><tr><th>CONTAINER</th><th>TYPE</th><th>BLOCKS</th><th class="n">UNITS</th><th>STATUS</th></tr></thead>
              <tbody>
                ${blocks.map(({ container, assignments }) => {
                  const statusKey = containerStatusKey(container);
                  const status = CONTAINER_STATUSES[statusKey];
                  return `
                    <tr>
                      <td><a href="#containers/${encodeURIComponent(container.id)}" data-action="open-container:${attr(container.id)}"><b>${esc(container.name)}</b></a></td>
                      <td>${esc(container.type)}</td>
                      <td>${assignments.map(({ assignment }) => renderTag('', assignment.block || 'B1')).join(' ')}</td>
                      <td class="n">${formatNumber(assignments.reduce((sum, { assignment }) => sum + assignment.units, 0))}</td>
                      <td>${renderTag(status.variant, status.label)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : '<div class="sub">This PO has no container blocks yet.</div>'}
      </div>`;
  }

  /* =========================================================================
     11. Follow-ups
     ========================================================================= */

  function followUpBuckets() {
    const rows = dashboardOrders();
    const buckets = {
      unplanned: [],
      notYetPlanned: [],
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
      if (summary.balance > 0 && !hasOpenReceipt && !atRisk && unplannedUnitsForPo(po) > 0) {
        buckets.notYetPlanned.push(row);
      }
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
    ['unplanned', 'notYetPlanned', 'nothing', 'overdue', 'old'].forEach((key) => {
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

  const FOLLOW_UP_CATEGORY_LABELS = {
    unplanned: 'At risk',
    notYetPlanned: 'Not yet planned',
    nothing: 'Open balance — already planned',
    overdue: 'Past ETA',
    old: 'Not shipped yet and Old',
    unmatched: 'Receipts unmatched',
  };

  function followUpVendorKey(categoryKey, vendor) {
    return `${categoryKey}::${vendor}`;
  }

  function followUpReferences(categoryKey, vendor) {
    const buckets = followUpBuckets();
    if (categoryKey === 'unmatched') {
      return buckets.unmatched
        .filter((receipt) => (receipt.vendorId || '(blank)') === vendor)
        .map((receipt) => receipt.invoiceNo || 'receipt');
    }
    return (buckets[categoryKey] || [])
      .filter(({ po }) => (po.vendorId || '(blank)') === vendor)
      .map(({ po }) => po.po);
  }

  function openFollowUpReminder(categoryKey, vendor, count) {
    const categoryLabel = FOLLOW_UP_CATEGORY_LABELS[categoryKey] || 'Follow-up';
    const references = followUpReferences(categoryKey, vendor);
    const shown = references.slice(0, 12);
    const referenceLine = shown.length
      ? `${shown.join(', ')}${references.length > shown.length ? ` and ${references.length - shown.length} more` : ''}`
      : `${count} item${count === 1 ? '' : 's'}`;
    const subject = `Follow-up required — ${vendor} — ${categoryLabel}`;
    const body = [
      `Hi ${vendor} team,`,
      '',
      `We are following up on ${count} ${count === 1 ? 'item' : 'items'} in our ${categoryLabel} list.`,
      '',
      `References: ${referenceLine}`,
      '',
      'Please confirm the latest production and shipment status, including any updated ETD/ETA.',
      '',
      'Thank you,',
      'Ariel Purchasing',
    ].join('\n');

    state.followUpReminderDraft = { vendor, count, categoryKey, categoryLabel, subject, body };

    const scrollY = window.scrollY;
    render();
    window.scrollTo({ top: scrollY });
  }

  function closeFollowUpReminder() {
    state.followUpReminderDraft = null;
    const scrollY = window.scrollY;
    render();
    window.scrollTo({ top: scrollY });
  }

  function sendFollowUpReminder() {
    const draft = state.followUpReminderDraft;
    if (!draft) return;

    state.reminders.unshift({
      vendor: draft.vendor,
      count: draft.count,
      channel: 'Email (simulated)',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    state.followUpReminderDraft = null;

    const scrollY = window.scrollY;
    render();
    window.scrollTo({ top: scrollY });
    showToast(`Reminder sent to ${draft.vendor} · ${draft.count} item${draft.count === 1 ? '' : 's'} (simulated).`);
  }

  function renderFollowUpReminderDialog() {
    const draft = state.followUpReminderDraft;
    if (!draft) return '';

    return `
      <div class="modal-backdrop">
        <div class="modal-card mail-draft-card" role="dialog" aria-modal="true" aria-labelledby="followup-draft-title">
          <div>
            <h2 id="followup-draft-title">Draft reminder</h2>
            <div class="sub">${esc(draft.vendor)} · ${formatNumber(draft.count)} item${draft.count === 1 ? '' : 's'}</div>
          </div>
          <div class="mail-draft-meta">
            <div><div class="sub">To</div><div><b>${esc(draft.vendor)}</b> purchasing contact</div></div>
            <div><div class="sub">Category</div><div>${esc(draft.categoryLabel)}</div></div>
          </div>
          <label class="field-label" for="followup-draft-subject">Subject</label>
          <input id="followup-draft-subject" class="mail-draft-subject" type="text" readonly value="${attr(draft.subject)}">
          <label class="field-label" for="followup-draft-body">Message</label>
          <textarea id="followup-draft-body" class="mail-draft-body" readonly rows="9">${esc(draft.body)}</textarea>
          <div class="sub">Sending is simulated in this prototype; no email is actually sent.</div>
          <div class="modal-actions">
            <button class="s" data-action="close-followup-draft">Cancel</button>
            <button class="p" data-action="send-followup-draft">Send</button>
          </div>
        </div>
      </div>`;
  }

  function renderFollowUpIndex(categories) {
    return `
      <div class="card">
        <div class="row">
          <div>
            <h2>Follow-up categories</h2>
            <div class="sub">Jump to a category, or expand and collapse the sections below.</div>
          </div>
          <div class="row">
            <button class="s" data-action="followup-expand-all">Expand all</button>
            <button class="s" data-action="followup-collapse-all">Collapse all</button>
          </div>
        </div>
        <div class="followup-index">
          ${categories.map((category) => `
            <button class="followup-index-item tone-${category.tone}" data-action="jump-followup:${attr(category.key)}">
              <b>${formatNumber(category.total)}</b>
              <span>${esc(category.shortTitle)}</span>
            </button>`).join('')}
        </div>
      </div>`;
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
              <th class="n">UNPLANNED UNITS</th>
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
                  <td><b>${esc(po.po)}</b>${summary.old ? ` ${renderTag('wn', 'Old')}` : ''}${shipped > 0 ? ` ${renderTag('info', 'In container', 'Some or all open units are on a container marked Shipped.')}` : ''}${followUpPlanningTags(po).join(' ')}</td>
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

  function renderFollowUpCategory({ key, title, description, groups, renderGroup, tone }) {
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    const open = state.followUpOpenCategories.has(key);
    return `
      <details class="card followup-category tone-${tone}" id="followup-${attr(key)}" data-followup-category="${attr(key)}"${open ? ' open' : ''}>
        <summary class="followup-category-summary">
          <div>
            <h2>${esc(title)}</h2>
            <div class="sub">${description}</div>
          </div>
          <div class="followup-category-count">
            <span class="tag ${tone === 'neutral' ? '' : tone}">${formatNumber(total)} item${total === 1 ? '' : 's'}</span>
            <span class="sub">${formatNumber(groups.length)} vendor${groups.length === 1 ? '' : 's'}</span>
          </div>
        </summary>
        <div class="followup-category-body">
          ${groups.length ? groups.map((group) => renderGroup(group, key)).join('') : '<div class="sub" style="margin-top:10px">Nothing in this category.</div>'}
        </div>
      </details>`;
  }

  function renderReminderLog() {
    if (!state.reminders.length) return '';
    return `
      <div class="card">
        <div class="row">
          <div>
            <h2>Reminder log</h2>
            <div class="sub">“Send reminder” opens a draft. Clicking Send logs the reminder in this session; no email is actually sent.</div>
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
    const notYetPlannedGroups = groupByVendor(buckets.notYetPlanned);
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

    const renderVendorGroup = (categoryKey, group, countLabel, content) => {
      const vendorKey = followUpVendorKey(categoryKey, group.vendor);
      const open = state.followUpOpenVendors.has(vendorKey);
      return `
        <details class="vendor-block followup-vendor" data-followup-vendor="${attr(vendorKey)}"${open ? ' open' : ''}>
          <summary class="followup-vendor-summary">
            <h3><span class="vendor-pill">${esc(group.vendor)}</span> <span class="sub">${countLabel}</span></h3>
          </summary>
          <div class="followup-vendor-body">
            <div class="row followup-vendor-actions">
              <span class="sub">Draft a follow-up email using these items.</span>
              <button class="s p" data-action="remind:${attr(categoryKey)}:${attr(group.vendor)}:${group.rows.length}">Send reminder</button>
            </div>
            ${content}
          </div>
        </details>`;
    };

    const renderPoGroup = (group, categoryKey) => renderVendorGroup(
      categoryKey,
      group,
      `${formatNumber(group.rows.length)} PO${group.rows.length === 1 ? '' : 's'}`,
      renderFollowUpPoTable(group.rows)
    );

    const renderUnmatchedGroup = (group, categoryKey) => renderVendorGroup(
      categoryKey,
      group,
      `${formatNumber(group.rows.length)} unmatched receipt${group.rows.length === 1 ? '' : 's'}`,
      `<div class="sc">
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
      </div>`
    );

    const categories = [
      {
        key: 'unplanned',
        shortTitle: 'At risk',
        title: '1. At risk',
        description: 'Open balance with no open receipt and unplanned units; the PO is over 90 days old or has a received receipt.',
        groups: unplannedGroups,
        renderGroup: renderPoGroup,
        tone: 'bad',
      },
      {
        key: 'notYetPlanned',
        shortTitle: 'Not yet planned',
        title: '2. Not yet planned',
        description: 'Unplanned open balance on a PO that does not meet the At risk definition.',
        groups: notYetPlannedGroups,
        renderGroup: renderPoGroup,
        tone: 'wn',
      },
      {
        key: 'nothing',
        shortTitle: 'Already planned',
        title: '3. Open balance — already planned',
        description: 'Open balance not yet shipped is assigned to a draft or booked container.',
        groups: nothingGroups,
        renderGroup: renderPoGroup,
        tone: 'info',
      },
      {
        key: 'overdue',
        shortTitle: 'Past ETA',
        title: '4. Past ETA',
        description: 'At least one open receipt has an ETA before the data date.',
        groups: overdueGroups,
        renderGroup: renderPoGroup,
        tone: 'bad',
      },
      {
        key: 'old',
        shortTitle: 'Old / not shipped',
        title: '5. Not shipped yet and Old',
        description: 'No receipt at all and the PO is more than 90 days old.',
        groups: oldGroups,
        renderGroup: renderPoGroup,
        tone: 'wn',
      },
      {
        key: 'unmatched',
        shortTitle: 'Unmatched receipts',
        title: '6. Receipts unmatched',
        description: 'Receipts with no exact or suffix-normalised PO match. They are not forced onto a PO and are shown across all segments because they have no PO/FOB segment.',
        groups: unmatched,
        renderGroup: renderUnmatchedGroup,
        tone: 'neutral',
      },
    ];
    categories.forEach((category) => {
      category.total = category.groups.reduce((sum, group) => sum + group.rows.length, 0);
    });

    return `
      ${renderHeader(
        'Follow-ups',
        '',
        `<div class="sub">${SEGMENT_LABELS[state.segmentFilter] || 'All segments'}</div>`
      )}

      ${renderReminderLog()}
      ${renderFollowUpIndex(categories)}
      ${categories.map((category) => renderFollowUpCategory(category)).join('')}
      ${renderFollowUpReminderDialog()}`;
  }

  /* =========================================================================
     12. Application shell
     ========================================================================= */

  const NAVIGATION = [
    ['OVERVIEW', [['home', 'Dashboard']]],
    ['ACT', [
      ['followup', 'Follow-ups'],
      ['containers', 'Containers'],
    ]],
    ['ORDERS', [
      ['orders', 'Purchase orders'],
      ['vendors', 'Vendors'],
    ]],
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
    vendors: renderVendors,
    containers: renderContainers,
    followup: renderFollowUps,
  };

  const LEGACY_ROUTES = {
    planner: 'containers',
    shipments: 'containers',
    import: 'containers',
    receive: 'containers',
    'vendor-updates': 'containers',
  };

  function normalizeLegacyRoute() {
    const raw = location.hash.slice(1);
    const base = raw.split('/')[0];
    if (!LEGACY_ROUTES[base]) return;
    if (base === 'shipments') state.containersView = 'water';
    else state.containersView = 'plan';
    try {
      window.history.replaceState(null, '', '#containers');
    } catch (error) {
      location.hash = 'containers';
    }
  }

  function parseRoute() {
    const raw = location.hash.slice(1);
    if (!raw) return { view: 'home', detailId: '' };
    const slash = raw.indexOf('/');
    const base = slash >= 0 ? raw.slice(0, slash) : raw;
    const detailId = slash >= 0 ? decodeURIComponent(raw.slice(slash + 1)) : '';
    if (base === 'containers') return { view: 'containers', detailId };
    if (LEGACY_ROUTES[base]) return { view: 'containers', detailId: '' };
    return { view: VIEWS[base] ? base : 'home', detailId: '' };
  }

  function currentContainerDetailId() {
    return parseRoute().detailId;
  }

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
    return parseRoute().view;
  }

  function setView(view) {
    if (location.hash === `#${view}`) {
      render();
    } else {
      location.hash = view;
    }
  }

  function openContainerDetail(key) {
    const record = findContainerRecord(key);
    if (!record) {
      showToast('That container is not available.');
      return;
    }
    state.containersView = record.kind === 'real'
      ? (realGroupReceived(record.group) ? 'arrived' : 'water')
      : (containerStatusKey(record.container) === 'arrived'
        ? 'arrived'
        : containerStatusKey(record.container) === 'shipped' ? 'water' : 'plan');
    state.containersReturnScroll = parseRoute().view === 'containers' ? window.scrollY : 0;
    const nextHash = `containers/${encodeURIComponent(record.key)}`;
    if (location.hash === `#${nextHash}`) render();
    else location.hash = nextHash;
  }

  function closeContainerDetail() {
    if (!currentContainerDetailId()) return;
    if (location.hash === '#containers') render();
    else location.hash = 'containers';
  }

  function syncGlobalFilters() {
    const vendor = document.getElementById('vendor-filter');
    const buyer = document.getElementById('buyer-filter');
    if (vendor) vendor.value = state.vendorFilter;
    if (buyer) buyer.value = state.buyerFilter;
  }

  function render() {
    normalizeLegacyRoute();
    const route = parseRoute();
    const viewKey = route.view;
    const detailId = route.detailId;
    const previousDetailId = state.lastRenderedDetailId;

    renderNavigation(viewKey);
    syncGlobalFilters();

    document.getElementById('meta').textContent =
      `Data as of ${AS_OF_LABEL} · ${formatNumber(HEALTH.counts.poHeaders)} POs · ` +
      `${formatNumber(HEALTH.counts.detailLines)} lines · ${formatNumber(HEALTH.counts.receipts)} receipts`;

    main.innerHTML = VIEWS[viewKey]();

    if (viewKey === 'orders') {
      updateOrderTable();
      const portSelect = document.getElementById('order-port');
      if (portSelect) portSelect.value = state.portFilter;
    }

    if (viewKey === 'containers') {
      if (state.containersView === 'plan') bindPlannerDragAndDrop();
      if (detailId && !previousDetailId) {
        const scroll = window.scrollY;
        if (state.containersReturnScroll == null) state.containersReturnScroll = scroll;
        if (window.matchMedia('(max-width: 900px)').matches) {
          setTimeout(() => window.scrollTo({ top: 0 }), 0);
        }
      }
      if (!detailId && previousDetailId) {
        const restore = state.containersReturnScroll || 0;
        state.containersReturnScroll = null;
        setTimeout(() => window.scrollTo({ top: restore }), 0);
      }
    }

    state.lastRenderedDetailId = detailId;
    persistDemoState();
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
        requestPlanLine(lineId, containerId);
      };
    });
  }

  function handleAction(action, args) {
    switch (action) {
      case 'go':
        setView(args[0]);
        break;

      case 'open-open-orders':
        state.searchQuery = '';
        state.statusFilter = '';
        state.orderBucketFilter = 'Open POs';
        state.portFilter = '';
        state.includeHeaderOnly = false;
        state.orderPage = 1;
        setView('orders');
        break;

      case 'ship-on-way':
        state.containersView = 'water';
        state.containersStatus = 'In transit';
        state.containersQuery = '';
        state.containersType = '';
        state.containersPage = 1;
        setView('containers');
        break;

      case 'containers-plan':
        state.containersView = 'plan';
        state.containersPage = 1;
        setView('containers');
        break;

      case 'containers-arrived':
        state.containersView = 'arrived';
        state.containersStatus = '';
        state.containersPage = 1;
        setView('containers');
        break;

      case 'container-view':
        state.containersView = ['plan', 'water', 'arrived'].includes(args[0]) ? args[0] : 'plan';
        state.containersPage = 1;
        state.containersStatus = '';
        state.containersQuery = '';
        state.containersType = '';
        if (currentContainerDetailId()) closeContainerDetail();
        else render();
        break;

      case 'containers-page':
        state.containersPage = Number(args[0]) || 1;
        updateContainersList();
        break;

      case 'toggle-container-group': {
        const key = args.join(':');
        if (state.expandedContainerGroups.has(key)) state.expandedContainerGroups.delete(key);
        else state.expandedContainerGroups.add(key);
        updateContainersList();
        break;
      }

      case 'containers-expand-all': {
        filteredContainerRows(state.containersView)
          .filter((row) => row.kind === 'real')
          .slice((state.containersPage - 1) * state.containersPageSize, state.containersPage * state.containersPageSize)
          .forEach((row) => state.expandedContainerGroups.add(row.key));
        updateContainersList();
        break;
      }

      case 'containers-collapse-all':
        state.expandedContainerGroups.clear();
        updateContainersList();
        break;

      case 'open-container':
        openContainerDetail(args.join(':'));
        break;

      case 'close-container':
        closeContainerDetail();
        break;

      case 'reset-demo':
        resetDemoData();
        break;

      case 'confirm-ship-as-planned':
        confirmContainerShipping(args[0]);
        break;

      case 'edit-shipped-line':
        editShippedLine(args[0], args[1]);
        break;

      case 'cancel-shipped-line':
        state.shippingLineEdit = '';
        render();
        break;

      case 'save-shipped-line':
        saveShippedLine(args[0], args[1]);
        break;

      case 'arrive-real':
        markRealContainerArrived(args.join(':'));
        break;

      case 'remove-container-document':
        removeContainerDocument(args[0], Number(args[1]));
        break;

      case 'vendors-all':
        state.vendorFilter = '';
        state.buyerFilter = '';
        state.segmentFilter = 'all';
        setView('vendors');
        break;

      case 'vendor-orders':
        state.vendorFilter = args[0] || '';
        state.searchQuery = '';
        state.statusFilter = '';
        state.orderBucketFilter = '';
        state.portFilter = '';
        state.includeHeaderOnly = false;
        state.orderPage = 1;
        setView('orders');
        break;

      case 'openpo': {
        const po = args[0] ? poById.get(args[0]) : null;
        // Container/receipt links can include Other/Domestic POs. If the link
        // points outside the current segment, move to that PO's segment so
        // the explicit navigation never lands on an empty order list.
        if (po && state.segmentFilter !== 'all' && po.segment !== state.segmentFilter) {
          state.segmentFilter = po.segment;
        }
        state.searchQuery = args[0] || '';
        state.statusFilter = '';
        state.orderBucketFilter = '';
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
        updateOrderTable({ preserveScroll: true });
        break;
      }

      case 'page':
        state.orderPage = Number(args[0]) || 1;
        updateOrderTable();
        break;

      case 'clear-order-bucket':
        state.orderBucketFilter = '';
        state.orderPage = 1;
        updateOrderTable();
        break;

      case 'add-container':
        addPlannerContainer(document.getElementById('planner-container-type')?.value || '');
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

      case 'confirm-planner-assignment':
        confirmPlannerAssignment();
        break;

      case 'cancel-planner-assignment':
        cancelPlannerAssignment();
        break;

      case 'remind': {
        const categoryKey = args[0] || 'unplanned';
        const vendor = args[1] || 'vendor';
        const count = Number(args[2]) || 0;
        openFollowUpReminder(categoryKey, vendor, count);
        break;
      }

      case 'close-followup-draft':
        closeFollowUpReminder();
        break;

      case 'send-followup-draft':
        sendFollowUpReminder();
        break;

      case 'followup-expand-all':
        state.followUpOpenCategories = new Set(Object.keys(FOLLOW_UP_CATEGORY_LABELS));
        render();
        setTimeout(() => {
          document.querySelectorAll('.followup-category, .followup-vendor').forEach((element) => {
            element.open = true;
          });
        }, 0);
        break;

      case 'followup-collapse-all':
        state.followUpOpenCategories = new Set();
        render();
        setTimeout(() => {
          document.querySelectorAll('.followup-category, .followup-vendor').forEach((element) => {
            element.open = false;
          });
        }, 0);
        break;

      case 'jump-followup': {
        const categoryKey = args[0] || 'unplanned';
        state.followUpOpenCategories.add(categoryKey);
        render();
        setTimeout(() => {
          const section = document.getElementById(`followup-${categoryKey}`);
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
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
    /* Container plan: select a line, then tap a container. */
    const plannerLine = event.target.closest('[data-planner-line]');
    if (plannerLine && !event.target.closest('[data-action]') && !event.target.closest('input, select, textarea')) {
      const id = Number(plannerLine.dataset.plannerLine);
      state.plannerSelectedLineId = state.plannerSelectedLineId === id ? null : id;
      render();
      return;
    }

    const plannerZone = event.target.closest('[data-planner-zone]');
    if (plannerZone && state.plannerSelectedLineId !== null && !event.target.closest('[data-action]')) {
      const containerId = plannerZone.dataset.plannerZone;
      if (containerId) {
        requestPlanLine(state.plannerSelectedLineId, containerId);
        return;
      }
    }

    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const [action, ...args] = actionElement.dataset.action.split(':');
    handleAction(action, args);
  });

  document.addEventListener('toggle', (event) => {
    const category = event.target.closest?.('details[data-followup-category]');
    if (category) {
      const key = category.dataset.followupCategory;
      if (category.open) state.followUpOpenCategories.add(key);
      else state.followUpOpenCategories.delete(key);
      return;
    }

    const vendor = event.target.closest?.('details[data-followup-vendor]');
    if (vendor) {
      const key = vendor.dataset.followupVendor;
      if (vendor.open) state.followUpOpenVendors.add(key);
      else state.followUpOpenVendors.delete(key);
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'container-vendor-form') {
      event.preventDefault();
      updateFromVendorDetailsForm(event.target);
      return;
    }
  });

  let searchTimer = null;
  let containersSearchTimer = null;
  let plannerLineSearchTimer = null;

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

    if (event.target.id === 'planner-line-search') {
      clearTimeout(plannerLineSearchTimer);
      const value = event.target.value;
      plannerLineSearchTimer = setTimeout(() => {
        state.plannerLineQuery = value;
        updatePlannerLines();
      }, 200);
      return;
    }

    if (event.target.id === 'containers-search') {
      clearTimeout(containersSearchTimer);
      const value = event.target.value;
      containersSearchTimer = setTimeout(() => {
        state.containersQuery = value;
        state.containersPage = 1;
        updateContainersList();
      }, 200);
      return;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentContainerDetailId()) {
      event.preventDefault();
      closeContainerDetail();
      return;
    }

    if (event.target.id === 'planner-container-type' && event.key === 'Enter') {
      event.preventDefault();
      addPlannerContainer(event.target.value);
      return;
    }

    if (state.followUpReminderDraft && event.key === 'Escape') {
      event.preventDefault();
      closeFollowUpReminder();
      return;
    }

    if (!state.plannerPendingAssignment) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelPlannerAssignment();
      return;
    }
    if (event.target.id === 'planner-assignment-qty' && event.key === 'Enter') {
      event.preventDefault();
      confirmPlannerAssignment();
    }
  });

  document.addEventListener('change', (event) => {
    if (updateContainerFieldFromEvent(event)) return;

    const dataset = event.target.dataset || {};
    if (dataset.containerName) {
      const container = state.plannerContainers.find((row) => row.id === dataset.containerName);
      if (container) {
        const previous = container.name;
        container.name = String(event.target.value || '').trim() || container.id;
        if (state.vendorDetails[container.id] && state.vendorDetails[container.id].tracking === previous) {
          state.vendorDetails[container.id].tracking = container.name;
        }
        persistDemoState();
        render();
        showToast(`Container ID changed to ${container.name}.`);
      }
      return;
    }

    if (dataset.poConfirmation) {
      savePoConfirmation(dataset.poConfirmation, 'status', event.target.value);
      return;
    }

    if (dataset.poNotes) {
      savePoConfirmation(dataset.poNotes, 'notes', event.target.value);
      return;
    }

    if (dataset.poLineReady) {
      const [poNumber, lineId] = dataset.poLineReady.split(':');
      savePoLineReadyDate(poNumber, lineId, event.target.value);
      return;
    }

    if (dataset.containerDocument) {
      addContainerDocuments(dataset.containerDocument, event.target.files);
      return;
    }

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

      case 'order-status':
        state.statusFilter = event.target.value;
        state.orderBucketFilter = '';
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

      case 'containers-type':
        state.containersType = event.target.value;
        state.containersPage = 1;
        updateContainersList();
        break;

      case 'containers-status':
        state.containersStatus = event.target.value;
        state.containersPage = 1;
        updateContainersList();
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
  }

  window.addEventListener('hashchange', () => {
    state.expandedOrders = new Set(state.expandedOrders);
    render();
  });

  state.vendorUpdates = loadVendorUpdates();
  loadDemoState();
  migrateLegacyVendorUpdates();
  syncPlannerAssigned();
  populateFilters();
  render();
})();
