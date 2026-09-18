/* Le bon geste : script du site (chargé avec defer, aucun script inline : compatible CSP « script-src 'self' »). */

        // ==================== PHOTOS DU DEVIS ====================
        // Limites côté navigateur (confort d'usage). La vraie barrière reste le service qui reçoit le formulaire.
        const MAX_PHOTOS = 3;
        const MAX_TOTAL_BYTES = 9.5 * 1024 * 1024; // FormSubmit refuse plus de 10 Mo au total (marge pour l'enveloppe du formulaire)

        function buildNode(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;   // textContent : jamais interprété comme du HTML
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

        function updateFileName(input) {
            const contentDiv = document.getElementById('dropzone-content');
            if (!contentDiv) return;
            const files = input.files ? Array.from(input.files) : [];
            const error = files.length > 0 ? photoError(files) : null;
            if (error) input.value = '';   // on vide la sélection refusée

            const nodes = [];
            if (error) {
                nodes.push(buildNode('i', 'ph-fill ph-warning-circle text-3xl text-red-500 mb-2'));
                nodes.push(buildNode('p', 'mb-1 text-sm text-red-600 font-semibold text-center px-4', error));
                nodes.push(buildNode('p', 'text-xs text-slate-500 text-center px-4', 'Ajoutez 1 à 3 photos (JPG ou PNG, 10 Mo maximum au total).'));
            } else if (files.length > 0) {
                nodes.push(buildNode('i', 'ph-fill ph-check-circle text-3xl text-teal mb-2'));
                nodes.push(buildNode('p', 'mb-1 text-sm text-slate-800 font-semibold text-center px-4', files.length + ' photo(s) prête(s)'));
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

            const villeInput = document.getElementById('ville');
            const villeResults = document.getElementById('ville-results');

            if(villeInput && villeResults) {
                villeInput.addEventListener('input', function() {
                    const query = this.value.trim().slice(0, 60);
                    
                    if (query.length >= 2) {
                        const isNumeric = /^\d+$/.test(query);
                        const url = isNumeric 
                            ? `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(query)}&boost=population&limit=5`
                            : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&boost=population&limit=5`;

                        fetch(url)
                            .then(response => {
                                if (!response.ok) throw new Error('HTTP ' + response.status);
                                return response.json();
                            })
                            .then(data => {
                                villeResults.replaceChildren();
                                if (Array.isArray(data) && data.length > 0) {
                                    data.forEach(city => {
                                        const li = document.createElement('li');
                                        li.className = 'px-4 py-3 hover:bg-teal-light cursor-pointer text-sm text-slate-700 border-b border-gray-100 last:border-0';
                                        
                                        // Récupération correcte du premier code postal du tableau
                                        const cp = (city.codesPostaux && city.codesPostaux.length > 0) ? city.codesPostaux[0] : '';
                                        
                                        li.textContent = `${cp} - ${city.nom}`;
                                        
                                        li.addEventListener('click', function() {
                                            villeInput.value = `${cp} ${city.nom}`;
                                            villeResults.classList.add('hidden');
                                        });
                                        
                                        villeResults.appendChild(li);
                                    });
                                    villeResults.classList.remove('hidden');
                                } else {
                                    villeResults.classList.add('hidden');
                                }
                            })
                            .catch(error => console.error('Erreur API Geo:', error));
                    } else {
                        villeResults.classList.add('hidden');
                    }
                });

                document.addEventListener('click', function(e) {
                    if (e.target !== villeInput && e.target !== villeResults) {
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
                title: "Le bon geste à Mazamet : services à la personne à domicile",
                description: "Jardinage, petit bricolage et services à la personne à Mazamet et alentours. Devis gratuit, 50 % de crédit d'impôt immédiat."
            },
            'services': {
                url: 'https://le-bon-geste.fr/catalogue',
                title: "Catalogue des prestations : services à la personne | Le bon geste",
                description: "Catalogue des prestations à Mazamet : taille de haies, tonte, petit bricolage, entretien des terrasses et assistance à domicile. Devis gratuit."
            },
            'sap': {
                url: 'https://le-bon-geste.fr/avantage-sap',
                title: "50 % de crédit d'impôt immédiat avec l'Avance Urssaf | Le bon geste",
                description: "Comment fonctionne l'Avance Immédiate de l'Urssaf : vous ne réglez que la moitié de la facture, le crédit d'impôt est déduit tout de suite, sans avance de trésorerie."
            },
            'guide': {
                url: 'https://le-bon-geste.fr/guide-urssaf',
                title: "Guide Avance Immédiate Urssaf | Le bon geste à Mazamet",
                description: "Guide simple pour comprendre et activer l'Avance Immédiate Urssaf avec un organisme de services à la personne à Mazamet."
            },
            'devis': {
                url: 'https://le-bon-geste.fr/devis',
                title: "Demander un devis gratuit | Le bon geste, Mazamet",
                description: "Décrivez votre projet de jardinage ou de service à domicile : réponse sous 24 à 48 h, devis gratuit et sans engagement."
            },
            'contact': {
                url: 'https://le-bon-geste.fr/contact',
                title: "Contact | Le bon geste, Mazamet",
                description: "Téléphone, email et devis gratuit : contactez Le bon geste pour vos services à la personne à Mazamet et ses environs."
            },
            'faq': {
                url: 'https://le-bon-geste.fr/faq',
                title: "FAQ services à la personne à Mazamet | Le bon geste",
                description: "Réponses aux questions fréquentes sur les services à la personne, le devis gratuit et l'Avance Immédiate Urssaf à Mazamet."
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
            
            // Fermer le menu mobile s'il est ouvert
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
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
        }

        // ==================== GESTION DU CONSENTEMENT COOKIES ====================
        const COOKIE_CONSENT_KEY = 'lbg_cookie_consent';
        const COOKIE_CONSENT_DAYS = 182; // ~6 mois, recommandation CNIL

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

        // Point d'accroche : appelée à chaque chargement avec le consentement courant.
        // Si un jour tu ajoutes Google Analytics ou un autre outil de mesure,
        // c'est ICI qu'il faut charger dynamiquement le script, uniquement si data.analytics === true.
        function applyCookieConsent(data) {
            if (data && data.analytics) {
                // Exemple (à décommenter et compléter le jour où tu ajoutes un outil de mesure) :
                // const s = document.createElement('script');
                // s.src = 'https://www.googletagmanager.com/gtag/js?id=TON_ID';
                // s.async = true;
                // document.head.appendChild(s);
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

        // Gestion du retour arrière / avant du navigateur (popstate)
        // Fait correspondre un chemin d'URL à un identifiant de page connu.
        // Toute URL qui ne correspond à rien de connu tombe sur la 404,
        // plutôt que de rediriger silencieusement vers l'accueil.
        function resolvePathToPageId(path) {
            if (path === '/' || path === '' || path.indexOf('index.html') !== -1) return 'accueil';
            if (path.indexOf('catalogue') !== -1) return 'services';
            if (path.indexOf('avantage-sap') !== -1) return 'sap';
            if (path.indexOf('guide-urssaf') !== -1) return 'guide';
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
            // Retour de FormSubmit après l'envoi d'un devis : https://le-bon-geste.fr/?envoye=1#envoye
            // (accueil + paramètre, plutôt que /merci qui dépend du routage de l'hébergeur ;
            //  le « #envoye » survit même si l'hébergeur supprime le « ?envoye=1 » en redirigeant)
            const confirmed = new URLSearchParams(window.location.search).get('envoye') === '1'
                           || window.location.hash === '#envoye';
            if (confirmed) {
                try { history.replaceState(null, '', '/'); } catch (e) { /* sans gravité */ }
                navigateTo(null, 'merci');
                return;
            }
            navigateTo(null, resolvePathToPageId(window.location.pathname));
        }

        // Le script est chargé avec « defer » : la page est déjà lue, on peut donc afficher la bonne page tout de suite
        // (plus fiable que l'évènement « load », qui peut être retardé ou perdu selon les réglages de l'hébergeur).
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialRoute);
        } else {
            initialRoute();
        }

        // ==================== ÉVÈNEMENTS (remplacent les anciens onclick="..." dans le HTML) ====================
        document.addEventListener('click', function(event) {
            const el = event.target.closest('[data-nav], [data-nav-service], [data-action]');
            if (!el) return;
            if (el.hasAttribute('data-nav')) {
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

        const photoInput = document.getElementById('dropzone-file');
        if (photoInput) {
            photoInput.addEventListener('change', function() { updateFileName(photoInput); });
        }
