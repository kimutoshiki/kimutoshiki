/* =========================================================
   kimutoshiki.com — Pop Diplomacy interaction script
   ========================================================= */
(() => {
    'use strict';

    document.documentElement.classList.add('js');

    const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
    const $  = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const ready = (fn) => document.readyState !== 'loading'
        ? fn()
        : document.addEventListener('DOMContentLoaded', fn);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    ready(() => {
        initHeader();
        initScrollProgress();
        initMenu();
        initReveal();
        initSplitChars();
        initHeroSlideshow();
        initBlogAccordion();
        initBlogFilter();
        initSparkles();
        initHomeNews();
    });

    /* -------- ヘッダースクロール -------- */
    function initHeader() {
        const header = $('.site-header');
        if (!header) return;
        const update = () => header.classList.toggle('scrolled', window.scrollY > 24);
        update();
        on(window, 'scroll', update, { passive: true });
    }

    /* -------- ページ上部の進行表示 -------- */
    function initScrollProgress() {
        let frame = 0;
        const update = () => {
            frame = 0;
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
            document.documentElement.style.setProperty('--scroll-progress', progress.toFixed(4));
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        on(window, 'scroll', schedule, { passive: true });
        on(window, 'resize', schedule, { passive: true });
    }

    /* -------- ハンバーガーメニュー -------- */
    function initMenu() {
        const toggle = $('#menuToggle');
        const nav = $('#navigation');
        if (!toggle || !nav) return;

        const isMobile = () => window.innerWidth <= 1040;
        const syncInert = () => {
            nav.toggleAttribute('inert', isMobile() && !nav.classList.contains('active'));
        };
        const close = (restoreFocus = false) => {
            toggle.classList.remove('active');
            nav.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'メニューを開く');
            document.body.style.overflow = '';
            syncInert();
            if (restoreFocus && isMobile()) toggle.focus();
        };

        on(toggle, 'click', () => {
            const active = !toggle.classList.contains('active');
            toggle.classList.toggle('active', active);
            nav.classList.toggle('active', active);
            toggle.setAttribute('aria-expanded', String(active));
            toggle.setAttribute('aria-label', active ? 'メニューを閉じる' : 'メニューを開く');
            document.body.style.overflow = active ? 'hidden' : '';
            syncInert();
            if (active) $('a', nav)?.focus();
        });

        $$('a', nav).forEach(a => on(a, 'click', () => close(false)));
        on(window, 'resize', () => {
            if (!isMobile()) close();
            else syncInert();
        });
        on(document, 'keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('active')) close(true);
        });
        syncInert();
    }

    /* -------- スクロール連動表示 -------- */
    function initReveal() {
        const els = $$('.reveal');
        if (!els.length || !('IntersectionObserver' in window)) {
            els.forEach(el => el.classList.add('is-visible'));
            return;
        }
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        els.forEach(el => io.observe(el));
    }

    /* -------- 文字を一文字ずつspanに分割 (yui540風) -------- */
    function initSplitChars() {
        $$('.split-chars').forEach(el => {
            if (el.dataset.split) return;
            const text = el.textContent;
            el.setAttribute('aria-label', text);
            el.textContent = '';
            [...text].forEach((ch, i) => {
                const span = document.createElement('span');
                span.className = 'char';
                span.style.setProperty('--i', i);
                span.setAttribute('aria-hidden', 'true');
                span.textContent = ch === ' ' ? '\u00A0' : ch;
                el.appendChild(span);
            });
            el.dataset.split = '1';
        });
    }

    /* -------- ホームの背景スライドショー -------- */
    function initHeroSlideshow() {
        const root = $('[data-hero-slideshow]');
        if (!root) return;

        const slides = $$('.hero-slide', root);
        const dots = $$('.hero-slide-dot', root);
        const pause = $('[data-slide-pause]', root);
        if (slides.length < 2) return;

        let current = 0;
        let timer = 0;
        let paused = reducedMotion;

        const show = (index, userInitiated = false) => {
            current = (index + slides.length) % slides.length;
            slides.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
            dots.forEach((dot, i) => {
                const active = i === current;
                dot.classList.toggle('is-active', active);
                dot.setAttribute('aria-pressed', String(active));
            });
            if (userInitiated && !paused) restart();
        };

        const stop = () => {
            window.clearInterval(timer);
            timer = 0;
        };
        const start = () => {
            if (paused || document.hidden || timer) return;
            timer = window.setInterval(() => show(current + 1), 6500);
        };
        const restart = () => {
            stop();
            start();
        };
        const syncPauseButton = () => {
            if (!pause) return;
            pause.setAttribute('aria-label', paused ? 'スライドショーを再生' : 'スライドショーを一時停止');
            const icon = $('span', pause);
            if (icon) icon.textContent = paused ? '▶' : 'Ⅱ';
        };

        dots.forEach(dot => on(dot, 'click', () => show(Number(dot.dataset.slide || 0), true)));
        on(pause, 'click', () => {
            paused = !paused;
            syncPauseButton();
            if (paused) stop();
            else start();
        });
        on(document, 'visibilitychange', () => {
            if (document.hidden) stop();
            else start();
        });
        const controls = $('.hero-slide-controls', root);
        on(controls, 'mouseenter', stop);
        on(controls, 'mouseleave', start);

        show(0);
        syncPauseButton();
        start();
    }

    /* -------- ブログアコーディオン -------- */
    function initBlogAccordion() {
        const items = $$('.blog-item');
        if (!items.length) return;

        items.forEach((item, index) => {
            const hdr = $('.blog-header', item);
            const content = $('.blog-content', item);
            const inner = $('.blog-content-inner', item);
            if (!hdr || !content) return;

            const date = $('.blog-date', item)?.textContent.trim().replace(/\D/g, '') || 'entry';
            item.id ||= `post-${date}-${index + 1}`;

            const headerId = `${item.id}-header`;
            const contentId = `${item.id}-content`;
            hdr.id = headerId;
            hdr.setAttribute('role', 'button');
            hdr.setAttribute('tabindex', '0');
            hdr.setAttribute('aria-expanded', 'false');
            hdr.setAttribute('aria-controls', contentId);
            content.id = contentId;
            content.setAttribute('role', 'region');
            content.setAttribute('aria-labelledby', headerId);
            content.style.maxHeight = '0px';

            if (inner && !inner.textContent.trim()) {
                inner.textContent = '本文は準備中です。';
                item.classList.add('is-pending');
            }

            const setOpen = (open) => {
                hdr.classList.toggle('active', open);
                hdr.setAttribute('aria-expanded', String(open));
                content.classList.toggle('active', open);
                content.style.maxHeight = open ? `${content.scrollHeight}px` : '0px';
            };
            const toggle = () => setOpen(hdr.getAttribute('aria-expanded') !== 'true');

            on(hdr, 'click', toggle);
            on(hdr, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });

            if (location.hash === `#${item.id}`) {
                setOpen(true);
                requestAnimationFrame(() => item.scrollIntoView({ block: 'start' }));
            }
        });

        on(window, 'resize', () => {
            $$('.blog-content.active').forEach(content => {
                content.style.maxHeight = `${content.scrollHeight}px`;
            });
        }, { passive: true });
    }

    /* -------- ブログフィルター -------- */
    function initBlogFilter() {
        const btns = $$('.filter-btn');
        const items = $$('.blog-item');
        if (!btns.length || !items.length) return;

        btns.forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
            on(btn, 'click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btns.forEach(b => b.setAttribute('aria-pressed', 'false'));
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                const filter = btn.dataset.filter;
                items.forEach(item => {
                    const show = filter === 'all' || item.dataset.category === filter;
                    item.style.display = show ? '' : 'none';
                });
            });
        });
    }

    /* -------- クリック時のスパークルエフェクト -------- */
    function initSparkles() {
        if (reducedMotion) return;
        const colors = ['var(--pop-pink)', 'var(--pop-yellow)', 'var(--pop-mint)', 'var(--pop-blue)', 'var(--pop-lav)'];
        const symbols = ['✦', '✧', '★', '♡', '◆'];

        on(document, 'click', (e) => {
            // どこをクリックしてもスパークル発火 (フォーム入力欄のみ除外)
            if (!e.detail || e.target.closest('input, textarea, select')) return;

            const x = e.clientX;
            const y = e.clientY;
            const count = 6;
            for (let i = 0; i < count; i++) {
                const s = document.createElement('span');
                s.className = 'sparkle-burst';
                s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                s.style.left = x + 'px';
                s.style.top = y + 'px';
                s.style.color = colors[Math.floor(Math.random() * colors.length)];
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
                const dist = 40 + Math.random() * 50;
                s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
                s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
                s.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
                document.body.appendChild(s);
                setTimeout(() => s.remove(), 800);
            }
        });
    }

    /* -------- ホームのNews自動生成 (blog.htmlから抽出) -------- */
    async function initHomeNews() {
        const list = $('#homeNewsList');
        if (!list) return;

        const limit = parseInt(list.dataset.limit || '5', 10);

        const categoryMap = {
            notice:   { label: 'お知らせ', cls: 'cat-notice' },
            activity: { label: '活動',     cls: 'cat-activity' },
            thought:  { label: '思考',     cls: 'cat-thought' },
        };

        try {
            const res = await fetch('blog.html');
            if (!res.ok) throw new Error('blog.html fetch failed');
            const html = await res.text();

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const posts = $$('.blog-item', doc).map((item, index) => {
                const cat = item.dataset.category || 'notice';
                const date = $('.blog-date', item)?.textContent.trim() || '';
                const title = $('.blog-title', item)?.textContent.trim() || '';
                const dateKey = date.replace(/\D/g, '') || 'entry';
                const id = item.id || `post-${dateKey}-${index + 1}`;
                return { cat, date, title, id };
            }).filter(p => p.title);

            const sorted = posts.sort((a, b) => {
                const parse = (s) => {
                    const m = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
                    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
                };
                return parse(b.date) - parse(a.date);
            }).slice(0, limit);

            if (!sorted.length) {
                list.innerHTML = '<li class="news-empty">まだ記事がありません</li>';
                return;
            }

            list.innerHTML = sorted.map((p, i) => {
                const cat = categoryMap[p.cat] || categoryMap.notice;
                return `
                    <li class="news-item reveal delay-${Math.min(i + 1, 4)}">
                        <a href="blog.html#${escapeHtml(p.id)}" class="news-link">
                            <span class="news-date font-en">${escapeHtml(p.date)}</span>
                            <span class="news-cat ${cat.cls}">${cat.label}</span>
                            <span class="news-title">${escapeHtml(p.title)}</span>
                            <span class="news-arrow" aria-hidden="true">→</span>
                        </a>
                    </li>
                `;
            }).join('');

            initReveal();
        } catch (err) {
            console.warn('[home news] fallback to static content:', err);
            list.classList.add('news-fallback');
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
})();
