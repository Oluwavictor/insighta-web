(function () {
	"use strict";
  
	const API_VERSION_HEADER = { "X-API-Version": "1" };
	let currentUser = null;
	let currentPage = 1;
  
	//Token Management 
	function getTokens() {
	  const a = sessionStorage.getItem("access_token");
	  const r = sessionStorage.getItem("refresh_token");
	  return a && r ? { access_token: a, refresh_token: r } : null;
	}
  
	function saveTokens(access_token, refresh_token) {
	  sessionStorage.setItem("access_token", access_token);
	  sessionStorage.setItem("refresh_token", refresh_token);
	}
  
	function clearTokens() {
	  sessionStorage.removeItem("access_token");
	  sessionStorage.removeItem("refresh_token");
	}
  
	// API Client 
	async function apiRequest(method, path, body = null) {
	  const tokens = getTokens();
	  const headers = {
		"Content-Type": "application/json",
		...API_VERSION_HEADER,
	  };
  
	  if (tokens) {
		headers["Authorization"] = `Bearer ${tokens.access_token}`;
	  }
  
	  const options = { method, headers };
	  if (body) options.body = JSON.stringify(body);
  
	  let res = await fetch(path, options);
  
	  // Auto-refresh on 401
	  if (res.status === 401 && tokens?.refresh_token) {
		const refreshRes = await fetch("/auth/refresh", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({ refresh_token: tokens.refresh_token }),
		});
  
		if (refreshRes.ok) {
		  const data = await refreshRes.json();
		  saveTokens(data.data.access_token, data.data.refresh_token);
		  headers["Authorization"] = `Bearer ${data.data.access_token}`;
		  res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : null });
		} else {
		  clearTokens();
		  showLogin();
		  return null;
		}
	  }
  
	  return res;
	}
  
	// Page Management 
  
	function showLogin() {
	  document.getElementById("page-login").classList.remove("hidden");
	  document.getElementById("page-dashboard").classList.add("hidden");
	}
  
	function showDashboard() {
	  document.getElementById("page-login").classList.add("hidden");
	  document.getElementById("page-dashboard").classList.remove("hidden");
	}
  
	function showSection(name) {
	  document.querySelectorAll(".section").forEach((s) => s.classList.add("hidden"));
	  document.getElementById(`section-${name}`)?.classList.remove("hidden");
	}
  
	// Auth 
	async function checkAuth() {
	  // Read tokens from URL after GitHub redirect
	  const urlParams = new URLSearchParams(window.location.search);
	  const access_token = urlParams.get("access_token");
	  const refresh_token = urlParams.get("refresh_token");
  
	  if (access_token && refresh_token) {
		saveTokens(access_token, refresh_token);
		window.history.replaceState({}, "", "/dashboard");
	  }
  
	  const tokens = getTokens();
	  if (!tokens) {
		showLogin();
		return;
	  }
  
	  const res = await apiRequest("GET", "/auth/whoami");
	  if (!res || !res.ok) {
		clearTokens();
		showLogin();
		return;
	  }
  
	  const data = await res.json();
	  currentUser = data.data;
  
	  showDashboard();
	  showSection("dashboard");
	  loadDashboard();
	}
  
	async function logout() {
	  const tokens = getTokens();
	  if (tokens) {
		await apiRequest("POST", "/auth/logout", {
		  refresh_token: tokens.refresh_token,
		});
	  }
	  clearTokens();
	  showLogin();
	}
  
	//Dashboard 
	async function loadDashboard() {
	  const res = await apiRequest("GET", "/api/profiles?limit=1");
	  if (!res?.ok) return;
	  const data = await res.json();
	  document.getElementById("stat-total").textContent = data.total ?? "—";
  
	  const [mRes, fRes] = await Promise.all([
		apiRequest("GET", "/api/profiles?gender=male&limit=1"),
		apiRequest("GET", "/api/profiles?gender=female&limit=1"),
	  ]);
  
	  if (mRes?.ok) {
		const md = await mRes.json();
		document.getElementById("stat-male").textContent = md.total ?? "—";
	  }
	  if (fRes?.ok) {
		const fd = await fRes.json();
		document.getElementById("stat-female").textContent = fd.total ?? "—";
	  }
	}
  
	// Profiles
  
	async function loadProfiles(page = 1) {
	  const gender = document.getElementById("filter-gender").value;
	  const ageGroup = document.getElementById("filter-age-group").value;
	  const country = document.getElementById("filter-country").value;
	  const minAge = document.getElementById("filter-min-age").value;
	  const maxAge = document.getElementById("filter-max-age").value;
  
	  const params = new URLSearchParams({ page, limit: 10 });
	  if (gender) params.set("gender", gender);
	  if (ageGroup) params.set("age_group", ageGroup);
	  if (country) params.set("country_id", country.toUpperCase());
	  if (minAge) params.set("min_age", minAge);
	  if (maxAge) params.set("max_age", maxAge);
  
	  const res = await apiRequest("GET", `/api/profiles?${params}`);
	  if (!res?.ok) return;
  
	  const data = await res.json();
	  currentPage = page;
  
	  const tbody = document.getElementById("profiles-tbody");
	  tbody.innerHTML = "";
  
	  for (const p of data.data) {
		const tr = document.createElement("tr");
		tr.innerHTML = `
		  <td>${p.name}</td>
		  <td>${p.gender}</td>
		  <td>${p.age}</td>
		  <td>${p.age_group}</td>
		  <td>${p.country_id} — ${p.country_name}</td>
		  <td><button class="btn-link" data-id="${p.id}">View</button></td>
		`;
		tbody.appendChild(tr);
	  }
  
	  tbody.querySelectorAll("[data-id]").forEach((btn) => {
		btn.addEventListener("click", () => loadProfileDetail(btn.dataset.id));
	  });
  
	  renderPagination("profiles-pagination", page, data.total_pages, loadProfiles);
  
	  const exportLink = document.getElementById("export-csv");
	  exportLink.href = `/api/profiles/export?format=csv&${params}`;
	  exportLink.setAttribute("download", "");
	}
  
	async function loadProfileDetail(id) {
	  showSection("profile-detail");
  
	  const res = await apiRequest("GET", `/api/profiles/${id}`);
	  if (!res?.ok) return;
	  const { data: p } = await res.json();
  
	  document.getElementById("profile-detail-content").innerHTML = `
		<h3>${p.name}</h3>
		<div class="detail-row"><span class="detail-label">ID</span><span>${p.id}</span></div>
		<div class="detail-row"><span class="detail-label">Gender</span><span>${p.gender} (${(p.gender_probability * 100).toFixed(1)}%)</span></div>
		<div class="detail-row"><span class="detail-label">Age</span><span>${p.age} (${p.age_group})</span></div>
		<div class="detail-row"><span class="detail-label">Country</span><span>${p.country_name} (${p.country_id}) — ${(p.country_probability * 100).toFixed(1)}%</span></div>
		<div class="detail-row"><span class="detail-label">Created</span><span>${p.created_at}</span></div>
	  `;
	}
  
	//Search
  
	async function performSearch(query, page = 1) {
	  const params = new URLSearchParams({ q: query, page, limit: 10 });
	  const res = await apiRequest("GET", `/api/profiles/search?${params}`);
	  if (!res?.ok) return;
  
	  const data = await res.json();
	  const container = document.getElementById("search-results");
  
	  if (!data.data?.length) {
		container.innerHTML = "<p>No results found.</p>";
		return;
	  }
  
	  const rows = data.data.map((p) => `
		<tr>
		  <td>${p.name}</td>
		  <td>${p.gender}</td>
		  <td>${p.age}</td>
		  <td>${p.age_group}</td>
		  <td>${p.country_id} — ${p.country_name}</td>
		</tr>
	  `).join("");
  
	  container.innerHTML = `
		<p style="margin-bottom:12px; color:#6b7280">${data.total} result(s) for "${query}"</p>
		<table class="data-table">
		  <thead>
			<tr>
			  <th>Name</th><th>Gender</th><th>Age</th><th>Age Group</th><th>Country</th>
			</tr>
		  </thead>
		  <tbody>${rows}</tbody>
		</table>
	  `;
  
	  renderPagination("search-results", page, data.total_pages, (p) =>
		performSearch(query, p)
	  );
	}
  
	// Account 
  
	function loadAccount() {
	  if (!currentUser) return;
	  document.getElementById("account-info").innerHTML = `
		<div class="detail-row"><span class="detail-label">Username</span><span>@${currentUser.username}</span></div>
		<div class="detail-row"><span class="detail-label">Email</span><span>${currentUser.email || "—"}</span></div>
		<div class="detail-row"><span class="detail-label">Role</span><span>${currentUser.role}</span></div>
		<div class="detail-row"><span class="detail-label">Status</span><span>${currentUser.is_active ? "Active" : "Inactive"}</span></div>
	  `;
	}
  
	// ── Pagination
	function renderPagination(containerId, currentPage, totalPages, onPageChange) {
	  const container = document.getElementById(containerId);
	  if (!container || totalPages <= 1) return;
  
	  const existing = container.parentNode.querySelector(".pagination");
	  if (existing) existing.remove();
  
	  const paginationEl = document.createElement("div");
	  paginationEl.className = "pagination";
  
	  for (let i = 1; i <= totalPages; i++) {
		const btn = document.createElement("button");
		btn.className = `page-btn${i === currentPage ? " active" : ""}`;
		btn.textContent = i;
		btn.addEventListener("click", () => onPageChange(i));
		paginationEl.appendChild(btn);
	  }
  
	  container.parentNode.insertBefore(paginationEl, container.nextSibling);
	}
  
	//Event Listeners
	document.getElementById("logout-btn").addEventListener("click", logout);
  
	document.querySelectorAll("[data-page]").forEach((link) => {
	  link.addEventListener("click", (e) => {
		e.preventDefault();
		const page = link.dataset.page;
		showSection(page);
		if (page === "profiles") loadProfiles(1);
		if (page === "account") loadAccount();
		if (page === "dashboard") loadDashboard();
	  });
	});
  
	document.getElementById("apply-filters").addEventListener("click", () => {
	  loadProfiles(1);
	});
  
	document.getElementById("back-to-profiles").addEventListener("click", () => {
	  showSection("profiles");
	});
  
	document.getElementById("nlq-search").addEventListener("click", () => {
	  const q = document.getElementById("nlq-input").value.trim();
	  if (q) performSearch(q, 1);
	});
  
	document.getElementById("nlq-input").addEventListener("keydown", (e) => {
	  if (e.key === "Enter") {
		const q = e.target.value.trim();
		if (q) performSearch(q, 1);
	  }
	});
  
	//Init 
	checkAuth();
  })();