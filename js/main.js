document.addEventListener('DOMContentLoaded', function () {

    /* ----------------------------------------
       Hamburger Menu
    ---------------------------------------- */
    const menuToggle = document.getElementById('menuToggle');
    const navigation = document.getElementById('navigation');

    if (menuToggle && navigation) {
        menuToggle.addEventListener('click', () => {
            navigation.classList.toggle('active');
            menuToggle.classList.toggle('active');
            const isExpanded = menuToggle.classList.contains('active');
            menuToggle.setAttribute('aria-expanded', isExpanded);
        });

        const navLinks = navigation.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navigation.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!navigation.contains(e.target) && !menuToggle.contains(e.target)) {
                navigation.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /* ----------------------------------------
       Header Scroll Effect
    ---------------------------------------- */
    const header = document.querySelector('.site-header');

    if (header) {
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const currentScroll = window.scrollY;
            if (currentScroll > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            lastScroll = currentScroll;
        }, { passive: true });
    }

    /* ----------------------------------------
       Scroll Animation (IntersectionObserver)
    ---------------------------------------- */
    const scrollElements = document.querySelectorAll('.scroll-animate');

    if (scrollElements.length > 0) {
        const observerOptions = {
            threshold: 0.08,
            rootMargin: '0px 0px -40px 0px'
        };

        const scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    // Once visible, stop observing for performance
                    scrollObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);

        scrollElements.forEach(el => {
            scrollObserver.observe(el);
        });
    }

    /* ----------------------------------------
       Blog Accordion
    ---------------------------------------- */
    const blogHeaders = document.querySelectorAll('.blog-header');

    if (blogHeaders.length > 0) {
        blogHeaders.forEach(headerEl => {
            headerEl.addEventListener('click', () => {
                const content = headerEl.nextElementSibling;
                const isOpen = headerEl.classList.contains('active');

                // Close all others (optional single-open accordion)
                // Uncomment below for single-accordion behavior:
                // blogHeaders.forEach(h => {
                //     h.classList.remove('active');
                //     h.nextElementSibling.classList.remove('active');
                // });

                if (isOpen) {
                    headerEl.classList.remove('active');
                    content.classList.remove('active');
                } else {
                    headerEl.classList.add('active');
                    content.classList.add('active');
                }
            });
        });
    }

    /* ----------------------------------------
       Blog Filter
    ---------------------------------------- */
    const filterBtns = document.querySelectorAll('.filter-btn');
    const blogItems = document.querySelectorAll('.blog-item');

    if (filterBtns.length > 0 && blogItems.length > 0) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const filterValue = btn.getAttribute('data-filter');

                blogItems.forEach(item => {
                    item.classList.remove('fade-in');

                    if (filterValue === 'all' || item.getAttribute('data-category') === filterValue) {
                        item.classList.remove('hidden');
                        requestAnimationFrame(() => {
                            item.classList.add('fade-in');
                        });
                    } else {
                        item.classList.add('hidden');
                    }
                });
            });
        });
    }

});
