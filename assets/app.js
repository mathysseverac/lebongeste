/* Le bon geste : script du site (chargé avec defer, aucun script inline : compatible CSP « script-src 'self' »). */

// ==================== PHOTOS DU DEVIS & COMPRESSION ====================
// Limites côté navigateur (confort d'usage).
const MAX_PHOTOS = 3;
const MAX_TOTAL_BYTES = 9.5 * 1024 * 1024; // FormSubmit refuse plus de 10 Mo au total
const MAX_IMAGE_DIMENSION = 1600;          // Redimensionnement max pour éviter les photos de 6 Mo sur mobile
const JPEG_QUALITY = 0.82;

function buildNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent : jamais interprété comme du HTML
    return node;
}

function photoError(files) {
    if (files.length > MAX_PHOTOS) return 'Maximum ' + MAX_PHOTOS + ' photos.';
    let total = 0;
    for (const file of files) {
        const okType = file.type === 'image/jpeg' || file.type === 'image/png' ||
                       (file.type === '' && /\.(jpe?g|png)$/i.test(file.name));
        if (!okType) return 'Formats acceptés : JPG ou PNG.';
        total += file.size;
    }
    if (total > MAX_TOTAL_BYTES) return 'Photos trop lourdes : 10 Mo maximum au total.';
    return null;
}

// Compresse une image côté client (Canvas) pour accélérer drastiquement l'envoi sur mobile
function compressImageFile(file) {
    return new Promise(function(resolve) {
        // Si l'image fait déjà moins de 400 Ko, on la garde telle quelle
        if (file.size <= 400 * 1024 || typeof DataTransfer === 'undefined' || typeof FileReader === 'undefined') {
            resolve(file);
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                let width = img.naturalWidth || img.width;
                let height = img.naturalHeight || img.height;
                if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                    const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(function(blob) {
                    if (!blob || blob.size >= file.size) {
                        resolve(file);
                        return;
                    }
                    const cleanName = file.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
                    const compressedFile = new File([blob], cleanName, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', JPEG_QUALITY);
            };
            img.onerror = function() {
                resolve(file);
            };
            img.src = e.target.result;
        };
        reader.onerror = function() {
            resolve(file);
        };
        reader.readAsDataURL(file);
    });
}

function renderDropzoneState(files, error) {
    const contentDiv = document.getElementById('dropzone-content');
    if (!contentDiv) return;

    const nodes = [];
    if (error) {
        nodes.push(buildNode('i', 'ph-fill ph-warning-circle text-3xl text-red-500 mb-2'));
        nodes.push(buildNode('p', 'mb-1 text-sm text-red-600 font-semibold text-center px-4', error));
        nodes.push(buildNode('p', 'text-xs text-slate-500 text-center px-4', 'Ajoutez 1 à 3 photos (JPG ou PNG, 10 Mo maximum au total).'));
    } else if (files.length > 0) {
        const totalKo = Math.round(files.reduce(function(acc, f) { return acc + f.size; }, 0) / 1024);
        nodes.push(buildNode('i', 'ph-fill ph-check-circle text-3xl text-teal mb-2'));
        nodes.push(buildNode('p', 'mb-1 text-sm text-slate-800 font-semibold text-center px-4', files.length + ' photo(s) prête(s) (' + totalKo + ' Ko)'));
        nodes.push(buildNode('p', 'text-xs text-teal text-center px-4 truncate w-[90%]', files.map(function(f) { return f.name; }).join(', ')));
    } else {
        nodes.push(buildNode('i', 'ph-fill ph-camera text-3xl text-slate-400 mb-2'));
        const hint = buildNode('p', 'mb-1 text-sm text-slate-600');
        hint.appendChild(buildNode('span', 'font-semibold text-teal', 'Cliquez pour ajouter'));
        hint.appendChild(document.createTextNode(' ou glissez vos photos'));
        nodes.push(hint);
        nodes.push(buildNode('p', 'text-xs text-slate-500 text-center px-4', 'Ajoutez 1 à 3 photos depuis votre smartphone ou PC'));
    }
    contentDiv.replaceChildren.apply(contentDiv, nodes);
}

async function handleSelectedFiles(input, rawFiles) {
    const files = rawFiles ? Array.from(rawFiles) : [];
    if (files.length === 0) {
        input.value = '';
        renderDropzoneState([], null);
        return;
    }

    // Vérification rapide du nombre et du format avant compression
    if (files.length > MAX_PHOTOS) {
        input.value = '';
        renderDropzoneState([], 'Maximum ' + MAX_PHOTOS + ' photos.');
        return;
    }
    for (const file of files) {
        const okType = file.type === 'image/jpeg' || file.type === 'image/png' ||
                       (file.type === '' && /\.(jpe?g|png)$/i.test(file.name));
        if (!okType) {
            input.value = '';
            renderDropzoneState([], 'Formats acceptés : JPG ou PNG.');
            return;
        }
    }

    // Compression automatique sur mobile/PC pour un envoi quasi instantané
    const compressedFiles = await Promise.all(files.map(compressImageFile));
    const error = photoError(compressedFiles);
    if (error) {
        input.value = '';
        renderDropzoneState([], error);
        return;
    }

    if (typeof DataTransfer !== 'undefined') {
        const dt = new DataTransfer();
        compressedFiles.forEach(function(f) { dt.items.add(f); });
        input.files = dt.files;
    }
    renderDropzoneState(compressedFiles, null);
}

// Réinitialise l'état du bouton d'envoi (utile aussi quand on revient en arrière sur mobile Safari / bfcache)
function resetSubmitButton() {
    const btn = document.getElementById('devis-submit-btn');
    const icon = document.getElementById('devis-submit-icon');
    const label = document.getElementById('devis-submit-label');
    if (btn && icon && label) {
        btn.disabled = false;
        icon.className = 'ph ph-paper-plane-right text-xl';
        label.textContent = 'Envoyer ma demande';
    }
    const photoInput = document.getElementById('dropzone-file');
    if (photoInput && !photoInput.getAttribute('name')) {
        photoInput.setAttribute('name', 'photos');
    }
}

window.addEventListener('pageshow', function() {
    resetSubmitButton();
});

document.addEventListener('DOMContentLoaded', function() {
    const devisForm = document.getElementById('devis-form');
    if (devisForm) {
        const requiredFields = ['nom', 'tel', 'email', 'ville'];

        function showFieldError(field, show) {
            const errorEl = document.getElementById('err-' + field.id);
            if (show) {
                field.classList.add('border-red-400', 'focus:border-red-500', 'focus:ring-red-200');
                field.classList.remove('border-gray-300');
                if (errorEl) errorEl.classList.remove('hidden');
            } else {
                field.classList.remove('border-red-400', 'focus:border-red-500', 'focus:ring-red-200');
                field.classList.add('border-gray-300');
                if (errorEl) errorEl.classList.add('hidden');
            }
        }

        // Cache l'erreur dès que le visiteur corrige le champ
        requiredFields.forEach(function(id) {
            const field = document.getElementById(id);
            if (field) {
                field.addEventListener('input', function() {
                    if (field.checkValidity()) showFieldError(field, false);
                });
            }
        });

        devisForm.addEventListener('submit', function(event) {
            let firstInvalid = null;
            let hasError = false;

            requiredFields.forEach(function(id) {
                const field = document.getElementById(id);
                if (!field) return;
                const valid = field.checkValidity();
                showFieldError(field, !valid);
                if (!valid) {
                    hasError = true;
                    if (!firstInvalid) firstInvalid = field;
                }
            });

            if (hasError) {
                event.preventDefault();
                if (firstInvalid) {
                    firstInvalid.focus();
                    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            // Si aucune photo n'est jointe, on retire temporairement l'attribut name du champ file
            // pour éviter d'envoyer une pièce jointe vide à FormSubmit.
            const pInput = document.getElementById('dropzone-file');
            if (pInput && (!pInput.files || pInput.files.length === 0)) {
                pInput.removeAttribute('name');
            }

            // Suivi de l'événement d'envoi de devis dans Microsoft Clarity
            trackClarityEvent('envoi_devis');

            // Formulaire valide : on affiche l'état de chargement pendant l'envoi
            const btn = document.getElementById('devis-submit-btn');
            const icon = document.getElementById('devis-submit-icon');
            const label = document.getElementById('devis-submit-label');
            if (btn && icon && label) {
                btn.disabled = true;
                icon.className = 'ph ph-circle-notch text-xl animate-spin';
                label.textContent = 'Envoi en cours…';
            }
        });
    }

    // Autocomplétion de la commune avec anti-rebond (debounce) et annulation des requêtes obsolètes
    const villeInput = document.getElementById('ville');
    const villeResults = document.getElementById('ville-results');
    let villeTimeout = null;
    let villeAbortController = null;

    if (villeInput && villeResults) {
        villeInput.addEventListener('input', function() {
            const query = this.value.trim().slice(0, 60);
            if (villeTimeout) clearTimeout(villeTimeout);
            if (villeAbortController) villeAbortController.abort();

            if (query.length < 2) {
                villeResults.classList.add('hidden');
                return;
            }

            villeTimeout = setTimeout(function() {
                const isNumeric = /^\d+$/.test(query);
                const url = isNumeric 
                    ? `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(query)}&boost=population&limit=5`
                    : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&boost=population&limit=5`;

                villeAbortController = new AbortController();
                fetch(url, { signal: villeAbortController.signal })
                    .then(function(response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json();
                    })
                    .then(function(data) {
                        villeResults.replaceChildren();
                        if (Array.isArray(data) && data.length > 0) {
                            data.forEach(function(city) {
                                const li = document.createElement('li');
                                li.className = 'px-4 py-3 hover:bg-teal-light cursor-pointer text-sm text-slate-700 border-b border-gray-100 last:border-0';
                                const cp = (city.codesPostaux && city.codesPostaux.length > 0) ? city.codesPostaux[0] : '';
                                li.textContent = `${cp} - ${city.nom}`;
                                li.addEventListener('click', function() {
                                    villeInput.value = `${cp} ${city.nom}`;
                                    villeResults.classList.add('hidden');
                                    const errVille = document.getElementById('err-ville');
                                    if (errVille) errVille.classList.add('hidden');
                                    villeInput.classList.remove('border-red-400', 'focus:border-red-500', 'focus:ring-red-200');
                                    villeInput.classList.add('border-gray-300');
                                });
                                villeResults.appendChild(li);
                            });
                            villeResults.classList.remove('hidden');
                        } else {
                            villeResults.classList.add('hidden');
                        }
                    })
                    .catch(function(error) {
                        if (error.name !== 'AbortError') {
                            console.error('Erreur API Geo:', error);
                        }
                    });
            }, 180);
        });

        document.addEventListener('click', function(e) {
            if (e.target !== villeInput && !villeResults.contains(e.target)) {
                villeResults.classList.add('hidden');
            }
        });
    }
});

// Met à jour automatiquement l'année du copyright dans le footer
document.addEventListener('DOMContentLoaded', function() {
    const yearEl = document.getElementById('copyright-year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
});

// Métadonnées par page : URL, titre d'onglet et description (SEO + partage)
const PAGES = {
    'accueil': {
        url: 'https://le-bon-geste.fr/',
        title: "Jardinier à Mazamet : haies, pelouses, petits travaux | Le bon geste",
        description: "Taille de haies, tonte et petits travaux à domicile à Mazamet et alentours. Appelez Sylvain. 50 % de déduction via la coopérative Unipros."
    },
    'services': {
        url: 'https://le-bon-geste.fr/catalogue',
        title: "Catalogue des prestations : petits travaux et jardinage | Le bon geste",
        description: "Catalogue des prestations à Mazamet : taille de haies, tonte, petit bricolage, entretien des terrasses et assistance à domicile. Devis gratuit."
    },
    'sap': {
        url: 'https://le-bon-geste.fr/avantage-sap',
        title: "50 % de déduction avec la coopérative Unipros | Le bon geste",
        description: "Comment fonctionne la déduction de 50 % avec Unipros : vous ne réglez que la moitié de la facture, la coopérative se charge du reste."
    },
    'guide': {
        url: 'https://le-bon-geste.fr/guide-urssaf',
        title: "Guide d'activation Unipros | Le bon geste à Mazamet",
        description: "Guide simple pour comprendre et activer la facturation via la coopérative Unipros à Mazamet."
    },
    'devis': {
        url: 'https://le-bon-geste.fr/devis',
        title: "Prendre rendez-vous | Le bon geste, Mazamet",
        description: "Décrivez votre besoin de jardinage ou de petit service à domicile : réponse sous 24 à 48 h et devis gratuit avant toute intervention."
    },
    'contact': {
        url: 'https://le-bon-geste.fr/contact',
        title: "Contact | Le bon geste, Mazamet",
        description: "Téléphone, email et devis gratuit : contactez Le bon geste pour vos travaux et petits services à Mazamet et ses environs."
    },
    'faq': {
        url: 'https://le-bon-geste.fr/faq',
        title: "FAQ travaux à domicile à Mazamet | Le bon geste",
        description: "Réponses aux questions fréquentes sur les prestations à domicile, le devis gratuit et la facturation via Unipros à Mazamet."
    },
    'mentions': {
        url: 'https://le-bon-geste.fr/mentions-legales',
        title: "Mentions légales | Le bon geste",
        description: "Mentions légales du site Le bon geste : éditeur, hébergement, propriété intellectuelle et données personnelles."
    },
    'cgv': {
        url: 'https://le-bon-geste.fr/cgv',
        title: "Conditions générales de vente | Le bon geste",
        description: "Conditions générales de vente des prestations Le bon geste : devis, tarifs, rétractation, annulation et médiation."
    },
    'confidentialite': {
        url: 'https://le-bon-geste.fr/politique-de-confidentialite',
        title: "Politique de confidentialité | Le bon geste",
        description: "Comment Le bon geste collecte et utilise vos données personnelles, et comment exercer vos droits RGPD."
    },
    'cookies': {
        url: 'https://le-bon-geste.fr/politique-de-cookies',
        title: "Politique de cookies | Le bon geste",
        description: "Le détail des cookies utilisés sur le site Le bon geste et la manière de gérer votre consentement."
    },
    'merci': {
        url: 'https://le-bon-geste.fr/merci',
        title: "Demande envoyée | Le bon geste",
        description: "Votre demande de devis a bien été transmise.",
        noindex: true
    },
    '404': {
        url: 'https://le-bon-geste.fr/404',
        title: "Page introuvable | Le bon geste",
        description: "Cette page n'existe pas ou plus.",
        noindex: true
    }
};

function updateMetadata(pageId) {
    const meta = PAGES[pageId] || PAGES['404'];
    document.title = meta.title;
    const descEl = document.getElementById('page-description');
    const canonEl = document.getElementById('page-canonical');
    const ogTitle = document.getElementById('og-title');
    const ogDesc = document.getElementById('og-description');
    const ogUrl = document.getElementById('og-url');
    const robotsEl = document.querySelector('meta[name="robots"]');
    if (descEl) descEl.setAttribute('content', meta.description);
    if (canonEl) canonEl.setAttribute('href', meta.url);
    if (ogTitle) ogTitle.setAttribute('content', meta.title);
    if (ogDesc) ogDesc.setAttribute('content', meta.description);
    if (ogUrl) ogUrl.setAttribute('content', meta.url);
    if (robotsEl) robotsEl.setAttribute('content', meta.noindex ? 'noindex, follow' : 'index, follow');
}

function navigateTo(event, pageId) {
    if (event) {
        event.preventDefault();
    }

    if (!PAGES[pageId]) {
        pageId = '404';
    }

    // Cacher toutes les pages
    const pages = document.querySelectorAll('.page-view');
    pages.forEach(function(page) {
        page.classList.remove('active-page');
    });
    
    // Afficher la page cible
    const targetPage = document.getElementById('page-' + pageId);
    if (targetPage) {
        targetPage.classList.add('active-page');
    }
    
    // Gérer l'état actif des liens de navigation desktop et mobile
    const navLinks = document.querySelectorAll('.nav-link, .mobile-link');
    navLinks.forEach(function(link) {
        link.classList.remove('active-link');
        if (link.dataset.nav === pageId) {
            link.classList.add('active-link');
        }
    });
    
    // Fermer le menu mobile s'il est ouvert et synchroniser aria-expanded
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileBtnEl = document.getElementById('mobile-menu-btn');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
        if (mobileBtnEl) {
            mobileBtnEl.setAttribute('aria-expanded', 'false');
            mobileBtnEl.setAttribute('aria-label', 'Ouvrir le menu');
        }
    }
    
    // Remonter en haut de la page
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Mettre à jour titre, description et balises de partage
    updateMetadata(pageId);

    // Mettre à jour l'URL avec history.pushState
    if (PAGES[pageId]) {
        try {
            history.pushState({page: pageId}, '', PAGES[pageId].url);
        } catch (e) {
            console.warn("pushState bloqué dans cet environnement de prévisualisation.");
        }
    }

    // Indiquer à Microsoft Clarity quelle page virtuelle est consultée
    if (typeof window.clarity === 'function') {
        window.clarity('set', 'page', pageId);
    }
}

// ==================== GESTION DU CONSENTEMENT COOKIES & MICROSOFT CLARITY ====================
const COOKIE_CONSENT_KEY = 'lbg_cookie_consent';
const COOKIE_CONSENT_DAYS = 182; // ~6 mois, recommandation CNIL

// Identifiant du projet Microsoft Clarity
const CLARITY_PROJECT_ID = 'zbmt1jjzns';
let clarityLoaded = false;

function loadMicrosoftClarity() {
    if (clarityLoaded || !CLARITY_PROJECT_ID) return;
    clarityLoaded = true;

    window.clarity = window.clarity || function() {
        (window.clarity.q = window.clarity.q || []).push(arguments);
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(CLARITY_PROJECT_ID);
    document.head.appendChild(script);

    // Signale à Clarity que l'utilisateur a accepté les cookies
    window.clarity('consent');
}

function trackClarityEvent(eventName) {
    if (typeof window.clarity === 'function') {
        window.clarity('event', eventName);
    }
}

function getCookieConsent() {
    try {
        const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const ageDays = (Date.now() - data.date) / (1000 * 60 * 60 * 24);
        if (ageDays > COOKIE_CONSENT_DAYS) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function saveCookieConsent(status, analytics) {
    const data = { status: status, analytics: !!analytics, date: Date.now() };
    try {
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Stockage local indisponible : le consentement ne pourra pas être mémorisé.');
    }
    applyCookieConsent(data);
}

function setCookieConsent(status) {
    saveCookieConsent(status, status === 'accepted');
    hideCookieBanner();
    closeCookieModal();
}

function saveCustomCookieConsent() {
    const analyticsToggle = document.getElementById('cookie-analytics-toggle');
    const analyticsOn = analyticsToggle ? analyticsToggle.checked : false;
    saveCookieConsent(analyticsOn ? 'accepted' : 'custom', analyticsOn);
    hideCookieBanner();
    closeCookieModal();
}

function applyCookieConsent(data) {
    if (data && data.analytics) {
        loadMicrosoftClarity();
    } else if (typeof window.clarity === 'function') {
        // Si le visiteur retire son consentement par la suite, on coupe les cookies Clarity
        window.clarity('consent', false);
    }
}

function showCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.remove('hidden');
}

function hideCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('hidden');
}

function openCookieModal() {
    const modal = document.getElementById('cookie-modal');
    const existing = getCookieConsent();
    const toggle = document.getElementById('cookie-analytics-toggle');
    if (toggle) toggle.checked = existing ? !!existing.analytics : false;
    if (modal) modal.classList.remove('hidden');
}

function closeCookieModal() {
    const modal = document.getElementById('cookie-modal');
    if (modal) modal.classList.add('hidden');
}

// Initialisation du consentement au chargement
(function initCookieConsent() {
    const existing = getCookieConsent();
    if (existing) {
        applyCookieConsent(existing);
    } else {
        document.addEventListener('DOMContentLoaded', showCookieBanner);
    }
})();

// Menu mobile (Ouverture/Fermeture toggle)
const mobileBtn = document.getElementById('mobile-menu-btn');
const mobileMenuEl = document.getElementById('mobile-menu');

if (mobileBtn && mobileMenuEl) {
    mobileBtn.addEventListener('click', function() {
        mobileMenuEl.classList.toggle('hidden');
        const isOpen = !mobileMenuEl.classList.contains('hidden');
        mobileBtn.setAttribute('aria-expanded', String(isOpen));
        mobileBtn.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
    });
}

// Effet scroll sur le header global
window.addEventListener('scroll', function() {
    const header = document.getElementById('header');
    if (header) {
        if (window.scrollY > 20) {
            header.classList.add('shadow-md', 'py-0');
            header.classList.remove('shadow-sm');
        } else {
            header.classList.add('shadow-sm');
            header.classList.remove('shadow-md', 'py-0');
        }
    }
});

// Fait correspondre un chemin d'URL à un identifiant de page connu
function resolvePathToPageId(path) {
    if (path === '/' || path === '' || path.indexOf('index.html') !== -1) return 'accueil';
    if (path.indexOf('catalogue') !== -1) return 'services';
    if (path.indexOf('avantage-sap') !== -1 || path.indexOf('avantage-unipros') !== -1) return 'sap';
    if (path.indexOf('guide-urssaf') !== -1 || path.indexOf('guide-unipros') !== -1) return 'guide';
    if (path.indexOf('devis') !== -1) return 'devis';
    if (path.indexOf('merci') !== -1) return 'merci';
    if (path.indexOf('contact') !== -1) return 'contact';
    if (path.indexOf('faq') !== -1) return 'faq';
    if (path.indexOf('mentions-legales') !== -1) return 'mentions';
    if (path.indexOf('cgv') !== -1) return 'cgv';
    if (path.indexOf('politique-de-confidentialite') !== -1) return 'confidentialite';
    if (path.indexOf('politique-de-cookies') !== -1) return 'cookies';
    return '404';
}

window.addEventListener('popstate', function() {
    navigateTo(null, resolvePathToPageId(window.location.pathname));
});

function updateHaieDetails() {
    const selected = document.querySelector('input[name="prestation"]:checked');
    const details = document.getElementById('haie-details');
    if (!details) return;
    const visible = selected && selected.value === 'jardin';
    details.classList.toggle('hidden', !visible);
    details.setAttribute('aria-hidden', String(!visible));
}

document.querySelectorAll('input[name="prestation"]').forEach(function(input) {
    input.addEventListener('change', updateHaieDetails);
});
updateHaieDetails();

function navigateToService(event, serviceId) {
    navigateTo(event, 'services');
    window.setTimeout(function() {
        const service = document.getElementById(serviceId);
        if (service) service.scrollIntoView({behavior: 'smooth', block: 'start'});
    }, 80);
}

// Initialisation : on affiche la page correspondant à l'adresse actuelle.
function initialRoute() {
    const confirmed = new URLSearchParams(window.location.search).get('envoye') === '1'
                   || window.location.hash === '#envoye';
    if (confirmed) {
        try { history.replaceState(null, '', '/'); } catch (e) { /* sans gravité */ }
        resetSubmitButton();
        navigateTo(null, 'merci');
        return;
    }
    navigateTo(null, resolvePathToPageId(window.location.pathname));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialRoute);
} else {
    initialRoute();
}

// ==================== ÉVÈNEMENTS GLOBAUX ====================
document.addEventListener('click', function(event) {
    // Suivi des clics sur les boutons d'appel téléphonique (tel:) et d'email (mailto:)
    const telLink = event.target.closest('a[href^="tel:"]');
    if (telLink) {
        trackClarityEvent('clic_telephone');
    }
    const mailLink = event.target.closest('a[href^="mailto:"]');
    if (mailLink) {
        trackClarityEvent('clic_email');
    }

    const el = event.target.closest('[data-nav], [data-nav-service], [data-action]');
    if (!el) return;
    if (el.hasAttribute('data-nav')) {
        const targetNav = el.getAttribute('data-nav');
        if (targetNav === 'devis') {
            trackClarityEvent('ouverture_page_devis');
        }
        // Si le bouton contient data-prestation, on pré-coche la prestation dans le formulaire de devis
        const presetPrestation = el.getAttribute('data-prestation');
        if (presetPrestation) {
            const radio = document.querySelector('input[name="prestation"][value="' + presetPrestation + '"]');
            if (radio) {
                radio.checked = true;
                updateHaieDetails();
            }
        }
        navigateTo(event, el.getAttribute('data-nav'));
    } else if (el.hasAttribute('data-nav-service')) {
        navigateToService(event, el.getAttribute('data-nav-service'));
    } else {
        switch (el.getAttribute('data-action')) {
            case 'cookie-open':   openCookieModal(); break;
            case 'cookie-close':  closeCookieModal(); break;
            case 'cookie-accept': setCookieConsent('accepted'); break;
            case 'cookie-reject': setCookieConsent('rejected'); break;
            case 'cookie-save':   saveCustomCookieConsent(); break;
        }
    }
});

// Sélection et Glisser-Déposer (Drag & Drop) des photos
const photoInput = document.getElementById('dropzone-file');
const dropzoneLabel = photoInput ? photoInput.closest('label') : null;

if (photoInput) {
    photoInput.addEventListener('change', function() {
        handleSelectedFiles(photoInput, photoInput.files);
    });
}

if (dropzoneLabel && photoInput) {
    ['dragenter', 'dragover'].forEach(function(evtName) {
        dropzoneLabel.addEventListener(evtName, function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropzoneLabel.classList.add('border-teal', 'bg-teal-light/30');
        });
    });
    ['dragleave', 'drop'].forEach(function(evtName) {
        dropzoneLabel.addEventListener(evtName, function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropzoneLabel.classList.remove('border-teal', 'bg-teal-light/30');
        });
    });
    dropzoneLabel.addEventListener('drop', function(e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSelectedFiles(photoInput, e.dataTransfer.files);
        }
    });
}

// Photos facultatives : chaque photo ne s'affiche que si son fichier existe dans /assets/img/
(function () {
    document.querySelectorAll('img[data-photo-img]').forEach(function (img) {
        var fig = img.closest('[data-photo]');
        if (!fig) return;
        function show() {
            fig.hidden = false;
            var group = fig.closest('[data-photo-group]');
            if (group) group.hidden = false;
            var host = fig.closest('[data-photo-host]');
            if (host) host.classList.add('has-photo');
        }
        if (img.complete && img.naturalWidth > 0) show();
        else img.addEventListener('load', function () { if (img.naturalWidth > 0) show(); });
    });
})();