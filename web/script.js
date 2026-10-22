document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // ==========================================
  // 1. HELPER FUNCTIONS
  // ==========================================

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = "dispatchpro_simulator_v1";
  const THEME_KEY = "dispatchpro_theme";

  let currentPage = "dashboard";
  let searchTerm = "";
  let statusFilter = "all";

  const pageContent = $("pageContent");
  const modal = $("deliveryModal");
  const deliveryForm = $("deliveryForm");

  const money = (amount) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);

  const initials = (name) =>
    String(name || "NA")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");

  const formatDate = (dateString) => {
    if (!dateString) return "—";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return "Recently";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return "Recently";

    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const relativeTime = (dateString) => {
    if (!dateString) return "Recently";

    const timestamp = new Date(dateString).getTime();

    if (Number.isNaN(timestamp)) return "Recently";

    const minutes = Math.max(
      0,
      Math.floor((Date.now() - timestamp) / 60000)
    );

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours} hr ago`;

    return `${Math.floor(hours / 24)} day(s) ago`;
  };

  // ==========================================
  // 2. SAMPLE DATA
  // ==========================================

  const initialDrivers = [
    {
      id: "DRV-001",
      name: "Chinedu Okafor",
      phone: "08012345671",
      zone: "GRA",
      status: "available",
      activeDeliveries: 0,
      completedDeliveries: 24,
      rating: 4.9,
      distance: 1.2
    },
    {
      id: "DRV-002",
      name: "Amaka Nwosu",
      phone: "08012345672",
      zone: "Woji",
      status: "available",
      activeDeliveries: 0,
      completedDeliveries: 18,
      rating: 4.8,
      distance: 2.4
    },
    {
      id: "DRV-003",
      name: "Emeka Daniel",
      phone: "08012345673",
      zone: "Rumuola",
      status: "busy",
      activeDeliveries: 1,
      completedDeliveries: 32,
      rating: 4.7,
      distance: 3.1
    },
    {
      id: "DRV-004",
      name: "Blessing George",
      phone: "08012345674",
      zone: "Trans Amadi",
      status: "available",
      activeDeliveries: 0,
      completedDeliveries: 16,
      rating: 4.9,
      distance: 1.7
    },
    {
      id: "DRV-005",
      name: "David Johnson",
      phone: "08012345675",
      zone: "Town",
      status: "offline",
      activeDeliveries: 0,
      completedDeliveries: 21,
      rating: 4.6,
      distance: 4.0
    }
  ];

  const now = Date.now();

  const initialDeliveries = [
    {
      id: "DSP-1001",
      customer: "Sarah Williams",
      phone: "08011112221",
      address: "Old GRA, Port Harcourt",
      zone: "GRA",
      fee: 1500,
      status: "delivered",
      driverId: "DRV-001",
      notes: "",
      createdAt: new Date(now - 86400000 * 2).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString()
    },
    {
      id: "DSP-1002",
      customer: "Michael Brown",
      phone: "08011112222",
      address: "Woji Road, Port Harcourt",
      zone: "Woji",
      fee: 2000,
      status: "in_transit",
      driverId: "DRV-003",
      notes: "Call on arrival",
      createdAt: new Date(now - 3600000).toISOString(),
      updatedAt: new Date(now - 1800000).toISOString()
    },
    {
      id: "DSP-1003",
      customer: "Grace Peters",
      phone: "08011112223",
      address: "Rumuola Junction",
      zone: "Rumuola",
      fee: 1200,
      status: "assigned",
      driverId: "DRV-002",
      notes: "",
      createdAt: new Date(now - 2400000).toISOString(),
      updatedAt: new Date(now - 1200000).toISOString()
    },
    {
      id: "DSP-1004",
      customer: "Daniel James",
      phone: "08011112224",
      address: "Trans Amadi Industrial Layout",
      zone: "Trans Amadi",
      fee: 1800,
      status: "pending",
      driverId: null,
      notes: "",
      createdAt: new Date(now - 900000).toISOString(),
      updatedAt: new Date(now - 900000).toISOString()
    },
    {
      id: "DSP-1005",
      customer: "Esther David",
      phone: "08011112225",
      address: "Town, Port Harcourt",
      zone: "Town",
      fee: 1000,
      status: "delivered",
      driverId: "DRV-004",
      notes: "",
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 43200000).toISOString()
    }
  ];

  function normalizeData(data) {
    const drivers = Array.isArray(data?.drivers)
      ? data.drivers
      : initialDrivers;

    const deliveries = Array.isArray(data?.deliveries)
      ? data.deliveries
      : initialDeliveries;

    const normalizedDrivers = drivers.map((driver) => ({
      ...driver,
      activeDeliveries: 0
    }));

    const normalizedDeliveries = deliveries.map((delivery) => ({
      ...delivery,
      driverId: delivery.driverId || null
    }));

    normalizedDeliveries.forEach((delivery) => {
      if (
        ["assigned", "in_transit"].includes(delivery.status) &&
        delivery.driverId
      ) {
        const driver = normalizedDrivers.find(
          (item) => item.id === delivery.driverId
        );

        if (driver) {
          driver.activeDeliveries += 1;
        }
      }
    });

    normalizedDrivers.forEach((driver) => {
      if (driver.status !== "offline") {
        driver.status =
          driver.activeDeliveries > 0 ? "busy" : "available";
      }
    });

    return {
      drivers: normalizedDrivers,
      deliveries: normalizedDeliveries,
      activities: Array.isArray(data?.activities)
        ? data.activities
        : [],
      nextDeliveryNumber: Number(data?.nextDeliveryNumber) || 1006
    };
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        return normalizeData(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Could not load saved simulator data:", error);
    }

    return normalizeData({
      drivers: initialDrivers,
      deliveries: initialDeliveries,
      activities: [],
      nextDeliveryNumber: 1006
    });
  }

  let data = loadData();

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Could not save simulator data:", error);
      showToast("Your browser could not save the latest changes.", "error");
    }
  }

  // ==========================================
  // 3. TOAST NOTIFICATIONS
  // ==========================================

  function showToast(message, type = "success") {
    const toast = document.createElement("div");

    toast.className = `toast ${type}`;
    toast.textContent = message;

    $("toastContainer").appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  // ==========================================
  // 4. ACTIVITY LOG
  // ==========================================

  function logActivity(message, type = "info") {
    data.activities.unshift({
      id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      type,
      createdAt: new Date().toISOString()
    });

    data.activities = data.activities.slice(0, 30);

    saveData();
  }

  // ==========================================
  // 5. DELIVERY AND DRIVER HELPERS
  // ==========================================

  const statusLabels = {
    pending: "Pending",
    assigned: "Assigned",
    in_transit: "In transit",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };

  function statusClass(status) {
    const classes = {
      pending: "status-pending",
      assigned: "status-assigned",
      in_transit: "status-transit",
      delivered: "status-delivered",
      cancelled: "status-cancelled"
    };

    return classes[status] || "status-pending";
  }

  function statusBadge(status) {
    return `
      <span class="status-badge ${statusClass(status)}">
        ${escapeHTML(statusLabels[status] || status)}
      </span>
    `;
  }

  function getDriver(driverId) {
    return data.drivers.find((driver) => driver.id === driverId) || null;
  }

  function getActiveDeliveryCount(driverId) {
    return data.deliveries.filter(
      (delivery) =>
        delivery.driverId === driverId &&
        ["assigned", "in_transit"].includes(delivery.status)
    ).length;
  }

  function syncDrivers() {
    data.drivers.forEach((driver) => {
      driver.activeDeliveries = getActiveDeliveryCount(driver.id);

      if (driver.status !== "offline") {
        driver.status =
          driver.activeDeliveries > 0 ? "busy" : "available";
      }
    });
  }

  function getAvailableDrivers() {
    syncDrivers();

    return data.drivers.filter(
      (driver) =>
        driver.status !== "offline" &&
        driver.activeDeliveries === 0
    );
  }

  function assignDriver(delivery) {
    syncDrivers();

    const availableDrivers = getAvailableDrivers();

    if (availableDrivers.length === 0) {
      delivery.driverId = null;
      delivery.status = "pending";
      return null;
    }

    // Simulation rule:
    // Prefer drivers in the delivery zone.
    // Among matching drivers, choose the shortest simulated distance.

    const sameZoneDrivers = availableDrivers.filter(
      (driver) => driver.zone === delivery.zone
    );

    const candidates =
      sameZoneDrivers.length > 0
        ? sameZoneDrivers
        : availableDrivers;

    candidates.sort((a, b) => a.distance - b.distance);

    const selectedDriver = candidates[0];

    delivery.driverId = selectedDriver.id;
    delivery.status = "assigned";

    syncDrivers();

    return selectedDriver;
  }

  function calculateMetrics() {
    const deliveries = data.deliveries;

    return {
      total: deliveries.length,

      active: deliveries.filter((delivery) =>
        ["assigned", "in_transit"].includes(delivery.status)
      ).length,

      pending: deliveries.filter(
        (delivery) => delivery.status === "pending"
      ).length,

      delivered: deliveries.filter(
        (delivery) => delivery.status === "delivered"
      ).length,

      cancelled: deliveries.filter(
        (delivery) => delivery.status === "cancelled"
      ).length,

      availableDrivers: getAvailableDrivers().length,

      totalDrivers: data.drivers.length,

      revenue: deliveries
        .filter((delivery) => delivery.status === "delivered")
        .reduce((total, delivery) => total + Number(delivery.fee || 0), 0)
    };
  }

  function getFilteredDeliveries() {
    let deliveries = [...data.deliveries];

    if (statusFilter !== "all") {
      deliveries = deliveries.filter(
        (delivery) => delivery.status === statusFilter
      );
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();

      deliveries = deliveries.filter((delivery) => {
        const driver = getDriver(delivery.driverId);

        return [
          delivery.id,
          delivery.customer,
          delivery.phone,
          delivery.address,
          delivery.zone,
          delivery.status,
          driver?.name || ""
        ].some((value) =>
          String(value).toLowerCase().includes(query)
        );
      });
    }

    return deliveries.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  // ==========================================
  // 6. REUSABLE PAGE COMPONENTS
  // ==========================================

  function pageHeader(eyebrow, title, description, actions = "") {
    return `
      <div class="page-heading">
        <div>
          <p class="eyebrow">${escapeHTML(eyebrow)}</p>
          <h1>${escapeHTML(title)}</h1>
          <p>${escapeHTML(description)}</p>
        </div>

        <div class="heading-actions">
          ${actions}
        </div>
      </div>
    `;
  }

  function metricCard(label, value, icon, color, note, change = "") {
    return `
      <article class="stat-card">
        <div class="stat-top">
          <span class="stat-label">${escapeHTML(label)}</span>
          <span class="stat-icon ${color}">${icon}</span>
        </div>

        <div class="stat-value">${escapeHTML(value)}</div>

        <div class="stat-footer">
          ${change
            ? `<span class="stat-change">${escapeHTML(change)}</span>`
            : ""}
          <span>${escapeHTML(note)}</span>
        </div>
      </article>
    `;
  }

  function customerCell(delivery) {
    return `
      <div class="customer-cell">
        <div class="mini-avatar">
          ${escapeHTML(initials(delivery.customer))}
        </div>

        <div>
          <strong>${escapeHTML(delivery.customer)}</strong>
          <small>${escapeHTML(delivery.phone)}</small>
        </div>
      </div>
    `;
  }

  function deliveryActionButtons(delivery) {
    if (delivery.status === "pending") {
      return `
        <button class="table-action"
          data-action="assign"
          data-id="${escapeHTML(delivery.id)}">
          Assign
        </button>
        <button class="table-action danger"
          data-action="cancel"
          data-id="${escapeHTML(delivery.id)}">
          Cancel
        </button>
      `;
    }

    if (delivery.status === "assigned") {
      return `
        <button class="table-action"
          data-action="transit"
          data-id="${escapeHTML(delivery.id)}">
          Start
        </button>
        <button class="table-action danger"
          data-action="cancel"
          data-id="${escapeHTML(delivery.id)}">
          Cancel
        </button>
      `;
    }

    if (delivery.status === "in_transit") {
      return `
        <button class="table-action"
          data-action="deliver"
          data-id="${escapeHTML(delivery.id)}">
          Complete
        </button>
      `;
    }

    return `<span style="color:var(--muted)">—</span>`;
  }

  function deliveryTable(deliveries, showToolbar = false) {
    const toolbar = showToolbar
      ? `
        <div class="table-toolbar">
          <div class="toolbar-left">
            <label class="search-box">
              <span>⌕</span>
              <input id="deliverySearch"
                type="search"
                placeholder="Search orders, customers, drivers..."
                value="${escapeHTML(searchTerm)}">
            </label>
          </div>

          <div class="toolbar-right">
            <select id="statusFilter" class="filter-select"
              aria-label="Filter delivery status">
              <option value="all" ${statusFilter === "all" ? "selected" : ""}>
                All statuses
              </option>
              <option value="pending" ${statusFilter === "pending" ? "selected" : ""}>
                Pending
              </option>
              <option value="assigned" ${statusFilter === "assigned" ? "selected" : ""}>
                Assigned
              </option>
              <option value="in_transit" ${statusFilter === "in_transit" ? "selected" : ""}>
                In transit
              </option>
              <option value="delivered" ${statusFilter === "delivered" ? "selected" : ""}>
                Delivered
              </option>
              <option value="cancelled" ${statusFilter === "cancelled" ? "selected" : ""}>
                Cancelled
              </option>
            </select>
          </div>
        </div>
      `
      : "";

    const rows = deliveries.map((delivery) => {
      const driver = getDriver(delivery.driverId);

      return `
        <tr>
          <td>
            <span class="order-id">${escapeHTML(delivery.id)}</span>
          </td>

          <td>${customerCell(delivery)}</td>

          <td>
            <div>${escapeHTML(delivery.address)}</div>
            <small style="color:var(--muted);display:block;margin-top:4px">
              ${escapeHTML(delivery.zone)}
            </small>
          </td>

          <td>${escapeHTML(driver?.name || "Unassigned")}</td>

          <td>${statusBadge(delivery.status)}</td>

          <td>${money(delivery.fee)}</td>

          <td>
            <div class="table-actions">
              ${deliveryActionButtons(delivery)}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    return `
      ${toolbar}

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Destination</th>
              <th>Driver</th>
              <th>Status</th>
              <th>Fee</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            ${rows || `
              <tr>
                <td colspan="7">
                  <div class="empty-state">
                    <strong>No deliveries found</strong>
                    Try changing your search or create a new delivery.
                  </div>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  function activityFeed() {
    const activities = data.activities.slice(0, 6);

    if (activities.length === 0) {
      return `
        <div class="activity-empty">
          No recent activity yet. Create a delivery to get started.
        </div>
      `;
    }

    return `
      <div class="activity-list">
        ${activities.map((activity) => {
          const type = activity.type || "info";

          const icon =
            type === "success" ? "✓" :
            type === "warning" ? "!" : "↗";

          const iconClass =
            type === "success" ? "success" :
            type === "warning" ? "warning" : "";

          return `
            <div class="activity-item">
              <div class="activity-icon ${iconClass}">${icon}</div>

              <div class="activity-text">
                <p>${escapeHTML(activity.message)}</p>
                <small>${escapeHTML(relativeTime(activity.createdAt))}</small>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // ==========================================
  // 7. DASHBOARD PAGE
  // ==========================================

  function renderDashboard() {
    const metrics = calculateMetrics();

    const recentDeliveries = [...data.deliveries]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    return `
      ${pageHeader(
        "OVERVIEW",
        "Dashboard",
        "Here's what's happening with your delivery operations today.",
        `
          <button class="button button-secondary"
            data-action="refresh">
            ↻ Refresh
          </button>

          <button class="button button-primary"
            data-action="new-delivery">
            + New delivery
          </button>
        `
      )}

      <section class="welcome-banner">
        <div class="welcome-copy">
          <p class="eyebrow">YOUR OPERATIONS AT A GLANCE</p>
          <h2>Deliver smarter. Move faster.</h2>
          <p>
            Manage orders, coordinate drivers, and monitor delivery progress
            from one simple workspace.
          </p>
        </div>

        <div class="welcome-actions">
          <button class="button button-white" data-action="new-delivery">
            + Create delivery
          </button>

          <button class="button button-transparent"
            data-action="navigate-deliveries">
            View all deliveries →
          </button>
        </div>
      </section>

      <section class="stats-grid">
        ${metricCard(
          "Total deliveries",
          metrics.total,
          "▤",
          "purple",
          "All recorded orders",
          "●"
        )}

        ${metricCard(
          "Active deliveries",
          metrics.active,
          "↗",
          "blue",
          "Assigned or in transit",
          "●"
        )}

        ${metricCard(
          "Available drivers",
          `${metrics.availableDrivers}/${metrics.totalDrivers}`,
          "♙",
          "green",
          "Ready for assignment",
          "●"
        )}

        ${metricCard(
          "Completed deliveries",
          metrics.delivered,
          "✓",
          "orange",
          "Successfully delivered",
          "●"
        )}
      </section>

      <section class="content-grid">
        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Recent deliveries</h2>
              <p>Latest orders in your dispatch system</p>
            </div>

            <button class="text-button" data-action="navigate-deliveries">
              View all →
            </button>
          </div>

          ${deliveryTable(recentDeliveries)}
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Recent activity</h2>
              <p>Latest changes across your workspace</p>
            </div>

            <span class="stat-icon purple">↗</span>
          </div>

          <div class="panel-body">
            ${activityFeed()}
          </div>
        </article>
      </section>

      <section class="content-grid">
        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Driver availability</h2>
              <p>Current driver status</p>
            </div>

            <button class="text-button" data-action="navigate-drivers">
              Manage drivers →
            </button>
          </div>

          <div class="panel-body">
            <div class="breakdown-list">
              ${driverAvailabilityBreakdown()}
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Delivery summary</h2>
              <p>Current order distribution</p>
            </div>
          </div>

          <div class="panel-body">
            <div class="breakdown-list">
              ${deliveryBreakdown()}
            </div>
          </div>
        </article>
      </section>
    `;
  }

  // ==========================================
  // 8. DELIVERY PAGE
  // ==========================================

  function renderDeliveries() {
    const metrics = calculateMetrics();
    const deliveries = getFilteredDeliveries();

    return `
      ${pageHeader(
        "ORDER MANAGEMENT",
        "Deliveries",
        "Create, assign, track, and complete customer orders.",
        `
          <button class="button button-primary" data-action="new-delivery">
            + New delivery
          </button>
        `
      )}

      <section class="stats-grid">
        ${metricCard(
          "All deliveries",
          metrics.total,
          "▤",
          "purple",
          "Total recorded orders"
        )}

        ${metricCard(
          "Awaiting assignment",
          metrics.pending,
          "◷",
          "orange",
          "Need a driver"
        )}

        ${metricCard(
          "In transit",
          data.deliveries.filter(
            (item) => item.status === "in_transit"
          ).length,
          "↗",
          "blue",
          "On the way"
        )}

        ${metricCard(
          "Delivered",
          metrics.delivered,
          "✓",
          "green",
          "Successfully completed"
        )}
      </section>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>All orders</h2>
            <p>Search your records or filter by delivery status.</p>
          </div>

          <span class="nav-badge">${deliveries.length} results</span>
        </div>

        ${deliveryTable(deliveries, true)}
      </article>
    `;
  }

  // ==========================================
  // 9. DRIVER PAGE
  // ==========================================

  function renderDrivers() {
    syncDrivers();

    const available = data.drivers.filter(
      (driver) => driver.status === "available"
    ).length;

    const busy = data.drivers.filter(
      (driver) => driver.status === "busy"
    ).length;

    const offline = data.drivers.filter(
      (driver) => driver.status === "offline"
    ).length;

    return `
      ${pageHeader(
        "FLEET MANAGEMENT",
        "Drivers",
        "Monitor driver availability, workload, and completed deliveries.",
        `
          <button class="button button-secondary"
            data-action="refresh">
            ↻ Refresh
          </button>
        `
      )}

      <section class="stats-grid">
        ${metricCard(
          "Total drivers",
          data.drivers.length,
          "♙",
          "purple",
          "Registered in simulator"
        )}

        ${metricCard(
          "Available",
          available,
          "✓",
          "green",
          "Ready for a new order"
        )}

        ${metricCard(
          "On delivery",
          busy,
          "↗",
          "blue",
          "Currently assigned"
        )}

        ${metricCard(
          "Offline",
          offline,
          "◷",
          "orange",
          "Not accepting orders"
        )}
      </section>

      <div class="drivers-grid">
        ${data.drivers.map((driver) => {
          const activeCount = getActiveDeliveryCount(driver.id);

          const driverStatusLabel = {
            available: "Available",
            busy: "On delivery",
            offline: "Offline"
          }[driver.status] || driver.status;

          const driverStatusClass =
            driver.status === "available"
              ? "status-delivered"
              : driver.status === "busy"
                ? "status-transit"
                : "status-cancelled";

          return `
            <article class="driver-card">
              <div class="driver-card-top">
                <div class="driver-avatar">
                  ${escapeHTML(initials(driver.name))}
                </div>

                <div>
                  <h3>${escapeHTML(driver.name)}</h3>
                  <p>${escapeHTML(driver.id)}</p>
                </div>

                <span class="status-badge ${driverStatusClass} driver-status">
                  ${escapeHTML(driverStatusLabel)}
                </span>
              </div>

              <div class="driver-details">
                <div class="driver-detail">
                  <span>Phone number</span>
                  <strong>${escapeHTML(driver.phone)}</strong>
                </div>

                <div class="driver-detail">
                  <span>Assigned zone</span>
                  <strong>${escapeHTML(driver.zone)}</strong>
                </div>

                <div class="driver-detail">
                  <span>Active deliveries</span>
                  <strong>${activeCount}</strong>
                </div>

                <div class="driver-detail">
                  <span>Completed orders</span>
                  <strong>${Number(driver.completedDeliveries) || 0}</strong>
                </div>

                <div class="driver-detail">
                  <span>Driver rating</span>
                  <strong>★ ${Number(driver.rating || 0).toFixed(1)}</strong>
                </div>
              </div>

              <div class="driver-card-footer">
                <span style="color:var(--muted);font-size:10px">
                  ${Number(driver.distance || 0).toFixed(1)} km simulated distance
                </span>

                <button class="table-action"
                  data-action="toggle-driver"
                  data-id="${escapeHTML(driver.id)}">
                  ${driver.status === "offline"
                    ? "Bring online"
                    : "Set offline"}
                </button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  // ==========================================
  // 10. ANALYTICS PAGE
  // ==========================================

  function getDailyDeliveryCounts() {
    const result = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = data.deliveries.filter((delivery) => {
        const created = new Date(delivery.createdAt);

        return created >= date && created < nextDate;
      }).length;

      result.push({
        label: date.toLocaleDateString("en-GB", {
          weekday: "short"
        }),
        count
      });
    }

    return result;
  }

  function renderDailyChart() {
    const days = getDailyDeliveryCounts();
    const max = Math.max(...days.map((day) => day.count), 1);

    return `
      <div class="chart-area">
        ${days.map((day) => {
          const height = Math.max((day.count / max) * 100, 3);

          return `
            <div class="chart-column">
              <span class="chart-value">${day.count}</span>
              <div class="chart-bar" style="height:${height}%"></div>
              <span class="chart-label">${escapeHTML(day.label)}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function deliveryBreakdown() {
    const statuses = [
      { key: "delivered", label: "Delivered", color: "#17a673" },
      { key: "in_transit", label: "In transit", color: "#7557f6" },
      { key: "assigned", label: "Assigned", color: "#4194ef" },
      { key: "pending", label: "Pending", color: "#e49a37" },
      { key: "cancelled", label: "Cancelled", color: "#e35466" }
    ];

    const total = Math.max(data.deliveries.length, 1);

    return statuses.map((status) => {
      const count = data.deliveries.filter(
        (delivery) => delivery.status === status.key
      ).length;

      const percentage = (count / total) * 100;

      return `
        <div class="breakdown-item">
          <div class="breakdown-heading">
            <strong>${escapeHTML(status.label)}</strong>
            <span>${count} (${Math.round(percentage)}%)</span>
          </div>

          <div class="breakdown-track">
            <div class="breakdown-fill"
              style="width:${percentage}%;background:${status.color}">
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function driverAvailabilityBreakdown() {
    const available = data.drivers.filter(
      (driver) => driver.status === "available"
    ).length;

    const busy = data.drivers.filter(
      (driver) => driver.status === "busy"
    ).length;

    const offline = data.drivers.filter(
      (driver) => driver.status === "offline"
    ).length;

    const total = Math.max(data.drivers.length, 1);

    return [
      { label: "Available drivers", count: available, color: "#17a673" },
      { label: "On delivery", count: busy, color: "#7557f6" },
      { label: "Offline", count: offline, color: "#e49a37" }
    ].map((item) => {
      const percentage = (item.count / total) * 100;

      return `
        <div class="breakdown-item">
          <div class="breakdown-heading">
            <strong>${escapeHTML(item.label)}</strong>
            <span>${item.count} (${Math.round(percentage)}%)</span>
          </div>

          <div class="breakdown-track">
            <div class="breakdown-fill"
              style="width:${percentage}%;background:${item.color}">
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAnalytics() {
    const metrics = calculateMetrics();

    const completionRate =
      metrics.total > 0
        ? Math.round((metrics.delivered / metrics.total) * 100)
        : 0;

    const averageFee =
      metrics.delivered > 0
        ? metrics.revenue / metrics.delivered
        : 0;

    return `
      ${pageHeader(
        "PERFORMANCE INSIGHTS",
        "Analytics",
        "Review delivery performance and operational metrics.",
        `
          <button class="button button-secondary"
            data-action="export-csv">
            ↓ Export CSV
          </button>
        `
      )}

      <section class="stats-grid">
        ${metricCard(
          "Total deliveries",
          metrics.total,
          "▤",
          "purple",
          "All recorded orders"
        )}

        ${metricCard(
          "Completion rate",
          `${completionRate}%`,
          "✓",
          "green",
          "Delivered / all orders"
        )}

        ${metricCard(
          "Delivery revenue",
          money(metrics.revenue),
          "₦",
          "blue",
          "Fees from completed orders"
        )}

        ${metricCard(
          "Average delivery fee",
          money(averageFee),
          "↗",
          "orange",
          "Per completed order"
        )}
      </section>

      <section class="analytics-grid">
        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Delivery activity</h2>
              <p>Orders created over the last seven calendar days</p>
            </div>
          </div>

          <div class="panel-body">
            ${renderDailyChart()}
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Delivery status breakdown</h2>
              <p>Current distribution of all orders</p>
            </div>
          </div>

          <div class="panel-body">
            <div class="breakdown-list">
              ${deliveryBreakdown()}
            </div>
          </div>
        </article>
      </section>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Operational summary</h2>
            <p>Current performance indicators</p>
          </div>
        </div>

        <div class="panel-body">
          <div class="breakdown-list">
            ${driverAvailabilityBreakdown()}
          </div>

          <div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--border)">
            <div class="driver-detail" style="margin-bottom:15px">
              <span>Pending orders</span>
              <strong>${metrics.pending}</strong>
            </div>

            <div class="driver-detail" style="margin-bottom:15px">
              <span>Cancelled orders</span>
              <strong>${metrics.cancelled}</strong>
            </div>

            <div class="driver-detail">
              <span>Successful delivery rate</span>
              <strong>${completionRate}%</strong>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  // ==========================================
  // 11. SETTINGS PAGE
  // ==========================================

  function renderSettings() {
    return `
      ${pageHeader(
        "WORKSPACE PREFERENCES",
        "Settings",
        "Manage the simulator's appearance and demo data.",
        ""
      )}

      <section class="settings-grid">
        <article class="panel">
          <div class="panel-header">
            <div>
              <h2>Appearance and preferences</h2>
              <p>Adjust how DispatchPro looks and behaves.</p>
            </div>
          </div>

          <div class="panel-body">
            <div class="settings-list">

              <div class="setting-row">
                <div>
                  <h3>Dark mode</h3>
                  <p>Use a darker interface for your workspace.</p>
                </div>

                <input class="toggle-switch" id="settingsThemeToggle"
                  type="checkbox" aria-label="Enable dark mode">
              </div>

              <div class="setting-row">
                <div>
                  <h3>Delivery simulator</h3>
                  <p>Manage orders, assignments, and driver status in demo mode.</p>
                </div>

                <span class="status-badge status-delivered">Active</span>
              </div>

              <div class="setting-row">
                <div>
                  <h3>Local data storage</h3>
                  <p>Changes are saved in this browser using local storage.</p>
                </div>

                <span class="status-badge status-assigned">Enabled</span>
              </div>

              <div class="setting-row">
                <div>
                  <h3>Registered drivers</h3>
                  <p>Drivers currently stored in your simulator.</p>
                </div>

                <strong>${data.drivers.length}</strong>
              </div>

              <div class="setting-row">
                <div>
                  <h3>Recorded deliveries</h3>
                  <p>Total orders currently stored in your simulator.</p>
                </div>

                <strong>${data.deliveries.length}</strong>
              </div>

            </div>
          </div>
        </article>

        <article class="panel danger-zone">
          <div class="panel-header">
            <div>
              <h2>Demo data management</h2>
              <p>Reset the simulator to its original sample data.</p>
            </div>
          </div>

          <div class="panel-body">
            <p style="font-size:11px;line-height:1.8;color:var(--muted);margin-bottom:20px">
              Resetting restores the original demo deliveries and drivers.
              Your current demo changes will be lost.
            </p>

            <button class="button button-danger"
              data-action="reset-data">
              Reset demo data
            </button>

            <div style="height:20px"></div>

            <p style="font-size:11px;line-height:1.8;color:var(--muted);margin-bottom:15px">
              Download a copy of your current delivery records for use in a spreadsheet.
            </p>

            <button class="button button-secondary"
              data-action="export-csv">
              ↓ Export deliveries
            </button>
          </div>
        </article>
      </section>
    `;
  }

  // ==========================================
  // 12. PAGE NAVIGATION AND RENDERING
  // ==========================================

  const pageNames = {
    dashboard: "Dashboard",
    deliveries: "Deliveries",
    drivers: "Drivers",
    analytics: "Analytics",
    settings: "Settings"
  };

  function renderPage() {
    syncDrivers();

    const renderers = {
      dashboard: renderDashboard,
      deliveries: renderDeliveries,
      drivers: renderDrivers,
      analytics: renderAnalytics,
      settings: renderSettings
    };

    pageContent.innerHTML = (
      renderers[currentPage] || renderDashboard
    )();

    $("breadcrumbTitle").textContent =
      pageNames[currentPage] || "Dashboard";

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle(
        "active",
        item.dataset.page === currentPage
      );
    });

    $("deliveryNavCount").textContent =
      data.deliveries.filter(
        (delivery) => delivery.status !== "cancelled"
      ).length;

    if (currentPage === "settings") {
      const themeToggle = $("settingsThemeToggle");

      if (themeToggle) {
        themeToggle.checked =
          document.body.classList.contains("dark-theme");
      }
    }
  }

  function navigateTo(page) {
    if (!pageNames[page]) return;

    currentPage = page;
    searchTerm = "";
    statusFilter = "all";

    renderPage();

    document.body.classList.remove("sidebar-open");
  }

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      navigateTo(item.dataset.page);
    });
  });

  // ==========================================
  // 13. MODAL CONTROLS
  // ==========================================

  function openModal() {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      $("customerName").focus();
    }, 100);
  }

  function closeModal() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
    deliveryForm.reset();
  }

  $("closeModal").addEventListener("click", closeModal);
  $("cancelModal").addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      document.body.classList.remove("sidebar-open");
    }
  });

  // ==========================================
  // 14. CREATE DELIVERY
  // ==========================================

  deliveryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const customer = $("customerName").value.trim();
    const phone = $("customerPhone").value.trim();
    const address = $("deliveryAddress").value.trim();
    const zone = $("deliveryZone").value;
    const fee = Number($("deliveryFee").value);
    const notes = $("deliveryNotes").value.trim();

    if (!customer || !phone || !address || !zone) {
      showToast("Please complete all required fields.", "error");
      return;
    }

    if (!Number.isFinite(fee) || fee < 0) {
      showToast("Enter a valid delivery fee.", "error");
      return;
    }

    const delivery = {
      id: `DSP-${data.nextDeliveryNumber++}`,
      customer,
      phone,
      address,
      zone,
      fee,
      notes,
      status: "pending",
      driverId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const assignedDriver = assignDriver(delivery);

    data.deliveries.unshift(delivery);

    if (assignedDriver) {
      logActivity(
        `Delivery ${delivery.id} was created and assigned to ${assignedDriver.name}.`,
        "success"
      );
    } else {
      logActivity(
        `Delivery ${delivery.id} was created and is awaiting driver assignment.`,
        "warning"
      );
    }

    saveData();
    closeModal();

    currentPage = "deliveries";
    searchTerm = "";
    statusFilter = "all";

    renderPage();

    if (assignedDriver) {
      showToast(
        `${delivery.id} created. Driver assigned: ${assignedDriver.name}.`
      );
    } else {
      showToast(
        `${delivery.id} created. No driver is available right now.`,
        "info"
      );
    }
  });

  // ==========================================
  // 15. DELIVERY ACTIONS
  // ==========================================

  function findDelivery(deliveryId) {
    return data.deliveries.find(
      (delivery) => delivery.id === deliveryId
    );
  }

  function updateDeliveryStatus(deliveryId, nextStatus) {
    const delivery = findDelivery(deliveryId);

    if (!delivery) {
      showToast("Delivery not found.", "error");
      return;
    }

    const allowedTransitions = {
      pending: ["assigned", "cancelled"],
      assigned: ["in_transit", "cancelled"],
      in_transit: ["delivered"]
    };

    if (
      !(allowedTransitions[delivery.status] || []).includes(nextStatus)
    ) {
      showToast("That status change is not allowed.", "error");
      return;
    }

    if (nextStatus === "assigned") {
      const driver = assignDriver(delivery);

      if (!driver) {
        showToast("No available drivers. Bring a driver online first.", "error");
        renderPage();
        return;
      }

      delivery.updatedAt = new Date().toISOString();

      logActivity(
        `Delivery ${delivery.id} was assigned to ${driver.name}.`,
        "success"
      );

      saveData();
      renderPage();

      showToast(`Assigned ${driver.name} to ${delivery.id}.`);
      return;
    }

    delivery.status = nextStatus;
    delivery.updatedAt = new Date().toISOString();

    if (nextStatus === "in_transit") {
      const driver = getDriver(delivery.driverId);

      logActivity(
        `Delivery ${delivery.id} is now in transit${driver ? ` with ${driver.name}` : ""}.`,
        "info"
      );

      showToast(`${delivery.id} is now in transit.`);
    }

    if (nextStatus === "delivered") {
      const driver = getDriver(delivery.driverId);

      if (driver) {
        driver.completedDeliveries =
          (Number(driver.completedDeliveries) || 0) + 1;
      }

      logActivity(
        `Delivery ${delivery.id} was successfully completed.`,
        "success"
      );

      showToast(`${delivery.id} marked as delivered.`);
    }

    if (nextStatus === "cancelled") {
      logActivity(
        `Delivery ${delivery.id} was cancelled.`,
        "warning"
      );

      showToast(`${delivery.id} cancelled.`, "info");
    }

    syncDrivers();
    saveData();
    renderPage();
  }

  function handleDeliveryAction(action, deliveryId) {
    if (action === "assign") {
      updateDeliveryStatus(deliveryId, "assigned");
    }

    if (action === "transit") {
      updateDeliveryStatus(deliveryId, "in_transit");
    }

    if (action === "deliver") {
      updateDeliveryStatus(deliveryId, "delivered");
    }

    if (action === "cancel") {
      const delivery = findDelivery(deliveryId);

      if (!delivery) return;

      const confirmed = window.confirm(
        `Cancel delivery ${deliveryId}?`
      );

      if (confirmed) {
        updateDeliveryStatus(deliveryId, "cancelled");
      }
    }
  }

  // ==========================================
  // 16. DRIVER AVAILABILITY
  // ==========================================

  function toggleDriver(driverId) {
    const driver = getDriver(driverId);

    if (!driver) return;

    syncDrivers();

    if (driver.status === "offline") {
      driver.status =
        getActiveDeliveryCount(driver.id) > 0
          ? "busy"
          : "available";

      logActivity(`${driver.name} is now online.`, "success");

      saveData();
      renderPage();

      showToast(`${driver.name} is now online.`);
      return;
    }

    if (getActiveDeliveryCount(driver.id) > 0) {
      showToast(
        "This driver has an active delivery and cannot go offline yet.",
        "error"
      );
      return;
    }

    driver.status = "offline";

    logActivity(`${driver.name} was set offline.`, "warning");

    saveData();
    renderPage();

    showToast(`${driver.name} is now offline.`, "info");
  }

  // ==========================================
  // 17. SEARCH AND FILTER
  // ==========================================

  pageContent.addEventListener("input", (event) => {
    if (event.target.id === "deliverySearch") {
      const input = event.target;
      const cursorPosition = input.selectionStart;

      searchTerm = input.value;

      const currentValue = searchTerm;

      renderPage();

      const newInput = $("deliverySearch");

      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(cursorPosition, cursorPosition);
      }

      // Keep the current search value if the page re-renders.
      searchTerm = currentValue;
    }
  });

  pageContent.addEventListener("change", (event) => {
    if (event.target.id === "statusFilter") {
      statusFilter = event.target.value;
      renderPage();
    }

    if (event.target.id === "settingsThemeToggle") {
      applyTheme(event.target.checked);
      renderPage();
    }
  });

  // ==========================================
  // 18. CSV EXPORT
  // ==========================================

  function exportDeliveriesCSV() {
    const headers = [
      "Delivery ID",
      "Customer",
      "Phone",
      "Address",
      "Zone",
      "Driver",
      "Status",
      "Delivery Fee",
      "Notes",
      "Created At"
    ];

    const rows = data.deliveries.map((delivery) => {
      const driver = getDriver(delivery.driverId);

      return [
        delivery.id,
        delivery.customer,
        delivery.phone,
        delivery.address,
        delivery.zone,
        driver?.name || "Unassigned",
        statusLabels[delivery.status] || delivery.status,
        delivery.fee,
        delivery.notes || "",
        delivery.createdAt
      ];
    });

    const escapeCSV = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(","))
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `dispatchpro-deliveries-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast("Delivery records exported successfully.");
  }

  // ==========================================
  // 19. RESET DEMO DATA
  // ==========================================

  function resetDemoData() {
    const confirmed = window.confirm(
      "Reset all simulator changes and restore the original sample data? This cannot be undone."
    );

    if (!confirmed) return;

    data = normalizeData({
      drivers: initialDrivers.map((driver) => ({ ...driver })),
      deliveries: initialDeliveries.map((delivery) => ({ ...delivery })),
      activities: [],
      nextDeliveryNumber: 1006
    });

    searchTerm = "";
    statusFilter = "all";

    saveData();

    logActivity("Demo data was reset to the original sample records.", "warning");

    currentPage = "dashboard";
    renderPage();

    showToast("Demo data has been reset.");
  }

  // ==========================================
  // 20. DARK MODE
  // ==========================================

  function applyTheme(isDark) {
    document.body.classList.toggle("dark-theme", isDark);

    $("themeToggle").textContent = isDark ? "☀" : "☾";

    $("themeToggle").setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );

    $("themeToggle").title =
      isDark ? "Switch to light mode" : "Switch to dark mode";

    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch (error) {
      console.warn("Could not save theme preference.", error);
    }

    const settingsToggle = $("settingsThemeToggle");

    if (settingsToggle) {
      settingsToggle.checked = isDark;
    }
  }

  let savedTheme = "light";

  try {
    savedTheme = localStorage.getItem(THEME_KEY) || "light";
  } catch (error) {
    console.warn("Could not load theme preference.", error);
  }

  applyTheme(savedTheme === "dark");

  $("themeToggle").addEventListener("click", () => {
    const isDark = !document.body.classList.contains("dark-theme");

    applyTheme(isDark);

    if (currentPage === "settings") {
      renderPage();
    }
  });

  // ==========================================
  // 21. GLOBAL BUTTON ACTIONS
  // ==========================================

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const deliveryId = actionButton.dataset.id;

    if (action === "new-delivery") {
      openModal();
    }

    if (action === "navigate-deliveries") {
      navigateTo("deliveries");
    }

    if (action === "navigate-drivers") {
      navigateTo("drivers");
    }

    if (action === "refresh") {
      syncDrivers();
      saveData();
      renderPage();
      showToast("Dashboard refreshed.");
    }

    if (action === "assign" ||
        action === "transit" ||
        action === "deliver" ||
        action === "cancel") {
      handleDeliveryAction(action, deliveryId);
    }

    if (action === "toggle-driver") {
      toggleDriver(actionButton.dataset.id);
    }

    if (action === "export-csv") {
      exportDeliveriesCSV();
    }

    if (action === "reset-data") {
      resetDemoData();
    }
  });

  // ==========================================
  // 22. MOBILE NAVIGATION
  // ==========================================

  $("menuButton").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });

  document.addEventListener("click", (event) => {
    const clickedMenu = $("menuButton").contains(event.target);
    const clickedSidebar = $("sidebar").contains(event.target);

    if (!clickedMenu && !clickedSidebar) {
      document.body.classList.remove("sidebar-open");
    }
  });

  // ==========================================
  // 23. NOTIFICATIONS
  // ==========================================

  $("notificationButton").addEventListener("click", () => {
    const metrics = calculateMetrics();

    showToast(
      `${metrics.pending} pending orders and ${metrics.availableDrivers} available drivers.`,
      "info"
    );
  });

  // ==========================================
  // 24. START APPLICATION
  // ==========================================

  $("currentYear").textContent = new Date().getFullYear();

  syncDrivers();
  saveData();
  renderPage();

  logActivity("DispatchPro simulator is ready.", "success");
  renderPage();

});