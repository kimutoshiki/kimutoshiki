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
        initPortfolioScrollGuide();
        initBlogAccordion();
        initBlogFilter();
        initClickEffects();
        initHomeNews();
    });

    /* -------- ヘッダー・進行表示・小さなパララックス -------- */
    function initPageMotion() {
        const header = $('.site-header');
        const hero = $('.hero-base');
        const pageArt = $$('.page-art, [data-page-art], [data-parallax-art], img.decor-art');
        if (!header && !hero && !pageArt.length) return;

        const mobileMotionQuery = window.matchMedia('(max-width: 860px), (hover: none), (pointer: coarse)');
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

            if (reducedMotion || mobileMotionQuery.matches) return;

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
                const maxShift = art.matches('img.decor-art') ? 5 : 10;
                const shift = clamp(-maxShift, centerOffset * -maxShift, maxShift);
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

        /* Blog accordion height animations must not make the whole page
           recompute its scroll metrics on every animation frame. */
        if ('ResizeObserver' in window && document.body && !$('.blog-posts')) {
            const sizeObserver = new ResizeObserver(() => schedule(true));
            sizeObserver.observe(document.body);
        }

        on(document, 'site:layoutchange', () => schedule(true));

        motionSubscribers.add(isReduced => {
            if (isReduced) resetParallax();
            schedule(true);
        });
        const syncMobileMotion = () => {
            if (mobileMotionQuery.matches) resetParallax();
            schedule(true);
        };
        if ('addEventListener' in mobileMotionQuery) {
            mobileMotionQuery.addEventListener('change', syncMobileMotion);
        } else {
            mobileMotionQuery.addListener(syncMobileMotion);
        }

        on(window, 'scroll', schedule, { passive: true });
        on(window, 'resize', () => schedule(true), { passive: true });
        on(window, 'load', () => schedule(true), { once: true });
        on(window, 'pageshow', () => schedule(true));
        if (reducedMotion || mobileMotionQuery.matches) resetParallax();
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

    /* -------- ホームの背景写真：ページスクロールに連動 -------- */
    function initHeroSlideshow() {
        const root = $('[data-hero-slideshow]');
        if (!root) return;

        const slides = $$('.hero-slide', root);
        if (slides.length < 2) return;

        let current = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
        let frame = 0;
        let nearViewport = true;

        const clamp = (min, value, max) => Math.min(max, Math.max(min, value));

        const loadSlide = (index) => {
            const normalized = (index + slides.length) % slides.length;
            slides[normalized]?.classList.add('is-loaded');
        };

        const show = (index) => {
            const next = clamp(0, index, slides.length - 1);
            current = next;
            loadSlide(current);
            loadSlide(Math.min(current + 1, slides.length - 1));
            slides.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
            root.dataset.heroIndex = String(current);
        };

        const update = () => {
            frame = 0;
            if (!nearViewport || document.hidden) return;
            if (reducedMotion) {
                root.style.setProperty('--hero-scroll-progress', '0');
                show(0);
                return;
            }

            const rect = root.getBoundingClientRect();
            const travel = Math.max(1, root.offsetHeight * 0.72);
            const progress = clamp(0, -rect.top / travel, 1);
            const index = Math.min(slides.length - 1, Math.floor(progress * slides.length));
            root.style.setProperty('--hero-scroll-progress', progress.toFixed(4));
            if (index !== current) show(index);
        };

        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                nearViewport = entries.some(entry => entry.isIntersecting);
                if (nearViewport) schedule();
            }, { rootMargin: '25% 0px' });
            observer.observe(root);
        }

        on(window, 'scroll', schedule, { passive: true });
        on(window, 'resize', schedule, { passive: true });
        on(window, 'pageshow', schedule);
        on(document, 'visibilitychange', schedule);
        motionSubscribers.add(schedule);

        loadSlide(current);
        show(current);
        const loadRemaining = () => slides.forEach((_, index) => loadSlide(index));
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(loadRemaining, { timeout: 1400 });
        } else {
            window.setTimeout(loadRemaining, 500);
        }
        schedule();
    }

    /* -------- ホームのページ案内：通常スクロールで順に強調 -------- */
    function initPortfolioScrollGuide() {
        $$('[data-portfolio-slider]').forEach(root => {
            const slides = $$('.portfolio-slide', root);
            if (slides.length < 2) return;

            let current = slides.findIndex(slide => (
                slide.classList.contains('is-active') || Boolean($('[aria-current="page"]', slide))
            ));
            if (current < 0) current = 0;

            let frame = 0;
            let nearViewport = true;

            const show = (index) => {
                current = Math.min(slides.length - 1, Math.max(0, index));
                const progressValue = (current + 1) / slides.length;
                root.dataset.portfolioIndex = String(current);
                root.style.setProperty('--portfolio-index', String(current));
                root.style.setProperty('--portfolio-progress', progressValue.toFixed(4));
                slides.forEach((slide, slideIndex) => {
                    const active = slideIndex === current;
                    slide.classList.toggle('is-active', active);
                    slide.classList.toggle('is-before', slideIndex < current);
                    slide.classList.toggle('is-after', slideIndex > current);
                });
            };

            const update = () => {
                frame = 0;
                if (!nearViewport || document.hidden) return;

                const targetY = Math.min(window.innerHeight * 0.52, window.innerHeight - 120);
                let closestIndex = current;
                let closestDistance = Number.POSITIVE_INFINITY;
                slides.forEach((slide, index) => {
                    const rect = slide.getBoundingClientRect();
                    const distance = Math.abs(rect.top + rect.height / 2 - targetY);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = index;
                    }
                });
                if (closestIndex !== current) show(closestIndex);
            };

            const schedule = () => {
                if (!frame) frame = requestAnimationFrame(update);
            };

            if ('ResizeObserver' in window) {
                const observer = new ResizeObserver(schedule);
                observer.observe(root);
            }
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver(entries => {
                    nearViewport = entries.some(entry => entry.isIntersecting);
                    if (nearViewport) schedule();
                }, { rootMargin: '30% 0px' });
                observer.observe(root);
            }

            on(window, 'scroll', schedule, { passive: true });
            on(window, 'resize', schedule, { passive: true });
            on(root, 'focusin', event => {
                const slide = event.target instanceof Element ? event.target.closest('.portfolio-slide') : null;
                const index = slides.indexOf(slide);
                if (index >= 0) show(index);
            });
            motionSubscribers.add(schedule);

            show(current);
            schedule();
        });
    }

    /* -------- ブログアコーディオン -------- */
    function initBlogAccordion() {
        const items = $$('.blog-item');
        if (!items.length) return;
        let resizeFrame = 0;

        let layoutTimer = 0;

        const refreshOpenContent = () => {
            resizeFrame = 0;
            const openContents = $$('.blog-content.active');
            const heights = openContents.map(content => content.scrollHeight);
            openContents.forEach((content, index) => {
                content.style.maxHeight = `${heights[index]}px`;
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
                window.clearTimeout(layoutTimer);
                layoutTimer = window.setTimeout(() => {
                    document.dispatchEvent(new Event('site:layoutchange'));
                }, reducedMotion ? 0 : 380);
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
                requestAnimationFrame(() => {
                    document.dispatchEvent(new Event('site:layoutchange'));
                });
            });
        });
    }

    /* -------- ページ全体のリップル＋紙吹雪 -------- */
    function initClickEffects() {
        const colors = ['var(--pop-pink)', 'var(--pop-yellow)', 'var(--pop-mint)', 'var(--pop-blue)', 'var(--pop-lav)'];
        let lastBurst = -Infinity;

        on(document, 'click', (e) => {
            if (reducedMotion || !e.detail || e.button !== 0) return;
            if (e.target instanceof Element && e.target.closest('.blog-header')) return;

            const now = performance.now();
            if (now - lastBurst < 120) return;
            lastBurst = now;

            const x = e.clientX;
            const y = e.clientY;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const fragment = document.createDocumentFragment();

            const ripple = document.createElement('span');
            ripple.className = 'click-ripple';
            ripple.setAttribute('aria-hidden', 'true');
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            ripple.style.setProperty('--ripple-color', color);

            const confetti = document.createElement('span');
            confetti.className = 'click-confetti';
            confetti.setAttribute('aria-hidden', 'true');
            confetti.style.left = `${x}px`;
            confetti.style.top = `${y}px`;

            const count = 6;
            for (let i = 0; i < count; i++) {
                const piece = document.createElement('span');
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.38;
                const distance = 34 + Math.random() * 28;
                const pieceColor = colors[(i + Math.floor(Math.random() * colors.length)) % colors.length];

                piece.className = 'click-confetti-piece';
                piece.style.backgroundColor = pieceColor;
                piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
                piece.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
                piece.style.setProperty('--rot', `${Math.random() * 320 - 160}deg`);
                piece.style.setProperty('--piece-color', pieceColor);
                piece.style.setProperty('--delay', `${Math.round(Math.random() * 55)}ms`);
                confetti.appendChild(piece);
            }

            fragment.append(ripple, confetti);
            document.body.appendChild(fragment);
            window.setTimeout(() => {
                ripple.remove();
                confetti.remove();
            }, 780);
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
