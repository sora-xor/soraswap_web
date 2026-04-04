const BUTTON_SELECTOR = '.button, .mobile-swap-fab, .subtab, .nav-link';
const HOTSPOT_MARGIN = 56;
const CLEANUP_KEY = '__soraswapLiquidButtonsCleanup__';

declare global {
  interface Window {
    __soraswapLiquidButtonsCleanup__?: () => void;
  }
}

let lavaLampId = 0;

const sharedSeed = {
  timingScale: 0.92 + Math.random() * 0.22
};

const lavaSvgTemplate = `
<svg class="lava-lamp__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="lava-__ID__" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f45878">
        <animate attributeName="stop-color" values="#f45878;#ff7e98;#f45878" dur="7s" repeatCount="indefinite" />
      </stop>
      <stop offset="52%" stop-color="#d81c4e">
        <animate attributeName="stop-color" values="#d81c4e;#f13f68;#d81c4e" dur="7s" repeatCount="indefinite" />
      </stop>
      <stop offset="100%" stop-color="#a40522">
        <animate attributeName="stop-color" values="#a40522;#c10b2d;#a40522" dur="7s" repeatCount="indefinite" />
      </stop>
    </linearGradient>

    <filter id="goo-__ID__" x="-30%" y="-40%" width="160%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9"
        result="goo"
      />
      <feComposite in="SourceGraphic" in2="goo" operator="atop" />
    </filter>

    <filter id="glow-__ID__" x="-40%" y="-50%" width="180%" height="200%">
      <feGaussianBlur stdDeviation="6" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="ripples-__ID__" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="8" result="noise">
        <animate attributeName="baseFrequency" values="0.8;1.1;0.85" dur="9s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G">
        <animate attributeName="scale" values="1.8;2.6;2;2.4;1.8" dur="12s" repeatCount="indefinite" />
      </feDisplacementMap>
    </filter>

    <linearGradient id="sheen-__ID__" x1="-120" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="rgba(255,255,255,0)" />
      <stop offset="42%" stop-color="rgba(255,232,238,0.26)" />
      <stop offset="50%" stop-color="rgba(255,255,255,0.58)" />
      <stop offset="58%" stop-color="rgba(255,210,220,0.3)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
      <animateTransform attributeName="gradientTransform" type="translate" values="-120 0;120 0;-120 0" dur="6s" repeatCount="indefinite" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="100" height="60" rx="30" ry="30" fill="url(#lava-__ID__)" opacity="0.16" />
  <rect x="-10" y="-10" width="120" height="80" rx="40" ry="40" fill="rgba(208,34,67,0.24)" filter="url(#glow-__ID__)" opacity="0.48" />

  <g filter="url(#goo-__ID__)">
    <g filter="url(#ripples-__ID__)">
      <circle cx="20" cy="52" r="20" fill="url(#lava-__ID__)">
        <animate attributeName="cy" values="52;18;52" keyTimes="0;0.48;1" dur="7.2s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
        <animate attributeName="cx" values="18;36;28;20" keyTimes="0;0.35;0.7;1" dur="8.1s" repeatCount="indefinite" />
        <animate attributeName="r" values="20;28;20" keyTimes="0;0.5;1" dur="7.2s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
      </circle>

      <circle cx="84" cy="14" r="18" fill="url(#lava-__ID__)" opacity="0.94">
        <animate attributeName="cy" values="14;48;14" keyTimes="0;0.5;1" dur="6.8s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
        <animate attributeName="cx" values="84;66;92;84" keyTimes="0;0.3;0.72;1" dur="7.6s" repeatCount="indefinite" />
        <animate attributeName="r" values="18;25;18" keyTimes="0;0.5;1" dur="6.8s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
      </circle>

      <circle cx="52" cy="30" r="16" fill="url(#lava-__ID__)" opacity="0.9">
        <animate attributeName="cy" values="30;44;22;30" keyTimes="0;0.3;0.7;1" dur="8.6s" calcMode="spline" keySplines="0.42 0 0.58 1;0.25 0.1 0.25 1;0.42 0 0.58 1" repeatCount="indefinite" />
        <animate attributeName="cx" values="52;44;60;52" keyTimes="0;0.3;0.7;1" dur="8.8s" repeatCount="indefinite" />
        <animate attributeName="r" values="16;22;16" keyTimes="0;0.5;1" dur="8.6s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
      </circle>

      <circle cx="72" cy="56" r="14" fill="url(#lava-__ID__)" opacity="0.88">
        <animate attributeName="cy" values="56;24;56" keyTimes="0;0.5;1" dur="7.9s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
        <animate attributeName="cx" values="72;86;62;72" keyTimes="0;0.3;0.72;1" dur="9.2s" repeatCount="indefinite" />
        <animate attributeName="r" values="14;20;14" keyTimes="0;0.5;1" dur="7.9s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
      </circle>

      <circle cx="10" cy="60" r="0" fill="url(#lava-__ID__)" opacity="0.85">
        <animate attributeName="cy" values="60;38;18;60" keyTimes="0;0.3;0.55;1" dur="6.4s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
        <animate attributeName="r" values="0;9;0;0" keyTimes="0;0.35;0.55;1" dur="6.4s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite" />
      </circle>
    </g>
  </g>

  <ellipse cx="24" cy="10" rx="16" ry="6" fill="rgba(255,238,244,0.28)">
    <animate attributeName="opacity" values="0.28;0.1;0.28" dur="4.6s" repeatCount="indefinite" />
  </ellipse>
  <ellipse cx="78" cy="38" rx="12" ry="5" fill="rgba(255,228,236,0.22)">
    <animate attributeName="opacity" values="0.22;0.08;0.22" dur="5.2s" repeatCount="indefinite" />
  </ellipse>

  <g style="mix-blend-mode:screen">
    <rect x="-120" y="0" width="240" height="60" rx="30" ry="30" fill="url(#sheen-__ID__)" opacity="0.58" />
  </g>
</svg>`;

const getDirectChild = (button: HTMLElement, className: string): HTMLElement | null =>
  Array.from(button.children).find((child) => child.classList.contains(className)) as HTMLElement | null;

const removeDirectChild = (button: HTMLElement, className: string) => {
  getDirectChild(button, className)?.remove();
};

const seedLiquidRadius = (button: HTMLElement) => {
  if (button.dataset.liquidRadius === 'true') return;
  const radius = window.getComputedStyle(button).borderRadius;
  if (radius) {
    button.style.setProperty('--liquid-radius', radius);
  }
  button.dataset.liquidRadius = 'true';
};

const ensureReflection = (button: HTMLElement) => {
  if (getDirectChild(button, 'reflection')) return;
  const reflection = document.createElement('span');
  reflection.className = 'reflection';
  reflection.setAttribute('aria-hidden', 'true');
  button.prepend(reflection);
};

const parseSvgMarkup = (markup: string): SVGSVGElement | null => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(markup, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    svg.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
    return document.importNode(svg, true) as SVGSVGElement;
  } catch {
    return null;
  }
};

const buildLavaLamp = (): HTMLSpanElement => {
  const lamp = document.createElement('span');
  lamp.className = 'lava-lamp';
  lamp.setAttribute('aria-hidden', 'true');

  const id = ++lavaLampId;
  const timingScale = sharedSeed.timingScale * (0.9 + Math.random() * 0.24);
  const turbulenceSeed = Math.floor(1 + Math.random() * 9000);

  let svg = lavaSvgTemplate.replace(/__ID__/g, String(id));
  svg = svg.replace(/seed="8"/g, `seed="${turbulenceSeed}"`);
  svg = svg.replace(/dur="([0-9.]+)s"/g, (_match, duration: string) => {
    const jitter = 0.92 + Math.random() * 0.2;
    const scaled = (Number.parseFloat(duration) * timingScale * jitter).toFixed(2);
    return `dur="${scaled}s"`;
  });

  let animationIndex = 0;
  svg = svg.replace(/<(animate(?:Transform)?)(\s)/g, (_match, tag: string, spacing: string) => {
    const offset = -(Math.random() * 4 + animationIndex * 0.12).toFixed(2);
    animationIndex += 1;
    return `<${tag} begin="${offset}s"${spacing}`;
  });

  const svgNode = parseSvgMarkup(svg);
  if (svgNode) {
    lamp.appendChild(svgNode);
  }

  return lamp;
};

const ensureLavaLamp = (button: HTMLElement, reducedMotion: boolean) => {
  if (reducedMotion) {
    removeDirectChild(button, 'lava-lamp');
    return;
  }

  if (getDirectChild(button, 'lava-lamp')) return;
  button.prepend(buildLavaLamp());
};

const seedButton = (button: HTMLElement, reducedMotion: boolean) => {
  seedLiquidRadius(button);
  button.classList.add('lava-lamp-btn');
  ensureReflection(button);
  ensureLavaLamp(button, reducedMotion);
};

const hydrateButtons = (root: ParentNode, reducedMotion: boolean) => {
  if (root instanceof HTMLElement && root.matches(BUTTON_SELECTOR)) {
    seedButton(root, reducedMotion);
  }

  if ('querySelectorAll' in root) {
    root.querySelectorAll<HTMLElement>(BUTTON_SELECTOR).forEach((button) => seedButton(button, reducedMotion));
  }
};

export const initLiquidButtons = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  window[CLEANUP_KEY]?.();

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => reducedMotionQuery.matches;
  const root = document.getElementById('app') ?? document.body;

  let animationFrame = 0;
  let pointerX = 0;
  let pointerY = 0;

  const applyHotspot = () => {
    animationFrame = 0;
    document.querySelectorAll<HTMLElement>(BUTTON_SELECTOR).forEach((button) => {
      const rect = button.getBoundingClientRect();
      const withinX = pointerX >= rect.left - HOTSPOT_MARGIN && pointerX <= rect.right + HOTSPOT_MARGIN;
      const withinY = pointerY >= rect.top - HOTSPOT_MARGIN && pointerY <= rect.bottom + HOTSPOT_MARGIN;
      if (!withinX || !withinY) return;
      button.style.setProperty('--x', `${pointerX - rect.left}px`);
      button.style.setProperty('--y', `${pointerY - rect.top}px`);
    });
  };

  const handlePointerMove = (event: PointerEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!animationFrame) {
      animationFrame = window.requestAnimationFrame(applyHotspot);
    }
  };

  const syncButtons = () => hydrateButtons(root, reducedMotion());

  const observer = new MutationObserver((mutations) => {
    const isReducedMotion = reducedMotion();
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          hydrateButtons(node, isReducedMotion);
        }
      });
    });
  });

  const handleReducedMotionChange = () => syncButtons();

  syncButtons();
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange);

  const cleanup = () => {
    observer.disconnect();
    window.removeEventListener('pointermove', handlePointerMove);
    reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };

  window[CLEANUP_KEY] = cleanup;
  return cleanup;
};
