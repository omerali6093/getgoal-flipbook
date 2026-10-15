import { PageFlip } from 'page-flip';
import gsap from 'gsap';
import './style.css';

/**
 * GETGOAL Flipbook
 * StPageFlip + GSAP
 *
 * Features:
 * - Proper Cover Page: Displays cover-page.webp as a real interactive book cover
 * - Smooth Opening: Centered closed cover; opens into 2-page spreads (pages 1-2, 3-4, etc.)
 * - Stutter-Free: Hard density eliminates heavy DOM cloning of MP4 video pages
 * - Safe Flipping: No stuck states, debounced transitions with safety timeouts
 * - Responsive: Works beautifully on desktop, tablet, and mobile devices
 * - Optimized: Videos start with preload="none"; metadata loaded on-demand near current page
 */

const ASPECT_RATIO = 1080 / 1920; // 9:16 portrait
const PRELOAD_DISTANCE = 2;

// How many pages ahead/behind to warm up video metadata
const VIDEO_WARM_DISTANCE = 3;

function parseAspectRatio(val, fallback = ASPECT_RATIO) {
  if (!val) return fallback;
  if (typeof val === 'number') return val > 0 ? val : fallback;
  const str = String(val).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
  }
  if (str.includes('/')) {
    const parts = str.split('/').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
  }
  const num = parseFloat(str);
  return !isNaN(num) && num > 0 ? num : fallback;
}

/* ---------------------------------------------------------
   CREATE PAGE NODE
--------------------------------------------------------- */

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

function isVideoSrc(src) {
  return VIDEO_EXTENSIONS.test(src);
}

function buildPageNode(src, alt, index, total) {
  const page = document.createElement('div');
  const isFirst = index === 0;
  const isLast = typeof total === 'number' && index === total - 1;

  page.className = 'jia-fb-page';
  if (isFirst) {
    page.classList.add('jia-fb-page-cover', 'jia-fb-page-first');
  }
  if (isLast) {
    page.classList.add('jia-fb-page-cover', 'jia-fb-page-last');
  }

  page.setAttribute(
    'data-density',
    isFirst || isLast ? 'hard' : 'soft'
  );
  page.setAttribute('data-page-index', String(index));

  let media;

  if (isVideoSrc(src)) {
    page.classList.add('jia-fb-page-video');

    media = document.createElement('video');
    media.src = src;
    media.autoplay = true;
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    // All videos start with preload="none" — the browser won't touch them
    // until warmVideo() promotes them when the user is about to see them.
    // This is the primary fix for slow cover page loading: previously pages
    // 1-2 used preload="auto" (full download ~34 MB) and all others used
    // preload="metadata", all competing with the cover image on page load.
    media.preload = 'none';
    media.draggable = false;
    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');
    media.setAttribute('muted', '');
  } else {
    media = document.createElement('img');
    media.src = src;
    media.alt = alt || (isFirst ? 'GetGoal Book Cover' : `Page ${index + 1}`);
    // Cover image (index 0) gets highest fetch priority so the browser
    // downloads it before anything else on the page.
    if (isFirst) {
      media.fetchPriority = 'high';
      media.loading = 'eager';
    } else {
      media.loading = 'eager';
    }
    media.decoding = 'async';
    media.draggable = false;
  }

  const shade = document.createElement('div');
  shade.className = 'jia-fb-shade';

  // Light-sweep overlay for realistic page-turning reflection effect
  const flipLight = document.createElement('div');
  flipLight.className = 'jia-fb-flip-light';

  page.appendChild(media);
  page.appendChild(shade);
  page.appendChild(flipLight);

  return page;
}

/* ---------------------------------------------------------
   PRELOAD IMAGES
--------------------------------------------------------- */

function preloadImage(src) {
  if (!src || isVideoSrc(src)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
}

function preloadNearbyImages(images, currentIndex) {
  const start = Math.max(0, currentIndex - PRELOAD_DISTANCE);
  const end = Math.min(images.length - 1, currentIndex + PRELOAD_DISTANCE);
  for (let i = start; i <= end; i++) {
    preloadImage(images[i]);
  }
}

/* ---------------------------------------------------------
   VIDEO WARM-UP: promote preload="none" → "metadata" for
   pages near the current spread so they are ready when the
   user reaches them without downloading unused pages.
--------------------------------------------------------- */

function warmNearbyVideos(bookEl, currentIndex, total) {
  const start = Math.max(0, currentIndex - VIDEO_WARM_DISTANCE);
  const end = Math.min(total - 1, currentIndex + VIDEO_WARM_DISTANCE);

  const allVideos = bookEl.querySelectorAll('video');
  allVideos.forEach((v) => {
    const page = v.closest('.jia-fb-page');
    if (!page) return;
    const idx = Number(page.getAttribute('data-page-index') ?? -1);

    if (idx >= start && idx <= end) {
      // Promote to metadata so the browser knows duration/dimensions
      if (v.preload === 'none') {
        v.preload = 'metadata';
      }
    }
  });
}

/* ---------------------------------------------------------
   INIT ONE FLIPBOOK
--------------------------------------------------------- */

function initFlipbook(root) {
  if (!root || root.dataset.jiaInit === '1') return;
  root.dataset.jiaInit = '1';

  let images = [];

  try {
    images = JSON.parse(root.getAttribute('data-images') || '[]');
  } catch (error) {
    console.error('GETGOAL Flipbook: could not parse image list', error);
    return;
  }

  if (!images.length) {
    console.warn('GETGOAL Flipbook: no images found.');
    return;
  }

  // If first item is not cover-page, ensure cover-page is at index 0
  if (/page-1\./i.test(images[0])) {
    images.unshift('assets/images/cover-page.png');
  }

  root.classList.add('jia-cover-view');

  /* -------------------------------------------------------
     ELEMENTS
  ------------------------------------------------------- */

  const stage = root.querySelector('.jia-flipbook-stage');
  const bookEl = root.querySelector('.jia-flipbook-book');
  const loader = root.querySelector('.jia-flipbook-loader');

  const currentEl = root.querySelector('.jia-fb-current');
  const totalEl = root.querySelector('.jia-fb-total');

  const prevBtn = root.querySelector('.jia-fb-prev');
  const nextBtn = root.querySelector('.jia-fb-next');
  const fsBtn = root.querySelector('.jia-fb-fullscreen');

  if (!stage || !bookEl) {
    console.warn('GETGOAL Flipbook: required elements are missing.');
    return;
  }

  /* -------------------------------------------------------
     BASIC DATA
  ------------------------------------------------------- */

  const total = images.length;

  if (totalEl) {
    totalEl.textContent = String(Math.max(1, total - 1));
  }

  /* -------------------------------------------------------
     BUILD ALL PAGES
  ------------------------------------------------------- */

  bookEl.innerHTML = '';
  images.forEach((src, index) => {
    bookEl.appendChild(
      buildPageNode(
        src,
        index === 0 ? 'GetGoal Solutions - Book Cover' : `Page ${index}`,
        index,
        images.length
      )
    );
  });

  preloadNearbyImages(images, 0);
  // Warm video metadata for the first spread so it's ready when user opens
  warmNearbyVideos(bookEl, 0, total);

  /* -------------------------------------------------------
     CALCULATE INITIAL SIZE
  ------------------------------------------------------- */

  const aspectAttr =
    root.getAttribute('data-aspect-ratio') ||
    root.getAttribute('data-ratio');
  const aspectRatio = parseAspectRatio(aspectAttr, ASPECT_RATIO);

  const containerWidth = stage.clientWidth || 1100;
  const baseWidth = Math.round(Math.min(containerWidth / 2, 700));
  const baseHeight = Math.round(baseWidth / aspectRatio);

  /* -------------------------------------------------------
     CREATE PAGEFLIP
  ------------------------------------------------------- */

  const pageFlip = new PageFlip(bookEl, {
    width: baseWidth,
    height: baseHeight,
    size: 'stretch',
    minWidth: 160,
    maxWidth: 1400,
    minHeight: 250,
    maxHeight: 2200,
    flippingTime: 1250,
    drawShadow: true,
    maxShadowOpacity: 0.65,
    usePortrait: false, // Maintain 2-page landscape spreads
    autoSize: true,
    showCover: true, // First page (index 0) is closed front cover
    mobileScrollSupport: true,
    useMouseEvents: true,
    swipeDistance: 25,
    clickEventForward: true,
    disableFlipByClick: false,
    showPageCorners: true,
    startPage: 0,
  });

  /* -------------------------------------------------------
     LOAD HTML PAGES
  ------------------------------------------------------- */

  pageFlip.loadFromHTML(bookEl.querySelectorAll('.jia-fb-page'));

  try {
    const pages = pageFlip.getPageCollection()?.getPages() || [];
    pages.forEach((page, index) => {
      if (page && typeof page.setDensity === 'function') {
        const isCover = index === 0 || index === total - 1;
        page.setDensity(isCover ? 'hard' : 'soft');
      }
    });
  } catch (error) {
    console.debug('GETGOAL Flipbook: page density configuration error:', error);
  }

  /* -------------------------------------------------------
     STATE & TIMING
  ------------------------------------------------------- */

  let isFlipping = false;
  let currentPage = 0;
  let lastFlipTime = 0;
  let flipSafetyTimer = null;

  function clearSafetyTimer() {
    if (flipSafetyTimer) {
      clearTimeout(flipSafetyTimer);
      flipSafetyTimer = null;
    }
  }

  function setFlippingState(flipping) {
    isFlipping = flipping;
    clearSafetyTimer();

    if (flipping) {
      root.classList.add('jia-is-flipping');
      // Safety release timeout ensures the flipbook NEVER stays stuck
      flipSafetyTimer = setTimeout(() => {
        isFlipping = false;
        root.classList.remove('jia-is-flipping');
        updateButtonState();
      }, 1100);
    } else {
      root.classList.remove('jia-is-flipping');
    }
    updateButtonState();
  }

  /* -------------------------------------------------------
     SAFETY GUARD: PREVENT FLIPPING PAST LAST SPREAD
  ------------------------------------------------------- */

  try {
    const flipController =
      pageFlip.getFlipController?.() || pageFlip.flipController;

    if (flipController && typeof flipController.checkDirection === 'function') {
      const origCheckDirection = flipController.checkDirection.bind(flipController);
      flipController.checkDirection = function (direction) {
        // 0 is FlipDirection.FORWARD
        if (direction === 0 && currentPage >= total - 2) {
          return false;
        }
        return origCheckDirection(direction);
      };
    }
  } catch (err) {
    console.debug('GETGOAL Flipbook: checkDirection guard error:', err);
  }

  /* -------------------------------------------------------
     UPDATE UI & INDICATORS
  ------------------------------------------------------- */

  function updateIndicator(pageIndex) {
    currentPage = Math.max(0, Math.min(pageIndex, total - 1));

    if (currentEl) {
      if (currentPage === 0) {
        currentEl.textContent = 'Cover';
      } else {
        const leftPage = currentPage;
        const rightPage = Math.min(currentPage + 1, total - 1);
        currentEl.textContent = `${leftPage}-${rightPage}`;
      }
    }

    if (prevBtn) prevBtn.disabled = currentPage <= 0;
    if (nextBtn) nextBtn.disabled = currentPage >= total - 2;

    if (currentPage >= total - 2) {
      root.classList.add('jia-last-spread');
    } else {
      root.classList.remove('jia-last-spread');
    }

    preloadNearbyImages(images, currentPage);
    warmNearbyVideos(bookEl, currentPage, total);
    updateVideosVisibility(currentPage);
  }

  /* -------------------------------------------------------
     VIDEO PLAYBACK MANAGEMENT
     Only plays videos on currently visible pages to ensure
     60fps performance and zero lag on mobile and desktop.
  ------------------------------------------------------- */

  function updateVideosVisibility(currentIndex) {
    try {
      const allVideos = bookEl.querySelectorAll('video');
      allVideos.forEach((v) => {
        const page = v.closest('.jia-fb-page');
        if (!page) return;
        const idx = Number(page.getAttribute('data-page-index') ?? -1);

        // When at cover (index 0), pause all video elements
        if (currentIndex === 0) {
          try { v.pause(); } catch (e) { }
          return;
        }

        // On active spread, play the left and right pages
        const shouldPlay = idx === currentIndex || idx === currentIndex + 1;
        if (shouldPlay) {
          try {
            if (v.paused) {
              const p = v.play();
              if (p !== undefined) p.catch(() => { });
            }
          } catch (e) { }
        } else {
          try {
            if (!v.paused) v.pause();
          } catch (e) { }
        }
      });
    } catch (e) {
      console.debug('updateVideosVisibility error:', e);
    }
  }

  /* -------------------------------------------------------
     BUTTON STATE
  ------------------------------------------------------- */

  function updateButtonState() {
    if (prevBtn) prevBtn.disabled = isFlipping || currentPage <= 0;
    if (nextBtn) nextBtn.disabled = isFlipping || currentPage >= total - 2;
  }

  /* -------------------------------------------------------
     FLIP STATE LISTENERS
  ------------------------------------------------------- */

  /**
   * FLIP LIGHT SWEEP EFFECT
   * Animates visible .jia-fb-flip-light overlays during a flip
   * to simulate realistic light glancing off paper.
   */
  function triggerFlipLightEffect() {
    const lights = bookEl.querySelectorAll('.jia-fb-flip-light');
    const stageRect = stage.getBoundingClientRect();

    lights.forEach((el) => {
      const page = el.closest('.stf__item') || el.closest('.jia-fb-page');
      if (!page) return;

      const rect = page.getBoundingClientRect();
      const isVisible =
        rect.right > stageRect.left &&
        rect.left < stageRect.right &&
        rect.bottom > stageRect.top &&
        rect.top < stageRect.bottom;

      gsap.killTweensOf(el);

      if (!isVisible) {
        gsap.set(el, { opacity: 0 });
        return;
      }

      gsap.fromTo(
        el,
        { opacity: 0, xPercent: -65, scaleX: 0.88 },
        {
          opacity: 1,
          xPercent: 65,
          scaleX: 1.08,
          duration: 0.78,
          ease: 'power2.inOut',
          onComplete: () => {
            gsap.to(el, { opacity: 0, duration: 0.3, ease: 'power1.out' });
          },
        }
      );
    });
  }

  function clearFlipLightEffect() {
    const lights = bookEl.querySelectorAll('.jia-fb-flip-light');
    lights.forEach((el) => {
      gsap.killTweensOf(el);
      gsap.to(el, { opacity: 0, duration: 0.2, ease: 'power1.out' });
    });
  }

  pageFlip.on('changeState', (event) => {
    const state = event.data;

    if (state === 'flipping' || state === 'user_fold') {
      if (currentPage === 0) {
        root.classList.remove('jia-cover-view');
        updateVideosVisibility(1);
      }
    }

    if (state === 'flipping') {
      setFlippingState(true);
      triggerFlipLightEffect();
    }

    if (state === 'read') {
      setFlippingState(false);
      updateVideosVisibility(currentPage);
      clearFlipLightEffect();
    }
  });

  pageFlip.on('flip', (event) => {
    const pageIndex = Number(event.data);
    updateIndicator(pageIndex);

    if (pageIndex === 0) {
      root.classList.add('jia-cover-view');
    } else {
      root.classList.remove('jia-cover-view');
    }

    setFlippingState(false);
    clearFlipLightEffect();
  });

  /* -------------------------------------------------------
     INITIALIZATION
  ------------------------------------------------------- */

  pageFlip.on('init', () => {
    updateIndicator(0);
    setFlippingState(false);

    if (loader) {
      gsap.to(loader, {
        opacity: 0,
        duration: 0.35,
        ease: 'power2.out',
        onComplete: () => {
          if (loader) loader.remove();
        },
      });
    }

    // Gentle book entrance
    gsap.fromTo(
      bookEl,
      { opacity: 0, y: 25, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.8,
        ease: 'power3.out',
        clearProps: 'opacity,y',
      }
    );

    // Corner hint animation if present
    const cornerHint = root.querySelector('.jia-fb-corner-hint');
    if (cornerHint) {
      gsap.to(cornerHint, {
        x: -10,
        duration: 0.75,
        delay: 0.8,
        repeat: 3,
        yoyo: true,
        ease: 'power1.inOut',
      });
    }
  });

  /* -------------------------------------------------------
     PROGRAMMATIC FLIP CONTROLS
  ------------------------------------------------------- */

  function goNext() {
    const now = Date.now();
    if (isFlipping || now - lastFlipTime < 700) return;
    if (currentPage >= total - 2) return;

    lastFlipTime = now;
    setFlippingState(true);

    if (currentPage === 0) {
      root.classList.remove('jia-cover-view');
    }

    preloadNearbyImages(images, currentPage + 2);
    pageFlip.flipNext();
  }

  function goPrevious() {
    const now = Date.now();
    if (isFlipping || now - lastFlipTime < 700) return;
    if (currentPage <= 0) return;

    lastFlipTime = now;
    setFlippingState(true);

    preloadNearbyImages(images, currentPage - 2);
    pageFlip.flipPrev();
  }

  /* -------------------------------------------------------
     CLICK TO FLIP COVER & BOOK
     When on the cover (page 0), clicking anywhere on the book
     instantly and smoothly opens the flipbook.
  ------------------------------------------------------- */

  bookEl.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, textarea, .jia-flipbook-toolbar')) {
      return;
    }

    if (currentPage === 0) {
      e.stopPropagation();
      goNext();
    }
  });

  /* -------------------------------------------------------
     MOBILE TOUCH INTERACTION FOR COVER
  ------------------------------------------------------- */

  let coverTouchStartX = 0;
  let coverTouchStartY = 0;
  let coverTouchStartTime = 0;

  bookEl.addEventListener(
    'touchstart',
    (e) => {
      if (currentPage !== 0) return;
      const t = e.touches[0];
      if (!t) return;
      coverTouchStartX = t.clientX;
      coverTouchStartY = t.clientY;
      coverTouchStartTime = Date.now();
    },
    { passive: true }
  );

  bookEl.addEventListener(
    'touchend',
    (e) => {
      if (currentPage !== 0 || coverTouchStartTime === 0) return;
      const dt = Date.now() - coverTouchStartTime;
      coverTouchStartTime = 0;
      const t = e.changedTouches[0];
      if (!t) return;

      const dx = Math.abs(t.clientX - coverTouchStartX);
      const dy = Math.abs(t.clientY - coverTouchStartY);

      // Quick tap or swipe left on the cover opens the book
      if ((dx < 25 && dy < 25 && dt < 450) || (coverTouchStartX - t.clientX > 30)) {
        goNext();
      }
    },
    { passive: true }
  );

  /* -------------------------------------------------------
     TOOLBAR BUTTON EVENTS
  ------------------------------------------------------- */

  prevBtn?.addEventListener('click', goPrevious);
  nextBtn?.addEventListener('click', goNext);

  [prevBtn, nextBtn, fsBtn].forEach((button) => {
    if (!button) return;

    button.addEventListener('mouseenter', () => {
      if (button.disabled) return;
      gsap.to(button, { scale: 1.08, duration: 0.18, ease: 'power2.out' });
    });

    button.addEventListener('mouseleave', () => {
      gsap.to(button, { scale: 1, duration: 0.18, ease: 'power2.out' });
    });

    button.addEventListener('click', () => {
      if (button.disabled) return;
      gsap.fromTo(button, { scale: 0.92 }, { scale: 1, duration: 0.2, ease: 'back.out(2)' });
    });
  });

  /* -------------------------------------------------------
     FULLSCREEN
  ------------------------------------------------------- */

  fsBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) {
        root.requestFullscreen().catch(() => { });
      }
      root.classList.add('is-fullscreen');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => { });
      }
      root.classList.remove('is-fullscreen');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      root.classList.remove('is-fullscreen');
    }
    setTimeout(() => {
      if (typeof pageFlip.update === 'function') {
        pageFlip.update();
      }
    }, 100);
  });

  /* -------------------------------------------------------
     KEYBOARD NAVIGATION
  ------------------------------------------------------- */

  root.setAttribute('tabindex', '0');
  root.addEventListener('keydown', (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrevious();
    }
  });

  /* -------------------------------------------------------
     RESPONSIVE RESIZE
  ------------------------------------------------------- */

  function handleResize() {
    clearTimeout(root._jiaResizeTimer);
    root._jiaResizeTimer = setTimeout(() => {
      if (typeof pageFlip.update === 'function') {
        pageFlip.update();
      }
      preloadNearbyImages(images, currentPage);
    }, 150);
  }

  window.addEventListener('resize', handleResize, { passive: true });

  root._jiaPageFlip = pageFlip;
}

/* ---------------------------------------------------------
   INIT ALL FLIPBOOKS
--------------------------------------------------------- */

function initAll() {
  document.querySelectorAll('.jia-flipbook-wrap').forEach(initFlipbook);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

window.JIAFlipbookInit = initAll;
