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
            
            // アクセシビリティ対応
            const isExpanded = menuToggle.classList.contains('active');
            menuToggle.setAttribute('aria-expanded', isExpanded);
        });

        // メニューリンクをクリックしたら閉じる（SP時）
        const navLinks = navigation.querySelectorAll('a');
        navLinks.forEach(link => {
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
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }

    /* ----------------------------------------
       ブログページのアコーディオン制御
    ---------------------------------------- */
    const blogHeaders = document.querySelectorAll('.blog-header');
    
    if (blogHeaders.length > 0) {
        blogHeaders.forEach(header => {
            header.addEventListener('click', () => {
                // クリックされた記事の内容を取得
                const content = header.nextElementSibling;
                
                // クラスを切り替え（CSSでアニメーション制御）
                header.classList.toggle('active');
                content.classList.toggle('active');
            });
        });
    }
});
