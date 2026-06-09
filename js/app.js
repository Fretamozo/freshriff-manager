// 🔴 REEMPLAZA con tu firebaseConfig
        const firebaseConfig = {
            apiKey: "AIzaSyDITBqeb39WP2m6wCuTgVyKHwTLg2kIjYc",
            authDomain: "freshriff-manager.firebaseapp.com",
            projectId: "freshriff-manager",
            storageBucket: "freshriff-manager.firebasestorage.app",
            messagingSenderId: "208409965363",
            appId: "1:208409965363:web:8b2f370990a153a9518446"
        };

        // Inicializar Firebase (versión compat, no module)
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        // Variables globales
        let appData = { accounts: [], clients: [], payments: [] };
        let currentSort = "asc";
        let currentCart = [];
        let editCurrentCart = [];
        let editingClientPin = null;
        let selectedMonth = new Date().getMonth();
        let selectedYear = new Date().getFullYear();
        let currentViewPin = null;
        let currentRenewPin = null;
        let selectedRenewalMonths = 1;
        let renewalCostPreview = 0;
        let isDataLoaded = false;
        let unsubscribe = null;

        const MONTH_NAMES = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];

        const PLATFORM_CONFIG = {
            Netflix: { icon: "🎬", color: "netflix", hasSubtypes: true, subtypes: { "Smart TV": { profiles: 3 }, "Móvil/PC": { profiles: 4 } } },
            "Disney+": { icon: "✨", color: "disney", hasSubtypes: false, profiles: 7 },
            "Prime Video": { icon: "📦", color: "prime", hasSubtypes: false, profiles: 6 },
            "HBO Max": { icon: "🎭", color: "hbo", hasSubtypes: false, profiles: 5 },
            "YouTube Premium": { icon: "▶️", color: "youtube", hasSubtypes: false, profiles: 5 },
            "Universal+": { icon: "🌍", color: "universal", hasSubtypes: false, profiles: 5 },
            "Crunchyroll": { icon: "🍥", color: "crunchyroll", hasSubtypes: false, profiles: 5 },
            "Apple TV+": { icon: "🍎", color: "appletv", hasSubtypes: false, profiles: 6 },
            "Paramount+": { icon: "⛰️", color: "paramount", hasSubtypes: false, profiles: 6 },
        };

        // 🔥 GUARDAR en Firebase
        function saveData() {
            return db.collection("appData").doc("main").set({
                accounts: appData.accounts,
                clients: appData.clients,
                payments: appData.payments,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                console.log("✅ Guardado en Firebase");
            }).catch((error) => {
                console.error("❌ Error guardando:", error);
                // Fallback a localStorage
                localStorage.setItem("freshRiffData", JSON.stringify(appData));
                alert("Error de conexión. Datos guardados localmente temporalmente.");
            });
        }

        // 🔥 CARGAR desde Firebase
        function loadData() {
            return db.collection("appData").doc("main").get().then((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData = {
                        accounts: data.accounts || [],
                        clients: data.clients || [],
                        payments: data.payments || []
                    };
                    console.log("✅ Cargado desde Firebase");
                } else {
                    // Intentar cargar desde localStorage como migración
                    const saved = localStorage.getItem("freshRiffData");
                    if (saved) {
                        appData = JSON.parse(saved);
                        // Guardar en Firebase para futuro
                        return saveData();
                    }
                }
                isDataLoaded = true;
                updateAllViews();
            }).catch((error) => {
                console.error("❌ Error cargando:", error);
                // Fallback a localStorage
                const saved = localStorage.getItem("freshRiffData");
                if (saved) {
                    appData = JSON.parse(saved);
                    updateAllViews();
                }
            });
        }

        // 🔥 Escuchar cambios en tiempo real
        function setupRealtimeListener() {
            unsubscribe = db.collection("appData").doc("main").onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData = {
                        accounts: data.accounts || [],
                        clients: data.clients || [],
                        payments: data.payments || []
                    };
                    // Solo actualizar si no hay modal abierto
                    if (!document.querySelector('.modal.active')) {
                        updateAllViews();
                    }
                }
            }, (error) => {
                console.error("Error en listener:", error);
            });
        }

        // Inicialización
        document.addEventListener("DOMContentLoaded", () => {
            const isAuthenticated = sessionStorage.getItem("freshRiffAuth") === "true";

            if (isAuthenticated) {
                showMainContent();
                loadData().then(() => {
                    setupRealtimeListener();
                });
            } else {
                showLoginScreen();
            }

            generateMonthSelector();
        });

        function handleLogin(event) {
            event.preventDefault();
            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            const errorDiv = document.getElementById("loginError");

            firebase.auth().signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Login exitoso
                    sessionStorage.setItem("freshRiffAuth", "true");
                    sessionStorage.setItem("freshRiffUser", email);
                    errorDiv.classList.remove("show");
                    showMainContent();
                    loadData().then(() => {
                        setupRealtimeListener();
                    });
                })
                .catch((error) => {
                    // Login fallido
                    errorDiv.classList.add("show");
                    document.getElementById("loginPassword").value = "";
                    document.getElementById("loginPassword").focus();
                });
        }

        function showLoginScreen() {
            document.getElementById("loginScreen").style.display = "flex";
            document.getElementById("mainContent").classList.remove("authenticated");
            document.getElementById("mainContent").style.display = "none";
        }

        function showMainContent() {
            document.getElementById("loginScreen").style.display = "none";
            document.getElementById("mainContent").style.display = "block";
            document.getElementById("mainContent").classList.add("authenticated");
            const userEmail = sessionStorage.getItem("freshRiffUser");
            if (userEmail) {
                document.getElementById("userEmailDisplay").textContent = userEmail;
            }
            document.getElementById("clientPaymentDate").valueAsDate = new Date();
            document.getElementById("paymentDate").valueAsDate = new Date();
        }

        function logout() {
            if (confirm("¿Cerrar sesión?")) {
                if (unsubscribe) unsubscribe();
                sessionStorage.removeItem("freshRiffAuth");
                sessionStorage.removeItem("freshRiffUser");
                location.reload();
            }
        }

        // Funciones helper
        function formatDate(dateString) {
            if (!dateString) return "-";
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString("es-ES", { day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        function calculateExpiryDate(startDate, monthsToAdd) {
            const date = new Date(startDate);
            const originalDay = date.getDate();
            date.setMonth(date.getMonth() + monthsToAdd);
            if (date.getDate() !== originalDay) date.setDate(0);
            return date;
        }

        function getExactDaysBetween(startDate, endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        }

        function generateUniquePIN(customPin) {
            if (customPin && customPin.length === 4 && /^\d{4}$/.test(customPin)) {
                if (!appData.clients.some((c) => c.pin === customPin)) return customPin;
                alert("El PIN personalizado ya está en uso. Se generará uno automático.");
            }
            let pin;
            do {
                pin = Math.floor(1000 + Math.random() * 9000).toString();
            } while (appData.clients.some((c) => c.pin === pin));
            return pin;
        }

        function getDaysRemaining(endDate) {
            const end = new Date(endDate);
            const today = new Date();
            end.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
        }

        function getStatusByDays(days) {
            if (days > 10) return { class: "badge-success", text: "Activo", color: "success" };
            if (days > 3) return { class: "badge-warning", text: "Por vencer", color: "warning" };
            if (days > 0) return { class: "badge-danger", text: "Crítico", color: "danger" };
            return { class: "badge-danger", text: "Vencido", color: "danger" };
        }

        function isPaymentInSelectedMonth(paymentDateStr) {
            if (!paymentDateStr) return false;
            const paymentDate = new Date(paymentDateStr);
            return paymentDate.getMonth() === selectedMonth && paymentDate.getFullYear() === selectedYear;
        }

        function calculateMonthlyIncome(month, year) {
            let total = 0;
            appData.clients.forEach((client) => {
                if (isPaymentInSelectedMonth(client.paymentDate)) {
                    total += client.totalPaid || 0;
                }
            });
            return total;
        }

        function calculateMonthlyCosts() {
            return appData.accounts.reduce((sum, acc) => sum + (acc.cost || 0), 0);
        }

        function generateMonthSelector() {
            const container = document.getElementById("monthSelector");
            if (!container) return;
            container.innerHTML = "";
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();

            for (let i = -1; i <= 3; i++) {
                const date = new Date(currentYear, currentMonth + i, 1);
                const month = date.getMonth();
                const year = date.getFullYear();
                const btn = document.createElement("button");
                btn.className = "month-btn" + (month === selectedMonth && year === selectedYear ? " active" : "");
                btn.textContent = `${MONTH_NAMES[month]} ${year}`;
                btn.onclick = function () {
                    selectedMonth = month;
                    selectedYear = year;
                    generateMonthSelector();
                    updateFinanceView();
                };
                container.appendChild(btn);
            }
        }

        function showSection(sectionId) {
            document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
            document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
            document.getElementById(sectionId).classList.add("active");
            if (event && event.target) event.target.classList.add("active");
            if (sectionId === "clients") renderClients();
            if (sectionId === "accounts") renderAccounts();
            if (sectionId === "payments") updateFinanceView();
        }

        function openModal(modalId) {
            document.getElementById(modalId).classList.add("active");
            if (modalId === "accountModal") resetAccountForm();
            else if (modalId === "addClientModal") {
                resetClientForm();
                updatePlatformSelection();
            }
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove("active");
        }

        function resetAccountForm() {
            const form = document.getElementById("accountForm");
            if (form) form.reset();
            const deviceContainer = document.getElementById("deviceTypeContainer");
            const deviceSelect = document.getElementById("accDeviceType");
            if (deviceContainer) deviceContainer.style.display = "none";
            if (deviceSelect) {
                deviceSelect.required = false;
                deviceSelect.value = "";
            }
        }

        function resetClientForm() {
            const clientForm = document.getElementById("clientForm");
            const regResult = document.getElementById("registrationResult");
            const priceSummary = document.getElementById("priceSummary");
            const paymentDate = document.getElementById("clientPaymentDate");

            if (clientForm) clientForm.style.display = "block";
            if (regResult) regResult.style.display = "none";
            if (priceSummary) priceSummary.style.display = "none";
            if (paymentDate) paymentDate.valueAsDate = new Date();

            currentCart = [];
            updatePlatformSelection();
        }

        function handlePlatformChange() {
            const platform = document.getElementById("accPlatform").value;
            const deviceContainer = document.getElementById("deviceTypeContainer");
            const deviceSelect = document.getElementById("accDeviceType");

            if (platform === "Netflix") {
                if (deviceContainer) deviceContainer.style.display = "block";
                if (deviceSelect) deviceSelect.required = true;
            } else {
                if (deviceContainer) deviceContainer.style.display = "none";
                if (deviceSelect) {
                    deviceSelect.required = false;
                    deviceSelect.value = "";
                }
            }
        }

        function validateDeviceType() {
            const deviceType = document.getElementById("accDeviceType").value;
            const container = document.getElementById("deviceTypeContainer");
            if (deviceType && container) {
                container.style.borderColor = "#e50914";
            }
        }

        // ========== CUENTAS ==========
        document.getElementById("accountForm").addEventListener("submit", function (e) {
            e.preventDefault();
            const platform = document.getElementById("accPlatform").value;
            let deviceType = "Todos";
            let maxProfiles;

            if (platform === "Netflix") {
                deviceType = document.getElementById("accDeviceType").value;
                if (!deviceType) {
                    alert("⚠️ Debes seleccionar el tipo de dispositivo para Netflix");
                    return;
                }
                maxProfiles = PLATFORM_CONFIG[platform].subtypes[deviceType].profiles;
            } else {
                maxProfiles = PLATFORM_CONFIG[platform].profiles;
            }

            const newAccount = {
                id: Date.now(),
                platform: platform,
                deviceType: deviceType,
                email: document.getElementById("accEmail").value,
                password: document.getElementById("accPassword").value,
                maxProfiles: maxProfiles,
                cost: parseFloat(document.getElementById("accCost").value),
                pricePerProfile: parseFloat(document.getElementById("accPrice").value),
                nextPayment: document.getElementById("accNextPayment").value,
                profiles: Array(maxProfiles).fill(null).map((_, i) => ({
                    number: i + 1,
                    occupied: false,
                    clientId: null,
                    expiryDate: null,
                })),
            };

            appData.accounts.push(newAccount);
            saveData().then(() => {
                closeModal("accountModal");
                updateAllViews();
                alert("✅ Cuenta registrada exitosamente");
            });
        });

        function editAccount(id) {
            const account = appData.accounts.find((a) => a.id === id);
            if (!account) return;

            document.getElementById("editAccId").value = id;
            document.getElementById("editAccPlatform").value = account.platform;
            document.getElementById("editAccEmail").value = account.email;
            document.getElementById("editAccPassword").value = account.password;
            document.getElementById("editAccPrice").value = account.pricePerProfile;
            document.getElementById("editAccCost").value = account.cost;
            document.getElementById("editAccNextPayment").value = account.nextPayment;

            const deviceGroup = document.getElementById("editDeviceTypeGroup");
            if (account.platform === "Netflix") {
                if (deviceGroup) deviceGroup.style.display = "block";
                document.getElementById("editAccDeviceType").value = account.deviceType;
            } else {
                if (deviceGroup) deviceGroup.style.display = "none";
            }

            openModal("editAccountModal");
        }

        document.getElementById("editAccountForm").addEventListener("submit", function (e) {
            e.preventDefault();
            const id = parseInt(document.getElementById("editAccId").value);
            const account = appData.accounts.find((a) => a.id === id);

            if (account) {
                const oldPassword = account.password;
                const newPassword = document.getElementById("editAccPassword").value;

                account.email = document.getElementById("editAccEmail").value;
                account.password = newPassword;
                account.pricePerProfile = parseFloat(document.getElementById("editAccPrice").value);
                account.cost = parseFloat(document.getElementById("editAccCost").value);
                account.nextPayment = document.getElementById("editAccNextPayment").value;

                // Propagar nueva contraseña a todos los clientes que tengan esta cuenta
                let clientsUpdated = 0;
                if (newPassword !== oldPassword) {
                    appData.clients.forEach((client) => {
                        client.assignments.forEach((ass) => {
                            if (ass.accountEmail === account.email && ass.platform === account.platform) {
                                if (account.platform === "Netflix" && ass.deviceType !== account.deviceType) return;
                                ass.password = newPassword;
                                clientsUpdated++;
                            }
                        });
                    });
                }

                saveData().then(() => {
                    closeModal("editAccountModal");
                    updateAllViews();
                    const msg = clientsUpdated > 0
                        ? `✅ Cuenta actualizada\n🔑 Contraseña actualizada en ${clientsUpdated} suscripción(es) de clientes`
                        : "✅ Cuenta actualizada exitosamente";
                    showNotification(msg, "success");
                });
            }
        });

        function deleteCurrentAccount() {
            const id = parseInt(document.getElementById("editAccId").value);
            const account = appData.accounts.find((a) => a.id === id);
            if (!account) return;

            const hasClients = account.profiles.some((p) => p.occupied);
            if (hasClients) {
                alert("⚠️ No puedes eliminar esta cuenta porque tiene clientes activos.");
                return;
            }

            if (confirm("¿Eliminar esta cuenta permanentemente?")) {
                appData.accounts = appData.accounts.filter((a) => a.id !== id);
                saveData().then(() => {
                    closeModal("editAccountModal");
                    updateAllViews();
                    alert("✅ Cuenta eliminada");
                });
            }
        }

        function quickUpdatePrice(accountId, newPrice) {
            const account = appData.accounts.find((a) => a.id === accountId);
            if (account) {
                account.pricePerProfile = parseFloat(newPrice);
                saveData();
            }
        }

        function quickUpdateCost(accountId, newCost) {
            const account = appData.accounts.find((a) => a.id === accountId);
            if (account) {
                account.cost = parseFloat(newCost);
                saveData();
            }
        }

        function renderAccounts() {
            const grid = document.getElementById("accountsGrid");
            const quickEditor = document.getElementById("quickPriceEditor");
            if (!grid || !quickEditor) return;

            grid.innerHTML = "";
            quickEditor.innerHTML = "";

            appData.accounts.forEach((account) => {
                const availableProfiles = account.profiles.filter((p) => !p.occupied).length;
                const config = PLATFORM_CONFIG[account.platform];

                const priceEditor = document.createElement("div");
                priceEditor.style.cssText = "background: var(--bg-secondary); padding: 15px; border-radius: 10px; border: 1px solid rgba(59, 130, 246, 0.2);";
                priceEditor.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">${config.icon}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 14px;">${account.platform}</div>
                            ${account.platform === "Netflix" ? `<span class="platform-subtype">${account.deviceType}</span>` : ""}
                        </div>
                    </div>
                    <button onclick="editAccount(${account.id})" style="background: none; border: none; color: var(--accent-primary); cursor: pointer; font-size: 16px;">✏️</button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Precio Perfil</label>
                        <input type="number" value="${account.pricePerProfile.toFixed(2)}" onchange="quickUpdatePrice(${account.id}, this.value)" style="padding: 8px; font-size: 14px; width: 100%;" step="0.01">
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Tu Costo</label>
                        <input type="number" value="${account.cost.toFixed(2)}" onchange="quickUpdateCost(${account.id}, this.value)" style="padding: 8px; font-size: 14px; width: 100%; border-color: rgba(239, 68, 68, 0.3);" step="0.01">
                    </div>
                </div>
            `;
                quickEditor.appendChild(priceEditor);

                const card = document.createElement("div");
                card.className = "platform-card";
                let profilesHtml = '<div class="profile-slots">';
                account.profiles.forEach((profile, idx) => {
                    const className = profile.occupied ? "slot-occupied" : "slot-available";
                    const title = profile.occupied ? `Ocupado por PIN: ${profile.clientId}` : "Disponible";
                    profilesHtml += `<div class="profile-slot ${className}" title="${title}">${idx + 1}</div>`;
                });
                profilesHtml += "</div>";

                card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-name">
                        <div class="platform-icon ${config.color}">${config.icon}</div>
                        <div>
                            ${account.platform}
                            ${account.platform === "Netflix" ? `<div style="font-size: 11px; color: var(--text-secondary); font-weight: 500;">${account.deviceType}</div>` : ""}
                        </div>
                    </div>
                    <div class="action-btns">
                        <button class="btn btn-secondary" onclick="editAccount(${account.id})" style="padding: 6px 12px; font-size: 11px;">✏️</button>
                    </div>
                </div>
                <div style="margin-bottom: 10px; font-size: 13px; color: var(--text-secondary);">
                    <div style="margin-bottom: 4px;">📧 ${account.email}</div>
                    <div style="display: flex; gap: 15px;">
                        <span class="highlight-primary">💰 Venta: $${account.pricePerProfile.toFixed(2)}/perfil</span>
                    </div>
                </div>
                ${profilesHtml}
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(59, 130, 246, 0.2); display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                    <div>
                        <span style="color: var(--text-secondary);">Próximo pago:</span><br>
                        <span class="date-display">${formatDate(account.nextPayment)}</span>
                    </div>
                    <span class="badge ${availableProfiles > 0 ? "badge-success" : "badge-danger"}">${availableProfiles} libres</span>
                </div>
            `;
                grid.appendChild(card);
            });
        }

        // ========== CLIENTES ==========
        function updateDatePreview(container, durationMonths) {
            const paymentDateInput = document.getElementById("clientPaymentDate");
            if (!paymentDateInput || !paymentDateInput.value) return;

            const startDate = new Date(paymentDateInput.value);
            const endDate = calculateExpiryDate(startDate, durationMonths);
            const days = getExactDaysBetween(startDate, endDate);

            let previewDiv = container.querySelector(".date-preview");
            if (!previewDiv) {
                previewDiv = document.createElement("div");
                previewDiv.className = "date-preview";
                container.appendChild(previewDiv);
            }

            previewDiv.innerHTML = `
            <div>📅 <strong>Inicio:</strong> ${formatDate(startDate)}</div>
            <div>⏰ <strong>Vencimiento:</strong> ${formatDate(endDate)}</div>
            <div>📊 <strong>Duración:</strong> ${days} días (${durationMonths} mes${durationMonths > 1 ? "es" : ""})</div>
        `;
        }

        function updateAllDatePreviews() {
            document.querySelectorAll("#platformSelection .card").forEach((card) => {
                const select = card.querySelector(".duration-select");
                if (select) updateDatePreview(card, parseInt(select.value));
            });
        }

        function updatePlatformSelection() {
            const container = document.getElementById("platformSelection");
            if (!container) return;
            container.innerHTML = "";

            const availableAccounts = appData.accounts.filter((acc) =>
                acc.profiles.some((p) => !p.occupied),
            );
            if (availableAccounts.length === 0) {
                container.innerHTML = '<p style="color: var(--accent-danger);">⚠️ No hay perfiles disponibles. Primero debes registrar cuentas.</p>';
                return;
            }

            const grouped = {};
            availableAccounts.forEach((acc) => {
                const key = acc.platform === "Netflix" ? `Netflix - ${acc.deviceType}` : acc.platform;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(acc);
            });

            Object.entries(grouped).forEach(([key, accounts]) => {
                const platform = accounts[0].platform;
                const deviceType = accounts[0].deviceType;
                const config = PLATFORM_CONFIG[platform];
                const availableCount = accounts.reduce(
                    (sum, acc) => sum + acc.profiles.filter((p) => !p.occupied).length,
                    0,
                );

                const div = document.createElement("div");
                div.className = "card";
                div.style.marginBottom = "15px";
                div.style.border = "2px solid rgba(59, 130, 246, 0.3)";
                div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 28px;">${config.icon}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 16px;">${platform}</div>
                            ${platform === "Netflix" ? `<span class="platform-subtype">${deviceType}</span>` : ""}
                        </div>
                    </div>
                    <span class="badge badge-success">${availableCount} disponibles</span>
                </div>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: var(--text-secondary);">Duración</label>
                        <select class="duration-select" data-platform="${platform}" data-device="${deviceType}" style="width: 100%; margin-top: 4px;" onchange="updatePriceSummary(); updateDatePreview(this.closest('.card'), parseInt(this.value));">
                            <option value="1">1 Mes</option>
                            <option value="3">3 Meses (-10%)</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: var(--text-secondary);">Cantidad</label>
                        <input type="number" class="quantity-input" data-platform="${platform}" data-device="${deviceType}" value="1" min="1" max="${availableCount}" style="width: 100%; margin-top: 4px;" onchange="updatePriceSummary()">
                    </div>
                    <div style="display: flex; align-items: end; height: 100%;">
                        <button type="button" class="btn btn-primary" onclick="addToCart('${platform}', '${deviceType}', ${accounts.map((a) => a.id).join(",")})" style="margin-top: 20px;">Agregar</button>
                    </div>
                </div>
            `;
                container.appendChild(div);
                updateDatePreview(div, 1);
            });
        }

        function addToCart(platform, deviceType) {
            const accountIds = Array.prototype.slice.call(arguments, 2);
            const accounts = appData.accounts.filter((a) => accountIds.includes(a.id));
            const available = accounts.reduce(
                (sum, acc) => sum + acc.profiles.filter((p) => !p.occupied).length,
                0,
            );
            const container = event.target.closest(".card");
            const durationMonths = parseInt(container.querySelector(".duration-select").value);
            const quantity = parseInt(container.querySelector(".quantity-input").value);

            if (quantity > available) {
                alert(`⚠️ Solo hay ${available} perfiles disponibles`);
                return;
            }

            const paymentDateInput = document.getElementById("clientPaymentDate");
            const startDate = paymentDateInput.value ? new Date(paymentDateInput.value) : new Date();
            const endDate = calculateExpiryDate(startDate, durationMonths);
            const exactDays = getExactDaysBetween(startDate, endDate);

            const pricePerProfile = accounts[0].pricePerProfile;
            let subtotal = pricePerProfile * quantity;
            let discount = 0;
            let discountType = "";

            if (durationMonths === 3) {
                subtotal = subtotal * 3;
                discount = subtotal * 0.10;
                discountType = "3 meses";
            }

            const item = {
                platform,
                deviceType,
                durationMonths,
                durationDays: exactDays,
                quantity,
                pricePerProfile,
                subtotal,
                discount,
                discountType,
                total: subtotal - discount,
                accountIds,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            };

            currentCart.push(item);
            updatePriceSummary();
            event.target.textContent = "✓ Agregado";
            event.target.disabled = true;
            event.target.style.background = "var(--success)";
        }

        function updatePriceSummary() {
            const summary = document.getElementById("priceSummary");
            const content = document.getElementById("summaryContent");
            if (!summary || !content) return;

            if (currentCart.length === 0) {
                summary.style.display = "none";
                return;
            }

            summary.style.display = "block";
            let html = "";

            // ===== SEPARAR POR CATEGORÍA =====
            const itemsCantidad = currentCart.filter(item => item.durationMonths === 1);
            const itemsTiempo = currentCart.filter(item => item.durationMonths === 3);

            // ===== DESCUENTO POR CANTIDAD (solo items de 1 mes) =====
            let subtotalCantidad = 0;
            itemsCantidad.forEach((item) => {
                subtotalCantidad += item.pricePerProfile * item.quantity * item.durationMonths;
            });

            const distinctPlatformsCantidad = new Set(itemsCantidad.map((i) => i.platform)).size;
            const totalProfilesCantidad = itemsCantidad.reduce((sum, i) => sum + i.quantity, 0);

            let descuentoCantidadRate = 0;
            let descuentoCantidadLabel = "";
            if (distinctPlatformsCantidad >= 7) {
                descuentoCantidadRate = 0.20;
                descuentoCantidadLabel = "7+ plataformas";
            } else if (distinctPlatformsCantidad === 6) {
                descuentoCantidadRate = 0.18;
                descuentoCantidadLabel = "6 plataformas";
            } else if (distinctPlatformsCantidad === 5) {
                descuentoCantidadRate = 0.15;
                descuentoCantidadLabel = "5 plataformas";
            } else if (distinctPlatformsCantidad === 4) {
                descuentoCantidadRate = 0.12;
                descuentoCantidadLabel = "4 plataformas";
            } else if (distinctPlatformsCantidad === 3) {
                descuentoCantidadRate = 0.10;
                descuentoCantidadLabel = "3 plataformas";
            }

            const aplicaDescuentoCantidad = descuentoCantidadRate > 0 && totalProfilesCantidad >= 3;
            const descuentoCantidad = aplicaDescuentoCantidad ? subtotalCantidad * descuentoCantidadRate : 0;

            // ===== DESCUENTO POR TIEMPO (solo items de 3 meses) =====
            let subtotalTiempo = 0;
            itemsTiempo.forEach((item) => {
                subtotalTiempo += item.pricePerProfile * item.quantity * item.durationMonths;
            });

            const descuentoTiempo = subtotalTiempo * 0.10; // 10% por 3 meses
            const aplicaDescuentoTiempo = itemsTiempo.length > 0;

            // ===== TOTALES =====
            const subtotalSinDescuento = subtotalCantidad + subtotalTiempo;
            const descuentoTotal = descuentoCantidad + descuentoTiempo;
            const grandTotal = subtotalSinDescuento - descuentoTotal;

            // ===== RENDERIZAR ITEMS =====
            currentCart.forEach((item, idx) => {
                const itemSubtotalOriginal = item.pricePerProfile * item.quantity * item.durationMonths;
                let itemDisplayTotal = itemSubtotalOriginal;
                let itemDisplayDiscount = 0;
                let itemDiscountLabels = [];

                if (item.durationMonths === 1 && aplicaDescuentoCantidad) {
                    // Este item pertenece a la categoría cantidad
                    const proporcion = itemSubtotalOriginal / subtotalCantidad;
                    itemDisplayDiscount = descuentoCantidad * proporcion;
                    itemDisplayTotal = itemSubtotalOriginal - itemDisplayDiscount;
                    itemDiscountLabels.push(`${descuentoCantidadLabel} (-${Math.round(descuentoCantidadRate * 100)}%)`);
                } else if (item.durationMonths === 3 && aplicaDescuentoTiempo) {
                    // Este item pertenece a la categoría tiempo
                    const proporcion = itemSubtotalOriginal / subtotalTiempo;
                    itemDisplayDiscount = descuentoTiempo * proporcion;
                    itemDisplayTotal = itemSubtotalOriginal - itemDisplayDiscount;
                    itemDiscountLabels.push("3 meses (-10%)");
                }

                item.discount = itemDisplayDiscount;
                item.total = itemDisplayTotal;
                item.discountType = itemDiscountLabels.join(", ");

                html += `
                <div class="summary-row">
                    <div>
                        ${PLATFORM_CONFIG[item.platform].icon} <strong>${item.platform}</strong> 
                        ${item.platform === "Netflix" ? `<span style="color: var(--text-secondary);">(${item.deviceType})</span>` : ""}
                        <br><small style="color: var(--text-secondary);">
                            ${item.quantity} perfil(es) × ${item.durationMonths} mes${item.durationMonths > 1 ? "es" : ""} × $${item.pricePerProfile.toFixed(2)}
                        </small>
                        <br><small style="color: var(--accent-primary);">
                            📅 ${formatDate(item.startDate)} → ${formatDate(item.endDate)} (${item.durationDays} días)
                        </small>
                        ${itemDisplayDiscount > 0 ? `<span class="discount-badge">AHORRO: $${itemDisplayDiscount.toFixed(2)}</span>` : ""}
                    </div>
                    <div style="font-weight: 700; color: ${itemDisplayDiscount > 0 ? "var(--success)" : "var(--text-primary)"};">
                        $${itemDisplayTotal.toFixed(2)}
                    </div>
                </div>
            `;
            });

            // ===== MOSTRAR DESCUENTOS POR CATEGORÍA =====
            if (descuentoCantidad > 0) {
                html += `
                <div class="summary-row" style="background: rgba(16, 185, 129, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
                    <div>
                        <strong style="color: var(--success);">🎉 Descuento por Cantidad (${descuentoCantidadLabel})</strong>
                        <br><small style="color: var(--text-secondary);">${distinctPlatformsCantidad} plataformas de 1 mes, ${totalProfilesCantidad} perfiles totales</small>
                    </div>
                    <div style="font-weight: 700; color: var(--success); font-size: 18px;">
                        -$${descuentoCantidad.toFixed(2)}
                    </div>
                </div>
            `;
            }

            if (descuentoTiempo > 0) {
                html += `
                <div class="summary-row" style="background: rgba(245, 158, 11, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
                    <div>
                        <strong style="color: var(--warning);">⏰ Descuento por Tiempo (3 meses)</strong>
                        <br><small style="color: var(--text-secondary);">Contratación de 3 meses en ${itemsTiempo.length} plataforma(s)</small>
                    </div>
                    <div style="font-weight: 700; color: var(--warning); font-size: 18px;">
                        -$${descuentoTiempo.toFixed(2)}
                    </div>
                </div>
            `;
            }

            html += `
            <div class="summary-row" style="margin-top: 10px;">
                <span>TOTAL A PAGAR</span>
                <span style="color: var(--accent-danger); font-size: 24px;">$${grandTotal.toFixed(2)}</span>
            </div>
        `;
            content.innerHTML = html;
        }

        document.getElementById("clientForm").addEventListener("submit", function (e) {
            e.preventDefault();
            if (currentCart.length === 0) {
                alert("⚠️ Agrega al menos una plataforma al carrito");
                return;
            }

            const firstName = document.getElementById("clientFirstName").value.trim();
            const lastName = document.getElementById("clientLastName").value.trim();
            const fullName = `${firstName} ${lastName}`;
            const customPin = document.getElementById("customPin").value;
            const pin = generateUniquePIN(customPin || null);
            const paymentDate = document.getElementById("clientPaymentDate").value;
            const startDate = paymentDate ? new Date(paymentDate) : new Date();

            const assignments = [];
            let totalPaid = 0;

            for (const item of currentCart) {
                const accounts = appData.accounts.filter((a) => item.accountIds.includes(a.id));
                const endDate = new Date(item.endDate);
                let assignedCount = 0;

                for (const acc of accounts) {
                    if (assignedCount >= item.quantity) break;
                    for (let i = acc.profiles.length - 1; i >= 0; i--) {
                        if (!acc.profiles[i].occupied && assignedCount < item.quantity) {
                            acc.profiles[i].occupied = true;
                            acc.profiles[i].clientId = pin;
                            acc.profiles[i].expiryDate = endDate.toISOString();

                            assignments.push({
                                platform: item.platform,
                                deviceType: item.deviceType,
                                accountEmail: acc.email,
                                password: acc.password,
                                profileNumber: acc.profiles[i].number,
                                durationMonths: item.durationMonths,
                                durationDays: item.durationDays,
                                expiryDate: endDate.toISOString(),
                            });
                            assignedCount++;
                        }
                    }
                }
                totalPaid += item.total;
            }

            const client = {
                pin,
                name: fullName,
                firstName,
                lastName,
                startDate: startDate.toISOString(),
                paymentDate,
                totalPaid,
                assignments,
                active: true,
            };

            appData.clients.push(client);
            saveData().then(() => {
                showRegistrationResult(pin, assignments, totalPaid, fullName);
                currentCart = [];
                updateAllViews();
            });
        });

        function showRegistrationResult(pin, assignments, total, fullName) {
            document.getElementById("clientForm").style.display = "none";
            document.getElementById("registrationResult").style.display = "block";
            document.getElementById("generatedPin").textContent = pin;

            const container = document.getElementById("assignedProfiles");
            container.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h4 style="color: var(--text-primary); margin-bottom: 5px;">${fullName}</h4>
                <p style="color: var(--text-secondary); font-size: 14px;">Cliente registrado exitosamente</p>
            </div>
            <div class="summary-box" style="margin-bottom: 20px;">
                <div class="summary-row" style="border: none; margin: 0; padding: 0;">
                    <span>Total Pagado:</span>
                    <span style="color: var(--accent-danger); font-size: 20px; font-weight: 800;">$${total.toFixed(2)}</span>
                </div>
                ${total < assignments.reduce((sum, a) => {
                const acc = appData.accounts.find((ac) => ac.email === a.accountEmail);
                return sum + (acc ? acc.pricePerProfile * (a.durationMonths || 1) : 0);
            }, 0) ? `
                <div style="margin-top: 8px; padding: 8px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; font-size: 12px; color: var(--success);">
                    🎉 Incluye descuento aplicado
                </div>
                ` : ""}
            </div>
            <h4 style="margin-bottom: 15px; color: var(--accent-primary);">📋 Perfiles Asignados:</h4>
        `;

            assignments.forEach((ass) => {
                const div = document.createElement("div");
                div.className = "client-result";
                div.style.border = "2px solid rgba(59, 130, 246, 0.3)";
                div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="font-size: 18px; color: var(--accent-danger);">${PLATFORM_CONFIG[ass.platform].icon} ${ass.platform}</strong>
                        ${ass.platform === "Netflix" ? `<span style="color: var(--text-secondary);">(${ass.deviceType})</span>` : ""}<br>
                        <small style="color: var(--text-secondary);">Perfil #${ass.profileNumber} • ${ass.durationMonths} mes${ass.durationMonths > 1 ? "es" : ""}</small>
                    </div>
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px;">
                    <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">📧</span> ${ass.accountEmail}</div>
                    <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">🔑</span> ${ass.password}</div>
                    <div style="color: var(--warning); margin-top: 8px; font-weight: 600;">
                        ⏰ Vence: <span class="date-display">${formatDate(ass.expiryDate)}</span> (${ass.durationDays} días)
                    </div>
                </div>
            `;
                container.appendChild(div);
            });

            updateAllViews();
        }

        function renderClients() {
            const tbody = document.getElementById("clientsTable");
            if (!tbody) return;
            tbody.innerHTML = "";

            let sortedClients = [...appData.clients].sort((a, b) => {
                const lastNameA = (a.lastName || a.name.split(" ").pop()).toLowerCase();
                const lastNameB = (b.lastName || b.name.split(" ").pop()).toLowerCase();
                return currentSort === "asc" ? lastNameA.localeCompare(lastNameB) : lastNameB.localeCompare(lastNameA);
            });

            if (sortedClients.length === 0) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <p>No hay clientes registrados</p>
                    </td>
                </tr>
            `;
                return;
            }

            sortedClients.forEach((client) => {
                const allDays = client.assignments.map((a) => getDaysRemaining(a.expiryDate));
                const daysLeft = Math.min(...allDays);
                const status = getStatusByDays(daysLeft);
                const platforms = [...new Set(client.assignments.map((a) => a.platform))];
                const lastName = client.lastName || client.name.split(" ").pop();
                const firstName = client.firstName || client.name.replace(" " + lastName, "");
                const nearestExpiry = client.assignments.reduce((nearest, a) =>
                    new Date(a.expiryDate) < new Date(nearest.expiryDate) ? a : nearest
                ).expiryDate;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td><strong style="font-family: monospace; font-size: 16px; color: var(--accent-danger);">${client.pin}</strong></td>
                <td><strong>${lastName}</strong>, ${firstName}</td>
                <td>${platforms.map((p) => PLATFORM_CONFIG[p].icon).join(" ")} (${platforms.length})</td>
                <td>
                    <span class="date-display">${formatDate(nearestExpiry)}</span><br>
                    <small style="color: ${daysLeft <= 3 ? "var(--accent-danger)" : daysLeft <= 10 ? "var(--warning)" : "var(--success)"};">${daysLeft <= 0 ? "Vencido" : daysLeft + " días"}</small>
                </td>
                <td><span class="badge ${status.class}">${status.text}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn btn-secondary" onclick="editClient('${client.pin}')" style="padding: 6px 10px;">✏️</button>
                        <button class="btn btn-primary" onclick="viewClientDetails('${client.pin}')" style="padding: 6px 10px;">👁️</button>
                        <button class="btn btn-warning" onclick="renewClient('${client.pin}')" style="padding: 6px 10px;">🔄</button>
                    </div>
                </td>
            `;
                tbody.appendChild(tr);
            });
        }

        function toggleSort() {
            currentSort = currentSort === "asc" ? "desc" : "asc";
            document.getElementById("sortIcon").textContent = currentSort === "asc" ? "📋" : "📋⬇️";
            document.getElementById("sortText").textContent = currentSort === "asc" ? "Ordenar por Apellido (A-Z)" : "Ordenar por Apellido (Z-A)";
            renderClients();
        }

        function searchClients() {
            const query = document.getElementById("clientSearch").value.toLowerCase().trim();
            const resultsDiv = document.getElementById("searchResults");
            const listDiv = document.getElementById("searchResultsList");
            if (!resultsDiv || !listDiv) return;

            if (query.length < 2) {
                resultsDiv.style.display = "none";
                return;
            }

            const matches = appData.clients.filter(
                (c) =>
                    c.name.toLowerCase().includes(query) ||
                    (c.firstName && c.firstName.toLowerCase().includes(query)) ||
                    (c.lastName && c.lastName.toLowerCase().includes(query)) ||
                    c.pin.includes(query),
            );

            if (matches.length === 0) {
                listDiv.innerHTML = '<p style="color: var(--text-secondary);">No se encontraron clientes</p>';
            } else {
                listDiv.innerHTML = "";
                matches.forEach((client) => {
                    const daysLeft = Math.min(...client.assignments.map((a) => getDaysRemaining(a.expiryDate)));
                    const status = getStatusByDays(daysLeft);
                    const platforms = [...new Set(client.assignments.map((a) => a.platform))];
                    const lastName = client.lastName || client.name.split(" ").pop();
                    const firstName = client.firstName || client.name.replace(" " + lastName, "");

                    const div = document.createElement("div");
                    div.className = "client-result";
                    div.style.cssText = "border: 2px solid rgba(59, 130, 246, 0.3); margin-bottom: 20px;";

                    let html = `
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid rgba(59, 130, 246, 0.2);">
                        <div>
                            <strong style="font-size: 20px; color: var(--text-primary);">${lastName}, ${firstName}</strong>
                            <div style="color: var(--accent-danger); font-family: monospace; font-size: 22px; margin-top: 8px; font-weight: 700; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(59, 130, 246, 0.05)); padding: 8px 16px; border-radius: 8px; display: inline-block; border: 2px dashed var(--accent-danger);">
                                PIN: ${client.pin}
                            </div>
                        </div>
                        <span class="badge ${status.class}" style="font-size: 14px; padding: 8px 16px;">${status.text} • ${daysLeft} días</span>
                    </div>
                    
                    <div class="summary-box" style="margin-bottom: 20px;">
                        <div class="detail-row">
                            <span class="detail-label">💰 Total Pagado:</span>
                            <span class="detail-value" style="color: var(--accent-success); font-size: 18px; font-weight: 700;">$${(client.totalPaid || 0).toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">📅 Fecha de Pago:</span>
                            <span class="detail-value date-display">${formatDate(client.paymentDate)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">📊 Estado:</span>
                            <span class="detail-value" style="color: ${daysLeft <= 3 ? 'var(--accent-danger)' : daysLeft <= 10 ? 'var(--warning)' : 'var(--accent-success)'}; font-weight: 700;">
                                ${daysLeft <= 0 ? 'VENCIDO' : daysLeft <= 3 ? 'CRÍTICO' : daysLeft <= 10 ? 'POR VENCER' : 'ACTIVO'}
                            </span>
                        </div>
                    </div>

                    <h4 style="margin: 20px 0 15px 0; color: var(--accent-primary); font-size: 16px; display: flex; align-items: center; gap: 8px;">
                        📺 Plataformas Contratadas (${client.assignments.length})
                    </h4>
                    <div style="display: grid; gap: 12px;">
                `;

                    client.assignments.slice().sort((a, b) => getDaysRemaining(b.expiryDate) - getDaysRemaining(a.expiryDate)).forEach((ass) => {
                        const config = PLATFORM_CONFIG[ass.platform];
                        const assDaysLeft = getDaysRemaining(ass.expiryDate);
                        const isExpired = assDaysLeft <= 0;

                        html += `
                        <div class="platform-detail-card" style="border: 2px solid ${isExpired ? 'var(--accent-danger)' : 'var(--accent-primary)'}; background: var(--bg-secondary); border-radius: 12px; padding: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 28px;">${config.icon}</span>
                                    <div>
                                        <strong style="font-size: 16px; color: ${isExpired ? 'var(--accent-danger)' : 'var(--text-primary)'};">
                                            ${ass.platform}
                                        </strong>
                                        ${ass.platform === "Netflix" ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${ass.deviceType}</div>` : ""}
                                    </div>
                                </div>
                                <span class="badge ${assDaysLeft <= 3 ? 'badge-danger' : assDaysLeft <= 10 ? 'badge-warning' : 'badge-success'}" style="font-size: 11px;">
                                    ${isExpired ? 'VENCIDO' : assDaysLeft + ' días'}
                                </span>
                            </div>
                            
                            <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px; margin-top: 10px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                                    <span style="color: var(--text-secondary);">👤 Perfil #${ass.profileNumber}</span>
                                    <span style="color: var(--text-secondary);">${ass.durationMonths || 1} mes${(ass.durationMonths || 1) > 1 ? 'es' : ''}</span>
                                </div>
                                <div style="margin-bottom: 6px; font-family: monospace; font-size: 13px;">
                                    <span style="color: var(--text-secondary);">📧</span> 
                                    <span style="color: var(--accent-primary); font-weight: 600;">${ass.accountEmail}</span>
                                </div>
                                <div style="margin-bottom: 6px; font-family: monospace; font-size: 13px;">
                                    <span style="color: var(--text-secondary);">🔑</span> 
                                    <span style="color: var(--warning); font-weight: 600;">${ass.password}</span>
                                </div>
                                <div style="padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; font-size: 12px;">
                                    <span style="color: var(--text-secondary);">⏰ Vence:</span> 
                                    <span class="date-display" style="color: var(--warning); font-weight: 600;">${formatDate(ass.expiryDate)}</span>
                                    <span style="color: var(--text-secondary); margin-left: 8px;">(${ass.durationDays || getExactDaysBetween(new Date(), ass.expiryDate)} días)</span>
                                </div>
                            </div>
                        </div>
                    `;
                    });

                    html += `
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px; padding-top: 20px; border-top: 2px solid rgba(59, 130, 246, 0.2);">
                        <button class="btn btn-secondary" onclick="editClient('${client.pin}')" style="flex: 1; padding: 10px; font-size: 13px;">
                            ✏️ Editar
                        </button>
                        <button class="btn btn-warning" onclick="renewClient('${client.pin}')" style="flex: 1; padding: 10px; font-size: 13px;">
                            🔄 Renovar
                        </button>
                        <button class="btn btn-danger" onclick="deleteClientFromSearch('${client.pin}')" style="flex: 1; padding: 10px; font-size: 13px;">
                            🗑️ Eliminar
                        </button>
                    </div>
                `;

                    div.innerHTML = html;
                    listDiv.appendChild(div);
                });
            }
            resultsDiv.style.display = "block";
        }

        function deleteClientFromSearch(pin) {
            const client = appData.clients.find((c) => c.pin === pin);
            if (!client) return;

            if (!confirm(`⚠️ ¿Eliminar permanentemente a ${client.name}?\n\nSe liberarán todos sus perfiles.`)) {
                return;
            }

            appData.accounts.forEach((acc) => {
                acc.profiles.forEach((p) => {
                    if (p.clientId === pin) {
                        p.occupied = false;
                        p.clientId = null;
                        p.expiryDate = null;
                    }
                });
            });

            appData.clients = appData.clients.filter((c) => c.pin !== pin);
            saveData().then(() => {
                updateAllViews();
                searchClients();
                showNotification(`✅ Cliente ${client.name} eliminado correctamente`, "success");
            });
        }

        function editClient(pin) {
            const client = appData.clients.find((c) => c.pin === pin);
            if (!client) return;

            editingClientPin = pin;
            document.getElementById("editClientOldPin").value = pin;
            document.getElementById("editClientFirstName").value = client.firstName || client.name.split(" ")[0] || "";
            document.getElementById("editClientLastName").value = client.lastName || client.name.split(" ").slice(1).join(" ") || "";
            document.getElementById("editClientPin").value = client.pin;
            document.getElementById("editClientPaymentDate").value = client.paymentDate ? client.paymentDate.split("T")[0] : "";

            renderEditCurrentAssignments(client);
            editCurrentCart = [];
            updateEditPlatformSelection();
            document.getElementById("editPriceSummary").style.display = "none";
            document.getElementById("editClientForm").style.display = "block";
            document.getElementById("editRegistrationResult").style.display = "none";

            openModal("editClientModal");
        }

        function unifyExpiryDates() {
            const client = appData.clients.find((c) => c.pin === editingClientPin);
            if (!client || client.assignments.length < 2) return;

            const dates = client.assignments.map((a) => new Date(a.expiryDate).getTime());
            const minDate = Math.min(...dates);
            const maxDate = Math.max(...dates);

            if (minDate === maxDate) {
                alert("\u2705 Todas las suscripciones ya tienen la misma fecha de vencimiento.");
                return;
            }

            const midTimestamp = Math.round((minDate + maxDate) / 2);
            const midDate = new Date(midTimestamp);
            midDate.setHours(0, 0, 0, 0);

            const formatted = midDate.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

            if (!confirm("\ud83d\udcc5 Fecha sugerida para unificar: " + formatted + "\n\nTodas las suscripciones de " + client.name + " pasarán a vencer en esa fecha.\n\n¿Confirmar?")) return;

            const newIso = midDate.toISOString();

            client.assignments.forEach((ass) => {
                ass.expiryDate = newIso;
                const account = appData.accounts.find((a) => {
                    if (ass.platform === "Netflix") {
                        return a.email === ass.accountEmail && a.platform === ass.platform && a.deviceType === ass.deviceType;
                    }
                    return a.email === ass.accountEmail && a.platform === ass.platform;
                });
                if (account) {
                    const profile = account.profiles.find((p) => p.number === ass.profileNumber && p.clientId === client.pin);
                    if (profile) profile.expiryDate = newIso;
                }
            });

            saveData().then(() => {
                renderEditCurrentAssignments(client);
                updateAllViews();
                showNotification("\u2705 Fechas unificadas al " + formatted, "success");
            });
        }

        function renderEditCurrentAssignments(client) {
            const container = document.getElementById("editCurrentAssignments");
            if (!client.assignments || client.assignments.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No tiene plataformas contratadas</p>';
                return;
            }

            const dates = client.assignments.map((a) => new Date(a.expiryDate).getTime());
            const allSameDate = dates.every((d) => d === dates[0]);

            container.innerHTML = "";

            if (!allSameDate && client.assignments.length >= 2) {
                const minD = new Date(Math.min(...dates));
                const maxD = new Date(Math.max(...dates));
                const midD = new Date(Math.round((Math.min(...dates) + Math.max(...dates)) / 2));
                midD.setHours(0, 0, 0, 0);
                const midFormatted = midD.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
                const banner = document.createElement("div");
                banner.style.cssText = "background: rgba(59,130,246,0.1); border: 2px solid var(--accent-primary); border-radius: 12px; padding: 14px 18px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;";
                banner.innerHTML = `<div style="font-size:13px; color: var(--text-secondary);">
                    <strong style="color: var(--accent-primary);">📅 Fechas distintas detectadas</strong><br>
                    Punto medio sugerido: <strong style="color: var(--text-primary);">${midFormatted}</strong>
                </div>
                <button type="button" class="btn btn-primary" onclick="unifyExpiryDates()" style="white-space: nowrap; padding: 8px 16px; font-size: 12px;">
                    Unificar fechas
                </button>`;
                container.appendChild(banner);
            }

            client.assignments.forEach((ass, idx) => {
                const daysLeft = getDaysRemaining(ass.expiryDate);
                const isExpired = daysLeft <= 0;
                const config = PLATFORM_CONFIG[ass.platform];

                const div = document.createElement("div");
                div.className = "client-result";
                div.style.cssText = `border: 2px solid ${isExpired ? "var(--accent-danger)" : "var(--accent-primary)"}; opacity: ${isExpired ? "0.6" : "1"}; margin-bottom: 10px;`;
                div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="font-size: 16px; color: ${isExpired ? "var(--accent-danger)" : "var(--text-primary)"};">
                            ${config.icon} ${ass.platform}
                        </strong>
                        ${ass.platform === "Netflix" ? `<span style="color: var(--text-secondary); font-size: 12px;">(${ass.deviceType})</span>` : ""}
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Perfil #${ass.profileNumber} • ${ass.durationMonths || 1} mes${(ass.durationMonths || 1) > 1 ? "es" : ""}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: var(--text-secondary);">Vence en:</div>
                        <div style="color: ${daysLeft <= 3 ? "var(--accent-danger)" : daysLeft <= 10 ? "var(--warning)" : "var(--success)"}; font-weight: 700;">
                            ${isExpired ? "VENCIDO" : daysLeft + " días"}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button onclick="renewEditAssignment(${idx})" class="btn btn-warning" style="flex: 1; padding: 6px; font-size: 11px;">
                        🔄 Renovar
                    </button>
                    <button onclick="removeEditAssignment(${idx})" class="btn btn-danger" style="flex: 1; padding: 6px; font-size: 11px;">
                        ❌ Quitar
                    </button>
                    <button onclick="moveClientAccount(${idx})" class="btn btn-primary" style="flex: 1; padding: 6px; font-size: 11px;">
                        🔀 Mover
                    </button>
                </div>
            `;
                container.appendChild(div);
            });
        }

        function moveClientAccount(assignmentIndex) {
            const client = appData.clients.find((c) => c.pin === editingClientPin);
            if (!client) return;

            const ass = client.assignments[assignmentIndex];

            // Buscar cuentas de la misma plataforma (y mismo deviceType para Netflix) con cupos libres, excluyendo la actual
            const candidates = appData.accounts.filter((a) => {
                if (a.email === ass.accountEmail && a.platform === ass.platform) return false; // misma cuenta
                if (a.platform !== ass.platform) return false;
                if (ass.platform === "Netflix" && a.deviceType !== ass.deviceType) return false;
                return a.profiles.some((p) => !p.occupied);
            });

            if (candidates.length === 0) {
                alert("⚠️ No hay otras cuentas de " + ass.platform + " con cupos disponibles.");
                return;
            }

            // Construir lista de opciones
            let msg = "Selecciona la cuenta destino para mover a " + client.name + ":\n\n";
            candidates.forEach((acc, i) => {
                const free = acc.profiles.filter((p) => !p.occupied).length;
                msg += (i + 1) + ". " + acc.email + " (" + free + " cupos libres)\n";
            });
            msg += "\nIngresá el número:";

            const choice = prompt(msg);
            if (!choice || isNaN(choice)) return;
            const choiceIdx = parseInt(choice) - 1;
            if (choiceIdx < 0 || choiceIdx >= candidates.length) {
                alert("Opción inválida.");
                return;
            }

            const targetAccount = candidates[choiceIdx];
            const freeProfile = targetAccount.profiles.find((p) => !p.occupied);
            if (!freeProfile) {
                alert("⚠️ No se encontró un perfil libre en esa cuenta.");
                return;
            }

            // Liberar perfil en cuenta origen
            const sourceAccount = appData.accounts.find((a) => {
                if (ass.platform === "Netflix") {
                    return a.email === ass.accountEmail && a.platform === ass.platform && a.deviceType === ass.deviceType;
                }
                return a.email === ass.accountEmail && a.platform === ass.platform;
            });
            if (sourceAccount) {
                const sourceProfile = sourceAccount.profiles.find((p) => p.number === ass.profileNumber && p.clientId === client.pin);
                if (sourceProfile) {
                    sourceProfile.occupied = false;
                    sourceProfile.clientId = null;
                    sourceProfile.expiryDate = null;
                }
            }

            // Ocupar perfil en cuenta destino
            freeProfile.occupied = true;
            freeProfile.clientId = client.pin;
            freeProfile.expiryDate = ass.expiryDate;

            // Actualizar datos en la asignación del cliente
            ass.accountEmail = targetAccount.email;
            ass.password = targetAccount.password;
            ass.profileNumber = freeProfile.number;

            saveData().then(() => {
                renderEditCurrentAssignments(client);
                updateAllViews();
                showNotification("✅ " + ass.platform + " movido a " + targetAccount.email + " (Perfil #" + freeProfile.number + ")", "success");
            });
        }

        // ========== FUNCIÓN CORREGIDA: Quitar plataforma de cliente ==========
        function removeEditAssignment(assignmentIndex) {
            const client = appData.clients.find((c) => c.pin === editingClientPin);
            if (!client) return;

            const assignment = client.assignments[assignmentIndex];

            if (!confirm(`¿Quitar ${assignment.platform} (Perfil #${assignment.profileNumber}) de ${client.name}?\n\nEl perfil quedará libre para otros clientes.`)) {
                return;
            }

            // 🔧 CORRECCIÓN: Buscar la cuenta correcta considerando también el deviceType para Netflix
            const account = appData.accounts.find((a) => {
                // Para Netflix, debemos coincidir también el deviceType
                if (assignment.platform === "Netflix") {
                    return a.email === assignment.accountEmail &&
                        a.platform === assignment.platform &&
                        a.deviceType === assignment.deviceType;
                }
                // Para otras plataformas, email y plataforma son suficientes
                return a.email === assignment.accountEmail &&
                    a.platform === assignment.platform;
            });

            if (account) {
                // 🔧 CORRECCIÓN: Buscar el perfil específico por número Y por clientId
                const profile = account.profiles.find(
                    (p) => p.number === assignment.profileNumber && p.clientId === client.pin
                );
                if (profile) {
                    profile.occupied = false;
                    profile.clientId = null;
                    profile.expiryDate = null;
                } else {
                    console.warn("Perfil no encontrado en la cuenta:", assignment);
                }
            } else {
                console.warn("Cuenta no encontrada para liberar perfil:", assignment);
                alert("⚠️ No se encontró la cuenta asociada. El perfil se eliminó del cliente pero podría no estar liberado en la cuenta.");
            }

            client.assignments.splice(assignmentIndex, 1);

            if (client.assignments.length === 0) {
                client.active = false;
                client.totalPaid = 0;
            }

            saveData().then(() => {
                renderEditCurrentAssignments(client);
                updateAllViews();
                showNotification(`✅ ${assignment.platform} removido correctamente`, "success");
            });
        }

        // ========== FUNCIÓN CORREGIDA: Renovar asignación específica ==========
        function renewEditAssignment(assignmentIndex) {
            const client = appData.clients.find((c) => c.pin === editingClientPin);
            if (!client) return;

            const months = prompt("¿Cuántos meses agregar? (1, 2 o 3):", "1");
            if (!months || isNaN(months)) return;

            const monthsNum = parseInt(months);
            const assignment = client.assignments[assignmentIndex];

            // 🔧 CORRECCIÓN DEFINITIVA: La fecha base es el MAYOR entre:
            // 1. El vencimiento actual de la asignación (si aún no venció o recién venció)
            // 2. La fecha de pago del cliente (si ya venció hace mucho)
            // 3. Hoy (último recurso)

            const currentExpiry = new Date(assignment.expiryDate);
            currentExpiry.setHours(0, 0, 0, 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let baseDate;

            // Si el vencimiento es hoy o futuro, extender desde el vencimiento
            // (el cliente paga antes de tiempo, no pierde días)
            if (currentExpiry >= today) {
                baseDate = new Date(currentExpiry);
            }
            // Si venció hace poco (menos de 5 días), dar beneficio de duda y extender desde vencimiento
            else {
                const daysExpired = Math.floor((today - currentExpiry) / (1000 * 60 * 60 * 24));
                if (daysExpired <= 5) {
                    baseDate = new Date(currentExpiry);
                } else {
                    // Venció hace mucho, extender desde hoy (o desde fecha de pago si existe)
                    baseDate = client.paymentDate ? new Date(client.paymentDate + "T00:00:00") : new Date(today);
                }
            }

            // Calcular nuevo vencimiento sumando los meses a la fecha base
            const newEnd = calculateExpiryDate(baseDate, monthsNum);

            assignment.expiryDate = newEnd.toISOString();
            assignment.durationMonths = (assignment.durationMonths || 1) + monthsNum;
            assignment.durationDays = getExactDaysBetween(baseDate, newEnd);
            assignment.startDate = baseDate.toISOString();

            // Buscar y actualizar el perfil en la cuenta
            const account = appData.accounts.find((a) => {
                if (assignment.platform === "Netflix") {
                    return a.email === assignment.accountEmail &&
                        a.platform === assignment.platform &&
                        a.deviceType === assignment.deviceType;
                }
                return a.email === assignment.accountEmail &&
                    a.platform === assignment.platform;
            });

            if (account) {
                const profile = account.profiles.find(
                    (p) => p.number === assignment.profileNumber && p.clientId === client.pin
                );
                if (profile) profile.expiryDate = newEnd.toISOString();
            }

            // Actualizar fecha de pago del cliente a hoy
            client.paymentDate = today.toISOString().split('T')[0];

            saveData().then(() => {
                renderEditCurrentAssignments(client);
                updateAllViews();
                alert(`✅ Renovado por ${monthsNum} mes(es)\nDesde: ${formatDate(baseDate)}\nNueva fecha: ${formatDate(newEnd)}`);
            });
        }

        function updateEditPlatformSelection() {
            const container = document.getElementById("editPlatformSelection");
            container.innerHTML = "";

            const availableAccounts = appData.accounts.filter((acc) =>
                acc.profiles.some((p) => !p.occupied),
            );
            if (availableAccounts.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No hay perfiles disponibles para agregar.</p>';
                return;
            }

            const grouped = {};
            availableAccounts.forEach((acc) => {
                const key = acc.platform === "Netflix" ? `Netflix - ${acc.deviceType}` : acc.platform;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(acc);
            });

            Object.entries(grouped).forEach(([key, accounts]) => {
                const platform = accounts[0].platform;
                const deviceType = accounts[0].deviceType;
                const config = PLATFORM_CONFIG[platform];
                const availableCount = accounts.reduce(
                    (sum, acc) => sum + acc.profiles.filter((p) => !p.occupied).length,
                    0,
                );

                const div = document.createElement("div");
                div.className = "card";
                div.style.marginBottom = "15px";
                div.style.border = "2px solid rgba(59, 130, 246, 0.3)";
                div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 28px;">${config.icon}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 16px;">${platform}</div>
                            ${platform === "Netflix" ? `<span class="platform-subtype">${deviceType}</span>` : ""}
                        </div>
                    </div>
                    <span class="badge badge-success">${availableCount} disponibles</span>
                </div>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: var(--text-secondary);">Duración</label>
                        <select class="edit-duration-select" data-platform="${platform}" data-device="${deviceType}" style="width: 100%; margin-top: 4px;" onchange="updateEditPriceSummary();">
                            <option value="1">1 Mes</option>
                            <option value="3">3 Meses (-10%)</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: var(--text-secondary);">Cantidad</label>
                        <input type="number" class="edit-quantity-input" data-platform="${platform}" data-device="${deviceType}" value="1" min="1" max="${availableCount}" style="width: 100%; margin-top: 4px;" onchange="updateEditPriceSummary()">
                    </div>
                    <div style="display: flex; align-items: end; height: 100%;">
                        <button type="button" class="btn btn-primary" onclick="addToEditCart('${platform}', '${deviceType}', ${accounts.map((a) => a.id).join(",")})" style="margin-top: 20px;">Agregar</button>
                    </div>
                </div>
            `;
                container.appendChild(div);
            });
        }

        function addToEditCart(platform, deviceType) {
            const accountIds = Array.prototype.slice.call(arguments, 2);
            const accounts = appData.accounts.filter((a) => accountIds.includes(a.id));
            const available = accounts.reduce(
                (sum, acc) => sum + acc.profiles.filter((p) => !p.occupied).length,
                0,
            );
            const container = event.target.closest(".card");
            const durationMonths = parseInt(container.querySelector(".edit-duration-select").value);
            const quantity = parseInt(container.querySelector(".edit-quantity-input").value);

            if (quantity > available) {
                alert(`⚠️ Solo hay ${available} perfiles disponibles`);
                return;
            }

            const paymentDateInput = document.getElementById("editClientPaymentDate");
            const startDate = paymentDateInput.value ? new Date(paymentDateInput.value) : new Date();
            const endDate = calculateExpiryDate(startDate, durationMonths);
            const exactDays = getExactDaysBetween(startDate, endDate);

            const pricePerProfile = accounts[0].pricePerProfile;
            let subtotal = pricePerProfile * quantity;
            let discount = 0;
            let discountType = "";

            if (durationMonths === 3) {
                subtotal = subtotal * 3;
                discount = subtotal * 0.10;
                discountType = "3 meses";
            }

            const item = {
                platform,
                deviceType,
                durationMonths,
                durationDays: exactDays,
                quantity,
                pricePerProfile,
                subtotal,
                discount,
                discountType,
                total: subtotal - discount,
                accountIds,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            };

            editCurrentCart.push(item);
            updateEditPriceSummary();
            event.target.textContent = "✓ Agregado";
            event.target.disabled = true;
            event.target.style.background = "var(--success)";
        }

        function updateEditPriceSummary() {
            const summary = document.getElementById("editPriceSummary");
            const content = document.getElementById("editSummaryContent");
            if (!summary || !content) return;

            if (editCurrentCart.length === 0) {
                summary.style.display = "none";
                return;
            }

            summary.style.display = "block";
            let html = "";

            // ===== SEPARAR POR CATEGORÍA =====
            const itemsCantidad = editCurrentCart.filter(item => item.durationMonths === 1);
            const itemsTiempo = editCurrentCart.filter(item => item.durationMonths === 3);

            // ===== DESCUENTO POR CANTIDAD (solo items de 1 mes) =====
            let subtotalCantidad = 0;
            itemsCantidad.forEach((item) => {
                subtotalCantidad += item.pricePerProfile * item.quantity * item.durationMonths;
            });

            const distinctPlatformsCantidad = new Set(itemsCantidad.map((i) => i.platform)).size;
            const totalProfilesCantidad = itemsCantidad.reduce((sum, i) => sum + i.quantity, 0);

            let descuentoCantidadRate = 0;
            let descuentoCantidadLabel = "";
            if (distinctPlatformsCantidad >= 7) {
                descuentoCantidadRate = 0.20;
                descuentoCantidadLabel = "7+ plataformas";
            } else if (distinctPlatformsCantidad === 6) {
                descuentoCantidadRate = 0.18;
                descuentoCantidadLabel = "6 plataformas";
            } else if (distinctPlatformsCantidad === 5) {
                descuentoCantidadRate = 0.15;
                descuentoCantidadLabel = "5 plataformas";
            } else if (distinctPlatformsCantidad === 4) {
                descuentoCantidadRate = 0.12;
                descuentoCantidadLabel = "4 plataformas";
            } else if (distinctPlatformsCantidad === 3) {
                descuentoCantidadRate = 0.10;
                descuentoCantidadLabel = "3 plataformas";
            }

            const aplicaDescuentoCantidad = descuentoCantidadRate > 0 && totalProfilesCantidad >= 3;
            const descuentoCantidad = aplicaDescuentoCantidad ? subtotalCantidad * descuentoCantidadRate : 0;

            // ===== DESCUENTO POR TIEMPO (solo items de 3 meses) =====
            let subtotalTiempo = 0;
            itemsTiempo.forEach((item) => {
                subtotalTiempo += item.pricePerProfile * item.quantity * item.durationMonths;
            });

            const descuentoTiempo = subtotalTiempo * 0.10;
            const aplicaDescuentoTiempo = itemsTiempo.length > 0;

            // ===== TOTALES =====
            const subtotalSinDescuento = subtotalCantidad + subtotalTiempo;
            const descuentoTotal = descuentoCantidad + descuentoTiempo;
            const grandTotal = subtotalSinDescuento - descuentoTotal;

            // ===== RENDERIZAR ITEMS =====
            editCurrentCart.forEach((item, idx) => {
                const itemSubtotalOriginal = item.pricePerProfile * item.quantity * item.durationMonths;
                let itemDisplayTotal = itemSubtotalOriginal;
                let itemDisplayDiscount = 0;
                let itemDiscountLabels = [];

                if (item.durationMonths === 1 && aplicaDescuentoCantidad) {
                    const proporcion = itemSubtotalOriginal / subtotalCantidad;
                    itemDisplayDiscount = descuentoCantidad * proporcion;
                    itemDisplayTotal = itemSubtotalOriginal - itemDisplayDiscount;
                    itemDiscountLabels.push(`${descuentoCantidadLabel} (-${Math.round(descuentoCantidadRate * 100)}%)`);
                } else if (item.durationMonths === 3 && aplicaDescuentoTiempo) {
                    const proporcion = itemSubtotalOriginal / subtotalTiempo;
                    itemDisplayDiscount = descuentoTiempo * proporcion;
                    itemDisplayTotal = itemSubtotalOriginal - itemDisplayDiscount;
                    itemDiscountLabels.push("3 meses (-10%)");
                }

                item.discount = itemDisplayDiscount;
                item.total = itemDisplayTotal;
                item.discountType = itemDiscountLabels.join(", ");

                html += `
                <div class="summary-row">
                    <div>
                        ${PLATFORM_CONFIG[item.platform].icon} <strong>${item.platform}</strong> 
                        ${item.platform === "Netflix" ? `<span style="color: var(--text-secondary);">(${item.deviceType})</span>` : ""}
                        <br><small style="color: var(--text-secondary);">
                            ${item.quantity} perfil(es) × ${item.durationMonths} mes${item.durationMonths > 1 ? "es" : ""} × $${item.pricePerProfile.toFixed(2)}
                        </small>
                        ${itemDisplayDiscount > 0 ? `<span class="discount-badge">AHORRO: $${itemDisplayDiscount.toFixed(2)}</span>` : ""}
                    </div>
                    <div style="font-weight: 700; color: ${itemDisplayDiscount > 0 ? "var(--success)" : "var(--text-primary)"};">
                        $${itemDisplayTotal.toFixed(2)}
                    </div>
                </div>
            `;
            });

            // ===== MOSTRAR DESCUENTOS POR CATEGORÍA =====
            if (descuentoCantidad > 0) {
                html += `
                <div class="summary-row" style="background: rgba(16, 185, 129, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
                    <div>
                        <strong style="color: var(--success);">🎉 Descuento por Cantidad (${descuentoCantidadLabel})</strong>
                        <br><small style="color: var(--text-secondary);">${distinctPlatformsCantidad} plataformas de 1 mes, ${totalProfilesCantidad} perfiles totales</small>
                    </div>
                    <div style="font-weight: 700; color: var(--success); font-size: 18px;">
                        -$${descuentoCantidad.toFixed(2)}
                    </div>
                </div>
            `;
            }

            if (descuentoTiempo > 0) {
                html += `
                <div class="summary-row" style="background: rgba(245, 158, 11, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
                    <div>
                        <strong style="color: var(--warning);">⏰ Descuento por Tiempo (3 meses)</strong>
                        <br><small style="color: var(--text-secondary);">Contratación de 3 meses en ${itemsTiempo.length} plataforma(s)</small>
                    </div>
                    <div style="font-weight: 700; color: var(--warning); font-size: 18px;">
                        -$${descuentoTiempo.toFixed(2)}
                    </div>
                </div>
            `;
            }

            html += `
            <div class="summary-row" style="margin-top: 10px;">
                <span>TOTAL ADICIONAL A PAGAR</span>
                <span style="color: var(--accent-danger); font-size: 24px;">$${grandTotal.toFixed(2)}</span>
            </div>
        `;
            content.innerHTML = html;
        }

        document.getElementById("editClientForm").addEventListener("submit", function (e) {
            e.preventDefault();

            const oldPin = document.getElementById("editClientOldPin").value;
            const newPin = document.getElementById("editClientPin").value;
            const firstName = document.getElementById("editClientFirstName").value.trim();
            const lastName = document.getElementById("editClientLastName").value.trim();

            const currentDate = new Date().toISOString().split('T')[0];

            if (!/^\d{4}$/.test(newPin)) {
                alert("⚠️ El PIN debe tener exactamente 4 dígitos numéricos");
                return;
            }

            if (newPin !== oldPin && appData.clients.some((c) => c.pin === newPin)) {
                alert("⚠️ Este PIN ya está en uso por otro cliente");
                return;
            }

            const client = appData.clients.find((c) => c.pin === oldPin);
            if (!client) {
                alert("⚠️ Error: Cliente no encontrado");
                return;
            }

            const newFullName = `${firstName} ${lastName}`;

            if (newPin !== oldPin) {
                appData.accounts.forEach((acc) => {
                    acc.profiles.forEach((p) => {
                        if (p.clientId === oldPin) p.clientId = newPin;
                    });
                });
                client.pin = newPin;
            }

            client.firstName = firstName;
            client.lastName = lastName;
            client.name = newFullName;

            let newAssignments = [];
            let totalAdditional = 0;

            if (editCurrentCart.length > 0) {
                client.paymentDate = currentDate;
                const startDate = new Date(currentDate);

                for (const item of editCurrentCart) {
                    const accounts = appData.accounts.filter((a) => item.accountIds.includes(a.id));
                    const endDate = new Date(item.endDate);
                    let assignedCount = 0;

                    for (const acc of accounts) {
                        if (assignedCount >= item.quantity) break;
                        for (let i = acc.profiles.length - 1; i >= 0; i--) {
                            if (!acc.profiles[i].occupied && assignedCount < item.quantity) {
                                acc.profiles[i].occupied = true;
                                acc.profiles[i].clientId = client.pin;
                                acc.profiles[i].expiryDate = endDate.toISOString();

                                newAssignments.push({
                                    platform: item.platform,
                                    deviceType: item.deviceType,
                                    accountEmail: acc.email,
                                    password: acc.password,
                                    profileNumber: acc.profiles[i].number,
                                    durationMonths: item.durationMonths,
                                    durationDays: item.durationDays,
                                    expiryDate: endDate.toISOString(),
                                    startDate: startDate.toISOString(),
                                });
                                assignedCount++;
                            }
                        }
                    }
                    totalAdditional += item.total;
                }

                client.assignments.push(...newAssignments);

                const hasActiveAssignments = client.assignments.some(ass => {
                    const daysLeft = getDaysRemaining(ass.expiryDate);
                    return daysLeft > 0 && !newAssignments.includes(ass);
                });

                if (hasActiveAssignments) {
                    client.totalPaid = (client.totalPaid || 0) + totalAdditional;
                } else {
                    client.totalPaid = totalAdditional;
                }
            }

            saveData().then(() => {
                if (editCurrentCart.length > 0) {
                    showEditRegistrationResult(client.pin, newAssignments, totalAdditional, client.name);
                } else {
                    closeModal("editClientModal");
                    updateAllViews();
                    alert("✅ Datos del cliente actualizados correctamente");
                }
            });
        });

        function showEditRegistrationResult(pin, assignments, total, fullName) {
            document.getElementById("editClientForm").style.display = "none";
            document.getElementById("editRegistrationResult").style.display = "block";
            document.getElementById("editGeneratedPin").textContent = pin;

            const container = document.getElementById("editAssignedProfiles");
            container.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h4 style="color: var(--text-primary); margin-bottom: 5px;">${fullName}</h4>
                <p style="color: var(--text-secondary); font-size: 14px;">Plataformas agregadas exitosamente</p>
            </div>
            <div class="summary-box" style="margin-bottom: 20px;">
                <div class="summary-row" style="border: none; margin: 0; padding: 0;">
                    <span>Total Adicional Pagado:</span>
                    <span style="color: var(--accent-danger); font-size: 20px; font-weight: 800;">$${total.toFixed(2)}</span>
                </div>
            </div>
            <h4 style="margin-bottom: 15px; color: var(--accent-primary);">📋 Nuevos Perfiles Asignados:</h4>
        `;

            assignments.forEach((ass) => {
                const div = document.createElement("div");
                div.className = "client-result";
                div.style.border = "2px solid rgba(59, 130, 246, 0.3)";
                div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="font-size: 18px; color: var(--accent-danger);">${PLATFORM_CONFIG[ass.platform].icon} ${ass.platform}</strong>
                        ${ass.platform === "Netflix" ? `<span class="platform-subtype">${ass.deviceType}</span>` : ""}<br>
                        <small style="color: var(--text-secondary);">Perfil #${ass.profileNumber} • ${ass.durationMonths} mes${ass.durationMonths > 1 ? "es" : ""}</small>
                    </div>
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px;">
                    <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">📧</span> ${ass.accountEmail}</div>
                    <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">🔑</span> ${ass.password}</div>
                    <div style="color: var(--warning); margin-top: 8px; font-weight: 600;">
                        ⏰ Vence: <span class="date-display">${formatDate(ass.expiryDate)}</span> (${ass.durationDays} días)
                    </div>
                </div>
            `;
                container.appendChild(div);
            });
        }

        function deleteCurrentClient() {
            if (!editingClientPin) {
                alert("⚠️ Error: No se ha seleccionado ningún cliente");
                return;
            }

            if (!confirm("⚠️ ¿ESTÁS SEGURO?\n\nEsta acción liberará todos los perfiles ocupados por este cliente y eliminará todos sus datos permanentemente.\n\n¿Deseas continuar?")) {
                return;
            }

            appData.accounts.forEach((acc) => {
                acc.profiles.forEach((p) => {
                    if (p.clientId === editingClientPin) {
                        p.occupied = false;
                        p.clientId = null;
                        p.expiryDate = null;
                    }
                });
            });

            appData.clients = appData.clients.filter((c) => c.pin !== editingClientPin);
            saveData().then(() => {
                closeModal("editClientModal");
                updateAllViews();
                alert("✅ Cliente eliminado y perfiles liberados correctamente");
            });
        }

        function viewClientDetails(pin) {
            const client = appData.clients.find((c) => c.pin === pin);
            if (!client) return;

            currentViewPin = pin;

            document.getElementById("viewClientName").textContent = client.name;
            document.getElementById("viewClientPin").textContent = client.pin;

            document.getElementById("viewClientTotalPaid").textContent = "$" + (client.totalPaid || 0).toFixed(2);
            document.getElementById("viewClientPaymentDate").textContent = formatDate(client.paymentDate);

            const daysLeft = Math.min(...client.assignments.map((a) => getDaysRemaining(a.expiryDate)));
            const status = getStatusByDays(daysLeft);
            const statusEl = document.getElementById("viewClientStatus");
            statusEl.textContent = status.text;
            statusEl.style.color = daysLeft <= 3 ? "var(--accent-danger)" : daysLeft <= 10 ? "var(--warning)" : "var(--accent-success)";

            const container = document.getElementById("viewClientPlatforms");
            container.innerHTML = "";

            const sortedAssignments = [...client.assignments].sort((a, b) => getDaysRemaining(b.expiryDate) - getDaysRemaining(a.expiryDate));

            sortedAssignments.forEach((ass) => {
                const config = PLATFORM_CONFIG[ass.platform];
                const assDaysLeft = getDaysRemaining(ass.expiryDate);
                const isExpired = assDaysLeft <= 0;

                const card = document.createElement("div");
                card.className = "platform-detail-card";
                card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 24px;">${config.icon}</span>
                            <strong style="font-size: 16px; color: ${isExpired ? "var(--accent-danger)" : "var(--text-primary)"};">
                                ${ass.platform}
                            </strong>
                            ${ass.platform === "Netflix" ? `<span class="platform-subtype">${ass.deviceType}</span>` : ""}
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
                            👤 Perfil #${ass.profileNumber} • ${ass.durationMonths || 1} mes${(ass.durationMonths || 1) > 1 ? "es" : ""}
                        </div>
                    </div>
                    <span class="badge ${assDaysLeft <= 3 ? "badge-danger" : assDaysLeft <= 10 ? "badge-warning" : "badge-success"}">
                        ${isExpired ? "VENCIDO" : assDaysLeft + " días"}
                    </span>
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--text-secondary); font-size: 12px;">📧 Email:</span>
                        <span style="font-size: 13px; font-family: monospace;">${ass.accountEmail}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--text-secondary); font-size: 12px;">🔑 Contraseña:</span>
                        <span style="font-size: 13px; font-family: monospace;">${ass.password}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 12px;">⏰ Vencimiento:</span>
                        <span style="font-size: 13px; color: var(--warning);" class="date-display">${formatDate(ass.expiryDate)}</span>
                    </div>
                </div>
            `;
                container.appendChild(card);
            });

            openModal("viewClientModal");
        }

        function renewClient(pin) {
            const client = appData.clients.find((c) => c.pin === pin);
            if (!client) return;

            currentRenewPin = pin;
            selectedRenewalMonths = 1;

            document.getElementById("renewClientName").textContent = client.name;
            document.getElementById("renewClientPin").textContent = client.pin;

            const lastExpiry = new Date(Math.max(...client.assignments.map((a) => new Date(a.expiryDate))));
            document.getElementById("renewCurrentExpiry").textContent = formatDate(lastExpiry);

            document.querySelectorAll(".renewal-option").forEach((opt) => opt.classList.remove("selected"));
            document.getElementById("renewOption1").classList.add("selected");
            document.getElementById("selectedRenewalMonths").value = "1";

            calculateAndShowRenewalCost();

            openModal("renewClientModal");
        }

        function selectRenewalMonths(months) {
            selectedRenewalMonths = months;
            const input = document.getElementById("selectedRenewalMonths");
            if (input) input.value = months;

            document.querySelectorAll(".renewal-option").forEach((opt) => opt.classList.remove("selected"));
            document.getElementById("renewOption" + months).classList.add("selected");

            calculateAndShowRenewalCost();
        }

        function calculateAndShowRenewalCost() {
            const client = appData.clients.find((c) => c.pin === currentRenewPin);
            if (!client) return;

            const months = selectedRenewalMonths;
            let platformCounts = {};

            client.assignments.forEach((ass) => {
                const key = ass.platform === "Netflix" ? `Netflix-${ass.deviceType}` : ass.platform;
                if (!platformCounts[key]) {
                    platformCounts[key] = { platform: ass.platform, deviceType: ass.deviceType, count: 0, price: 0 };
                }
                platformCounts[key].count++;
            });

            Object.keys(platformCounts).forEach((key) => {
                const info = platformCounts[key];
                const account = appData.accounts.find((a) =>
                    a.platform === info.platform &&
                    (info.platform !== "Netflix" || a.deviceType === info.deviceType)
                );
                if (account) info.price = account.pricePerProfile;
            });

            // ===== SEPARAR POR CATEGORÍA =====
            // En renovación, todos los items tienen la misma duración (months)
            // Si months === 3 → descuento por TIEMPO
            // Si months === 1 → posible descuento por CANTIDAD

            let subtotal = 0;
            Object.values(platformCounts).forEach((info) => {
                subtotal += info.price * info.count * months;
            });

            const distinctPlatforms = Object.keys(platformCounts).length;
            const totalProfiles = Object.values(platformCounts).reduce((sum, info) => sum + info.count, 0);

            let discount = 0;
            let discountText = "";
            let discountDetails = [];

            if (months === 3) {
                // Solo aplica descuento por TIEMPO
                discount = subtotal * 0.10;
                discountText = " (10% OFF por 3 meses)";
                discountDetails.push({ label: "Descuento por Tiempo (3 meses)", amount: discount, color: "var(--warning)" });
            } else if (months === 1) {
                // Solo aplica descuento por CANTIDAD
                let platformDiscountRate = 0;
                let platformDiscountLabel = "";
                if (distinctPlatforms >= 7) {
                    platformDiscountRate = 0.20;
                    platformDiscountLabel = "7+ plataformas";
                } else if (distinctPlatforms === 6) {
                    platformDiscountRate = 0.18;
                    platformDiscountLabel = "6 plataformas";
                } else if (distinctPlatforms === 5) {
                    platformDiscountRate = 0.15;
                    platformDiscountLabel = "5 plataformas";
                } else if (distinctPlatforms === 4) {
                    platformDiscountRate = 0.12;
                    platformDiscountLabel = "4 plataformas";
                } else if (distinctPlatforms === 3) {
                    platformDiscountRate = 0.10;
                    platformDiscountLabel = "3 plataformas";
                }

                if (platformDiscountRate > 0 && totalProfiles >= 3) {
                    discount = subtotal * platformDiscountRate;
                    discountText = ` (${Math.round(platformDiscountRate * 100)}% OFF por ${platformDiscountLabel})`;
                    discountDetails.push({ label: `Descuento por Cantidad (${platformDiscountLabel})`, amount: discount, color: "var(--success)" });
                }
            }
            // Si months === 2, no hay descuento

            const total = subtotal - discount;
            renewalCostPreview = total;

            updateRenewalSummaryWithPrice(subtotal, discount, total, months, discountText, discountDetails);
        }

        function updateRenewalSummaryWithPrice(subtotal, discount, total, months, discountText, discountDetails) {
            const client = appData.clients.find((c) => c.pin === currentRenewPin);
            if (!client) return;

            const lastExpiry = new Date(Math.max(...client.assignments.map((a) => new Date(a.expiryDate))));
            const baseDate = lastExpiry > new Date() ? lastExpiry : new Date();
            const newEnd = calculateExpiryDate(baseDate, months);

            const summary = document.getElementById("renewalSummary");
            summary.style.display = "block";

            let discountHtml = "";
            if (discountDetails && discountDetails.length > 0) {
                discountDetails.forEach((d) => {
                    discountHtml += `
                    <div class="detail-row" style="color: ${d.color}">
                        <span class="detail-label">${d.label}:</span>
                        <span class="detail-value">-$${d.amount.toFixed(2)}</span>
                    </div>
                    `;
                });
            } else if (discount > 0) {
                discountHtml = `
                <div class="detail-row" style="color: var(--success)">
                    <span class="detail-label">Descuento:</span>
                    <span class="detail-value">-$${discount.toFixed(2)}</span>
                </div>
                `;
            }

            summary.innerHTML = `
            <h4 style="margin-bottom: 15px; color: var(--accent-primary)">
                💰 Resumen de Renovación
            </h4>
            <div class="detail-row">
                <span class="detail-label">Duración:</span>
                <span class="detail-value">${months} mes${months > 1 ? "es" : ""}${discountText}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Subtotal:</span>
                <span class="detail-value">$${subtotal.toFixed(2)}</span>
            </div>
            ${discountHtml}
            <div class="detail-row" style="border-top: 2px solid var(--accent-primary); padding-top: 10px; margin-top: 10px;">
                <span class="detail-label" style="font-size: 16px; font-weight: 700;">TOTAL A COBRAR:</span>
                <span class="detail-value" style="font-size: 24px; font-weight: 800; color: var(--accent-danger);">
                    $${total.toFixed(2)}
                </span>
            </div>
            <div class="detail-row" style="margin-top: 15px;">
                <span class="detail-label">Nueva fecha de vencimiento:</span>
                <span class="detail-value" style="color: var(--accent-success); font-weight: 700;">
                    ${formatDate(newEnd)}
                </span>
            </div>
        `;
        }

        function confirmRenewal() {
            const months = selectedRenewalMonths;

            if (!months || isNaN(months) || months < 1 || months > 3) {
                alert("⚠️ Selecciona una duración válida (1, 2 o 3 meses)");
                return;
            }

            const client = appData.clients.find((c) => c.pin === currentRenewPin);
            if (!client) {
                alert("⚠️ Error: Cliente no encontrado");
                return;
            }

            // 🔧 CORRECCIÓN DEFINITIVA: Para renovación completa, la fecha base es:
            // El vencimiento más lejano entre todas las asignaciones activas
            // Si ya todo venció, usar hoy (o fecha de pago)

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Encontrar el vencimiento más lejano
            const lastExpiry = new Date(Math.max(...client.assignments.map((a) => new Date(a.expiryDate))));
            lastExpiry.setHours(0, 0, 0, 0);

            let baseDate;

            // Si el último vencimiento es hoy o futuro, extender desde ahí
            if (lastExpiry >= today) {
                baseDate = lastExpiry;
            } else {
                // Si venció hace poco (grace period de 5 días)
                const daysExpired = Math.floor((today - lastExpiry) / (1000 * 60 * 60 * 24));
                if (daysExpired <= 5) {
                    baseDate = lastExpiry;
                } else {
                    // Venció hace mucho, usar hoy
                    baseDate = today;
                }
            }

            const newEnd = calculateExpiryDate(baseDate, months);

            // ... cálculo de costos se mantiene igual ...
            let platformCounts = {};
            client.assignments.forEach((ass) => {
                const key = ass.platform === "Netflix" ? `Netflix-${ass.deviceType}` : ass.platform;
                if (!platformCounts[key]) {
                    platformCounts[key] = { count: 0, price: 0 };
                }
                platformCounts[key].count++;
            });

            Object.keys(platformCounts).forEach((key) => {
                const info = platformCounts[key];
                const [platform, deviceType] = key.includes('-') ? key.split('-') : [key, null];
                const account = appData.accounts.find((a) =>
                    a.platform === platform &&
                    (platform !== "Netflix" || a.deviceType === deviceType)
                );
                if (account) info.price = account.pricePerProfile;
            });

            let subtotal = 0;
            Object.values(platformCounts).forEach((info) => {
                subtotal += info.price * info.count * months;
            });

            const distinctPlatforms = Object.keys(platformCounts).length;
            const totalProfiles = Object.values(platformCounts).reduce((sum, info) => sum + info.count, 0);

            let discount = 0;
            let discountDetails = [];

            if (months === 3) {
                discount = subtotal * 0.10;
                discountDetails.push("10% por 3 meses");
            } else if (months === 1) {
                let platformDiscountRate = 0;
                if (distinctPlatforms >= 7) platformDiscountRate = 0.20;
                else if (distinctPlatforms === 6) platformDiscountRate = 0.18;
                else if (distinctPlatforms === 5) platformDiscountRate = 0.15;
                else if (distinctPlatforms === 4) platformDiscountRate = 0.12;
                else if (distinctPlatforms === 3) platformDiscountRate = 0.10;

                if (platformDiscountRate > 0 && totalProfiles >= 3) {
                    discount = subtotal * platformDiscountRate;
                    discountDetails.push(`${Math.round(platformDiscountRate * 100)}% por ${distinctPlatforms} plataformas`);
                }
            }

            let renewalCost = subtotal - discount;

            const confirmMessage = `¿Confirmar renovación?\n\n` +
                `Cliente: ${client.name}\n` +
                `Vencimiento actual: ${formatDate(lastExpiry)}\n` +
                `Renovar desde: ${formatDate(baseDate)}\n` +
                `Duración: ${months} mes(es)\n` +
                (discount > 0 ? `Subtotal: $${subtotal.toFixed(2)}\nDescuento: -$${discount.toFixed(2)} (${discountDetails.join(", ")})\n` : ``) +
                `Monto a cobrar: $${renewalCost.toFixed(2)}\n\n` +
                `¿Proceder?`;

            if (!confirm(confirmMessage)) return;

            client.totalPaid = renewalCost;
            // Actualizar fecha de pago a hoy
            client.paymentDate = today.toISOString().split('T')[0];

            // Aplicar la nueva fecha a TODAS las asignaciones
            client.assignments.forEach((ass) => {
                ass.expiryDate = newEnd.toISOString();
                ass.durationMonths = months;
                ass.startDate = baseDate.toISOString();
                ass.durationDays = getExactDaysBetween(baseDate, newEnd);

                const account = appData.accounts.find((a) => {
                    if (ass.platform === "Netflix") {
                        return a.email === ass.accountEmail &&
                            a.platform === ass.platform &&
                            a.deviceType === ass.deviceType;
                    }
                    return a.email === ass.accountEmail &&
                        a.platform === ass.platform;
                });

                if (account) {
                    const profile = account.profiles.find(
                        (p) => p.number === ass.profileNumber && p.clientId === currentRenewPin
                    );
                    if (profile) profile.expiryDate = newEnd.toISOString();
                }
            });

            saveData().then(() => {
                closeModal('renewClientModal');
                updateAllViews();
                showNotification(
                    `✅ Suscripción renovada\n💰 Cobrado: $${renewalCost.toFixed(2)}\n📅 Nueva fecha: ${formatDate(newEnd)}`,
                    "success"
                );
            });
        }

        function showNotification(message, type) {
            const notification = document.createElement("div");
            notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === "success" ? "linear-gradient(135deg, var(--success), #059669)" : "linear-gradient(135deg, var(--accent-danger), var(--accent-danger-dark))"};
            color: white;
            padding: 20px 25px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            z-index: 3000;
            font-weight: 600;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
            border: 2px solid rgba(255,255,255,0.1);
        `;
            notification.innerHTML = message.replace(/\n/g, "<br>");

            const style = document.createElement("style");
            style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
            document.head.appendChild(style);

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = "slideOut 0.3s ease-out";
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        function updateDashboard() {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const banner = document.getElementById("currentMonthBanner");
            if (banner) banner.textContent = `💰 Flujo de Caja de ${MONTH_NAMES[currentMonth]} ${currentYear}`;

            const monthlyIncome = calculateMonthlyIncome(currentMonth, currentYear);
            const monthlyCosts = calculateMonthlyCosts();
            const netCash = monthlyIncome - monthlyCosts;

            const cashInHand = document.getElementById("cashInHand");
            const monthlyCostsEl = document.getElementById("monthlyCosts");
            const netCashFlow = document.getElementById("netCashFlow");

            if (cashInHand) cashInHand.textContent = "$" + monthlyIncome.toFixed(2);
            if (monthlyCostsEl) monthlyCostsEl.textContent = "$" + monthlyCosts.toFixed(2);
            if (netCashFlow) netCashFlow.textContent = (netCash >= 0 ? "+" : "") + "$" + netCash.toFixed(2);

            const netCard = document.getElementById("netCashCard");
            const netText = document.getElementById("netCashText");

            if (netCard && netText) {
                if (netCash >= 0) {
                    netCard.className = "stat-card success";
                    netText.textContent = "✅ Tienes ganancia este mes";
                } else {
                    netCard.className = "stat-card danger";
                    netText.textContent = "⚠️ Estás en números rojos";
                }
            }

            const activeClients = appData.clients;
            const totalClientsEl = document.getElementById("totalClients");
            if (totalClientsEl) totalClientsEl.textContent = activeClients.length;

            const alertsContainer = document.getElementById("alertsContainer");
            if (!alertsContainer) return;

            const expiringSoon = appData.clients.filter((c) => {
                const days = Math.min(...c.assignments.map((a) => getDaysRemaining(a.expiryDate)));
                return days > 3 && days <= 10;
            });
            const critical = appData.clients.filter((c) => {
                const days = Math.min(...c.assignments.map((a) => getDaysRemaining(a.expiryDate)));
                return days <= 3 && days > 0;
            });
            const expired = appData.clients.filter((c) => {
                const days = Math.min(...c.assignments.map((a) => getDaysRemaining(a.expiryDate)));
                return days <= 0;
            });

            const allExpiring = [...expired, ...critical, ...expiringSoon].sort(
                (a, b) => Math.min(...a.assignments.map((x) => getDaysRemaining(x.expiryDate))) - Math.min(...b.assignments.map((x) => getDaysRemaining(x.expiryDate)))
            );

            if (allExpiring.length === 0) {
                alertsContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">🎉 No hay alertas pendientes</p>';
            } else {
                alertsContainer.innerHTML = "";
                allExpiring.forEach((client) => {
                    const days = Math.min(...client.assignments.map((a) => getDaysRemaining(a.expiryDate)));
                    const status = getStatusByDays(days);
                    const alert = document.createElement("div");
                    alert.className = "card";
                    alert.style.cssText = `border-left: 4px solid var(--${status.color}); margin-bottom: 10px;`;
                    alert.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="font-size: 16px;">${client.name}</strong>
                            <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">
                                PIN: ${client.pin} • 
                                ${client.assignments.reduce((nearest, a) => getDaysRemaining(a.expiryDate) < getDaysRemaining(nearest.expiryDate) ? a : nearest).platform} vence antes
                            </div>
                        </div>
                        <span class="badge ${status.class}">${days <= 0 ? "Vencido" : days + " días"}</span>
                    </div>
                `;
                    alertsContainer.appendChild(alert);
                });
            }

            const dashboardAccounts = document.getElementById("dashboardAccounts");
            if (!dashboardAccounts) return;
            dashboardAccounts.innerHTML = "";

            const summary = {};
            appData.accounts.forEach((acc) => {
                const key = acc.platform === "Netflix" ? `Netflix - ${acc.deviceType}` : acc.platform;
                if (!summary[key]) {
                    summary[key] = { total: 0, available: 0, icon: PLATFORM_CONFIG[acc.platform].icon, color: PLATFORM_CONFIG[acc.platform].color };
                }
                summary[key].total += acc.maxProfiles;
                summary[key].available += acc.profiles.filter((p) => !p.occupied).length;
            });

            Object.entries(summary).forEach(([key, data]) => {
                const card = document.createElement("div");
                card.className = "platform-card";
                card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-name">
                        <div class="platform-icon ${data.color}">${data.icon}</div>
                        <div style="font-size: 14px;">${key}</div>
                    </div>
                </div>
                <div style="text-align: center; margin: 15px 0;">
                    <div style="font-size: 36px; font-weight: 800; color: var(--accent-primary);">${data.available}</div>
                    <div style="color: var(--text-secondary); font-size: 12px;">disponibles de ${data.total}</div>
                </div>
                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 10px; text-align: center; font-size: 12px; color: var(--text-secondary);">Ocupados: ${data.total - data.available}</div>
            `;
                dashboardAccounts.appendChild(card);
            });
        }

        function updateFinanceView() {
            const banner = document.getElementById("financeMonthBanner");
            if (banner) banner.textContent = `💰 Flujo de Caja de ${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

            const monthlyIncome = calculateMonthlyIncome(selectedMonth, selectedYear);
            const monthlyCosts = calculateMonthlyCosts();
            const netCash = monthlyIncome - monthlyCosts;

            const selectedMonthIncome = document.getElementById("selectedMonthIncome");
            const selectedMonthCosts = document.getElementById("selectedMonthCosts");
            const selectedMonthNet = document.getElementById("selectedMonthNet");

            if (selectedMonthIncome) selectedMonthIncome.textContent = "$" + monthlyIncome.toFixed(2);
            if (selectedMonthCosts) selectedMonthCosts.textContent = "$" + monthlyCosts.toFixed(2);
            if (selectedMonthNet) selectedMonthNet.textContent = (netCash >= 0 ? "+" : "") + "$" + netCash.toFixed(2);

            const netCard = document.getElementById("selectedNetCard");
            if (netCard) {
                netCard.className = netCash >= 0 ? "stat-card success" : "stat-card danger";
            }

            const breakdown = document.getElementById("platformBreakdown");
            if (!breakdown) return;

            let html = "";

            const platformIncome = {};
            appData.clients.forEach((client) => {
                if (isPaymentInSelectedMonth(client.paymentDate)) {
                    client.assignments.slice().sort((a, b) => getDaysRemaining(b.expiryDate) - getDaysRemaining(a.expiryDate)).forEach((ass) => {
                        if (!platformIncome[ass.platform]) platformIncome[ass.platform] = 0;
                        const acc = appData.accounts.find(
                            (a) => a.email === ass.accountEmail && a.platform === ass.platform,
                        );
                        if (acc) {
                            const months = ass.durationMonths || 1;
                            const price = acc.pricePerProfile * months * (months === 3 ? 0.88 : 1);
                            platformIncome[ass.platform] += price;
                        }
                    });
                }
            });

            const platformCosts = {};
            appData.accounts.forEach((acc) => {
                if (!platformCosts[acc.platform]) platformCosts[acc.platform] = 0;
                platformCosts[acc.platform] += acc.cost;
            });

            const allPlatforms = [...new Set([...Object.keys(platformIncome), ...Object.keys(platformCosts)])];

            if (allPlatforms.length === 0) {
                html = '<p style="color: var(--text-secondary);">No hay datos para este mes</p>';
            } else {
                html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">';

                allPlatforms.forEach((platform) => {
                    const income = platformIncome[platform] || 0;
                    const cost = platformCosts[platform] || 0;
                    const profit = income - cost;
                    const config = PLATFORM_CONFIG[platform];

                    html += `
                    <div class="finance-card" style="border: 2px solid ${profit >= 0 ? "var(--success)" : "var(--accent-danger)"};">
                        <div class="finance-title">
                            <span style="font-size: 24px;">${config?.icon || "📺"}</span>
                            ${platform}
                        </div>
                        <div class="finance-row">
                            <span>Ingresos del mes:</span>
                            <strong style="color: var(--accent-primary);">$${income.toFixed(2)}</strong>
                        </div>
                        <div class="finance-row">
                            <span>Costo mensual:</span>
                            <strong style="color: var(--accent-danger);">$${cost.toFixed(2)}</strong>
                        </div>
                        <div class="finance-row total" style="border-top: 2px solid ${profit >= 0 ? "var(--success)" : "var(--accent-danger)"};">
                            <span>Ganancia:</span>
                            <strong style="color: ${profit >= 0 ? "var(--success)" : "var(--accent-danger)"}; font-size: 18px;">
                                ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}
                            </strong>
                        </div>
                    </div>
                `;
                });

                html += "</div>";
            }

            breakdown.innerHTML = html;

            const select = document.getElementById("paymentAccount");
            if (!select) return;

            select.innerHTML = '<option value="">Selecciona una cuenta...</option>';

            const netflixByEmail = {};
            const otherAccounts = [];

            appData.accounts.forEach((acc) => {
                if (acc.platform === "Netflix") {
                    if (!netflixByEmail[acc.email]) netflixByEmail[acc.email] = [];
                    netflixByEmail[acc.email].push(acc);
                } else {
                    otherAccounts.push(acc);
                }
            });

            if (Object.keys(netflixByEmail).length > 0) {
                const netflixGroup = document.createElement("optgroup");
                netflixGroup.label = "🎬 Netflix (por cuenta de correo)";
                Object.entries(netflixByEmail).forEach(([email, accounts]) => {
                    const totalCost = accounts.reduce((sum, a) => sum + a.cost, 0);
                    const types = accounts.map((a) => a.deviceType).join(" + ");
                    const option = document.createElement("option");
                    option.value = accounts[0].id;
                    option.dataset.netflixGroup = JSON.stringify(accounts.map((a) => a.id));
                    option.textContent = `${email} (${types}) - $${totalCost.toFixed(2)}/mes`;
                    netflixGroup.appendChild(option);
                });
                select.appendChild(netflixGroup);
            }

            if (otherAccounts.length > 0) {
                const otherGroup = document.createElement("optgroup");
                otherGroup.label = "📺 Otras Plataformas";
                otherAccounts.forEach((acc) => {
                    const option = document.createElement("option");
                    option.value = acc.id;
                    option.textContent = `${acc.platform} - ${acc.email} ($${acc.cost.toFixed(2)}/mes)`;
                    otherGroup.appendChild(option);
                });
                select.appendChild(otherGroup);
            }

            const list = document.getElementById("paymentList");
            if (!list) return;

            const sorted = appData.payments.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (sorted.length === 0) {
                list.innerHTML = '<p style="color: var(--text-secondary); margin-top: 20px;">No hay pagos registrados</p>';
            } else {
                list.innerHTML = '<h4 style="margin: 20px 0 10px 0; font-size: 14px; color: var(--accent-primary);">Últimos Pagos</h4>';
                sorted.slice(0, 5).forEach((pay) => {
                    const div = document.createElement("div");
                    div.style.cssText = "padding: 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px; font-size: 13px; border-left: 3px solid var(--accent-danger);";
                    div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <strong>${pay.platform}</strong>
                        <span style="color: var(--accent-danger); font-weight: 700;">-$${pay.amount.toFixed(2)}</span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 11px;">
                        ${pay.email} • <span class="date-display">${formatDate(pay.date)}</span>
                    </div>
                `;
                    list.appendChild(div);
                });
            }

            const upcoming = document.getElementById("upcomingPayments");
            if (!upcoming) return;

            const nextPayments = appData.accounts
                .map((a) => ({ ...a, daysLeft: getDaysRemaining(a.nextPayment) }))
                .sort((a, b) => a.daysLeft - b.daysLeft)
                .slice(0, 5);

            if (nextPayments.length > 0) {
                upcoming.innerHTML = '<h4 style="margin-bottom: 10px; color: var(--accent-primary); font-size: 14px;">Próximos Pagos</h4>';
                nextPayments.forEach((acc) => {
                    const div = document.createElement("div");
                    div.style.cssText = `padding: 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px; font-size: 12px; border-left: 3px solid ${acc.daysLeft <= 3 ? "var(--accent-danger)" : acc.daysLeft <= 7 ? "var(--warning)" : "var(--accent-primary)"}`;
                    div.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">${acc.platform} ${acc.platform === "Netflix" ? `(${acc.deviceType})` : ""}</span>
                        <span style="color: ${acc.daysLeft <= 3 ? "var(--accent-danger)" : acc.daysLeft <= 7 ? "var(--warning)" : "var(--accent-primary)"}; font-weight: 700;">
                            ${acc.daysLeft} días
                        </span>
                    </div>
                    <div style="color: var(--text-secondary); margin-top: 4px;">
                        $${acc.cost.toFixed(2)} • <span class="date-display">${formatDate(acc.nextPayment)}</span>
                    </div>
                `;
                    upcoming.appendChild(div);
                });
            } else {
                upcoming.innerHTML = '<p style="color: var(--text-secondary);">No hay pagos pendientes</p>';
            }
        }

        document.getElementById("paymentForm").addEventListener("submit", function (e) {
            e.preventDefault();

            const select = document.getElementById("paymentAccount");
            const selectedOption = select.options[select.selectedIndex];
            let accountIds = [];

            if (selectedOption.dataset.netflixGroup) {
                accountIds = JSON.parse(selectedOption.dataset.netflixGroup);
            } else {
                accountIds = [parseInt(select.value)];
            }

            const amount = parseFloat(document.getElementById("paymentAmount").value);
            const date = document.getElementById("paymentDate").value;
            const amountPerAccount = amount / accountIds.length;

            accountIds.forEach((accId, index) => {
                const account = appData.accounts.find((a) => a.id === accId);
                if (!account) return;

                const payment = {
                    id: Date.now() + index,
                    accountId: accId,
                    platform: account.platform,
                    email: account.email,
                    amount: accountIds.length === 1 ? amount : amountPerAccount,
                    date: date,
                    nextPayment: new Date(new Date(date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                };

                appData.payments.push(payment);
                account.nextPayment = payment.nextPayment;
            });

            saveData().then(() => {
                e.target.reset();
                updateFinanceView();
                renderAccounts();
                showNotification(`✅ Pago registrado para ${accountIds.length} cuenta(s)`, "success");
            });
        });

        function updateAllViews() {
            updateDashboard();
            renderAccounts();
            renderClients();
            updateFinanceView();
        }

        window.onclick = function (event) {
            if (event.target.classList.contains("modal")) {
                event.target.classList.remove("active");
            }
        };