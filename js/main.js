/* =========================================================
   kimutoshiki.com — Pop Diplomacy interaction script
   ========================================================= */
(() => {
    'use strict';

    const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
    const $  = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const ready = (fn) => document.readyState !== 'loading'
        ? fn()
        : document.addEventListener('DOMContentLoaded', fn);
    const isCoarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    ready(() => {
        initHeader();
        initScrollProgress();
        initMenu();
        initReveal();
        initSplitChars();
        initBlogAccordion();
        initBlogFilter();
        initSparkles();
        initFloatTilt();
        initPointerGlow();
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

    /* -------- ページ上端のスクロール・プログレス -------- */
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

        const close = () => {
            toggle.classList.remove('active');
            nav.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'メニューを開く');
            document.body.style.overflow = '';
        };

        on(toggle, 'click', () => {
            const active = !toggle.classList.contains('active');
            toggle.classList.toggle('active', active);
            nav.classList.toggle('active', active);
            toggle.setAttribute('aria-expanded', String(active));
            toggle.setAttribute('aria-label', active ? 'メニューを閉じる' : 'メニューを開く');
            document.body.style.overflow = active ? 'hidden' : '';
        });

        $$('a', nav).forEach(a => on(a, 'click', close));
        on(window, 'resize', () => { if (window.innerWidth > 1040) close(); });
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

    /* -------- ブログアコーディオン -------- */
    function initBlogAccordion() {
        $$('.blog-header').forEach((hdr, index) => {
            const content = hdr.nextElementSibling;
            const headerId = `blog-header-${index + 1}`;
            const contentId = `blog-content-${index + 1}`;
            hdr.id = headerId;
            hdr.setAttribute('role', 'button');
            hdr.setAttribute('tabindex', '0');
            hdr.setAttribute('aria-expanded', 'false');
            if (content) {
                content.id = contentId;
                content.setAttribute('role', 'region');
                content.setAttribute('aria-labelledby', headerId);
                hdr.setAttribute('aria-controls', contentId);
            }

            const toggle = () => {
                const content = hdr.nextElementSibling;
                const isActive = hdr.classList.toggle('active');
                hdr.setAttribute('aria-expanded', String(isActive));
                if (content) {
                    content.classList.toggle('active', isActive);
                }
            };
            on(hdr, 'click', toggle);
            on(hdr, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
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
                    if (show) {
                        item.style.animation = 'none';
                        void item.offsetWidth;
                        item.style.animation = '';
                    }
                });
            });
        });
    }

    /* -------- クリック時のスパークルエフェクト -------- */
    function initSparkles() {
        if (reducedMotion) return;
        const colors = ['#FF5C8A', '#FFD83D', '#4ED4A4', '#5DA8FF', '#B488FF'];
        const symbols = ['✦', '✧', '★', '♡', '◆'];

        on(document, 'click', (e) => {
            // どこをクリックしてもスパークル発火 (フォーム入力欄のみ除外)
            if (e.target.closest('input, textarea, select')) return;

            if (!e.clientX && !e.clientY) return;

            const x = e.clientX;
            const y = e.clientY;
            const count = 6;
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < count; i++) {
                const s = document.createElement('span');
                s.className = 'sparkle-burst';
                s.setAttribute('aria-hidden', 'true');
                s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                s.style.left = x + 'px';
                s.style.top = y + 'px';
                s.style.color = colors[Math.floor(Math.random() * colors.length)];
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
                const dist = 40 + Math.random() * 50;
                s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
                s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
                s.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
                fragment.appendChild(s);
                setTimeout(() => s.remove(), 800);
            }
            document.body.appendChild(fragment);
        });

        // スタイル注入
        if (!$('#sparkle-style')) {
            const st = document.createElement('style');
            st.id = 'sparkle-style';
            st.textContent = `
                .sparkle-burst {
                    position: fixed;
                    pointer-events: none;
                    font-size: 18px;
                    z-index: 9998;
                    transform: translate(-50%, -50%);
                    animation: sparkleFly 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    will-change: transform, opacity;
                }
                @keyframes sparkleFly {
                    0%   { opacity: 1; transform: translate(-50%, -50%) scale(0.4) rotate(0); }
                    50%  { opacity: 1; transform: translate(calc(-50% + var(--dx) * 0.6), calc(-50% + var(--dy) * 0.6)) scale(1.2) rotate(calc(var(--rot) * 0.5)); }
                    100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.6) rotate(var(--rot)); }
                }
            `;
            document.head.appendChild(st);
        }
    }

    /* -------- カードに微小な3Dティルト -------- */
    function initFloatTilt() {
        if (isCoarse || reducedMotion) return;
        const targets = $$('.highlight-card, .theme-card, .activity-card, .type-card, .future-card, .contact-card, .license-item');
        targets.forEach(el => {
            let frame = 0;
            let lastEvent;
            on(el, 'mousemove', (e) => {
                lastEvent = e;
                if (frame) return;
                frame = requestAnimationFrame(() => {
                    frame = 0;
                    const r = el.getBoundingClientRect();
                    const x = (lastEvent.clientX - r.left) / r.width - 0.5;
                    const y = (lastEvent.clientY - r.top)  / r.height - 0.5;
                    el.style.setProperty('--tilt-x', (y * -4) + 'deg');
                    el.style.setProperty('--tilt-y', (x *  4) + 'deg');
                });
            });
            on(el, 'mouseleave', () => {
                if (frame) cancelAnimationFrame(frame);
                frame = 0;
                el.style.setProperty('--tilt-x', '0deg');
                el.style.setProperty('--tilt-y', '0deg');
            });
        });
    }

    /* -------- ヒーローの軽量ポインターグロー -------- */
    function initPointerGlow() {
        if (isCoarse || reducedMotion) return;
        $$('.hero-base').forEach(hero => {
            on(hero, 'pointermove', (e) => {
                const r = hero.getBoundingClientRect();
                hero.style.setProperty('--pointer-x', `${e.clientX - r.left}px`);
                hero.style.setProperty('--pointer-y', `${e.clientY - r.top}px`);
                hero.style.setProperty('--pointer-active', '1');
            }, { passive: true });
            on(hero, 'pointerleave', () => hero.style.setProperty('--pointer-active', '0'));
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
