import { PageFlip } from 'page-flip';
import gsap from 'gsap';
import './style.css';

/**
 * JIA Flipbook
 * StPageFlip + GSAP
 *
 * Fixes:
 * - Prevents duplicate/ghost page during next flip
 * - Makes previous flip smoother
 * - Removes GSAP filter animation that can interfere with page rendering
 * - Removes parent CSS filter/drop-shadow compositing problems
 * - Prevents multiple flips from starting at the same time
 * - Preloads nearby pages
 * - Keeps soft paper/page behavior
 */

const ASPECT_RATIO = 1241 / 1754;
const FLIP_TIME = 800;
const PRELOAD_DISTANCE = 3;


/* ---------------------------------------------------------
   CREATE PAGE
--------------------------------------------------------- */

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

function isVideoSrc(src) {
  return VIDEO_EXTENSIONS.test(src);
}

function buildPageNode(src, alt, index) {
  const page = document.createElement('div');

  page.className = 'jia-fb-page';
  page.setAttribute('data-density', 'soft');
  page.setAttribute('data-page-index', String(index));

  let media;

  if (isVideoSrc(src)) {

    /*
     * Video page — autoplay, muted, loop so it
     * behaves like animated content inside the book.
     */
    media = document.createElement('video');
    media.src = src;
    media.autoplay = true;
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    media.preload = 'auto';
    media.draggable = false;

    media.setAttribute('playsinline', '');
    media.setAttribute('webkit-playsinline', '');

  } else {

    /*
     * Image page (default).
     */
    media = document.createElement('img');
    media.src = src;
    media.alt = alt || `Page ${index + 1}`;

    /*
     * We don't lazy-load flipbook pages.
     *
     * Lazy loading can cause a page to appear late while
     * the 3D animation is already running.
     */
    media.loading = 'eager';
    media.decoding = 'async';
    media.draggable = false;

  }

  const shade = document.createElement('div');
  shade.className = 'jia-fb-shade';

  page.appendChild(media);
  page.appendChild(shade);

  return page;
}


/* ---------------------------------------------------------
   PRELOAD IMAGES
--------------------------------------------------------- */

function preloadImage(src) {
  if (!src) return;

  /* Videos handle their own buffering via preload="auto" */
  if (isVideoSrc(src)) return;

  const img = new Image();
  img.decoding = 'async';
  img.src = src;
}

function preloadNearbyImages(images, currentIndex) {
  const start = Math.max(0, currentIndex - PRELOAD_DISTANCE);
  const end = Math.min(
    images.length - 1,
    currentIndex + PRELOAD_DISTANCE
  );

  for (let i = start; i <= end; i++) {
    preloadImage(images[i]);
  }
}


/* ---------------------------------------------------------
   INIT ONE FLIPBOOK
--------------------------------------------------------- */

function initFlipbook(root) {
  if (!root || root.dataset.jiaInit === '1') return;

  root.dataset.jiaInit = '1';

  let images = [];

  try {
    images = JSON.parse(
      root.getAttribute('data-images') || '[]'
    );
  } catch (error) {
    console.error(
      'JIA Flipbook: could not parse image list',
      error
    );

    return;
  }

  if (!images.length) {
    console.warn('JIA Flipbook: no images found.');
    return;
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

  const soundHintTargets =
    root.querySelectorAll('.jia-fb-hint');


  if (!stage || !bookEl) {
    console.warn(
      'JIA Flipbook: required elements are missing.'
    );

    return;
  }


  /* -------------------------------------------------------
     BASIC DATA
  ------------------------------------------------------- */

  const total = images.length;

  if (totalEl) {
    totalEl.textContent = String(total);
  }


  /* -------------------------------------------------------
     BUILD ALL PAGES
  ------------------------------------------------------- */

  images.forEach((src, index) => {
    bookEl.appendChild(
      buildPageNode(
        src,
        `JIA Guide page ${index + 1}`,
        index
      )
    );
  });


  /* -------------------------------------------------------
     PRELOAD FIRST FEW PAGES
  ------------------------------------------------------- */

  preloadNearbyImages(images, 0);


  /* -------------------------------------------------------
     CALCULATE INITIAL SIZE
  ------------------------------------------------------- */

  const containerWidth =
    stage.clientWidth || 1100;

  const baseWidth = Math.round(
    Math.min(
      containerWidth / 2,
      750
    )
  );

  const baseHeight = Math.round(
    baseWidth / ASPECT_RATIO
  );


  /* -------------------------------------------------------
     CREATE PAGEFLIP
  ------------------------------------------------------- */


  const pageFlip = new PageFlip(bookEl, {
  width: baseWidth,
  height: baseHeight,

  size: 'stretch',

  minWidth: 220,
  maxWidth: 1500,

  minHeight: 300,
  maxHeight: 2000,

  flippingTime: 800,

  /*
   * IMPORTANT
   */
  usePortrait: false,

  autoSize: true,

  drawShadow: true,
  maxShadowOpacity: 0.55,

  showCover: true,

  mobileScrollSupport: true,
  useMouseEvents: true,

  swipeDistance: 30,

  clickEventForward: true,

  disableFlipByClick: false,

  showPageCorners: true,

  startPage: 0
});

 


  /* -------------------------------------------------------
     LOAD HTML PAGES
  ------------------------------------------------------- */

  pageFlip.loadFromHTML(
    bookEl.querySelectorAll('.jia-fb-page')
  );


  /* -------------------------------------------------------
     FORCE SOFT DENSITY
  ------------------------------------------------------- */

  try {

    const pages =
      pageFlip
        .getPageCollection()
        ?.getPages() || [];

    pages.forEach((page) => {

      if (
        page &&
        typeof page.setDensity === 'function'
      ) {
        page.setDensity('soft');
      }

    });

  } catch (error) {

    console.debug(
      'JIA Flipbook: soft density configuration:',
      error
    );

  }


  /* -------------------------------------------------------
     STATE
  ------------------------------------------------------- */

  let isFlipping = false;

  let currentPage = 0;


  /* -------------------------------------------------------
     UPDATE UI
  ------------------------------------------------------- */

  function updateIndicator(pageIndex) {

    currentPage = Math.max(
      0,
      Math.min(pageIndex, total - 1)
    );

    if (currentEl) {
      currentEl.textContent =
        String(currentPage + 1);
    }

    if (prevBtn) {
      prevBtn.disabled =
        currentPage <= 0;
    }

    if (nextBtn) {
      nextBtn.disabled =
        currentPage >= total - 1;
    }

    preloadNearbyImages(
      images,
      currentPage
    );
  }


  /* -------------------------------------------------------
     BUTTON STATE
  ------------------------------------------------------- */

  function updateButtonState() {

    if (prevBtn) {
      prevBtn.disabled =
        isFlipping ||
        currentPage <= 0;
    }

    if (nextBtn) {
      nextBtn.disabled =
        isFlipping ||
        currentPage >= total - 1;
    }

  }


  /* -------------------------------------------------------
     FLIP STATE
  ------------------------------------------------------- */

  pageFlip.on('changeState', (event) => {

    const state = event.data;

    /*
     * StPageFlip exposes:
     *
     * user_fold
     * fold_corner
     * flipping
     * read
     */

    if (state === 'flipping') {

      isFlipping = true;

      root.classList.remove('jia-cover-view');

      root.classList.add(
        'jia-is-flipping'
      );

      updateButtonState();

    }

    if (state === 'read') {

      isFlipping = false;

      root.classList.remove(
        'jia-is-flipping'
      );

      updateButtonState();
    }

  });


  /* -------------------------------------------------------
     PAGE CHANGED
  ------------------------------------------------------- */

  pageFlip.on('flip', (event) => {

    const pageIndex = Number(event.data);

    updateIndicator(pageIndex);

    /*
     * COVER VIEW LOGIC
     *
     * Keep the original initial-cover behavior.
     *
     * When the user returns to page 1 using the
     * Previous button, restore the same cover state.
     *
     * This removes the book shadow and restores the
     * cover positioning only when page 1 is actually reached.
     */

    if (pageIndex === 0) {

        root.classList.add(
            'jia-cover-view'
        );

    } else {

        root.classList.remove(
            'jia-cover-view'
        );

    }

    /*
     * IMPORTANT:
     *
     * No GSAP filter/transform is applied here.
     *
     * PageFlip is already doing the 3D transformation.
     * Adding another filter/transform at this point can
     * create a temporary duplicate/compositing artifact.
     */

});

  /* -------------------------------------------------------
     INITIALIZATION
  ------------------------------------------------------- */

  pageFlip.on('init', () => {

    updateIndicator(0);

    isFlipping = false;

    updateButtonState();


    /* Remove loader */

    if (loader) {

      gsap.to(loader, {

        opacity: 0,

        duration: 0.35,

        ease: 'power2.out',

        onComplete: () => {

          if (loader) {
            loader.remove();
          }

        }

      });

    }


    /* -----------------------------------------------------
       ENTRANCE ANIMATION
    ----------------------------------------------------- */

    gsap.fromTo(

      bookEl,

      {
        opacity: 0,
        y: 35,
        scale: 0.97
      },

      {
        opacity: 1,
        y: 0,
        scale: 1,

        duration: 0.8,

        ease: 'power3.out',

        clearProps: 'transform,opacity'
      }

    );


    /* -----------------------------------------------------
       CORNER HINT
    ----------------------------------------------------- */

    const cornerHint =
      root.querySelector(
        '.jia-fb-corner-hint'
      );

    if (soundHintTargets.length) {

      gsap.fromTo(

        soundHintTargets,

        {
          opacity: 0
        },

        {
          opacity: 1,

          duration: 0.5,

          delay: 0.7,

          ease: 'power2.out'
        }

      );

    }

    if (cornerHint) {

      gsap.to(

        cornerHint,

        {
          x: -12,

          duration: 0.75,

          delay: 1,

          repeat: 3,

          yoyo: true,

          ease: 'power1.inOut'
        }

      );

    }

  });


  /* -------------------------------------------------------
     SAFE NEXT FLIP
  ------------------------------------------------------- */

  function goNext() {

    if (isFlipping) return;

    if (currentPage >= total - 1) {
      return;
    }

    preloadNearbyImages(
      images,
      currentPage + 1
    );

    pageFlip.flipNext();

  }


  /* -------------------------------------------------------
     SAFE PREVIOUS FLIP
  ------------------------------------------------------- */

  function goPrevious() {

    if (isFlipping) return;

    if (currentPage <= 0) {
      return;
    }

    preloadNearbyImages(
      images,
      currentPage - 1
    );

    pageFlip.flipPrev();

  }


  /* -------------------------------------------------------
     BUTTON EVENTS
  ------------------------------------------------------- */

  prevBtn?.addEventListener(
    'click',
    goPrevious
  );

  nextBtn?.addEventListener(
    'click',
    goNext
  );


  /* -------------------------------------------------------
     BUTTON HOVER
  ------------------------------------------------------- */

  [prevBtn, nextBtn, fsBtn].forEach(
    (button) => {

      if (!button) return;

      button.addEventListener(
        'mouseenter',
        () => {

          if (
            button.disabled
          ) {
            return;
          }

          gsap.to(
            button,
            {
              scale: 1.08,
              duration: 0.18,
              ease: 'power2.out'
            }
          );

        }
      );


      button.addEventListener(
        'mouseleave',
        () => {

          gsap.to(
            button,
            {
              scale: 1,
              duration: 0.18,
              ease: 'power2.out'
            }
          );

        }
      );


      button.addEventListener(
        'click',
        () => {

          if (
            button.disabled
          ) {
            return;
          }

          gsap.fromTo(

            button,

            {
              scale: 0.92
            },

            {
              scale: 1,
              duration: 0.2,
              ease: 'back.out(2)'
            }

          );

        }
      );

    }
  );


  /* -------------------------------------------------------
     FULLSCREEN
  ------------------------------------------------------- */

  fsBtn?.addEventListener(
    'click',
    () => {

      if (!document.fullscreenElement) {

        if (root.requestFullscreen) {

          root
            .requestFullscreen()
            .catch(() => {});

        }

        root.classList.add(
          'is-fullscreen'
        );

      } else {

        if (document.exitFullscreen) {

          document
            .exitFullscreen()
            .catch(() => {});

        }

        root.classList.remove(
          'is-fullscreen'
        );

      }

    }
  );


  /* -------------------------------------------------------
     FULLSCREEN CHANGE
  ------------------------------------------------------- */

  document.addEventListener(
    'fullscreenchange',
    () => {

      if (
        !document.fullscreenElement
      ) {

        root.classList.remove(
          'is-fullscreen'
        );

      }


      /*
       * Give the browser a moment to update
       * the fullscreen dimensions before
       * asking PageFlip to recalculate.
       */

      setTimeout(() => {

        if (
          typeof pageFlip.update ===
          'function'
        ) {

          pageFlip.update();

        }

      }, 100);

    }
  );


  /* -------------------------------------------------------
     KEYBOARD NAVIGATION
  ------------------------------------------------------- */

  root.setAttribute(
    'tabindex',
    '0'
  );

  root.addEventListener(
    'keydown',
    (event) => {

      /*
       * Don't interfere with form inputs.
       */

      const tag =
        event.target?.tagName;

      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT'
      ) {
        return;
      }


      if (
        event.key === 'ArrowRight'
      ) {

        event.preventDefault();

        goNext();

      }


      if (
        event.key === 'ArrowLeft'
      ) {

        event.preventDefault();

        goPrevious();

      }

    }
  );


  /* -------------------------------------------------------
     RESPONSIVE RESIZE
  ------------------------------------------------------- */

  function handleResize() {

    clearTimeout(
      root._jiaResizeTimer
    );

    root._jiaResizeTimer =
      setTimeout(() => {

        if (
          typeof pageFlip.update ===
          'function'
        ) {

          pageFlip.update();

        }

        preloadNearbyImages(
          images,
          currentPage
        );

      }, 180);

  }


  window.addEventListener(
    'resize',
    handleResize,
    { passive: true }
  );


  /* -------------------------------------------------------
     STORE INSTANCE
  ------------------------------------------------------- */

  root._jiaPageFlip = pageFlip;

}


/* ---------------------------------------------------------
   INIT ALL FLIPBOOKS
--------------------------------------------------------- */

function initAll() {

  document
    .querySelectorAll(
      '.jia-flipbook-wrap'
    )
    .forEach(initFlipbook);

}


/* ---------------------------------------------------------
   DOM READY
--------------------------------------------------------- */

if (
  document.readyState ===
  'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    initAll
  );

} else {

  initAll();

}


/*
 * Allow Elementor/AJAX/etc. to manually
 * initialize newly inserted flipbooks.
 */

window.JIAFlipbookInit = initAll;









// import gsap from 'gsap';
// import './style.css';

// /**
//  * JIA Flipbook — StPageFlip + GSAP powered 3D flipbook.
//  * Every element carrying the class "jia-flipbook-wrap" on the page is
//  * turned into an independent flipbook instance, so the [jia_flipbook]
//  * shortcode can safely be used more than once on the same page.
//  */

// const ASPECT_RATIO = 1241 / 1754; // matches the source page images (portrait A4-like)

// function buildPageNode(src, alt, index, total) {
//   const page = document.createElement('div');
//   page.className = 'jia-fb-page';
//   page.setAttribute('data-density', 'soft');

//   const img = document.createElement('img');
//   img.src = src;
//   img.alt = alt || `Page ${index + 1}`;
//   img.loading = index < 2 ? 'eager' : 'lazy';
//   img.draggable = false;

//   const shade = document.createElement('div');
//   shade.className = 'jia-fb-shade';

//   page.appendChild(img);
//   page.appendChild(shade);
//   return page;
// }

// function initFlipbook(root) {
//   if (!root || root.dataset.jiaInit === '1') return;
//   root.dataset.jiaInit = '1';

//   let images = [];
//   try {
//     images = JSON.parse(root.getAttribute('data-images') || '[]');
//   } catch (e) {
//     console.error('JIA Flipbook: could not parse image list', e);
//     return;
//   }
//   if (!images.length) return;

//   const stage = root.querySelector('.jia-flipbook-stage');
//   const bookEl = root.querySelector('.jia-flipbook-book');
//   const loader = root.querySelector('.jia-flipbook-loader');
//   const currentEl = root.querySelector('.jia-fb-current');
//   const totalEl = root.querySelector('.jia-fb-total');
//   const prevBtn = root.querySelector('.jia-fb-prev');
//   const nextBtn = root.querySelector('.jia-fb-next');
//   const fsBtn = root.querySelector('.jia-fb-fullscreen');
//   const soundHintTargets = root.querySelectorAll('.jia-fb-hint');

//   const total = images.length;
//   if (totalEl) totalEl.textContent = String(total);

//   // Build page DOM nodes up front with soft flexible paper density.
//   images.forEach((src, i) => {
//     bookEl.appendChild(buildPageNode(src, `JIA Guide page ${i + 1}`, i, total));
//   });

//   // Compute a sensible starting size from the container while keeping
//   // the true page aspect ratio; StPageFlip will keep it responsive.
//   const containerWidth = stage.clientWidth || 900;
//   const baseWidth = Math.min(containerWidth / 2, 620); // single-page width (book shows 2 pages)
//   const baseHeight = Math.round(baseWidth / ASPECT_RATIO);

//   const pageFlip = new PageFlip(bookEl, {
//     width: baseWidth,
//     height: baseHeight,
//     size: 'stretch',
//     minWidth: 220,
//     maxWidth: 1000,
//     minHeight: 300,
//     maxHeight: 1400,
//     maxShadowOpacity: 0.7,
//     showCover: true,
//     mobileScrollSupport: true,
//     useMouseEvents: true,
//     flippingTime: 950,
//     usePortrait: true,
//     autoSize: true,
//     drawShadow: true,
//     showPageCorners: true,
//     swipeDistance: 30,
//     clickEventForward: true,
//     disableFlipByClick: false,
//   });

//   pageFlip.loadFromHTML(bookEl.querySelectorAll('.jia-fb-page'));

//   // Ensure all pages (including covers) use soft density for smooth corner tilt & peel animation
//   try {
//     const pages = pageFlip.getPageCollection()?.getPages() || [];
//     pages.forEach((p) => {
//       p.setDensity('soft');
//     });
//   } catch (err) {
//     console.debug('Soft density configuration:', err);
//   }

//   const updateIndicator = (pageIndex) => {
//     if (currentEl) currentEl.textContent = String(Math.min(pageIndex + 1, total));
//     if (prevBtn) prevBtn.disabled = pageIndex <= 0;
//     if (nextBtn) nextBtn.disabled = pageIndex >= total - 1;
//   };

//   pageFlip.on('flip', (e) => {
//     updateIndicator(e.data);
//     gsap.fromTo(
//       root.querySelectorAll('.jia-fb-page.--current, .jia-fb-page.--right, .jia-fb-page.--left'),
//       { filter: 'brightness(0.94)' },
//       { filter: 'brightness(1)', duration: 0.35, ease: 'power2.out' }
//     );
//   });

//   pageFlip.on('init', () => {
//     updateIndicator(0);
//     if (loader) {
//       gsap.to(loader, {
//         opacity: 0,
//         duration: 0.4,
//         onComplete: () => loader.remove(),
//       });
//     }

//     // Entrance animation for the whole book.
//     gsap.fromTo(
//       bookEl,
//       { opacity: 0, y: 50, scale: 0.94, rotateX: 8 },
//       {
//         opacity: 1,
//         y: 0,
//         scale: 1,
//         rotateX: 0,
//         duration: 1,
//         ease: 'power3.out',
//         clearProps: 'transform',
//       }
//     );

//     // A gentle "come flip me" hint on the corner of the first page.
//     gsap.fromTo(
//       soundHintTargets,
//       { opacity: 0 },
//       { opacity: 1, duration: 0.6, delay: 0.8 }
//     );
//     gsap.to(root.querySelector('.jia-fb-corner-hint'), {
//       x: -18,
//       duration: 0.9,
//       delay: 1.1,
//       repeat: 3,
//       yoyo: true,
//       ease: 'power1.inOut',
//     });
//   });

//   // Toolbar interactions.
//   prevBtn?.addEventListener('click', () => pageFlip.flipPrev());
//   nextBtn?.addEventListener('click', () => pageFlip.flipNext());

//   [prevBtn, nextBtn, fsBtn].forEach((btn) => {
//     if (!btn) return;
//     btn.addEventListener('mouseenter', () =>
//       gsap.to(btn, { scale: 1.12, duration: 0.2, ease: 'power2.out' })
//     );
//     btn.addEventListener('mouseleave', () =>
//       gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power2.out' })
//     );
//     btn.addEventListener('click', () =>
//       gsap.fromTo(btn, { scale: 0.85 }, { scale: 1, duration: 0.25, ease: 'back.out(3)' })
//     );
//   });

//   fsBtn?.addEventListener('click', () => {
//     if (!document.fullscreenElement) {
//       root.requestFullscreen?.().catch(() => {});
//       root.classList.add('is-fullscreen');
//     } else {
//       document.exitFullscreen?.();
//       root.classList.remove('is-fullscreen');
//     }
//   });

//   document.addEventListener('fullscreenchange', () => {
//     if (!document.fullscreenElement) root.classList.remove('is-fullscreen');
//     setTimeout(() => pageFlip.updateFromHtml?.(root.querySelectorAll('.jia-fb-page')), 50);
//   });

//   // Keyboard navigation when the flipbook has focus.
//   root.setAttribute('tabindex', '0');
//   root.addEventListener('keydown', (evt) => {
//     if (evt.key === 'ArrowRight') pageFlip.flipNext();
//     if (evt.key === 'ArrowLeft') pageFlip.flipPrev();
//   });

//   // Keep StPageFlip responsive on resize.
//   window.addEventListener('resize', () => {
//     clearTimeout(root._jiaResizeTimer);
//     root._jiaResizeTimer = setTimeout(() => {
//       pageFlip.update();
//     }, 150);
//   });
// }

// function initAll() {
//   document.querySelectorAll('.jia-flipbook-wrap').forEach(initFlipbook);
// }

// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', initAll);
// } else {
//   initAll();
// }

// // Re-scan in case content is injected later (e.g. Elementor/AJAX loaded pages).
// window.JIAFlipbookInit = initAll;
