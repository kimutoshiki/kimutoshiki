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
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionSubscribers = new Set();
    let reducedMotion = motionQuery.matches;

    const notifyMotionChange = (event) => {
        reducedMotion = event.matches;
        motionSubscribers.forEach(fn => fn(reducedMotion));
    };
    if ('addEventListener' in motionQuery) {
        motionQuery.addEventListener('change', notifyMotionChange);
    } else {
        motionQuery.addListener(notifyMotionChange);
    }

    // CSS側では .is-loaded が付くまで背景画像を取得しない。deferスクリプト
    // なので、この時点でDOMは構築済みであり、先頭画像だけをすぐに許可できる。
    $('.hero-slide')?.classList.add('is-loaded');

    ready(() => {
        initPageMotion();
        initMenu();
        initReveal();
        initSplitChars();
        initHeroSlideshow();
        initBlogAccordion();
        initBlogFilter();
        initSparkles();
        initHomeNews();
    });

    /* -------- ヘッダー・進行表示・小さなパララックス -------- */
    function initPageMotion() {
        const header = $('.site-header');
        const hero = $('.hero-base');
        const pageArt = $$('.page-art, [data-page-art], [data-parallax-art]');
        if (!header && !hero && !pageArt.length) return;

        let frame = 0;
        let maxScroll = 0;
        let metricsDirty = true;
        let wasScrolled = null;
        const activeArt = new Set();

        const clamp = (min, value, max) => Math.min(max, Math.max(min, value));
        const refreshMetrics = () => {
            maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            metricsDirty = false;
        };
        const resetParallax = () => {
            hero?.style.setProperty('--hero-shift', '0px');
            pageArt.forEach(art => art.style.setProperty('--art-shift', '0px'));
        };
        const update = () => {
            frame = 0;
            if (metricsDirty) refreshMetrics();

            const scrollY = window.scrollY;
            const progress = maxScroll > 0 ? clamp(0, scrollY / maxScroll, 1) : 0;
            if (header) {
                header.style.setProperty('--scroll-progress', progress.toFixed(4));
                const isScrolled = scrollY > 24;
                if (isScrolled !== wasScrolled) {
                    header.classList.toggle('scrolled', isScrolled);
                    wasScrolled = isScrolled;
                }
            }

            if (reducedMotion) return;

            const viewportHeight = window.innerHeight;
            if (hero) {
                const rect = hero.getBoundingClientRect();
                const nearViewport = rect.bottom > -viewportHeight * 0.15
                    && rect.top < viewportHeight * 1.15;
                if (nearViewport) {
                    const shift = clamp(-18, -rect.top * 0.025, 18);
                    hero.style.setProperty('--hero-shift', `${shift.toFixed(2)}px`);
                }
            }

            activeArt.forEach(art => {
                const rect = art.getBoundingClientRect();
                const centerOffset = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
                const shift = clamp(-12, centerOffset * -12, 12);
                art.style.setProperty('--art-shift', `${shift.toFixed(2)}px`);
            });
        };
        const schedule = (refresh = false) => {
            if (refresh) metricsDirty = true;
            if (!frame) frame = requestAnimationFrame(update);
        };

        if ('IntersectionObserver' in window && pageArt.length) {
            const artObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) activeArt.add(entry.target);
                    else activeArt.delete(entry.target);
                });
                schedule();
            }, { rootMargin: '25% 0px' });
            pageArt.forEach(art => artObserver.observe(art));
        } else {
            pageArt.forEach(art => activeArt.add(art));
        }

        if ('ResizeObserver' in window && document.body) {
            const sizeObserver = new ResizeObserver(() => schedule(true));
            sizeObserver.observe(document.body);
        }

        motionSubscribers.add(isReduced => {
            if (isReduced) resetParallax();
            schedule(true);
        });

        on(window, 'scroll', schedule, { passive: true });
        on(window, 'resize', () => schedule(true), { passive: true });
        on(window, 'load', () => schedule(true), { once: true });
        on(window, 'pageshow', () => schedule(true));
        if (reducedMotion) resetParallax();
        schedule(true);
    }

    /* -------- ハンバーガーメニュー -------- */
    function initMenu() {
        const toggle = $('#menuToggle');
        const nav = $('#navigation');
        if (!toggle || !nav) return;

        const mobileQuery = window.matchMedia('(max-width: 1180px)');
        const pageRegions = [$('main'), $('.site-footer')].filter(Boolean);
        let previousBodyOverflow = '';

        const isOpen = () => nav.classList.contains('active');
        const setPageInert = (active) => {
            pageRegions.forEach(region => region.toggleAttribute('inert', active));
        };
        const syncState = () => {
            const mobile = mobileQuery.matches;
            nav.toggleAttribute('inert', mobile && !isOpen());
            if (!mobile) {
                toggle.classList.remove('active');
                nav.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'メニューを開く');
                nav.removeAttribute('inert');
                setPageInert(false);
                document.body.style.overflow = previousBodyOverflow;
            }
        };
        const close = (restoreFocus = false) => {
            toggle.classList.remove('active');
            nav.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'メニューを開く');
            document.body.style.overflow = previousBodyOverflow;
            setPageInert(false);
            syncState();
            if (restoreFocus && mobileQuery.matches) toggle.focus();
        };
        const open = () => {
            previousBodyOverflow = document.body.style.overflow;
            toggle.classList.add('active');
            nav.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'メニューを閉じる');
            nav.removeAttribute('inert');
            setPageInert(true);
            document.body.style.overflow = 'hidden';
            $('a[href]', nav)?.focus();
        };

        on(toggle, 'click', () => {
            if (!mobileQuery.matches) return;
            if (isOpen()) close(false);
            else open();
        });

        $$('a', nav).forEach(a => on(a, 'click', () => close(false)));
        on(document, 'keydown', (e) => {
            if (!mobileQuery.matches || !isOpen()) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                close(true);
                return;
            }
            if (e.key !== 'Tab') return;

            const focusable = [toggle, ...$$('a[href]', nav).filter(link => !link.hasAttribute('disabled'))];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeIndex = focusable.indexOf(document.activeElement);

            if (e.shiftKey && (document.activeElement === first || activeIndex < 0)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || activeIndex < 0)) {
                e.preventDefault();
                first.focus();
            }
        });

        if ('addEventListener' in mobileQuery) {
            mobileQuery.addEventListener('change', syncState);
        } else {
            mobileQuery.addListener(syncState);
        }
        syncState();
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

        const interval = 6500;
        const preloadLead = 2400;
        let current = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
        let timer = 0;
        let preloadTimer = 0;
        let userPaused = false;
        let preferencePaused = reducedMotion;
        let pointerPaused = false;
        let focusPaused = false;

        const loadSlide = (index) => {
            const normalized = (index + slides.length) % slides.length;
            slides[normalized]?.classList.add('is-loaded');
        };
        const isPermanentlyPaused = () => userPaused || preferencePaused;
        const isTemporarilyPaused = () => pointerPaused || focusPaused || document.hidden;
        const stop = () => {
            window.clearTimeout(timer);
            window.clearTimeout(preloadTimer);
            timer = 0;
            preloadTimer = 0;
        };
        const scheduleUpcomingLoad = () => {
            const next = (current + 1) % slides.length;
            if (slides[next].classList.contains('is-loaded')) return;
            preloadTimer = window.setTimeout(() => {
                preloadTimer = 0;
                loadSlide(next);
            }, Math.max(0, interval - preloadLead));
        };
        const start = () => {
            if (isPermanentlyPaused() || isTemporarilyPaused() || timer) return;
            scheduleUpcomingLoad();
            timer = window.setTimeout(() => {
                timer = 0;
                show(current + 1);
                start();
            }, interval);
        };
        const restart = () => {
            stop();
            start();
        };

        const show = (index, userInitiated = false) => {
            current = (index + slides.length) % slides.length;
            loadSlide(current);
            slides.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
            dots.forEach((dot, i) => {
                const active = i === current;
                dot.classList.toggle('is-active', active);
                dot.setAttribute('aria-pressed', String(active));
            });
            if (userInitiated) restart();
        };
        const syncPauseButton = () => {
            if (!pause) return;
            const paused = isPermanentlyPaused();
            pause.setAttribute('aria-label', paused ? 'スライドショーを再生' : 'スライドショーを一時停止');
            const icon = $('span', pause);
            if (icon) icon.textContent = paused ? '▶' : 'Ⅱ';
        };

        dots.forEach(dot => {
            const index = Number(dot.dataset.slide || 0);
            on(dot, 'pointerenter', () => loadSlide(index), { passive: true });
            on(dot, 'focus', () => loadSlide(index));
            on(dot, 'click', () => show(index, true));
        });
        on(pause, 'click', () => {
            if (preferencePaused) {
                preferencePaused = false;
                userPaused = false;
            } else {
                userPaused = !userPaused;
            }
            syncPauseButton();
            restart();
        });
        on(document, 'visibilitychange', () => {
            if (document.hidden) stop();
            else start();
        });
        const controls = $('.hero-slide-controls', root);
        on(controls, 'pointerenter', () => {
            pointerPaused = true;
            stop();
        }, { passive: true });
        on(controls, 'pointerleave', () => {
            pointerPaused = false;
            start();
        }, { passive: true });
        on(controls, 'focusin', () => {
            focusPaused = true;
            stop();
        });
        on(controls, 'focusout', () => {
            requestAnimationFrame(() => {
                focusPaused = Boolean(controls?.contains(document.activeElement));
                if (!focusPaused) start();
            });
        });

        motionSubscribers.add(isReduced => {
            preferencePaused = isReduced;
            syncPauseButton();
            if (isReduced) stop();
            else start();
        });

        loadSlide(current);
        show(current);
        syncPauseButton();
        const loadNext = () => loadSlide(current + 1);
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(loadNext, { timeout: 1400 });
        } else {
            window.setTimeout(loadNext, 500);
        }
        start();
    }

    /* -------- ブログアコーディオン -------- */
    function initBlogAccordion() {
        const items = $$('.blog-item');
        if (!items.length) return;
        let resizeFrame = 0;

        const refreshOpenContent = () => {
            resizeFrame = 0;
            $$('.blog-content.active').forEach(content => {
                content.style.maxHeight = `${content.scrollHeight}px`;
            });
        };
        const scheduleOpenContentRefresh = () => {
            if (!resizeFrame) resizeFrame = requestAnimationFrame(refreshOpenContent);
        };

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

        on(window, 'resize', scheduleOpenContentRefresh, { passive: true });
        if (document.fonts) {
            document.fonts.ready.then(scheduleOpenContentRefresh);
            on(document.fonts, 'loadingdone', scheduleOpenContentRefresh);
        }
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
        const colors = ['var(--pop-pink)', 'var(--pop-yellow)', 'var(--pop-mint)', 'var(--pop-blue)', 'var(--pop-lav)'];
        const symbols = ['✦', '✧', '★', '♡', '◆'];
        const interactiveSelector = [
            'a',
            'button',
            '[role="button"]',
            '[data-sparkle]',
            '.card',
            '.highlight-card',
            '.theme-card',
            '.activity-card',
            '.type-card',
            '.future-card',
            '.contact-card',
            '.license-item',
            '.blog-item',
            '.about-item',
            '.vision-meta-item',
            '.roadmap-item',
        ].join(',');
        let lastBurst = -Infinity;

        on(document, 'click', (e) => {
            if (reducedMotion || !e.detail || !(e.target instanceof Element)) return;
            if (!e.target.closest(interactiveSelector)) return;

            const now = performance.now();
            if (now - lastBurst < 120) return;
            lastBurst = now;

            const x = e.clientX;
            const y = e.clientY;
            const count = 4;
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < count; i++) {
                const s = document.createElement('span');
                s.className = 'sparkle-burst';
                s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                s.style.left = x + 'px';
                s.style.top = y + 'px';
                s.style.color = colors[Math.floor(Math.random() * colors.length)];
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
                const dist = 22 + Math.random() * 28;
                s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
                s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
                s.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
                on(s, 'animationend', () => s.remove(), { once: true });
                window.setTimeout(() => s.remove(), 800);
                fragment.appendChild(s);
            }
            document.body.appendChild(fragment);
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
