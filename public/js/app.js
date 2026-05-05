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

	function isAdmin() {
		return currentUser?.role === "admin";
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
		  res = await fetch(path, 
			{ 
				method, 
				headers, 
				body: body ? JSON.stringify(body) : null 
			});
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

	   //  Show/hide admin-only UI based on role
	   renderAdminUI();
  
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

	//  Admin UI 
	function renderAdminUI() {
		if (!isAdmin()) return;
	
		// Add "Create Profile" button to profiles section
		const filterBar = document.querySelector(".filter-bar");
		if (filterBar && !document.getElementById("create-profile-btn")) {
		  const createBtn = document.createElement("button");
		  createBtn.id = "create-profile-btn";
		  createBtn.className = "btn";
		  createBtn.textContent = "+ Create Profile";
		  createBtn.addEventListener("click", () => showCreateProfileModal());
		  filterBar.appendChild(createBtn);
	
		  // Add CSV Upload button
		  const uploadBtn = document.createElement("button");
		  uploadBtn.id = "upload-csv-btn";
		  uploadBtn.className = "btn btn-secondary";
		  uploadBtn.textContent = "⬆ Upload CSV";
		  uploadBtn.addEventListener("click", () => showUploadCsvModal());
		  filterBar.appendChild(uploadBtn);
		}
	  }
	
	  // Create Profile Modal 
	  function showCreateProfileModal() {
		const existing = document.getElementById("create-modal");
		if (existing) existing.remove();
	
		const modal = document.createElement("div");
		modal.id = "create-modal";
		modal.className = "modal-overlay";
		modal.innerHTML = `
		  <div class="modal-box">
			<h3>Create Profile</h3>
			<p style="color:#6b7280;margin-bottom:16px;font-size:0.9rem;">
			  Enter a name — gender, age, and country will be enriched automatically.
			</p>
			<label class="form-label">Name</label>
			<input id="new-profile-name" type="text" class="form-input"
			  placeholder="e.g. Harriet Tubman" />
			<div id="create-profile-error" class="form-error hidden"></div>
			<div class="modal-actions">
			  <button id="create-profile-submit" class="btn">Create</button>
			  <button id="create-profile-cancel" class="btn btn-secondary">Cancel</button>
			</div>
		  </div>
		`;
	
		document.body.appendChild(modal);
	
		document.getElementById("create-profile-cancel").addEventListener("click", () => {
		  modal.remove();
		});
	
		modal.addEventListener("click", (e) => {
		  if (e.target === modal) modal.remove();
		});
	
		document.getElementById("create-profile-submit").addEventListener("click", async () => {
		  const name = document.getElementById("new-profile-name").value.trim();
		  const errorEl = document.getElementById("create-profile-error");
		  const submitBtn = document.getElementById("create-profile-submit");
	
		  if (!name) {
			errorEl.textContent = "Name is required";
			errorEl.classList.remove("hidden");
			return;
		  }
	
		  submitBtn.disabled = true;
		  submitBtn.textContent = "Creating...";
		  errorEl.classList.add("hidden");
	
		  const res = await apiRequest("POST", "/api/profiles", { name });
	
		  if (!res) {
			submitBtn.disabled = false;
			submitBtn.textContent = "Create";
			return;
		  }
	
		  if (!res.ok) {
			const err = await res.json();
			errorEl.textContent = err.message || "Failed to create profile";
			errorEl.classList.remove("hidden");
			submitBtn.disabled = false;
			submitBtn.textContent = "Create";
			return;
		  }
	
		  modal.remove();
		  showToast("Profile created successfully ");
		  loadProfiles(currentPage);
		  loadDashboard();
		});
	
		// Focus input
		setTimeout(() => {
		  document.getElementById("new-profile-name")?.focus();
		}, 100);
	  }
	
	  // CSV Upload Modal 
	  function showUploadCsvModal() {
		const existing = document.getElementById("upload-modal");
		if (existing) existing.remove();
	
		const modal = document.createElement("div");
		modal.id = "upload-modal";
		modal.className = "modal-overlay";
		modal.innerHTML = `
		  <div class="modal-box">
			<h3>Upload CSV</h3>
			<p style="color:#6b7280;margin-bottom:16px;font-size:0.9rem;">
			  Upload a CSV file with profile data. Up to 500,000 rows supported.
			</p>
			<p style="color:#6b7280;margin-bottom:16px;font-size:0.85rem;">
			  Required columns: <strong>name, gender, age</strong><br/>
			  Optional: country_id, country_name, gender_probability, country_probability
			</p>
			<label class="form-label">Select CSV File</label>
			<input id="csv-file-input" type="file" accept=".csv" class="form-input" />
			<div id="upload-progress" class="hidden" style="margin-top:12px;">
			  <div style="color:#4f46e5;font-size:0.9rem;"> Uploading and processing...</div>
			  <div style="color:#6b7280;font-size:0.8rem;margin-top:4px;">
				Large files may take a moment. Please wait.
			  </div>
			</div>
			<div id="upload-result" class="hidden" style="margin-top:12px;"></div>
			<div id="upload-error" class="form-error hidden"></div>
			<div class="modal-actions">
			  <button id="upload-csv-submit" class="btn">Upload</button>
			  <button id="upload-csv-cancel" class="btn btn-secondary">Cancel</button>
			</div>
		  </div>
		`;
	
		document.body.appendChild(modal);
	
		document.getElementById("upload-csv-cancel").addEventListener("click", () => {
		  modal.remove();
		});
	
		modal.addEventListener("click", (e) => {
		  if (e.target === modal) modal.remove();
		});
	
		document.getElementById("upload-csv-submit").addEventListener("click", async () => {
		  const fileInput = document.getElementById("csv-file-input");
		  const errorEl = document.getElementById("upload-error");
		  const progressEl = document.getElementById("upload-progress");
		  const resultEl = document.getElementById("upload-result");
		  const submitBtn = document.getElementById("upload-csv-submit");
		  const cancelBtn = document.getElementById("upload-csv-cancel");
	
		  if (!fileInput.files || !fileInput.files[0]) {
			errorEl.textContent = "Please select a CSV file";
			errorEl.classList.remove("hidden");
			return;
		  }
	
		  const file = fileInput.files[0];
		  if (!file.name.endsWith(".csv")) {
			errorEl.textContent = "Only CSV files are allowed";
			errorEl.classList.remove("hidden");
			return;
		  }
	
		  // Show progress
		  submitBtn.disabled = true;
		  cancelBtn.disabled = true;
		  submitBtn.textContent = "Uploading...";
		  progressEl.classList.remove("hidden");
		  errorEl.classList.add("hidden");
		  resultEl.classList.add("hidden");
	
		  const tokens = getTokens();
		  if (!tokens) {
			showLogin();
			return;
		  }
	
		  // Use FormData for file upload — not JSON
		  const formData = new FormData();
		  formData.append("file", file);
	
		  try {
			let res = await fetch("/api/ingestion/upload", {
			  method: "POST",
			  headers: {
				Authorization: `Bearer ${tokens.access_token}`,
				"X-API-Version": "1",
				// Don't set Content-Type — browser sets it with boundary
			  },
			  body: formData,
			});
	
			// Auto-refresh on 401
			if (res.status === 401 && tokens.refresh_token) {
			  const refreshRes = await fetch("/auth/refresh", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ refresh_token: tokens.refresh_token }),
			  });
	
			  if (refreshRes.ok) {
				const refreshData = await refreshRes.json();
				saveTokens(
				  refreshData.data.access_token,
				  refreshData.data.refresh_token
				);
	
				res = await fetch("/api/ingestion/upload", {
				  method: "POST",
				  headers: {
					Authorization: `Bearer ${refreshData.data.access_token}`,
					"X-API-Version": "1",
				  },
				  body: formData,
				});
			  }
			}
	
			progressEl.classList.add("hidden");
	
			if (!res.ok) {
			  const err = await res.json();
			  errorEl.textContent = err.message || "Upload failed";
			  errorEl.classList.remove("hidden");
			  submitBtn.disabled = false;
			  cancelBtn.disabled = false;
			  submitBtn.textContent = "Upload";
			  return;
			}
	
			const result = await res.json();
			const d = result.data;
	
			// Show ingestion summary
			resultEl.innerHTML = `
			  <div style="background:#f0fdf4;border:1px solid #bbf7d0;
				border-radius:8px;padding:16px;font-size:0.88rem;">
				<div style="font-weight:600;color:#15803d;margin-bottom:8px;">
				   Upload Complete
				</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
				  <div>Total rows: <strong>${d.total_rows}</strong></div>
				  <div>Inserted: <strong style="color:#15803d">${d.inserted}</strong></div>
				  <div>Skipped: <strong style="color:#dc2626">${d.skipped}</strong></div>
				</div>
				${d.skipped > 0 ? `
				<div style="margin-top:12px;color:#6b7280;font-size:0.82rem;">
				  <div style="font-weight:600;margin-bottom:4px;">Skip reasons:</div>
				  ${Object.entries(d.reasons)
					.filter(([, v]) => v > 0)
					.map(([k, v]) => `<div>${k.replace(/_/g, " ")}: ${v}</div>`)
					.join("")}
				</div>` : ""}
			  </div>
			`;
			resultEl.classList.remove("hidden");
	
			// Refresh profiles list
			loadProfiles(1);
			loadDashboard();
	
			submitBtn.disabled = false;
			cancelBtn.disabled = false;
			submitBtn.textContent = "Upload Another";
	
			// Re-enable file input for another upload
			fileInput.value = "";
		  } catch (err) {
			progressEl.classList.add("hidden");
			errorEl.textContent = "Network error. Please try again.";
			errorEl.classList.remove("hidden");
			submitBtn.disabled = false;
			cancelBtn.disabled = false;
			submitBtn.textContent = "Upload";
		  }
		});
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
		  <td>
		  	<button class="btn-link" data-id="${p.id}"  data-action="view">
				View
			</button>

			${isAdmin() ? `
            <button class="btn-link" style="color:#dc2626;margin-left:8px;"
              data-id="${p.id}" data-action="delete">Delete</button>
          ` : ""}
		  </td>
		`;
		tbody.appendChild(tr);
	  }

		// Wire up view and delete buttons
		tbody.querySelectorAll("[data-action='view']").forEach((btn) => {
			btn.addEventListener("click", () => loadProfileDetail(btn.dataset.id));
		});

		tbody.querySelectorAll("[data-action='delete']").forEach((btn) => {
			btn.addEventListener("click", () =>
			  confirmDeleteProfile(btn.dataset.id, p => p.name)
			);
		});

		// tbody.querySelectorAll("[data-id]").forEach((btn) => {
		// 	btn.addEventListener("click", () => loadProfileDetail(btn.dataset.id));
		// });

		// table header to show Action column
		const thead = document.querySelector(".data-table thead tr");
		if (thead) {
		  thead.innerHTML = `
			<th>Name</th>
			<th>Gender</th>
			<th>Age</th>
			<th>Age Group</th>
			<th>Country</th>
			<th>Action</th>
		  `;
		}
  
		renderPagination(
			"profiles-pagination", 
			page, 
			data.total_pages, 
			loadProfiles
		);

		//  export CSV 
		const exportBtn = document.getElementById("export-csv");
		exportBtn.onclick = async (e) => {
		  e.preventDefault();
		  await downloadExportCsv(params);
		};
	
		// const exportLink = document.getElementById("export-csv");
		// exportLink.href = `/api/profiles/export?format=csv&${params}`;
		// exportLink.setAttribute("download", "");
	}

	// Delete Profile 
	function confirmDeleteProfile(id) {
		const existing = document.getElementById("delete-modal");
		if (existing) existing.remove();
	
		const modal = document.createElement("div");
		modal.id = "delete-modal";
		modal.className = "modal-overlay";
		modal.innerHTML = `
		  <div class="modal-box">
			<h3>Delete Profile</h3>
			<p style="color:#6b7280;margin:16px 0;">
			  Are you sure you want to delete this profile?
			  This action cannot be undone.
			</p>
			<div class="modal-actions">
			  <button id="confirm-delete-btn" class="btn"
				style="background:#dc2626;">Delete</button>
			  <button id="cancel-delete-btn" class="btn btn-secondary">Cancel</button>
			</div>
		  </div>
		`;
	
		document.body.appendChild(modal);
	
		document.getElementById("cancel-delete-btn").addEventListener("click", () => {
		  modal.remove();
		});
	
		modal.addEventListener("click", (e) => {
		  if (e.target === modal) modal.remove();
		});
	
		document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
		  const btn = document.getElementById("confirm-delete-btn");
		  btn.disabled = true;
		  btn.textContent = "Deleting...";
	
		  const res = await apiRequest("DELETE", `/api/profiles/${id}`);
	
		  modal.remove();
	
		  if (res && res.status === 204) {
			showToast("Profile deleted ");
			loadProfiles(currentPage);
			loadDashboard();
		  } else {
			showToast("Failed to delete profile ");
		  }
		});
	  }
	
	  // Export CSV with Auth 
	  async function downloadExportCsv(params) {
		const tokens = getTokens();
		if (!tokens) {
		  showLogin();
		  return;
		}
	
		try {
	
		  const res = await fetch(`/api/profiles/export?${params.toString()}`, {
			method: "GET",
			headers: {
			  Authorization: `Bearer ${tokens.access_token}`,
			  "X-API-Version": "1",
			},
		  });
	
		  if (!res.ok) {
			showToast("Export failed ");
			return;
		  }
	
		  // Convert response to blob and trigger download
		  const blob = await res.blob();
		  const url = URL.createObjectURL(blob);
		  const a = document.createElement("a");
		  a.href = url;
		  a.download = `profiles_export.csv`;
		  document.body.appendChild(a);
		  a.click();
		  a.remove();
		  URL.revokeObjectURL(url);
	
		  showToast("Export downloaded ");
		} catch {
		  showToast("Export failed — network error ");
		}
	  }

	  // Profile Detail
	async function loadProfileDetail(id) {
		showSection("profile-detail");
	
		const res = await apiRequest("GET", `/api/profiles/${id}`);
		if (!res?.ok) return;
		const { data: p } = await res.json();
	
		document.getElementById("profile-detail-content").innerHTML = `
		<h3>${p.name}</h3>
		<div class="detail-row">
			<span class="detail-label">ID</span>
			<span>${p.id}</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">Gender</span>
			<span>${p.gender} (${(p.gender_probability * 100).toFixed(1)}%)</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">Age</span>
			<span>${p.age} (${p.age_group})</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">Country</span>
			<span>${p.country_name} (${p.country_id})
			— ${(p.country_probability * 100).toFixed(1)}%</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">Created</span>
			<span>${p.created_at}</span>
		</div>
		${isAdmin() ? `
		<div style="margin-top:20px;">
			<button class="btn" style="background:#dc2626;"
			id="detail-delete-btn">Delete Profile</button>
		</div>` : ""}
		`;

		if (isAdmin()) {
		document.getElementById("detail-delete-btn")
			.addEventListener("click", () => {
			confirmDeleteProfile(p.id);
			});
		}
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
			  <th>Name</th>
			  <th>Gender</th>
			  <th>Age</th>
			  <th>Age Group</th>
			  <th>Country</th>
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
		  <div class="detail-row">
			<span class="detail-label">Username</span>
			<span>@${currentUser.username}</span>
		  </div>
		  <div class="detail-row">
			<span class="detail-label">Email</span>
			<span>${currentUser.email || "—"}</span>
		  </div>
		  <div class="detail-row">
			<span class="detail-label">Role</span>
			<span>${currentUser.role}</span>
		  </div>
		  <div class="detail-row">
			<span class="detail-label">Status</span>
			<span>${currentUser.is_active ? "Active" : "Inactive"}</span>
		  </div>
		`;
	}

	// Toast Notification 
	function showToast(message) {
		const existing = document.getElementById("toast");
		if (existing) existing.remove();
	
		const toast = document.createElement("div");
		toast.id = "toast";
		toast.textContent = message;
		toast.style.cssText = `
		  position: fixed;
		  bottom: 24px;
		  right: 24px;
		  background: #1a1a2e;
		  color: #fff;
		  padding: 12px 20px;
		  border-radius: 8px;
		  font-size: 0.9rem;
		  z-index: 9999;
		  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
		  animation: fadeIn 0.2s ease;
		`;
	
		document.body.appendChild(toast);
		setTimeout(() => toast.remove(), 3000);
	}

	// Pagination
	function renderPagination(containerId, currentPage, totalPages, onPageChange) {
		const container = document.getElementById(containerId);
	  
		if (!container) return;
	  
		container.innerHTML = "";
	  
		if (!totalPages || totalPages <= 1) return;
	  
		function makeBtn(label, page, disabled = false, isActive = false) {
		  const btn = document.createElement("button");
		  btn.className = "page-btn";
		  if (isActive) btn.classList.add("active");
		  if (disabled) btn.classList.add("disabled");
		  btn.textContent = label;
		  btn.disabled = disabled;
		  if (!disabled) {
			btn.addEventListener("click", () => onPageChange(page));
		  }
		  return btn;
		}
	  
		// First Button
		container.appendChild(makeBtn("« First", 1, currentPage === 1));
	  
		// Back Button
		container.appendChild(makeBtn("‹ Back", currentPage - 1, currentPage === 1));
	  
		// Page Number Buttons (max 10 visible)
		const maxVisible = 10;
		let startPage, endPage;
	  
		if (totalPages <= maxVisible) {
		  // Show all pages
		  startPage = 1;
		  endPage = totalPages;
		} else {
		  // Try to center current page
		  const half = Math.floor(maxVisible / 2);
		  startPage = currentPage - half;
		  endPage = currentPage + half - 1;
	  
		  // range
		  if (startPage < 1) {
			startPage = 1;
			endPage = maxVisible;
		  }
		  if (endPage > totalPages) {
			endPage = totalPages;
			startPage = totalPages - maxVisible + 1;
		  }
		}
	  
		// Leading ellipsis
		if (startPage > 1) {
		  container.appendChild(makeBtn("...", null, true));
		}
	  
		for (let i = startPage; i <= endPage; i++) {
		  container.appendChild(makeBtn(i, i, false, i === currentPage));
		}
	  
		// Trailing ellipsis
		if (endPage < totalPages) {
		  container.appendChild(makeBtn("...", null, true));
		}
	  
		// Forward Button
		container.appendChild(
		  makeBtn("Forward ›", currentPage + 1, currentPage === totalPages)
		);
	  
		// Last Button
		container.appendChild(
		  makeBtn("Last »", totalPages, currentPage === totalPages)
		);
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