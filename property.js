document.addEventListener('DOMContentLoaded', function() {
    const API_BASE_URL = window.location.origin;
    const propertyId = new URLSearchParams(window.location.search).get('id');
    const detailContainer = document.getElementById('propertyDetail');
    const inquiryForm = document.getElementById('propertyInquiryForm');
    const inquiryStatus = document.getElementById('propertyInquiryStatus');

    function setInquiryStatus(message, type = '') {
        if (!inquiryStatus) return;
        inquiryStatus.className = `form-status${type ? ` ${type}` : ''}`;
        inquiryStatus.textContent = message;
    }

    async function trackEvent(eventType, metadata = {}) {
        try {
            await fetch(`${API_BASE_URL}/api/analytics/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType,
                    page: window.location.pathname,
                    propertyId,
                    metadata
                })
            });
        } catch (_error) {
            // Non-blocking analytics call
        }
    }

    async function loadProperty() {
        if (!propertyId) {
            detailContainer.innerHTML = '<p>Invalid property id.</p>';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/properties/${encodeURIComponent(propertyId)}`);
            if (!response.ok) {
                throw new Error('Property not found.');
            }
            const property = await response.json();
            document.title = `${property.title} | ADEKANLE AND ADEKANLE REAL ESTATE`;

            detailContainer.innerHTML = `
                <div class="property-image">
                    <img src="${property.image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80'}" alt="${property.title}">
                    <span class="property-type">${property.listingType || 'For Sale'}</span>
                </div>
                <div class="property-details">
                    <h1>${property.title}</h1>
                    <p><i class="fas fa-map-marker-alt"></i> ${property.location}</p>
                    <div class="property-features">
                        <span><i class="fas fa-bed"></i> ${property.beds || 0} Beds</span>
                        <span><i class="fas fa-bath"></i> ${property.baths || 0} Baths</span>
                        <span><i class="fas fa-ruler-combined"></i> ${property.size || 'N/A'} sqft</span>
                    </div>
                    <div class="property-price"><strong>${property.price || 'Price on request'}</strong></div>
                    <p>Category: ${property.category || 'N/A'}</p>
                    <p>${property.description || 'No additional description provided.'}</p>
                </div>
            `;

            const schema = {
                '@context': 'https://schema.org',
                '@type': 'RealEstateListing',
                name: property.title,
                description: property.description || `Property in ${property.location}`,
                url: window.location.href,
                image: property.image,
                offers: {
                    '@type': 'Offer',
                    priceCurrency: 'USD',
                    price: property.numericPrice || 0
                }
            };
            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.textContent = JSON.stringify(schema);
            document.head.appendChild(script);
            trackEvent('property_detail_view', { propertyId });
        } catch (error) {
            detailContainer.innerHTML = `<p>${error.message}</p>`;
        }
    }

    if (inquiryForm) {
        inquiryForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            setInquiryStatus('Sending inquiry...');

            const formData = new FormData(inquiryForm);
            const payload = {
                propertyId,
                name: formData.get('name')?.toString().trim(),
                email: formData.get('email')?.toString().trim(),
                phone: formData.get('phone')?.toString().trim(),
                message: formData.get('message')?.toString().trim(),
                source: 'property-detail-page'
            };

            try {
                const response = await fetch(`${API_BASE_URL}/api/inquiries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(body.error || 'Could not submit inquiry right now.');
                }

                setInquiryStatus('Inquiry sent successfully. Our team will contact you shortly.', 'success');
                inquiryForm.reset();
                trackEvent('inquiry_submitted', { propertyId });
            } catch (error) {
                setInquiryStatus(error.message || 'Unable to submit inquiry.', 'error');
            }
        });
    }

    loadProperty();
});
