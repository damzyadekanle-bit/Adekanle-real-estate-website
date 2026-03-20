document.addEventListener('DOMContentLoaded', function() {
    const propertiesGrid = document.querySelector('.properties-grid');
    const addPropertyForm = document.getElementById('addPropertyForm');
    const addPropertyStatus = document.getElementById('addPropertyStatus');
    const adminListStatus = document.getElementById('adminListStatus');
    const adminPropertiesList = document.getElementById('adminPropertiesList');

    const API_BASE_URL = window.location.origin;
    const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/properties`;
    const PROPERTIES_ENDPOINT = `${API_BASE_URL}/api/properties`;
    const ADMIN_UPDATE_ENDPOINT = `${API_BASE_URL}/api/admin/properties`;
    const ANALYTICS_ENDPOINT = `${API_BASE_URL}/api/analytics/events`;

    const ADMIN_API_KEY_STORAGE_KEY = 'adekanle_admin_api_key';

    let activeFilters = {
        category: 'all',
        q: '',
        location: '',
        listingType: '',
        beds: '',
        minPrice: '',
        maxPrice: '',
        page: 1,
        limit: 12
    };

    function trackEvent(eventType, metadata = {}) {
        fetch(ANALYTICS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eventType,
                page: window.location.pathname,
                propertyId: metadata.propertyId || null,
                metadata
            })
        }).catch(() => {
            // Non-blocking analytics call.
        });
    }

    function hideUploadNavLinks() {
        document.querySelectorAll('.nav-links a').forEach((link) => {
            if ((link.textContent || '').trim().toLowerCase() === 'upload property') {
                link.remove();
            }
        });
    }

    function createElement(tag, className, textContent) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent !== undefined && textContent !== null) element.textContent = textContent;
        return element;
    }

    function toPropertyDetailsUrl(property) {
        return `property.html?id=${encodeURIComponent(property.id)}`;
    }

    function createPropertyCard(property) {
        const card = createElement('div', 'property-card');
        card.setAttribute('data-category', property.category || 'house');
        card.setAttribute('data-db-id', property.id || '');

        const imageWrap = createElement('div', 'property-image');
        const img = createElement('img');
        img.src = property.image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
        img.alt = property.title || 'Property image';
        imageWrap.appendChild(img);

        const type = createElement('span', 'property-type', property.listingType || 'For Sale');
        imageWrap.appendChild(type);

        const details = createElement('div', 'property-details');
        details.appendChild(createElement('h3', '', property.title || 'Untitled Property'));

        const location = createElement('p');
        const icon = createElement('i', 'fas fa-map-marker-alt');
        location.appendChild(icon);
        location.appendChild(document.createTextNode(` ${property.location || 'Location not set'}`));
        details.appendChild(location);

        const features = createElement('div', 'property-features');
        const beds = createElement('span');
        beds.innerHTML = `<i class="fas fa-bed"></i> ${property.beds || 0} Beds`;
        const baths = createElement('span');
        baths.innerHTML = `<i class="fas fa-bath"></i> ${property.baths || 0} Baths`;
        const size = createElement('span');
        size.innerHTML = `<i class="fas fa-ruler-combined"></i> ${property.size || 'N/A'} sqft`;
        features.append(beds, baths, size);
        details.appendChild(features);

        const priceRow = createElement('div', 'property-price');
        priceRow.appendChild(createElement('strong', '', property.price || 'Price on request'));

        const viewLink = createElement('a', 'btn-view', 'View Details');
        viewLink.href = toPropertyDetailsUrl(property);
        viewLink.dataset.propertyId = property.id || '';
        viewLink.addEventListener('click', () => trackEvent('view_details_click', { propertyId: property.id }));

        priceRow.appendChild(viewLink);
        details.appendChild(priceRow);

        card.append(imageWrap, details);
        return card;
    }

    function setStatus(element, message, type = '') {
        if (!element) return;
        element.className = `form-status${type ? ` ${type}` : ''}`;
        element.textContent = message;
    }

    function getAdminApiKey() {
        if (!addPropertyForm) return '';
        const input = addPropertyForm.querySelector('input[name="adminApiKey"]');
        return input ? input.value.trim() : '';
    }

    function getAuthHeaders({ includeJson = false } = {}) {
        const headers = {};
        if (includeJson) headers['Content-Type'] = 'application/json';
        const adminApiKey = getAdminApiKey();
        if (adminApiKey) headers['x-admin-api-key'] = adminApiKey;
        return headers;
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Could not read image file.'));
            reader.readAsDataURL(file);
        });
    }

    function cacheAdminKeyIfRequested(adminKey) {
        if (!addPropertyForm || !adminKey) return;
        const rememberField = addPropertyForm.querySelector('input[name="rememberAdminKey"]');
        if (rememberField?.checked) {
            localStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, adminKey);
            return;
        }
        localStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY);
    }

    function prefillAdminApiKey() {
        if (!addPropertyForm) return;
        const savedKey = localStorage.getItem(ADMIN_API_KEY_STORAGE_KEY);
        if (!savedKey) return;
        const keyInput = addPropertyForm.querySelector('input[name="adminApiKey"]');
        const rememberField = addPropertyForm.querySelector('input[name="rememberAdminKey"]');
        if (keyInput) keyInput.value = savedKey;
        if (rememberField) rememberField.checked = true;
    }

    function buildAdminPayloadFromPrompt(property) {
        const title = window.prompt('Title', property.title || '');
        if (title === null) return null;
        const location = window.prompt('Location', property.location || '');
        if (location === null) return null;
        const price = window.prompt('Price', property.price || '');
        if (price === null) return null;
        const beds = window.prompt('Beds', property.beds ?? 0);
        if (beds === null) return null;
        const baths = window.prompt('Baths', property.baths ?? 0);
        if (baths === null) return null;
        const size = window.prompt('Size (sqft)', property.size || '');
        if (size === null) return null;
        const description = window.prompt('Description (optional)', property.description || '');
        if (description === null) return null;
        const listingType = window.prompt('Listing Type (For Sale / For Rent / Commercial)', property.listingType || '');
        if (listingType === null) return null;
        const category = window.prompt('Category (house / apartment / commercial / land / joint-venture)', property.category || '');
        if (category === null) return null;
        const image = window.prompt('Image URL (optional)', property.image || '');
        if (image === null) return null;

        return { title, location, price, beds, baths, size, description, listingType, category, image };
    }

    function renderAdminProperties(properties) {
        if (!adminPropertiesList) return;
        adminPropertiesList.innerHTML = '';

        if (!Array.isArray(properties) || properties.length === 0) {
            adminPropertiesList.innerHTML = '<p class="admin-property-meta">No properties found yet.</p>';
            return;
        }

        properties.forEach((property) => {
            const item = createElement('div', 'admin-property-item');
            const title = createElement('strong', '', property.title || 'Untitled Property');
            const meta = createElement(
                'p',
                'admin-property-meta',
                `${property.location || 'No location'} • ${property.price || 'No price'} • ${property.listingType || 'N/A'} • ${property.category || 'N/A'}`
            );
            const description = createElement('p', 'admin-property-meta', property.description || 'No description provided.');
            const actions = createElement('div', 'admin-property-actions');
            const editButton = createElement('button', 'btn-secondary', 'Edit');
            editButton.type = 'button';
            const deleteButton = createElement('button', 'btn-danger', 'Delete');
            deleteButton.type = 'button';

            editButton.addEventListener('click', async function() {
                if (!getAdminApiKey()) {
                    setStatus(adminListStatus, 'Enter Admin API key to edit properties.', 'error');
                    return;
                }

                const updatedProperty = buildAdminPayloadFromPrompt(property);
                if (!updatedProperty) return;

                try {
                    const response = await fetch(`${ADMIN_UPDATE_ENDPOINT}/${property.id}`, {
                        method: 'PUT',
                        headers: getAuthHeaders({ includeJson: true }),
                        body: JSON.stringify(updatedProperty)
                    });
                    const responseBody = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        throw new Error(responseBody.error || 'Failed to update property.');
                    }
                    setStatus(adminListStatus, 'Property updated successfully.', 'success');
                    await refreshAdminProperties();
                    await loadPropertiesFromApi();
                } catch (error) {
                    setStatus(adminListStatus, error.message || 'Failed to update property.', 'error');
                }
            });

            deleteButton.addEventListener('click', async function() {
                if (!getAdminApiKey()) {
                    setStatus(adminListStatus, 'Enter Admin API key to delete properties.', 'error');
                    return;
                }
                const confirmed = window.confirm(`Delete "${property.title || 'this property'}"?`);
                if (!confirmed) return;

                try {
                    const response = await fetch(`${ADMIN_UPDATE_ENDPOINT}/${property.id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    if (!response.ok) {
                        const responseBody = await response.json().catch(() => ({}));
                        throw new Error(responseBody.error || 'Failed to delete property.');
                    }
                    setStatus(adminListStatus, 'Property deleted successfully.', 'success');
                    await refreshAdminProperties();
                    await loadPropertiesFromApi();
                } catch (error) {
                    setStatus(adminListStatus, error.message || 'Failed to delete property.', 'error');
                }
            });

            actions.append(editButton, deleteButton);
            item.append(title, meta, description, actions);
            adminPropertiesList.appendChild(item);
        });
    }

    async function refreshAdminProperties() {
        if (!adminPropertiesList) return;
        try {
            const response = await fetch(PROPERTIES_ENDPOINT);
            if (!response.ok) {
                throw new Error('Failed to load property list.');
            }
            const payload = await response.json();
            renderAdminProperties(Array.isArray(payload) ? payload : payload.data || []);
        } catch (error) {
            setStatus(adminListStatus, error.message || 'Unable to load properties.', 'error');
        }
    }

    function renderProperties(properties) {
        if (!propertiesGrid) return;
        propertiesGrid.innerHTML = '';
        properties.forEach((property) => propertiesGrid.appendChild(createPropertyCard(property)));
    }

    async function loadPropertiesFromApi() {
        if (!propertiesGrid) return;

        const params = new URLSearchParams();
        if (activeFilters.category && activeFilters.category !== 'all') params.set('category', activeFilters.category);
        if (activeFilters.q) params.set('q', activeFilters.q);
        if (activeFilters.location) params.set('location', activeFilters.location);
        if (activeFilters.listingType) params.set('listingType', activeFilters.listingType);
        if (activeFilters.beds) params.set('beds', activeFilters.beds);
        if (activeFilters.minPrice) params.set('minPrice', activeFilters.minPrice);
        if (activeFilters.maxPrice) params.set('maxPrice', activeFilters.maxPrice);
        params.set('page', String(activeFilters.page));
        params.set('limit', String(activeFilters.limit));

        try {
            const response = await fetch(`${PROPERTIES_ENDPOINT}?${params.toString()}`);
            if (!response.ok) return;
            const payload = await response.json();
            const items = Array.isArray(payload) ? payload : payload.data || [];
            renderProperties(items);

            const paginationSummary = document.getElementById('paginationSummary');
            if (paginationSummary && payload.pagination) {
                const { page, totalPages, total } = payload.pagination;
                paginationSummary.textContent = `Page ${page} of ${Math.max(totalPages, 1)} • ${total} result(s)`;
            }
        } catch (_error) {
            // Keep static listings even if API is unavailable.
        }
    }

    function syncSearchControls() {
        const listingTypeInput = document.getElementById('listingTypeFilter');
        const locationInput = document.getElementById('locationFilter');
        const bedsInput = document.getElementById('bedsFilter');
        const minPriceInput = document.getElementById('minPriceFilter');
        const maxPriceInput = document.getElementById('maxPriceFilter');
        const keywordInput = document.getElementById('keywordFilter');

        activeFilters.listingType = listingTypeInput?.value || '';
        activeFilters.location = locationInput?.value || '';
        activeFilters.beds = bedsInput?.value || '';
        activeFilters.minPrice = minPriceInput?.value || '';
        activeFilters.maxPrice = maxPriceInput?.value || '';
        activeFilters.q = keywordInput?.value || '';
        activeFilters.page = 1;
    }

    hideUploadNavLinks();
    prefillAdminApiKey();
    loadPropertiesFromApi();
    refreshAdminProperties();

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach((button) => {
        button.addEventListener('click', function() {
            filterButtons.forEach((btn) => btn.classList.remove('active'));
            this.classList.add('active');
            activeFilters.category = this.getAttribute('data-filter') || 'all';
            activeFilters.page = 1;
            trackEvent('category_filter', { category: activeFilters.category });
            loadPropertiesFromApi();
        });
    });

    const searchButton = document.querySelector('.btn-search');
    if (searchButton) {
        searchButton.addEventListener('click', function() {
            syncSearchControls();
            trackEvent('listing_search', { ...activeFilters });
            loadPropertiesFromApi();
        });
    }

    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function() {
            activeFilters.page = Math.max(activeFilters.page - 1, 1);
            loadPropertiesFromApi();
        });
    }
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function() {
            activeFilters.page += 1;
            loadPropertiesFromApi();
        });
    }

    if (addPropertyForm) {
        addPropertyForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            setStatus(addPropertyStatus, 'Uploading property...');

            const formData = new FormData(addPropertyForm);
            const adminApiKey = formData.get('adminApiKey')?.toString().trim();
            const property = {
                title: formData.get('title')?.toString().trim(),
                location: formData.get('location')?.toString().trim(),
                price: formData.get('price')?.toString().trim(),
                beds: formData.get('beds')?.toString().trim(),
                baths: formData.get('baths')?.toString().trim(),
                size: formData.get('size')?.toString().trim(),
                description: formData.get('description')?.toString().trim(),
                listingType: formData.get('listingType')?.toString().trim(),
                category: formData.get('category')?.toString().trim(),
                image: formData.get('image')?.toString().trim()
            };
            const imageFile = addPropertyForm.querySelector('input[name="imageFile"]')?.files?.[0];
            let imageData = '';
            if (imageFile) {
                try {
                    imageData = await fileToDataUrl(imageFile);
                } catch (error) {
                    setStatus(addPropertyStatus, error.message || 'Unable to read selected image.', 'error');
                    return;
                }
            }

            if (!adminApiKey) {
                setStatus(addPropertyStatus, 'Enter Admin API key.', 'error');
                return;
            }

            try {
                const response = await fetch(UPLOAD_ENDPOINT, {
                    method: 'POST',
                    headers: getAuthHeaders({ includeJson: true }),
                    body: JSON.stringify({
                        ...property,
                        imageData,
                        imageName: imageFile?.name || ''
                    })
                });

                const body = await response.json().catch(() => ({}));

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Unauthorized: admin API key is incorrect.');
                    }
                    if (response.status === 400) {
                        throw new Error(body.error || 'Validation failed. Check required fields.');
                    }
                    throw new Error(body.error || 'Failed to upload property.');
                }

                if (adminApiKey) {
                    cacheAdminKeyIfRequested(adminApiKey);
                }
                addPropertyForm.reset();
                prefillAdminApiKey();
                setStatus(addPropertyStatus, 'Property uploaded and saved to the database.', 'success');
                setStatus(adminListStatus, 'Property list refreshed.', 'success');
                await refreshAdminProperties();
                await loadPropertiesFromApi();
            } catch (error) {
                setStatus(addPropertyStatus, error.message || 'Failed to upload property.', 'error');
            }
        });
    }

    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function() {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            if (navLinks.style.display === 'flex') {
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.background = 'white';
                navLinks.style.padding = '2rem';
                navLinks.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)';
            }
        });
    }

    const contactForm = document.getElementById('contactForm');
    const formStatus = document.getElementById('formStatus');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const endpoint = contactForm.getAttribute('action') || '';
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalText = submitButton ? submitButton.textContent : '';

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Sending...';
            }

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json'
                    },
                    body: new FormData(contactForm)
                });

                const responseBody = await response.json().catch(() => null);

                if (!response.ok) {
                    const apiErrors = Array.isArray(responseBody?.errors)
                        ? responseBody.errors.map((error) => error.message).join(' ')
                        : '';

                    let errorMessage = apiErrors || 'Form submission failed.';

                    if (/activate|verify|confirm/i.test(errorMessage)) {
                        errorMessage += ' Please check Formspree for an activation/verification email and confirm the form.';
                    }

                    if (/domain|origin|allowed/i.test(errorMessage)) {
                        errorMessage += ' Add your site domain in Formspree project settings.';
                    }

                    throw new Error(errorMessage);
                }

                if (formStatus) {
                    formStatus.className = 'form-status success';
                    formStatus.textContent = 'Thanks! Your enquiry has been received. We will contact you shortly.';
                }
                trackEvent('contact_form_submit', { source: 'homepage' });
                contactForm.reset();
            } catch (error) {
                if (formStatus) {
                    formStatus.className = 'form-status error';
                    formStatus.textContent = error.message || 'Unable to send right now. Please call or email us directly.';
                }
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalText;
                }
            }
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });

                if (window.innerWidth <= 768 && navLinks) {
                    navLinks.style.display = 'none';
                }
            }
        });
    });

    trackEvent('page_view', { page: window.location.pathname });
});
