/* =========================================================
   kimutoshiki.com - interaction script
   ========================================================= */
(() => {
    'use strict';

    const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
    const $  = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const ready = (fn) => document.readyState !== 'loading'
        ? fn()
        : document.addEventListener('DOMContentLoaded', fn);

    ready(() => {
        initHeader();
        initMenu();
        initReveal();
        initBlogAccordion();
        initBlogFilter();
        initCursorAccent();
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

    /* -------- ハンバーガーメニュー -------- */
    function initMenu() {
        const toggle = $('#menuToggle');
        const nav = $('#navigation');
        if (!toggle || !nav) return;

        const close = () => {
            toggle.classList.remove('active');
            nav.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        on(toggle, 'click', () => {
            const active = !toggle.classList.contains('active');
            toggle.classList.toggle('active', active);
            nav.classList.toggle('active', active);
            toggle.setAttribute('aria-expanded', String(active));
            document.body.style.overflow = active ? 'hidden' : '';
        });

        $$('a', nav).forEach(a => on(a, 'click', close));
        on(window, 'resize', () => { if (window.innerWidth > 860) close(); });
        on(document, 'keydown', (e) => { if (e.key === 'Escape') close(); });
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
        }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
        els.forEach(el => io.observe(el));
    }

    /* -------- ブログアコーディオン -------- */
    function initBlogAccordion() {
        $$('.blog-header').forEach(hdr => {
            on(hdr, 'click', () => {
                const content = hdr.nextElementSibling;
                const isActive = hdr.classList.toggle('active');
                if (content) {
                    content.classList.toggle('active', isActive);
                }
            });
        });
    }

    /* -------- ブログフィルター -------- */
    function initBlogFilter() {
        const btns = $$('.filter-btn');
        const items = $$('.blog-item');
        if (!btns.length || !items.length) return;

        btns.forEach(btn => {
            on(btn, 'click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                items.forEach(item => {
                    const show = filter === 'all' || item.dataset.category === filter;
                    item.style.display = show ? '' : 'none';
                    if (show) {
                        item.style.animation = 'none';
                        void item.offsetWidth;
                        item.style.animation = '';
                    }
                });
            });
        });
    }

    /* -------- カーソル追従アクセント (大画面のみ) -------- */
    function initCursorAccent() {
        if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const dot = document.createElement('div');
        dot.className = 'cursor-accent';
        dot.setAttribute('aria-hidden', 'true');
        document.body.appendChild(dot);

        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        let tx = x, ty = y;
        let raf = null;

        const render = () => {
            x += (tx - x) * 0.12;
            y += (ty - y) * 0.12;
            dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            raf = requestAnimationFrame(render);
        };

        on(window, 'mousemove', (e) => {
            tx = e.clientX;
            ty = e.clientY;
            if (!raf) raf = requestAnimationFrame(render);
        });

        const hovertargets = 'a, button, .card, .theme-card, .blog-header, .btn, .home-card, .news-item';
        $$(hovertargets).forEach(el => {
            on(el, 'mouseenter', () => dot.classList.add('is-hover'));
            on(el, 'mouseleave', () => dot.classList.remove('is-hover'));
        });
    }

    /* -------- ホームのNews自動生成 (blog.htmlから抽出) -------- */
    async function initHomeNews() {
        const list = $('#homeNewsList');
        if (!list) return;

        const limit = parseInt(list.dataset.limit || '5', 10);

        const categoryMap = {
            notice: { label: 'お知らせ', cls: 'cat-notice' },
            activity: { label: '活動', cls: 'cat-activity' },
            thought: { label: '思考', cls: 'cat-thought' },
        };

        try {
            const res = await fetch('blog.html', { cache: 'no-store' });
            if (!res.ok) throw new Error('blog.html fetch failed');
            const html = await res.text();

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const posts = $$('.blog-item', doc).map(item => {
                const cat = item.dataset.category || 'notice';
                const date = $('.blog-date', item)?.textContent.trim() || '';
                const title = $('.blog-title', item)?.textContent.trim() || '';
                return { cat, date, title };
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
                        <a href="blog.html" class="news-link">
                            <span class="news-date font-en">${escapeHtml(p.date)}</span>
                            <span class="news-cat ${cat.cls}">${cat.label}</span>
                            <span class="news-title">${escapeHtml(p.title)}</span>
                            <span class="news-arrow" aria-hidden="true">→</span>
                        </a>
                    </li>
                `;
            }).join('');

            // 追加されたreveal要素にobserverを再適用
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
