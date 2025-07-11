document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.getElementById('navToggle');
    const mobileNav = document.getElementById('mobileNav');
    const navIcon = navToggle.querySelector('.nav-toggle__icon');

    if (navToggle && mobileNav) {
        navToggle.addEventListener('click', () => {
            // ARIA属性を切り替えて、現在の状態（開いているか閉じているか）を取得
            const isOpened = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', !isOpened);

            // メニューの表示・非表示を切り替え
            mobileNav.classList.toggle('scale-y-100');
            mobileNav.classList.toggle('opacity-100');
            mobileNav.classList.toggle('scale-y-0');
            mobileNav.classList.toggle('opacity-0');
            
            // ハンバーガーアイコンを「×」印にアニメーション
            navIcon.classList.toggle('opened');
        });
    }
});
