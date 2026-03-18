// Property Filtering
document.addEventListener('DOMContentLoaded', function() {
    const propertiesGrid = document.querySelector('.properties-grid');
    const API_BASE_URL = "https://adekanle-real-estate-website.onrender.com";
    const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/properties`;
    const PROPERTIES_ENDPOINT = `${API_BASE_URL}/api/properties`;
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
        const viewBtn = createElement('button', 'btn-view', 'View Details');
        priceRow.appendChild(viewBtn);
        details.appendChild(priceRow);

        card.append(imageWrap, details);
        return card;
    }
    async function loadPropertiesFromApi() {
        if (!propertiesGrid) return;

        try {
            const response = await fetch(PROPERTIES_ENDPOINT);
            if (!response.ok) return;
            const properties = await response.json();
            properties.slice().reverse().forEach((property) => propertiesGrid.prepend(createPropertyCard(property)));
        } catch (error) {
            // Keep static listings even if API is unavailable.
        }
    }

    hideUploadNavLinks();
    loadPropertiesFromApi();

    // Filter properties
    const filterButtons = document.querySelectorAll('.filter-btn');

    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            const filterValue = this.getAttribute('data-filter');
            const propertyCards = document.querySelectorAll('.property-card');

            propertyCards.forEach(card => {
                const categories = (card.getAttribute('data-category') || '').split(/\s+/);
                if (filterValue === 'all' || categories.includes(filterValue)) {
                    card.style.display = 'block';
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1)';
                    }, 100);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 300);
                }
            });
        });
    });

    // Add property form (admin API)
    const addPropertyForm = document.getElementById('addPropertyForm');
    const addPropertyStatus = document.getElementById('addPropertyStatus');

    if (addPropertyForm) {
        addPropertyForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (addPropertyStatus) {
                addPropertyStatus.className = 'form-status';
                addPropertyStatus.textContent = 'Uploading property...';
            }

            const formData = new FormData(addPropertyForm);
            const property = {
                title: formData.get('title')?.toString().trim(),
                location: formData.get('location')?.toString().trim(),
                price: formData.get('price')?.toString().trim(),
                beds: formData.get('beds')?.toString().trim(),
                baths: formData.get('baths')?.toString().trim(),
                size: formData.get('size')?.toString().trim(),
                listingType: formData.get('listingType')?.toString().trim(),
                category: formData.get('category')?.toString().trim(),
                image: formData.get('image')?.toString().trim(),
                adminApiKey: formData.get('adminApiKey')?.toString().trim()
            };

            if (!property.adminApiKey) {
                if (addPropertyStatus) {
                    addPropertyStatus.className = 'form-status error';
                    addPropertyStatus.textContent = 'Admin API key is required.';
                }
                return;
            }

            try {
                const response = await fetch(UPLOAD_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-api-key': property.adminApiKey
                    },
                    body: JSON.stringify({
                        title: property.title,
                        location: property.location,
                        price: property.price,
                        beds: property.beds,
                        baths: property.baths,
                        size: property.size,
                        listingType: property.listingType,
                        category: property.category,
                        image: property.image
                    })
                });

                const body = await response.json().catch(() => ({}));

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Unauthorized: admin API key is incorrect. Set ADMIN_API_KEY on the server and use the same value here.');
                    }
                    if (response.status === 400) {
                        throw new Error(body.error || 'Validation failed. Check required fields.');
                    }
                    throw new Error(body.error || 'Failed to upload property. Check backend CORS, endpoint, and Render server logs.');
                }

                if (propertiesGrid) {
                    propertiesGrid.prepend(createPropertyCard(body));
                }
                addPropertyForm.reset();
                if (addPropertyStatus) {
                    addPropertyStatus.className = 'form-status success';
                    addPropertyStatus.textContent = 'Property uploaded and saved to the database.';
                }
            } catch (error) {
                if (addPropertyStatus) {
                    addPropertyStatus.className = 'form-status error';
                    addPropertyStatus.textContent = error.message || 'Failed to upload property.';
                }
            }
        });
    }

    // Mobile menu toggle
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

    // Contact form submission
    const contactForm = document.getElementById('contactForm');
    const formStatus = document.getElementById('formStatus');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const endpoint = contactForm.getAttribute('action') || '';

            if (!endpoint.includes('formspree.io/f/')) {
                if (formStatus) {
                    formStatus.className = 'form-status error';
                    formStatus.textContent = 'Form endpoint looks invalid. Update the form action URL in index.html.';
                }
                return;
            }

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
                        ? responseBody.errors.map(error => error.message).join(' ')
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

    // View property details (event delegation so it works for uploaded cards too)
    if (propertiesGrid) {
        propertiesGrid.addEventListener('click', function(event) {
            const viewButton = event.target.closest('.btn-view');
            if (!viewButton) return;

            const card = viewButton.closest('.property-card');
            if (!card) return;

            const propertyName = card.querySelector('h3')?.textContent || 'Property';
            const propertyPrice = card.querySelector('strong')?.textContent || 'Price on request';
            alert(`Property: ${propertyName}\nPrice: ${propertyPrice}\n\nFull details page would open here with more images, descriptions, virtual tour, and contact options.`);
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
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
});
