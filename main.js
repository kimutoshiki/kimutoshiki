document.addEventListener('DOMContentLoaded', function() {

    // --- スライドショー機能 ---
    const slides = document.querySelectorAll('#slideshow .slide');
    let currentSlide = 0;
    
    if (slides.length > 0) {
        // 5秒ごとにスライドを切り替え
        setInterval(nextSlide, 5000); 
    }

    function nextSlide() {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }

    // --- モバイルナビゲーション機能 ---
    const navToggle = document.getElementById('navToggle');
    const mobileNav = document.getElementById('mobileNav');

    if (navToggle && mobileNav) {
        navToggle.addEventListener('click', () => {
            // ARIA属性を切り替えて、現在の状態（開いているか閉じているか）を取得
            const isOpened = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', !isOpened);

            // Tailwindのクラスを切り替えて表示・非表示をアニメーション
            mobileNav.classList.toggle('scale-y-0');
            mobileNav.classList.toggle('opacity-0');
            mobileNav.classList.toggle('scale-y-100');
            mobileNav.classList.toggle('opacity-100');
        });
    }
});
