document.addEventListener('DOMContentLoaded', function() {
    
    /* ----------------------------------------
       ハンバーガーメニュー制御
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

        navigation.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navigation.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* ----------------------------------------
       スクロール時のヘッダー制御
    ---------------------------------------- */
    const header = document.querySelector('.site-header');
    
    if (header) {
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 50);
        }, { passive: true });
    }

    /* ----------------------------------------
       ブログページのアコーディオン制御
    ---------------------------------------- */
    const blogHeaders = document.querySelectorAll('.blog-header');
    
    blogHeaders.forEach(hdr => {
        hdr.addEventListener('click', () => {
            const content = hdr.nextElementSibling;
            hdr.classList.toggle('active');
            content.classList.toggle('active');
        });
    });

    /* ----------------------------------------
       ブログページのフィルター制御
    ---------------------------------------- */
    const filterBtns = document.querySelectorAll('.filter-btn');
    const blogItems = document.querySelectorAll('.blog-item');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            blogItems.forEach(item => {
                item.style.display = (filter === 'all' || item.dataset.category === filter) ? '' : 'none';
            });
        });
    });

    /* ----------------------------------------
       スクロールアニメーション制御（全ページ共通）
    ---------------------------------------- */
    const scrollElements = document.querySelectorAll('.scroll-animate');
    
    if (scrollElements.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        }, { threshold: 0.1 });

        scrollElements.forEach(el => observer.observe(el));
    }

});
