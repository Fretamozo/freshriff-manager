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
        let appData = { accounts: [], clients: [], payments: [], customPlatforms: [], platformLogos: {} };
        // Orden de la tabla de clientes: campo activo + dirección. Por defecto,
        // Apellido descendente (tal como pidió Facu).
        let currentSortField = "lastName";
        let currentSortDirection = "desc";
        // Plataformas tildadas en los botones de filtro (vacío = mostrar todos)
        let activePlatformFilters = new Set();
        let currentCart = [];
        let editCurrentCart = [];
        let editingClientPin = null;
        // Logo elegido pero todavía no guardado (se resuelve en el submit del form).
        // En el de editar: "" significa que el usuario tocó "Quitar logo" a propósito.
        let pendingNewPlatformLogo = null;
        let pendingEditPlatformLogo = null;
        let selectedMonth = new Date().getMonth();
        let selectedYear = new Date().getFullYear();
        let currentViewPin = null;
        let currentRenewPin = null;
        let changeExpiryAssignmentIndex = null;
        let selectedRenewalMonths = 1;
        let renewalCostPreview = 0;
        let isDataLoaded = false;
        let unsubscribe = null;

        const MONTH_NAMES = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];

        let PLATFORM_CONFIG = {
            Netflix: { icon: "🎬", color: "netflix", hasSubtypes: true, subtypes: { "Smart TV": { profiles: 3 }, "Móvil/PC": { profiles: 4 } } },
            "Disney+": { icon: "✨", color: "disney", hasSubtypes: true, subtypes: { "Smart": { profiles: 2 }, "Común": { profiles: 6 } } },
            "Prime Video": { icon: "📦", color: "prime", hasSubtypes: false, profiles: 6 },
            "HBO Max": { icon: "🎭", color: "hbo", hasSubtypes: false, profiles: 5 },
            "YouTube Premium": { icon: "▶️", color: "youtube", hasSubtypes: false, profiles: 5 },
            "Universal+": { icon: "🌍", color: "universal", hasSubtypes: false, profiles: 5 },
            "Crunchyroll": { icon: "🍥", color: "crunchyroll", hasSubtypes: false, profiles: 5 },
            "Apple TV+": { icon: "🍎", color: "appletv", hasSubtypes: false, profiles: 6 },
            "Paramount+": { icon: "⛰️", color: "paramount", hasSubtypes: false, profiles: 6 },
        };

        // ¿Esta plataforma se vende dividida en subtipos (ej: Netflix Smart TV /
        // Móvil-PC, Disney+ Smart / Común)? Antes esto se preguntaba comparando
        // directamente contra el string "Netflix" en decenas de lugares del código;
        // ahora es genérico, así que cualquier plataforma con hasSubtypes:true en
        // PLATFORM_CONFIG (de fábrica o futura) queda soportada sin tocar nada más.
        function platformHasSubtypes(platform) {
            return !!(PLATFORM_CONFIG[platform] && PLATFORM_CONFIG[platform].hasSubtypes);
        }

        // Nombres de las plataformas que vienen incluidas de fábrica (no se pueden borrar/editar desde el catálogo)
        const BUILTIN_PLATFORM_NAMES = Object.keys(PLATFORM_CONFIG);

        // 🧩 Vuelve a armar PLATFORM_CONFIG combinando las plataformas fijas (de fábrica)
        // con las plataformas personalizadas que Facu agregó desde "🧩 Plataformas".
        // Se llama cada vez que appData.customPlatforms cambia (alta, edición, borrado,
        // carga inicial desde Firebase) para que TODO el resto del código (que sigue
        // leyendo PLATFORM_CONFIG[platform] tal cual como antes) vea también las
        // plataformas dinámicas sin tener que tocar cada punto de uso.
        function rebuildPlatformConfig() {
            const builtins = {};
            BUILTIN_PLATFORM_NAMES.forEach((name) => {
                builtins[name] = PLATFORM_CONFIG[name];
            });

            const merged = { ...builtins };
            (appData.customPlatforms || []).forEach((cp) => {
                merged[cp.name] = {
                    icon: cp.icon || "📺",
                    color: cp.colorClass || "custom-platform",
                    hasSubtypes: false,
                    profiles: cp.profiles,
                    isCustom: true,
                    customColorHex: cp.colorHex || "#3b82f6",
                };
            });
            PLATFORM_CONFIG = merged;
        }

        // 🖼️ Devuelve el logo (imagen) que Facu subió para una plataforma, o null si
        // todavía no subió ninguno (en ese caso se sigue usando el emoji de siempre).
        function getPlatformLogo(platformName) {
            return (appData.platformLogos || {})[platformName] || null;
        }

        // 🎨 Genera el <div> del ícono de una plataforma (versión grande, 44x44, usada
        // en los encabezados de tarjeta). Si hay un logo subido lo muestra como imagen;
        // si no, cae al emoji + color de siempre (de fábrica o del catálogo personalizado).
        function platformIconHtml(config, platformName) {
            const logo = platformName ? getPlatformLogo(platformName) : null;
            if (logo) {
                return `<div class="platform-icon" style="background: #fff; padding: 5px;"><img src="${logo}" alt="${platformName}" style="width: 100%; height: 100%; object-fit: contain;"></div>`;
            }
            if (config && config.isCustom) {
                const hex = config.customColorHex || "#3b82f6";
                return `<div class="platform-icon" style="background: linear-gradient(135deg, ${hex}, ${hex}cc);">${config.icon}</div>`;
            }
            return `<div class="platform-icon ${config.color}">${config.icon}</div>`;
        }

        // 🎨 Ícono chico para usar dentro de texto/resúmenes cortos (ej: "🎬 Netflix").
        // Si hay logo subido, muestra una miniatura; si no, el emoji de siempre.
        function platformIconInline(platformName, size) {
            size = size || 18;
            const logo = getPlatformLogo(platformName);
            if (logo) {
                return `<img src="${logo}" alt="${platformName}" style="width: ${size}px; height: ${size}px; object-fit: contain; vertical-align: middle; border-radius: 4px; background: #fff;">`;
            }
            const config = PLATFORM_CONFIG[platformName];
            return config ? config.icon : "📺";
        }

        // 🖼️ Redimensiona y comprime una imagen de logo antes de guardarla, para que
        // cada logo pese solo unos KB (Firestore tiene un límite de 1MB por documento y
        // acá se guardan TODOS los datos de la app juntos). Devuelve un dataURL en PNG,
        // achicado a como máximo 160x160px manteniendo la proporción.
        function resizeLogoImage(file) {
            return new Promise((resolve, reject) => {
                if (!file.type.startsWith("image/")) {
                    reject(new Error("El archivo elegido no es una imagen"));
                    return;
                }
                const reader = new FileReader();
                reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
                reader.onload = (e) => {
                    const img = new Image();
                    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
                    img.onload = () => {
                        const maxSize = 160;
                        let { width, height } = img;
                        if (width > height && width > maxSize) {
                            height = Math.round((height * maxSize) / width);
                            width = maxSize;
                        } else if (height > maxSize) {
                            width = Math.round((width * maxSize) / height);
                            height = maxSize;
                        }
                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d");
                        ctx.clearRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL("image/png"));
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        // Cuando eligen un archivo en "🧩 Nueva Plataforma": lo redimensiona, lo muestra
        // en la vista previa y lo deja listo (en una variable) para guardarlo recién
        // cuando se confirme el formulario.
        function handleNewPlatformLogoChange(input) {
            const file = input.files && input.files[0];
            if (!file) return;

            resizeLogoImage(file)
                .then((dataUrl) => {
                    pendingNewPlatformLogo = dataUrl;
                    const preview = document.getElementById("newPlatformLogoPreview");
                    const wrap = document.getElementById("newPlatformLogoPreviewWrap");
                    if (preview) preview.src = dataUrl;
                    if (wrap) wrap.style.display = "block";
                })
                .catch((err) => {
                    alert("⚠️ " + err.message);
                    input.value = "";
                });
        }

        // Igual que la anterior, pero para el formulario de "✏️ Editar Plataforma"
        function handleEditPlatformLogoChange(input) {
            const file = input.files && input.files[0];
            if (!file) return;

            resizeLogoImage(file)
                .then((dataUrl) => {
                    pendingEditPlatformLogo = dataUrl;
                    const preview = document.getElementById("editPlatformCatalogLogoPreview");
                    const wrap = document.getElementById("editPlatformCatalogLogoPreviewWrap");
                    if (preview) preview.src = dataUrl;
                    if (wrap) wrap.style.display = "flex";
                })
                .catch((err) => {
                    alert("⚠️ " + err.message);
                    input.value = "";
                });
        }

        // Botón "🗑️ Quitar logo" dentro de "Editar Plataforma": vuelve a usar el emoji
        function removeEditPlatformLogo() {
            pendingEditPlatformLogo = "";
            const wrap = document.getElementById("editPlatformCatalogLogoPreviewWrap");
            const fileInput = document.getElementById("editPlatformCatalogLogoFile");
            if (wrap) wrap.style.display = "none";
            if (fileInput) fileInput.value = "";
        }

        // 🔥 GUARDAR en Firebase
        function saveData() {
            return db.collection("appData").doc("main").set({
                accounts: appData.accounts,
                clients: appData.clients,
                payments: appData.payments,
                customPlatforms: appData.customPlatforms,
                platformLogos: appData.platformLogos || {},
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

        // 🧩 Detecta plataformas que aparecen en cuentas/clientes guardados pero que no
        // están ni en las plataformas de fábrica ni en el catálogo personalizado (por
        // ejemplo, datos de una versión anterior). Las da de alta automáticamente en
        // el catálogo para que no queden "huérfanas" sin ícono ni configuración.
        function migrateUnknownPlatforms() {
            const known = new Set([...BUILTIN_PLATFORM_NAMES, ...(appData.customPlatforms || []).map((cp) => cp.name)]);
            const found = new Map();

            (appData.accounts || []).forEach((acc) => {
                if (!known.has(acc.platform) && !found.has(acc.platform)) {
                    found.set(acc.platform, acc.maxProfiles || 5);
                }
            });

            if (found.size === 0) return false;

            found.forEach((profiles, name) => {
                appData.customPlatforms.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name,
                    profiles,
                    icon: "📺",
                    colorClass: "custom-platform",
                    colorHex: "#3b82f6",
                });
            });
            return true;
        }

        // 🔥 CARGAR desde Firebase
        function loadData() {
            return db.collection("appData").doc("main").get().then((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData = {
                        accounts: data.accounts || [],
                        clients: data.clients || [],
                        payments: data.payments || [],
                        customPlatforms: data.customPlatforms || [],
                        platformLogos: data.platformLogos || {}
                    };
                    console.log("✅ Cargado desde Firebase");
                    const migrated = migrateUnknownPlatforms();
                    rebuildPlatformConfig();
                    if (migrated) saveData();
                } else {
                    // Intentar cargar desde localStorage como migración
                    const saved = localStorage.getItem("freshRiffData");
                    if (saved) {
                        appData = JSON.parse(saved);
                        if (!appData.customPlatforms) appData.customPlatforms = [];
                        if (!appData.platformLogos) appData.platformLogos = {};
                        migrateUnknownPlatforms();
                        rebuildPlatformConfig();
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
                    if (!appData.customPlatforms) appData.customPlatforms = [];
                    if (!appData.platformLogos) appData.platformLogos = {};
                    rebuildPlatformConfig();
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
                        payments: data.payments || [],
                        customPlatforms: data.customPlatforms || [],
                        platformLogos: data.platformLogos || {}
                    };
                    rebuildPlatformConfig();
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

        // Un perfil está en venta solo si no está ocupado por un cliente NI bloqueado a mano
        function isProfileSellable(p) {
            return !p.occupied && !p.blocked;
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
            if (sectionId === "platformsCatalog") renderCustomPlatformsCatalog();
        }

        function openModal(modalId) {
            document.getElementById(modalId).classList.add("active");
            if (modalId === "accountModal") {
                populatePlatformSelect();
                resetAccountForm();
            }
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
            const deviceLabel = document.getElementById("deviceTypeLabel");

            if (platformHasSubtypes(platform)) {
                if (deviceContainer) deviceContainer.style.display = "block";
                if (deviceLabel) deviceLabel.textContent = `Tipo/Categoría de ${platform} *`;
                if (deviceSelect) {
                    deviceSelect.required = true;
                    const options = Object.entries(PLATFORM_CONFIG[platform].subtypes)
                        .map(([name, info]) => `<option value="${name}">${name} (${info.profiles} perfiles)</option>`)
                        .join("");
                    deviceSelect.innerHTML = `<option value="">Selecciona el tipo...</option>${options}`;
                }
            } else {
                if (deviceContainer) deviceContainer.style.display = "none";
                if (deviceSelect) {
                    deviceSelect.required = false;
                    deviceSelect.value = "";
                }
            }

            // Si es una plataforma del catálogo con precio/costo por defecto cargados,
            // precargamos esos valores para no tener que tipearlos de nuevo cada vez.
            const cp = (appData.customPlatforms || []).find((p) => p.name === platform);
            if (cp) {
                const priceInput = document.getElementById("accPrice");
                const costInput = document.getElementById("accCost");
                if (priceInput && cp.defaultPrice != null) priceInput.value = cp.defaultPrice;
                if (costInput && cp.defaultCost != null) costInput.value = cp.defaultCost;
            }
        }

        function validateDeviceType() {
            const deviceType = document.getElementById("accDeviceType").value;
            const container = document.getElementById("deviceTypeContainer");
            if (deviceType && container) {
                container.style.borderColor = "#e50914";
            }
        }

        // ========== CATÁLOGO DE PLATAFORMAS ==========

        // 🧩 Llena el <select id="accPlatform"> con: primero las plataformas de
        // fábrica (en el orden de siempre) y después, en una sección separada, las
        // plataformas personalizadas que Facu fue agregando. Se llama cada vez que el
        // catálogo cambia y también al abrir el modal de Nueva Cuenta, para que nunca
        // quede desactualizado.
        function populatePlatformSelect() {
            const select = document.getElementById("accPlatform");
            if (!select) return;
            const previousValue = select.value;

            select.innerHTML = '<option value="">Selecciona una plataforma...</option>';

            BUILTIN_PLATFORM_NAMES.forEach((name) => {
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });

            const customPlatforms = appData.customPlatforms || [];
            if (customPlatforms.length > 0) {
                const group = document.createElement("optgroup");
                group.label = "🧩 Plataformas Agregadas";
                customPlatforms.forEach((cp) => {
                    const opt = document.createElement("option");
                    opt.value = cp.name;
                    opt.textContent = `${cp.icon || "📺"} ${cp.name} (${cp.profiles} perfiles)`;
                    group.appendChild(opt);
                });
                select.appendChild(group);
            }

            // Si había algo seleccionado y todavía existe, lo mantenemos
            if (previousValue && Array.from(select.options).some((o) => o.value === previousValue)) {
                select.value = previousValue;
            }
        }

        // 🧩 Dibuja las tarjetas del catálogo en la pestaña "Plataformas". Solo
        // muestra las personalizadas (las de fábrica no se editan ni se borran desde
        // acá, para no romper la lógica de subtipos de Netflix ni los precios ya
        // cargados de las demás).
        function renderCustomPlatformsCatalog() {
            const grid = document.getElementById("customPlatformsGrid");
            if (!grid) return;

            const customPlatforms = appData.customPlatforms || [];

            if (customPlatforms.length === 0) {
                grid.innerHTML = `
                <p style="color: var(--text-secondary); text-align: center; padding: 30px; grid-column: 1 / -1;">
                    Todavía no agregaste ninguna plataforma personalizada.<br>
                    Usá el botón "+ Nueva Plataforma" para sumar la primera (por ejemplo, MioTV).
                </p>`;
                return;
            }

            grid.innerHTML = "";
            customPlatforms.forEach((cp) => {
                const accountsOfThisPlatform = appData.accounts.filter((a) => a.platform === cp.name);
                const totalProfiles = accountsOfThisPlatform.reduce((sum, a) => sum + a.maxProfiles, 0);
                const occupiedProfiles = accountsOfThisPlatform.reduce(
                    (sum, a) => sum + a.profiles.filter((p) => p.occupied).length, 0
                );

                const config = { icon: cp.icon || "📺", isCustom: true, customColorHex: cp.colorHex || "#3b82f6" };

                const card = document.createElement("div");
                card.className = "platform-card";
                card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-name">
                        ${platformIconHtml(config, cp.name)}
                        <div>
                            <div>${cp.name}</div>
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 500;">${cp.profiles} perfiles por cuenta</div>
                        </div>
                    </div>
                    <div class="action-btns">
                        <button class="btn btn-secondary" onclick="editCustomPlatform(${cp.id})" style="padding: 6px 12px; font-size: 11px;">✏️</button>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 13px; color: var(--text-secondary);">
                    ${accountsOfThisPlatform.length > 0
                        ? `${accountsOfThisPlatform.length} cuenta(s) registrada(s) • ${occupiedProfiles}/${totalProfiles} perfiles ocupados`
                        : "Todavía no tiene ninguna cuenta registrada"}
                </div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(59, 130, 246, 0.2);">
                    <button class="btn btn-primary" style="width: 100%; font-size: 12px;" onclick="goToAccountsWithPlatform('${cp.name}')">
                        + Registrar cuenta de ${cp.name}
                    </button>
                </div>
            `;
                grid.appendChild(card);
            });
        }

        // Acceso rápido: desde el catálogo, ir directo a "Nueva Cuenta" con la
        // plataforma ya seleccionada.
        function goToAccountsWithPlatform(platformName) {
            showSection("accounts");
            document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
            const accountsTab = Array.from(document.querySelectorAll(".nav-tab")).find((t) => t.textContent.includes("Cuentas"));
            if (accountsTab) accountsTab.classList.add("active");
            openModal("accountModal");
            const select = document.getElementById("accPlatform");
            if (select) {
                select.value = platformName;
                handlePlatformChange();
            }
        }

        document.getElementById("newPlatformForm").addEventListener("submit", function (e) {
            e.preventDefault();

            const name = document.getElementById("newPlatformName").value.trim();
            const profiles = parseInt(document.getElementById("newPlatformProfiles").value);
            const icon = document.getElementById("newPlatformIcon").value.trim();
            const colorHex = document.getElementById("newPlatformColor").value;
            const priceStr = document.getElementById("newPlatformPrice").value;
            const costStr = document.getElementById("newPlatformCost").value;

            if (!name) {
                alert("⚠️ Ingresá un nombre para la plataforma");
                return;
            }

            const allNames = [...BUILTIN_PLATFORM_NAMES, ...(appData.customPlatforms || []).map((cp) => cp.name)];
            if (allNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
                alert(`⚠️ Ya existe una plataforma llamada "${name}"`);
                return;
            }

            if (!profiles || profiles < 1) {
                alert("⚠️ La cantidad de perfiles debe ser mayor a 0");
                return;
            }

            if (!appData.customPlatforms) appData.customPlatforms = [];
            appData.customPlatforms.push({
                id: Date.now(),
                name,
                profiles,
                icon: icon || "📺",
                colorClass: "custom-platform",
                colorHex: colorHex || "#3b82f6",
                defaultPrice: priceStr !== "" ? parseFloat(priceStr) : null,
                defaultCost: costStr !== "" ? parseFloat(costStr) : null,
            });

            if (pendingNewPlatformLogo) {
                if (!appData.platformLogos) appData.platformLogos = {};
                appData.platformLogos[name] = pendingNewPlatformLogo;
            }

            rebuildPlatformConfig();

            saveData().then(() => {
                closeModal("newPlatformModal");
                document.getElementById("newPlatformForm").reset();
                document.getElementById("newPlatformColor").value = "#3b82f6";
                pendingNewPlatformLogo = null;
                const wrap = document.getElementById("newPlatformLogoPreviewWrap");
                if (wrap) wrap.style.display = "none";
                renderCustomPlatformsCatalog();
                populatePlatformSelect();
                showNotification(`✅ Plataforma "${name}" agregada. Ya podés registrar cuentas de ${name} en 📺 Cuentas.`, "success");
            });
        });

        function editCustomPlatform(id) {
            const cp = (appData.customPlatforms || []).find((p) => p.id === id);
            if (!cp) return;

            document.getElementById("editPlatformCatalogId").value = cp.id;
            document.getElementById("editPlatformCatalogName").value = cp.name;
            document.getElementById("editPlatformCatalogProfiles").value = cp.profiles;
            document.getElementById("editPlatformCatalogIcon").value = cp.icon || "";
            document.getElementById("editPlatformCatalogColor").value = cp.colorHex || "#3b82f6";
            document.getElementById("editPlatformCatalogPrice").value = cp.defaultPrice != null ? cp.defaultPrice : "";
            document.getElementById("editPlatformCatalogCost").value = cp.defaultCost != null ? cp.defaultCost : "";

            pendingEditPlatformLogo = null;
            const fileInput = document.getElementById("editPlatformCatalogLogoFile");
            if (fileInput) fileInput.value = "";
            const preview = document.getElementById("editPlatformCatalogLogoPreview");
            const wrap = document.getElementById("editPlatformCatalogLogoPreviewWrap");
            const existingLogo = getPlatformLogo(cp.name);
            if (existingLogo && preview && wrap) {
                preview.src = existingLogo;
                wrap.style.display = "flex";
            } else if (wrap) {
                wrap.style.display = "none";
            }

            openModal("editPlatformCatalogModal");
        }

        document.getElementById("editPlatformCatalogForm").addEventListener("submit", function (e) {
            e.preventDefault();

            const id = parseInt(document.getElementById("editPlatformCatalogId").value);
            const cp = (appData.customPlatforms || []).find((p) => p.id === id);
            if (!cp) return;

            const newName = document.getElementById("editPlatformCatalogName").value.trim();
            const newProfiles = parseInt(document.getElementById("editPlatformCatalogProfiles").value);
            const priceStr = document.getElementById("editPlatformCatalogPrice").value;
            const costStr = document.getElementById("editPlatformCatalogCost").value;

            if (!newName) {
                alert("⚠️ Ingresá un nombre para la plataforma");
                return;
            }

            const allOtherNames = [
                ...BUILTIN_PLATFORM_NAMES,
                ...(appData.customPlatforms || []).filter((p) => p.id !== id).map((p) => p.name),
            ];
            if (allOtherNames.some((n) => n.toLowerCase() === newName.toLowerCase())) {
                alert(`⚠️ Ya existe otra plataforma llamada "${newName}"`);
                return;
            }

            const oldName = cp.name;
            const nameChanged = oldName !== newName;

            cp.name = newName;
            cp.profiles = newProfiles;
            cp.icon = document.getElementById("editPlatformCatalogIcon").value.trim() || "📺";
            cp.colorHex = document.getElementById("editPlatformCatalogColor").value;
            cp.defaultPrice = priceStr !== "" ? parseFloat(priceStr) : null;
            cp.defaultCost = costStr !== "" ? parseFloat(costStr) : null;

            // Si se cambió el nombre, hay que propagarlo a las cuentas y asignaciones
            // de clientes existentes para que no queden "huérfanas" apuntando a un
            // nombre de plataforma que ya no existe.
            if (nameChanged) {
                appData.accounts.forEach((acc) => {
                    if (acc.platform === oldName) acc.platform = newName;
                });
                appData.clients.forEach((client) => {
                    client.assignments.forEach((ass) => {
                        if (ass.platform === oldName) ass.platform = newName;
                    });
                });
            }

            // Logo: si subieron uno nuevo, se guarda con el nombre actual; si tocaron
            // "Quitar logo", se borra; si no tocaron nada pero cambió el nombre, se
            // mueve el logo existente a la nueva clave para no perderlo.
            if (!appData.platformLogos) appData.platformLogos = {};
            if (pendingEditPlatformLogo === "") {
                delete appData.platformLogos[oldName];
            } else if (pendingEditPlatformLogo) {
                if (nameChanged) delete appData.platformLogos[oldName];
                appData.platformLogos[newName] = pendingEditPlatformLogo;
            } else if (nameChanged && appData.platformLogos[oldName]) {
                appData.platformLogos[newName] = appData.platformLogos[oldName];
                delete appData.platformLogos[oldName];
            }

            rebuildPlatformConfig();

            saveData().then(() => {
                closeModal("editPlatformCatalogModal");
                pendingEditPlatformLogo = null;
                renderCustomPlatformsCatalog();
                populatePlatformSelect();
                updateAllViews();
                showNotification(`✅ Plataforma actualizada correctamente`, "success");
            });
        });

        function deleteCustomPlatform() {
            const id = parseInt(document.getElementById("editPlatformCatalogId").value);
            const cp = (appData.customPlatforms || []).find((p) => p.id === id);
            if (!cp) return;

            const hasAccounts = appData.accounts.some((a) => a.platform === cp.name);
            if (hasAccounts) {
                alert("⚠️ No podés eliminar esta plataforma porque ya tiene cuentas registradas. Primero eliminá esas cuentas desde 📺 Cuentas.");
                return;
            }

            if (!confirm(`¿Eliminar la plataforma "${cp.name}" del catálogo?`)) return;

            appData.customPlatforms = appData.customPlatforms.filter((p) => p.id !== id);
            if (appData.platformLogos && appData.platformLogos[cp.name]) {
                delete appData.platformLogos[cp.name];
            }
            rebuildPlatformConfig();

            saveData().then(() => {
                closeModal("editPlatformCatalogModal");
                renderCustomPlatformsCatalog();
                populatePlatformSelect();
                showNotification(`✅ Plataforma "${cp.name}" eliminada`, "success");
            });
        }

        // ========== CUENTAS ==========
        document.getElementById("accountForm").addEventListener("submit", function (e) {
            e.preventDefault();
            const platform = document.getElementById("accPlatform").value;
            let deviceType = "Todos";
            let maxProfiles;

            if (platformHasSubtypes(platform)) {
                deviceType = document.getElementById("accDeviceType").value;
                if (!deviceType) {
                    alert(`⚠️ Debes seleccionar el tipo/categoría para ${platform}`);
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
                    blocked: false,
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
            if (platformHasSubtypes(account.platform)) {
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
                                if (platformHasSubtypes(account.platform) && ass.deviceType !== account.deviceType) return;
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

            // ---------- Editor rápido de precio/costo: uno por cuenta, sin agrupar ----------
            appData.accounts.forEach((account) => {
                const config = PLATFORM_CONFIG[account.platform];
                const priceEditor = document.createElement("div");
                priceEditor.style.cssText = "background: var(--bg-secondary); padding: 15px; border-radius: 10px; border: 1px solid rgba(59, 130, 246, 0.2);";
                priceEditor.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">${config.icon}</span>
                        <div>
                            <div style="font-weight: 700; font-size: 14px;">${account.platform}</div>
                            ${platformHasSubtypes(account.platform) ? `<span class="platform-subtype">${account.deviceType}</span>` : ""}
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
            });

            // ---------- Tarjetas principales ----------
            // Las plataformas con subtipos (Netflix, Disney+) se agrupan en UNA sola
            // tarjeta por email, con una sección por subtipo (en el orden definido en
            // PLATFORM_CONFIG: ej. Smart siempre arriba, Móvil/PC o Común abajo). El
            // resto de las plataformas se sigue mostrando como antes, una tarjeta por cuenta.
            const groupedIds = new Set();
            const groups = [];

            appData.accounts.forEach((account) => {
                if (!platformHasSubtypes(account.platform)) return;
                let group = groups.find((g) => g.platform === account.platform && g.email === account.email);
                if (!group) {
                    group = { platform: account.platform, email: account.email, accounts: [] };
                    groups.push(group);
                }
                group.accounts.push(account);
                groupedIds.add(account.id);
            });

            groups.forEach((group) => grid.appendChild(buildGroupedAccountCard(group)));

            appData.accounts.forEach((account) => {
                if (groupedIds.has(account.id)) return;
                grid.appendChild(buildSingleAccountCard(account));
            });
        }

        // Grilla de perfiles (numeritos clickeables) de UNA cuenta puntual.
        function buildProfileSlotsHtml(account) {
            let html = '<div class="profile-slots">';
            account.profiles.forEach((profile, idx) => {
                let className, title, clickHandler;
                if (profile.occupied) {
                    className = "slot-occupied";
                    title = `Ocupado por PIN: ${profile.clientId}`;
                    clickHandler = "";
                } else if (profile.blocked) {
                    className = "slot-blocked";
                    title = "🔒 No se vende (click para habilitar)";
                    clickHandler = `onclick="toggleProfileBlock(${account.id}, ${profile.number})"`;
                } else {
                    className = "slot-available";
                    title = "Disponible (click para no vender este perfil)";
                    clickHandler = `onclick="toggleProfileBlock(${account.id}, ${profile.number})"`;
                }
                html += `<div class="profile-slot ${className}" title="${title}" ${clickHandler}>${idx + 1}</div>`;
            });
            html += "</div>";
            return html;
        }

        // Tarjeta de una cuenta que vende una plataforma SIN subtipos (la mayoría)
        function buildSingleAccountCard(account) {
            const sellableProfiles = account.profiles.filter(isProfileSellable).length;
            const blockedProfiles = account.profiles.filter((p) => !p.occupied && p.blocked).length;
            const config = PLATFORM_CONFIG[account.platform];

            const card = document.createElement("div");
            card.className = "platform-card";
            card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-name">
                        ${platformIconHtml(config, account.platform)}
                        <div>
                            ${account.platform}
                            ${platformHasSubtypes(account.platform) ? `<div style="font-size: 11px; color: var(--text-secondary); font-weight: 500;">${account.deviceType}</div>` : ""}
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
                ${buildProfileSlotsHtml(account)}
                <small style="color: var(--text-secondary); font-size: 11px; display: block; margin-top: 4px;">🔒 Click en un perfil libre para no venderlo este mes</small>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(59, 130, 246, 0.2); display: flex; justify-content: space-between; align-items: center; font-size: 12px; gap: 8px;">
                    <div>
                        <span style="color: var(--text-secondary);">Próximo pago:</span><br>
                        <span class="date-display">${formatDate(account.nextPayment)}</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${blockedProfiles > 0 ? `<span class="badge badge-warning">🔒 ${blockedProfiles} sin vender</span>` : ""}
                        <span class="badge ${sellableProfiles > 0 ? "badge-success" : "badge-danger"}">${sellableProfiles} libres</span>
                    </div>
                </div>
            `;
            return card;
        }

        // Tarjeta ÚNICA para un grupo de cuentas que comparten plataforma + email
        // (ej: el mismo login de Netflix vendido como Smart TV y como Móvil/PC).
        // Cada subtipo se muestra como una sección propia, en el orden en que
        // aparecen en PLATFORM_CONFIG[platform].subtypes.
        function buildGroupedAccountCard(group) {
            const config = PLATFORM_CONFIG[group.platform];
            const subtypeOrder = Object.keys(config.subtypes || {});
            const orderedAccounts = [...group.accounts].sort(
                (a, b) => subtypeOrder.indexOf(a.deviceType) - subtypeOrder.indexOf(b.deviceType),
            );

            const card = document.createElement("div");
            card.className = "platform-card platform-card-grouped";

            let sectionsHtml = "";
            orderedAccounts.forEach((account, idx) => {
                const sellableProfiles = account.profiles.filter(isProfileSellable).length;
                const blockedProfiles = account.profiles.filter((p) => !p.occupied && p.blocked).length;
                sectionsHtml += `
                <div class="account-subsection"${idx > 0 ? ' style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed rgba(59, 130, 246, 0.25);"' : ""}>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span class="platform-subtype">${account.deviceType}</span>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="highlight-primary" style="font-size: 12px;">💰 $${account.pricePerProfile.toFixed(2)}/perfil</span>
                            <button class="btn btn-secondary" onclick="editAccount(${account.id})" style="padding: 4px 10px; font-size: 11px;">✏️</button>
                        </div>
                    </div>
                    ${buildProfileSlotsHtml(account)}
                    <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-secondary);">
                        <span>Próximo pago: <span class="date-display">${formatDate(account.nextPayment)}</span></span>
                        <div style="display: flex; gap: 6px;">
                            ${blockedProfiles > 0 ? `<span class="badge badge-warning">🔒 ${blockedProfiles} sin vender</span>` : ""}
                            <span class="badge ${sellableProfiles > 0 ? "badge-success" : "badge-danger"}">${sellableProfiles} libres</span>
                        </div>
                    </div>
                </div>
            `;
            });

            card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-name">
                        ${platformIconHtml(config, group.platform)}
                        <div>
                            ${group.platform}
                            <div style="font-size: 11px; color: var(--text-secondary); font-weight: 500;">📧 ${group.email}</div>
                        </div>
                    </div>
                </div>
                ${sectionsHtml}
                <small style="color: var(--text-secondary); font-size: 11px; display: block; margin-top: 10px;">🔒 Click en un perfil libre para no venderlo este mes</small>
            `;
            return card;
        }

        // Bloquear o habilitar un perfil puntual para que no aparezca como disponible al vender
        function toggleProfileBlock(accountId, profileNumber) {
            const account = appData.accounts.find((a) => a.id === accountId);
            if (!account) return;
            const profile = account.profiles.find((p) => p.number === profileNumber);
            if (!profile || profile.occupied) return;

            profile.blocked = !profile.blocked;

            saveData().then(() => {
                renderAccounts();
                updateAllViews();
                showNotification(
                    profile.blocked
                        ? `🔒 Perfil #${profileNumber} de ${account.platform} marcado como NO disponible`
                        : `🔓 Perfil #${profileNumber} de ${account.platform} vuelve a estar disponible`,
                    "success"
                );
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
                acc.profiles.some(isProfileSellable),
            );
            if (availableAccounts.length === 0) {
                container.innerHTML = '<p style="color: var(--accent-danger);">⚠️ No hay perfiles disponibles. Primero debes registrar cuentas.</p>';
                return;
            }

            const grouped = {};
            availableAccounts.forEach((acc) => {
                const key = platformHasSubtypes(acc.platform) ? `${acc.platform} - ${acc.deviceType}` : acc.platform;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(acc);
            });

            Object.entries(grouped).forEach(([key, accounts]) => {
                const platform = accounts[0].platform;
                const deviceType = accounts[0].deviceType;
                const config = PLATFORM_CONFIG[platform];
                const availableCount = accounts.reduce(
                    (sum, acc) => sum + acc.profiles.filter(isProfileSellable).length,
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
                            ${platformHasSubtypes(platform) ? `<span class="platform-subtype">${deviceType}</span>` : ""}
                        </div>
                    </div>
                    <span class="badge badge-success">${availableCount} disponibles</span>
                </div>
                ${accounts.length > 1 ? `
                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 12px; color: var(--text-secondary);">🎯 Cuenta específica (opcional)</label>
                    <select class="account-select" data-platform="${platform}" data-device="${deviceType}" style="width: 100%; margin-top: 4px;" onchange="onAccountSelectChange(this)">
                        <option value="">Automático (reparte entre las cuentas con cupo)</option>
                        ${accounts.map((a) => `<option value="${a.id}">${a.email} — ${a.profiles.filter(isProfileSellable).length} libres</option>`).join("")}
                    </select>
                </div>
                ` : ""}
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

        // Cuando eligen una cuenta específica (o vuelven a "Automático"), recalcular
        // el máximo de perfiles disponibles para la cantidad
        function onAccountSelectChange(selectEl) {
            const card = selectEl.closest(".card");
            const qtyInput = card.querySelector(".quantity-input");
            if (!qtyInput) return;

            let max;
            if (selectEl.value) {
                const account = appData.accounts.find((a) => a.id === parseInt(selectEl.value));
                max = account ? account.profiles.filter(isProfileSellable).length : 0;
            } else {
                const platform = selectEl.dataset.platform;
                const deviceType = selectEl.dataset.device;
                const accounts = appData.accounts.filter((a) =>
                    a.platform === platform && (!platformHasSubtypes(platform) || a.deviceType === deviceType)
                );
                max = accounts.reduce((sum, acc) => sum + acc.profiles.filter(isProfileSellable).length, 0);
            }

            qtyInput.max = max;
            if (parseInt(qtyInput.value) > max) qtyInput.value = Math.max(max, 1);
            if (typeof updatePriceSummary === "function") updatePriceSummary();
        }

        function addToCart(platform, deviceType) {
            const accountIds = Array.prototype.slice.call(arguments, 2);
            const container = event.target.closest(".card");
            const accountSelect = container.querySelector(".account-select");

            let accounts = appData.accounts.filter((a) => accountIds.includes(a.id));
            // Si eligieron una cuenta específica, restringimos la asignación a esa sola cuenta
            if (accountSelect && accountSelect.value) {
                accounts = accounts.filter((a) => a.id === parseInt(accountSelect.value));
            }

            const available = accounts.reduce(
                (sum, acc) => sum + acc.profiles.filter(isProfileSellable).length,
                0,
            );
            const durationMonths = parseInt(container.querySelector(".duration-select").value);
            const quantity = parseInt(container.querySelector(".quantity-input").value);

            if (quantity > available) {
                alert(`⚠️ Solo hay ${available} perfiles disponibles${accountSelect && accountSelect.value ? " en esa cuenta" : ""}`);
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
                accountIds: accounts.map((a) => a.id),
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
                        ${platformHasSubtypes(item.platform) ? `<span style="color: var(--text-secondary);">(${item.deviceType})</span>` : ""}
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
                        if (isProfileSellable(acc.profiles[i]) && assignedCount < item.quantity) {
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
                                startDate: startDate.toISOString(),
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
                        ${platformHasSubtypes(ass.platform) ? `<span style="color: var(--text-secondary);">(${ass.deviceType})</span>` : ""}<br>
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

        // ========== Helpers de ordenamiento y filtro de clientes ==========

        // La plataforma "principal" de un cliente para ordenar por plataforma:
        // la primera en orden alfabético entre las que tiene contratadas.
        function getClientSortPlatform(client) {
            if (!client.assignments || client.assignments.length === 0) return "";
            const names = client.assignments.map((a) => a.platform);
            return [...names].sort((a, b) => a.localeCompare(b))[0];
        }

        // Días restantes del vencimiento más próximo (puede ser negativo si ya venció)
        function getClientDaysLeft(client) {
            if (!client.assignments || client.assignments.length === 0) return Infinity;
            return Math.min(...client.assignments.map((a) => getDaysRemaining(a.expiryDate)));
        }

        // Nivel de urgencia del estado: 4 = Vencido, 3 = Crítico, 2 = Por vencer, 1 = Activo
        function getClientSeverity(client) {
            const days = getClientDaysLeft(client);
            if (days <= 0) return 4;
            if (days <= 3) return 3;
            if (days <= 10) return 2;
            return 1;
        }

        function getClientNames(client) {
            const lastName = (client.lastName || client.name.split(" ").pop() || "").toLowerCase();
            const firstName = (client.firstName || client.name.replace(" " + (client.lastName || client.name.split(" ").pop()), "") || "").toLowerCase();
            return { lastName, firstName };
        }

        // Compara dos clientes según currentSortField/currentSortDirection.
        // Si hay empate en el campo elegido, siempre desempata por Apellido.
        function compareClients(a, b) {
            const namesA = getClientNames(a);
            const namesB = getClientNames(b);
            const lastNameTiebreak = namesA.lastName.localeCompare(namesB.lastName) || namesA.firstName.localeCompare(namesB.firstName);

            let cmp;
            switch (currentSortField) {
                case "platform":
                    cmp = getClientSortPlatform(a).toLowerCase().localeCompare(getClientSortPlatform(b).toLowerCase());
                    break;
                case "expiry":
                    cmp = getClientDaysLeft(a) - getClientDaysLeft(b);
                    break;
                case "estado":
                    cmp = getClientSeverity(a) - getClientSeverity(b);
                    break;
                case "lastName":
                default:
                    cmp = namesA.lastName.localeCompare(namesB.lastName);
            }

            if (currentSortDirection === "desc") cmp = -cmp;

            return cmp !== 0 ? cmp : lastNameTiebreak;
        }

        // Botón de orden de una columna: 1er click = descendente, 2do click =
        // ascendente, 3er click = vuelve al orden base (Apellido descendente).
        function handleSortButtonClick(field) {
            if (currentSortField !== field) {
                currentSortField = field;
                currentSortDirection = "desc";
            } else if (currentSortDirection === "desc") {
                currentSortDirection = "asc";
            } else {
                currentSortField = "lastName";
                currentSortDirection = "desc";
            }

            renderClients();
            const searchInput = document.getElementById("clientSearch");
            if (searchInput && searchInput.value.trim().length >= 2) {
                searchClients();
            }
        }

        function updateSortButtonsUI() {
            ["lastName", "platform", "expiry", "estado"].forEach((field) => {
                const btn = document.getElementById("sortBtn-" + field);
                if (!btn) return;
                if (field === currentSortField) {
                    btn.textContent = currentSortDirection === "desc" ? "▼" : "▲";
                    btn.classList.add("sort-btn-active");
                } else {
                    btn.textContent = "⇅";
                    btn.classList.remove("sort-btn-active");
                }
            });
        }

        // ---------- Filtro por botones de plataforma ----------

        // Clave única por "tipo" de plataforma. Netflix se separa por tipo de
        // dispositivo (Smart TV / Móvil-PC) porque se vende como algo distinto;
        // el resto de las plataformas se identifican solo por su nombre.
        function getPlatformFilterKey(platform, deviceType) {
            return platformHasSubtypes(platform) ? `${platform}::${deviceType || ""}` : platform;
        }

        function clientMatchesPlatformFilters(client) {
            if (activePlatformFilters.size === 0) return true;
            return client.assignments.some((a) => activePlatformFilters.has(getPlatformFilterKey(a.platform, a.deviceType)));
        }

        // Genera un botón por cada tipo de plataforma que exista realmente en
        // 📺 Cuentas. Se llama cada vez que cambian las cuentas, así que si se
        // registra una cuenta de una plataforma/tipo nuevo, su botón aparece solo.
        function renderPlatformFilterButtons() {
            const container = document.getElementById("platformFilterButtons");
            if (!container) return;

            const seen = new Map();
            appData.accounts.forEach((acc) => {
                const key = getPlatformFilterKey(acc.platform, acc.deviceType);
                if (!seen.has(key)) {
                    const label = platformHasSubtypes(acc.platform) ? `${acc.platform} ${acc.deviceType}` : acc.platform;
                    seen.set(key, { key, label, platform: acc.platform });
                }
            });

            const entries = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));

            if (entries.length === 0) {
                container.innerHTML = '<small style="color: var(--text-secondary);">Todavía no hay cuentas registradas.</small>';
                return;
            }

            container.innerHTML = entries.map((entry) => {
                const config = PLATFORM_CONFIG[entry.platform] || { icon: "📺" };
                const isActive = activePlatformFilters.has(entry.key);
                const safeKey = entry.key.replace(/'/g, "\\'");
                return `<button type="button" class="platform-filter-btn${isActive ? " active" : ""}" onclick="togglePlatformFilter('${safeKey}')">${platformIconInline(entry.platform, 16)} ${entry.label}</button>`;
            }).join("");
        }

        function togglePlatformFilter(key) {
            if (activePlatformFilters.has(key)) {
                activePlatformFilters.delete(key);
            } else {
                activePlatformFilters.add(key);
            }
            renderPlatformFilterButtons();
            renderClients();
            const searchInput = document.getElementById("clientSearch");
            if (searchInput && searchInput.value.trim().length >= 2) {
                searchClients();
            }
        }

        function renderClients() {
            const tbody = document.getElementById("clientsTable");
            if (!tbody) return;
            tbody.innerHTML = "";

            let sortedClients = appData.clients
                .filter(clientMatchesPlatformFilters)
                .sort((a, b) => compareClients(a, b));

            updateSortButtonsUI();

            if (sortedClients.length === 0) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <p>${activePlatformFilters.size > 0 ? "Ningún cliente tiene las plataformas tildadas" : "No hay clientes registrados"}</p>
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
                    clientMatchesPlatformFilters(c) &&
                    (c.name.toLowerCase().includes(query) ||
                        (c.firstName && c.firstName.toLowerCase().includes(query)) ||
                        (c.lastName && c.lastName.toLowerCase().includes(query)) ||
                        c.pin.includes(query) ||
                        c.assignments.some((a) => a.platform.toLowerCase().includes(query))),
            );

            matches.sort((a, b) => compareClients(a, b));

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
                                        ${platformHasSubtypes(ass.platform) ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${ass.deviceType}</div>` : ""}
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
                        <button class="btn btn-primary" onclick="viewClientDetails('${client.pin}')" style="flex: 1; padding: 10px; font-size: 13px;">
                            👁️ Ver Detalles
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

            // 🔧 CORRECCIÓN: la fecha de inicio para PLATAFORMAS NUEVAS es un campo
            // independiente de la fecha de pago original del cliente, y se inicializa
            // siempre con la fecha de hoy (el día en que efectivamente se está
            // agregando la nueva contratación), no con client.paymentDate.
            const newPlatformsStartInput = document.getElementById("editNewPlatformsStartDate");
            if (newPlatformsStartInput) newPlatformsStartInput.valueAsDate = new Date();

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
                    if (platformHasSubtypes(ass.platform)) {
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
                        ${platformHasSubtypes(ass.platform) ? `<span style="color: var(--text-secondary); font-size: 12px;">(${ass.deviceType})</span>` : ""}
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Perfil #${ass.profileNumber} • ${ass.durationMonths || 1} mes${(ass.durationMonths || 1) > 1 ? "es" : ""}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: var(--text-secondary);">Vence en:</div>
                        <div style="color: ${daysLeft <= 3 ? "var(--accent-danger)" : daysLeft <= 10 ? "var(--warning)" : "var(--success)"}; font-weight: 700;">
                            ${isExpired ? "VENCIDO" : daysLeft + " días"}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); flex-wrap: wrap;">
                    <button onclick="renewEditAssignment(${idx})" class="btn btn-warning" style="flex: 1 1 45%; padding: 6px; font-size: 11px;">
                        🔄 Renovar
                    </button>
                    <button onclick="openChangeExpiryDate(${idx})" class="btn btn-primary" style="flex: 1 1 45%; padding: 6px; font-size: 11px;">
                        📅 Fecha
                    </button>
                    <button onclick="moveClientAccount(${idx})" class="btn btn-primary" style="flex: 1 1 45%; padding: 6px; font-size: 11px;">
                        🔀 Mover
                    </button>
                    <button onclick="removeEditAssignment(${idx})" class="btn btn-danger" style="flex: 1 1 45%; padding: 6px; font-size: 11px;">
                        ❌ Quitar
                    </button>
                </div>
            `;
                container.appendChild(div);
            });
        }

        // ========== Cambiar fecha de vencimiento manualmente (corrección de errores) ==========
        function openChangeExpiryDate(assignmentIndex) {
            const client = appData.clients.find((c) => c.pin === editingClientPin);
            if (!client) return;
            const ass = client.assignments[assignmentIndex];
            if (!ass) return;

            changeExpiryAssignmentIndex = assignmentIndex;
            const config = PLATFORM_CONFIG[ass.platform];
            document.getElementById("changeExpiryPlatformLabel").textContent =
                `${config.icon} ${ass.platform}${platformHasSubtypes(ass.platform) ? " (" + ass.deviceType + ")" : ""} — Perfil #${ass.profileNumber}`;

            const dateInput = document.getElementById("changeExpiryDateInput");
            dateInput.value = new Date(ass.expiryDate).toISOString().split("T")[0];

            document.getElementById("changeExpiryApplyAll").checked = false;

            openModal("changeExpiryModal");
        }

        function confirmChangeExpiryDate() {
            const client = appData.clients.find((c) => c.pin === editingClientPin);
            if (!client || changeExpiryAssignmentIndex === null) return;

            const dateValue = document.getElementById("changeExpiryDateInput").value;
            if (!dateValue) {
                alert("⚠️ Elegí una fecha.");
                return;
            }
            const applyAll = document.getElementById("changeExpiryApplyAll").checked;

            const newDate = new Date(dateValue + "T00:00:00");
            const newIso = newDate.toISOString();

            const targets = applyAll ? client.assignments : [client.assignments[changeExpiryAssignmentIndex]];

            targets.forEach((ass) => {
                if (!ass) return;
                ass.expiryDate = newIso;

                const account = appData.accounts.find((a) => {
                    if (platformHasSubtypes(ass.platform)) {
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
                closeModal("changeExpiryModal");
                changeExpiryAssignmentIndex = null;
                renderEditCurrentAssignments(client);
                updateAllViews();
                showNotification(`✅ Fecha actualizada al ${formatDate(newDate)}`, "success");
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
                if (platformHasSubtypes(ass.platform) && a.deviceType !== ass.deviceType) return false;
                return a.profiles.some(isProfileSellable);
            });

            if (candidates.length === 0) {
                alert("⚠️ No hay otras cuentas de " + ass.platform + " con cupos disponibles.");
                return;
            }

            // Construir lista de opciones
            let msg = "Selecciona la cuenta destino para mover a " + client.name + ":\n\n";
            candidates.forEach((acc, i) => {
                const free = acc.profiles.filter(isProfileSellable).length;
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
            const freeProfile = targetAccount.profiles.find(isProfileSellable);
            if (!freeProfile) {
                alert("⚠️ No se encontró un perfil libre en esa cuenta.");
                return;
            }

            // Liberar perfil en cuenta origen
            const sourceAccount = appData.accounts.find((a) => {
                if (platformHasSubtypes(ass.platform)) {
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
                if (platformHasSubtypes(assignment.platform)) {
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

            // 🔧 La fecha de vencimiento NUNCA se mueve por el día en que el cliente
            // efectivamente paga. Si debía pagar el 05/07 y paga el 10/07, el nuevo
            // vencimiento se calcula siempre desde el 05/07 (la fecha que ya tenía
            // asignada), sin importar cuántos días de atraso tenga. Si una fecha quedó
            // mal cargada por error, usá el botón "📅 Fecha" para corregirla a mano.
            const currentExpiry = new Date(assignment.expiryDate);
            currentExpiry.setHours(0, 0, 0, 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const baseDate = new Date(currentExpiry);

            // Calcular nuevo vencimiento sumando los meses a la fecha base
            const newEnd = calculateExpiryDate(baseDate, monthsNum);

            assignment.expiryDate = newEnd.toISOString();
            assignment.durationMonths = (assignment.durationMonths || 1) + monthsNum;
            assignment.durationDays = getExactDaysBetween(baseDate, newEnd);
            assignment.startDate = baseDate.toISOString();

            // Buscar y actualizar el perfil en la cuenta
            const account = appData.accounts.find((a) => {
                if (platformHasSubtypes(assignment.platform)) {
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
                acc.profiles.some(isProfileSellable),
            );
            if (availableAccounts.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No hay perfiles disponibles para agregar.</p>';
                return;
            }

            const grouped = {};
            availableAccounts.forEach((acc) => {
                const key = platformHasSubtypes(acc.platform) ? `${acc.platform} - ${acc.deviceType}` : acc.platform;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(acc);
            });

            Object.entries(grouped).forEach(([key, accounts]) => {
                const platform = accounts[0].platform;
                const deviceType = accounts[0].deviceType;
                const config = PLATFORM_CONFIG[platform];
                const availableCount = accounts.reduce(
                    (sum, acc) => sum + acc.profiles.filter(isProfileSellable).length,
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
                            ${platformHasSubtypes(platform) ? `<span class="platform-subtype">${deviceType}</span>` : ""}
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
                (sum, acc) => sum + acc.profiles.filter(isProfileSellable).length,
                0,
            );
            const container = event.target.closest(".card");
            const durationMonths = parseInt(container.querySelector(".edit-duration-select").value);
            const quantity = parseInt(container.querySelector(".edit-quantity-input").value);

            if (quantity > available) {
                alert(`⚠️ Solo hay ${available} perfiles disponibles`);
                return;
            }

            // 🔧 CORRECCIÓN: la fecha de inicio de una plataforma NUEVA agregada a un
            // cliente existente debe tomarse del campo independiente
            // "editNewPlatformsStartDate" (la fecha real en que se está dando de alta
            // esta nueva contratación), y NO de "editClientPaymentDate" (que refleja la
            // fecha de pago original del cliente y puede ser muy anterior a hoy).
            // Antes este código usaba "editClientPaymentDate" por error, lo que hacía
            // que toda plataforma nueva heredara el vencimiento de la primera, sin
            // importar qué día se la estuviera agregando.
            const startDateInput = document.getElementById("editNewPlatformsStartDate");
            const startDate = startDateInput && startDateInput.value ? new Date(startDateInput.value) : new Date();
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
                        ${platformHasSubtypes(item.platform) ? `<span style="color: var(--text-secondary);">(${item.deviceType})</span>` : ""}
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
                // 🔧 CORRECCIÓN: usamos la fecha del campo "Fecha de Inicio de las Nuevas
                // Plataformas" (la fecha real de esta nueva contratación) tanto para
                // calcular los vencimientos como para registrar cuándo se cobró este
                // pago adicional. Ya NO se sobreescribe client.paymentDate (la fecha de
                // pago ORIGINAL del cliente) con la fecha de hoy: ese campo representa
                // el primer pago del cliente y debe permanecer intacto.
                const newPlatformsStartInput = document.getElementById("editNewPlatformsStartDate");
                const startDateValue = newPlatformsStartInput && newPlatformsStartInput.value
                    ? newPlatformsStartInput.value
                    : new Date().toISOString().split("T")[0];
                const startDate = new Date(startDateValue);

                for (const item of editCurrentCart) {
                    const accounts = appData.accounts.filter((a) => item.accountIds.includes(a.id));
                    const endDate = new Date(item.endDate);
                    let assignedCount = 0;

                    for (const acc of accounts) {
                        if (assignedCount >= item.quantity) break;
                        for (let i = acc.profiles.length - 1; i >= 0; i--) {
                            if (isProfileSellable(acc.profiles[i]) && assignedCount < item.quantity) {
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
                        ${platformHasSubtypes(ass.platform) ? `<span class="platform-subtype">${ass.deviceType}</span>` : ""}<br>
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
                            ${platformHasSubtypes(ass.platform) ? `<span class="platform-subtype">${ass.deviceType}</span>` : ""}
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
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="color: var(--text-secondary); font-size: 12px;">⏰ Vencimiento:</span>
                        <span style="font-size: 13px; color: var(--warning);" class="date-display">${formatDate(ass.expiryDate)}</span>
                    </div>
                    <button class="btn btn-secondary" onclick="copyAssignmentCredentials(${client.assignments.indexOf(ass)})" style="width: 100%; padding: 6px; font-size: 11px;">
                        📋 Copiar Correo y Contraseña
                    </button>
                </div>
            `;
                container.appendChild(card);
            });

            openModal("viewClientModal");
        }

        // Formatea el correo y contraseña de una plataforma, listos para pegar
        function formatAssignmentCredentials(ass) {
            const platformLabel = platformHasSubtypes(ass.platform) ? `${ass.platform} (${ass.deviceType})` : ass.platform;
            return `${platformLabel}\nCorreo: ${ass.accountEmail}\nContraseña: ${ass.password}`;
        }

        // Copia al portapapeles, con respaldo por si el navegador no soporta
        // navigator.clipboard (ej: página servida sin HTTPS)
        function copyToClipboard(text, successMessage) {
            const done = () => showNotification(successMessage || "✅ Copiado al portapapeles", "success");
            const fallback = () => {
                try {
                    const textarea = document.createElement("textarea");
                    textarea.value = text;
                    textarea.style.position = "fixed";
                    textarea.style.opacity = "0";
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                    done();
                } catch (err) {
                    alert("⚠️ No se pudo copiar automáticamente. Copiá el texto a mano.");
                }
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(fallback);
            } else {
                fallback();
            }
        }

        // Copia correo y contraseña de UNA plataforma puntual del cliente que se está viendo
        function copyAssignmentCredentials(assignmentIndex) {
            const client = appData.clients.find((c) => c.pin === currentViewPin);
            if (!client) return;
            const ass = client.assignments[assignmentIndex];
            if (!ass) return;

            copyToClipboard(formatAssignmentCredentials(ass), `✅ Copiado: ${ass.platform}`);
        }

        // Copia correo y contraseña de TODAS las plataformas del cliente que se está
        // viendo, separadas por el nombre de cada plataforma y un espacio entre ellas
        function copyAllClientCredentials() {
            const client = appData.clients.find((c) => c.pin === currentViewPin);
            if (!client || !client.assignments || client.assignments.length === 0) {
                alert("⚠️ Este cliente no tiene plataformas contratadas.");
                return;
            }

            const sortedAssignments = [...client.assignments].sort((a, b) => getDaysRemaining(b.expiryDate) - getDaysRemaining(a.expiryDate));
            const text = sortedAssignments.map(formatAssignmentCredentials).join("\n\n");

            copyToClipboard(text, `✅ Copiadas ${sortedAssignments.length} plataforma${sortedAssignments.length > 1 ? "s" : ""} de ${client.name}`);
        }

        function renewClient(pin) {
            const client = appData.clients.find((c) => c.pin === pin);
            if (!client) return;

            currentRenewPin = pin;
            selectedRenewalMonths = 1;

            document.getElementById("renewClientName").textContent = client.name;
            document.getElementById("renewClientPin").textContent = client.pin;

            document.querySelectorAll(".renewal-option").forEach((opt) => opt.classList.remove("selected"));
            document.getElementById("renewOption1").classList.add("selected");
            document.getElementById("selectedRenewalMonths").value = "1";

            renderRenewExistingList(client);
            renderRenewAddList(client);
            calculateAndShowRenewalCost();

            openModal("renewClientModal");
        }

        // Lista de plataformas que YA tiene el cliente, con checkbox para renovar
        function renderRenewExistingList(client) {
            const container = document.getElementById("renewExistingList");
            container.innerHTML = "";

            if (!client.assignments || client.assignments.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary); margin-bottom: 15px;">Este cliente no tiene plataformas activas.</p>';
                return;
            }

            client.assignments.forEach((ass, idx) => {
                const config = PLATFORM_CONFIG[ass.platform];
                const row = document.createElement("label");
                row.className = "renew-item-row checked";
                row.innerHTML = `
                    <div class="renew-item-info">
                        <strong>${config.icon} ${ass.platform}</strong>
                        ${platformHasSubtypes(ass.platform) ? `<span class="platform-subtype" style="margin-left:6px;">${ass.deviceType}</span>` : ""}
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">Perfil #${ass.profileNumber} • Vence: ${formatDate(ass.expiryDate)}</div>
                    </div>
                    <input type="checkbox" class="renew-existing-checkbox" data-idx="${idx}" checked
                        onchange="this.closest('.renew-item-row').classList.toggle('checked', this.checked); calculateAndShowRenewalCost();">
                `;
                container.appendChild(row);
            });
        }

        // Lista de plataformas disponibles para agregar como NUEVAS junto con la renovación
        function renderRenewAddList(client) {
            const container = document.getElementById("renewAddList");
            container.innerHTML = "";

            const availableAccounts = appData.accounts.filter((acc) => acc.profiles.some(isProfileSellable));
            if (availableAccounts.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary); margin-bottom: 15px;">No hay perfiles disponibles para agregar.</p>';
                return;
            }

            const grouped = {};
            availableAccounts.forEach((acc) => {
                const key = platformHasSubtypes(acc.platform) ? `${acc.platform} - ${acc.deviceType}` : acc.platform;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(acc);
            });

            Object.entries(grouped).forEach(([key, accounts]) => {
                const platform = accounts[0].platform;
                const deviceType = accounts[0].deviceType || "";
                const config = PLATFORM_CONFIG[platform];
                const availableCount = accounts.reduce(
                    (sum, acc) => sum + acc.profiles.filter(isProfileSellable).length,
                    0,
                );
                const accountIds = accounts.map((a) => a.id).join(",");

                const row = document.createElement("div");
                row.className = "renew-item-row";
                row.innerHTML = `
                    <div class="renew-item-info">
                        <strong>${config.icon} ${platform}</strong>
                        ${platformHasSubtypes(platform) ? `<span class="platform-subtype" style="margin-left:6px;">${deviceType}</span>` : ""}
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${availableCount} disponibles</div>
                    </div>
                    <input type="number" class="renew-add-qty" data-platform="${platform}" data-device="${deviceType}" data-account-ids="${accountIds}" value="1" min="1" max="${availableCount}" disabled style="width: 55px; text-align: center; margin-right: 10px;" onchange="calculateAndShowRenewalCost()">
                    <input type="checkbox" class="renew-add-checkbox" data-platform="${platform}" data-device="${deviceType}" data-account-ids="${accountIds}"
                        onchange="
                            const row = this.closest('.renew-item-row');
                            const qtyInput = row.querySelector('.renew-add-qty');
                            qtyInput.disabled = !this.checked;
                            row.classList.toggle('checked', this.checked);
                            calculateAndShowRenewalCost();
                        ">
                `;
                container.appendChild(row);
            });
        }

        function selectRenewalMonths(months) {
            selectedRenewalMonths = months;
            const input = document.getElementById("selectedRenewalMonths");
            if (input) input.value = months;

            document.querySelectorAll(".renewal-option").forEach((opt) => opt.classList.remove("selected"));
            document.getElementById("renewOption" + months).classList.add("selected");

            calculateAndShowRenewalCost();
        }

        // Junta lo tildado para renovar + lo tildado para agregar y calcula el costo combinado.
        // El descuento por cantidad de plataformas se calcula sobre el conjunto de las DOS listas,
        // así renovar 2 y agregar 1 nueva (misma duración = misma categoría) cuenta como 3 plataformas.
        function calculateAndShowRenewalCost() {
            const client = appData.clients.find((c) => c.pin === currentRenewPin);
            if (!client) return;

            const months = selectedRenewalMonths;

            const renewChecks = Array.from(document.querySelectorAll(".renew-existing-checkbox:checked"));
            const renewIdxs = renewChecks.map((el) => parseInt(el.dataset.idx));
            const renewAssignments = renewIdxs.map((idx) => client.assignments[idx]).filter(Boolean);

            let platformCounts = {};
            renewAssignments.forEach((ass) => {
                const key = platformHasSubtypes(ass.platform) ? `${ass.platform}-${ass.deviceType}` : ass.platform;
                if (!platformCounts[key]) {
                    platformCounts[key] = { platform: ass.platform, deviceType: ass.deviceType, count: 0, price: 0 };
                }
                platformCounts[key].count++;
            });

            const addChecks = Array.from(document.querySelectorAll(".renew-add-checkbox:checked"));
            addChecks.forEach((chk) => {
                const platform = chk.dataset.platform;
                const deviceType = chk.dataset.device || null;
                const qtyInput = chk.closest(".renew-item-row").querySelector(".renew-add-qty");
                const qty = parseInt(qtyInput.value) || 1;
                const key = platformHasSubtypes(platform) ? `${platform}-${deviceType}` : platform;
                if (!platformCounts[key]) {
                    platformCounts[key] = { platform, deviceType, count: 0, price: 0 };
                }
                platformCounts[key].count += qty;
            });

            Object.keys(platformCounts).forEach((key) => {
                const info = platformCounts[key];
                const account = appData.accounts.find((a) =>
                    a.platform === info.platform &&
                    (!platformHasSubtypes(info.platform) || a.deviceType === info.deviceType)
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
            let discountText = "";
            let discountDetails = [];

            if (months === 3) {
                // Solo aplica descuento por TIEMPO
                discount = subtotal * 0.10;
                discountText = " (10% OFF por 3 meses)";
                discountDetails.push({ label: "Descuento por Tiempo (3 meses)", amount: discount, color: "var(--warning)" });
            } else if (months === 1) {
                // Solo aplica descuento por CANTIDAD (misma categoría: 1 mes)
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

            updateRenewalSummaryWithPrice(subtotal, discount, total, months, discountText, discountDetails, renewAssignments, distinctPlatforms, totalProfiles);
        }

        function updateRenewalSummaryWithPrice(subtotal, discount, total, months, discountText, discountDetails, renewAssignments, distinctPlatforms, totalProfiles) {
            const client = appData.clients.find((c) => c.pin === currentRenewPin);
            if (!client) return;

            // 🔧 La fecha base es SIEMPRE la que ya tenían las plataformas tildadas para
            // renovar (nunca se mueve por el día en que el cliente paga). Si no se tildó
            // ninguna para renovar (solo se está agregando algo nuevo), se toma como
            // referencia el vencimiento más lejano que ya tiene el cliente, para que lo
            // nuevo quede sincronizado con su ciclo actual.
            const refAssignments = (renewAssignments && renewAssignments.length > 0) ? renewAssignments : client.assignments;
            let baseDate = (refAssignments && refAssignments.length > 0)
                ? new Date(Math.max(...refAssignments.map((a) => new Date(a.expiryDate))))
                : new Date();
            baseDate.setHours(0, 0, 0, 0);

            const currentExpiryEl = document.getElementById("renewCurrentExpiry");
            if (currentExpiryEl) currentExpiryEl.textContent = formatDate(baseDate);

            const summary = document.getElementById("renewalSummary");

            if (!subtotal || subtotal === 0) {
                summary.style.display = "none";
                return;
            }

            summary.style.display = "block";

            const newEnd = calculateExpiryDate(baseDate, months);

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
                <span class="detail-label">Plataformas incluidas:</span>
                <span class="detail-value">${distinctPlatforms} (${totalProfiles} perfil${totalProfiles === 1 ? "" : "es"})</span>
            </div>
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
                <span class="detail-label">Nueva fecha de vencimiento (todo junto):</span>
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

            const renewChecks = Array.from(document.querySelectorAll(".renew-existing-checkbox:checked"));
            const renewIdxs = renewChecks.map((el) => parseInt(el.dataset.idx));
            const renewAssignments = renewIdxs.map((idx) => client.assignments[idx]).filter(Boolean);

            const addChecks = Array.from(document.querySelectorAll(".renew-add-checkbox:checked"));

            if (renewAssignments.length === 0 && addChecks.length === 0) {
                alert("⚠️ Tildá al menos una plataforma para renovar o para agregar.");
                return;
            }

            // Validar cupos disponibles de lo nuevo ANTES de cobrar nada
            const addItems = [];
            for (const chk of addChecks) {
                const platform = chk.dataset.platform;
                const deviceType = chk.dataset.device || null;
                const accountIds = chk.dataset.accountIds.split(",").filter(Boolean).map(Number);
                const qtyInput = chk.closest(".renew-item-row").querySelector(".renew-add-qty");
                const qty = parseInt(qtyInput.value) || 1;

                const accounts = appData.accounts.filter((a) => accountIds.includes(a.id));
                const available = accounts.reduce((sum, acc) => sum + acc.profiles.filter(isProfileSellable).length, 0);
                if (qty > available) {
                    alert(`⚠️ Solo hay ${available} perfil(es) disponible(s) de ${platform}${deviceType ? " (" + deviceType + ")" : ""}`);
                    return;
                }
                addItems.push({ platform, deviceType, qty, accounts });
            }

            // 🔧 Fecha base: SIEMPRE la que ya tenían las plataformas tildadas para
            // renovar. Nunca se mueve por el día en que el cliente efectivamente paga.
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const refAssignments = renewAssignments.length > 0 ? renewAssignments : client.assignments;
            let baseDate = (refAssignments && refAssignments.length > 0)
                ? new Date(Math.max(...refAssignments.map((a) => new Date(a.expiryDate))))
                : new Date(today);
            baseDate.setHours(0, 0, 0, 0);

            const newEnd = calculateExpiryDate(baseDate, months);
            const durationDays = getExactDaysBetween(baseDate, newEnd);

            // ... cálculo de costos ...
            let platformCounts = {};
            renewAssignments.forEach((ass) => {
                const key = platformHasSubtypes(ass.platform) ? `${ass.platform}-${ass.deviceType}` : ass.platform;
                if (!platformCounts[key]) {
                    platformCounts[key] = { platform: ass.platform, deviceType: ass.deviceType, count: 0, price: 0 };
                }
                platformCounts[key].count++;
            });
            addItems.forEach((item) => {
                const key = platformHasSubtypes(item.platform) ? `${item.platform}-${item.deviceType}` : item.platform;
                if (!platformCounts[key]) {
                    platformCounts[key] = { platform: item.platform, deviceType: item.deviceType, count: 0, price: 0 };
                }
                platformCounts[key].count += item.qty;
            });

            Object.keys(platformCounts).forEach((key) => {
                const info = platformCounts[key];
                const account = appData.accounts.find((a) =>
                    a.platform === info.platform &&
                    (!platformHasSubtypes(info.platform) || a.deviceType === info.deviceType)
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
                `Plataformas incluidas: ${distinctPlatforms} (${totalProfiles} perfiles)\n` +
                `Renovar desde: ${formatDate(baseDate)}\n` +
                `Duración: ${months} mes(es)\n` +
                (discount > 0 ? `Subtotal: $${subtotal.toFixed(2)}\nDescuento: -$${discount.toFixed(2)} (${discountDetails.join(", ")})\n` : ``) +
                `Monto a cobrar: $${renewalCost.toFixed(2)}\n` +
                `Nueva fecha (para todo lo incluido): ${formatDate(newEnd)}\n\n` +
                `¿Proceder?`;

            if (!confirm(confirmMessage)) return;

            client.totalPaid = renewalCost;
            // Actualizar fecha de ÚLTIMO PAGO a hoy (solo a fines de registro, no se usa para calcular vencimientos)
            client.paymentDate = today.toISOString().split('T')[0];

            // Aplicar la nueva fecha a las asignaciones tildadas para renovar
            renewAssignments.forEach((ass) => {
                ass.expiryDate = newEnd.toISOString();
                ass.durationMonths = months;
                ass.startDate = baseDate.toISOString();
                ass.durationDays = durationDays;

                const account = appData.accounts.find((a) => {
                    if (platformHasSubtypes(ass.platform)) {
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

            // Agregar las plataformas nuevas tildadas, sincronizadas a la misma fecha
            addItems.forEach((item) => {
                let remaining = item.qty;
                for (const account of item.accounts) {
                    if (remaining <= 0) break;
                    const freeProfiles = account.profiles.filter(isProfileSellable);
                    for (const profile of freeProfiles) {
                        if (remaining <= 0) break;
                        profile.occupied = true;
                        profile.clientId = client.pin;
                        profile.expiryDate = newEnd.toISOString();

                        client.assignments.push({
                            platform: item.platform,
                            deviceType: item.deviceType,
                            accountEmail: account.email,
                            password: account.password,
                            profileNumber: profile.number,
                            durationMonths: months,
                            durationDays: durationDays,
                            startDate: baseDate.toISOString(),
                            expiryDate: newEnd.toISOString(),
                        });
                        remaining--;
                    }
                }
            });

            client.active = true;

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
                const key = platformHasSubtypes(acc.platform) ? `${acc.platform} - ${acc.deviceType}` : acc.platform;
                if (!summary[key]) {
                    const cfg = PLATFORM_CONFIG[acc.platform] || { icon: "📺", color: "custom-platform" };
                    summary[key] = { total: 0, available: 0, occupied: 0, blocked: 0, config: cfg, platform: acc.platform };
                }
                summary[key].total += acc.maxProfiles;
                summary[key].available += acc.profiles.filter(isProfileSellable).length;
                summary[key].occupied += acc.profiles.filter((p) => p.occupied).length;
                summary[key].blocked += acc.profiles.filter((p) => !p.occupied && p.blocked).length;
            });

            Object.entries(summary).forEach(([key, data]) => {
                const card = document.createElement("div");
                card.className = "platform-card";
                card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-name">
                        ${platformIconHtml(data.config, data.platform)}
                        <div style="font-size: 14px;">${key}</div>
                    </div>
                </div>
                <div style="text-align: center; margin: 15px 0;">
                    <div style="font-size: 36px; font-weight: 800; color: var(--accent-primary);">${data.available}</div>
                    <div style="color: var(--text-secondary); font-size: 12px;">disponibles de ${data.total}</div>
                </div>
                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 10px; text-align: center; font-size: 12px; color: var(--text-secondary);">
                    Ocupados: ${data.occupied}${data.blocked > 0 ? ` • 🔒 Sin vender: ${data.blocked}` : ""}
                </div>
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

            const subtypeAccountsByPlatform = {};
            const otherAccounts = [];

            appData.accounts.forEach((acc) => {
                if (platformHasSubtypes(acc.platform)) {
                    if (!subtypeAccountsByPlatform[acc.platform]) subtypeAccountsByPlatform[acc.platform] = {};
                    if (!subtypeAccountsByPlatform[acc.platform][acc.email]) subtypeAccountsByPlatform[acc.platform][acc.email] = [];
                    subtypeAccountsByPlatform[acc.platform][acc.email].push(acc);
                } else {
                    otherAccounts.push(acc);
                }
            });

            Object.entries(subtypeAccountsByPlatform).forEach(([platform, byEmail]) => {
                const platformGroup = document.createElement("optgroup");
                platformGroup.label = `${PLATFORM_CONFIG[platform].icon} ${platform} (por cuenta de correo)`;
                Object.entries(byEmail).forEach(([email, accounts]) => {
                    const totalCost = accounts.reduce((sum, a) => sum + a.cost, 0);
                    const types = accounts.map((a) => a.deviceType).join(" + ");
                    const option = document.createElement("option");
                    option.value = accounts[0].id;
                    option.dataset.subtypeGroup = JSON.stringify(accounts.map((a) => a.id));
                    option.textContent = `${email} (${types}) - $${totalCost.toFixed(2)}/mes`;
                    platformGroup.appendChild(option);
                });
                select.appendChild(platformGroup);
            });

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
                        <span style="font-weight: 600;">${acc.platform} ${platformHasSubtypes(acc.platform) ? `(${acc.deviceType})` : ""}</span>
                        <span style="color: ${acc.daysLeft <= 3 ? "var(--accent-danger)" : acc.daysLeft <= 7 ? "var(--warning)" : "var(--accent-primary)"}; font-weight: 700;">
                            ${acc.daysLeft} días
                        </span>
                    </div>
                    <div style="color: var(--text-secondary); margin-top: 4px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <span>$${acc.cost.toFixed(2)} • <span class="date-display">${formatDate(acc.nextPayment)}</span></span>
                        <button type="button" class="btn btn-danger" onclick="quickPayAccount(${acc.id})" style="padding: 5px 10px; font-size: 11px; white-space: nowrap;">
                            💳 Marcar Pagado
                        </button>
                    </div>
                `;
                    upcoming.appendChild(div);
                });
            } else {
                upcoming.innerHTML = '<p style="color: var(--text-secondary);">No hay pagos pendientes</p>';
            }
        }

        // Registrar el pago de UNA cuenta directamente desde "Próximos Pagos", sin tener
        // que ir hasta el formulario de "Registrar Pago de Cuentas" y volver a elegirla.
        function quickPayAccount(accountId) {
            const account = appData.accounts.find((a) => a.id === accountId);
            if (!account) return;

            const label = `${account.platform}${platformHasSubtypes(account.platform) ? " (" + account.deviceType + ")" : ""} — ${account.email}`;
            const amountStr = prompt(`💳 Registrar pago de:\n${label}\n\nMonto a pagar:`, account.cost.toFixed(2));
            if (amountStr === null) return;

            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0) {
                alert("⚠️ Monto inválido");
                return;
            }

            const today = new Date();
            const dateStr = today.toISOString().split("T")[0];
            const nextPayment = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

            appData.payments.push({
                id: Date.now(),
                accountId: account.id,
                platform: account.platform,
                email: account.email,
                amount: amount,
                date: dateStr,
                nextPayment: nextPayment,
            });
            account.nextPayment = nextPayment;

            saveData().then(() => {
                updateFinanceView();
                renderAccounts();
                showNotification(`✅ Pago registrado: ${label} — $${amount.toFixed(2)}`, "success");
            });
        }

        document.getElementById("paymentForm").addEventListener("submit", function (e) {
            e.preventDefault();

            const select = document.getElementById("paymentAccount");
            const selectedOption = select.options[select.selectedIndex];
            let accountIds = [];

            if (selectedOption.dataset.subtypeGroup) {
                accountIds = JSON.parse(selectedOption.dataset.subtypeGroup);
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
            renderPlatformFilterButtons();
            renderClients();
            updateFinanceView();
            populatePlatformSelect();
            renderCustomPlatformsCatalog();
        }

        window.onclick = function (event) {
            if (event.target.classList.contains("modal")) {
                event.target.classList.remove("active");
            }
        };
