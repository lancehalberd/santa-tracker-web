import {LitElement, html} from "lit-element";
import styles from './modvil-module.css';
import {_static} from '../../../src/magic.js';
import {loadAnimation} from '../../../src/deps/lottie.js';


const noop = () => {};


class ModvilModuleConstructor extends LitElement {
  static get styles() { return [styles]; }

  static get properties() {
    return {
      color: {type: String},   // default color before assets load
      parts: {type: String},   // parts config, comma-separated
      mode: {type: String},    // "mobile", "small" or ""
      load: {type: Boolean},   // whether to load at all (unset for offscreen)
      ratio: {type: Number},   // numeric ratio
    };
  }

  constructor() {
    super();

    this.parts = '';
    this.mode = '';
    this.ratio = null;
    this.load = false;

    this._partsCache = [];
  }

  _loadPart(type, index) {
    const layer = null; // -(1000 - index);

    const id = this.id;
    const base = _static`scenes/modvil/img/modules/` + id;

    switch (type) {
      case 'static-png':
      case 'static-svg': {
        const ext = type.split('-')[1];
        const img = document.createElement('img');
        img.src = `${base}/${index}.${ext}`;
        img.style.zIndex = layer;
        img.className = 'loading';
        img.onload = () => img.classList.remove('loading');
        return {node: img, ratio: noop};
      }

      case 'mobile': {
        // There's only one mobile image per module.
        const img = document.createElement('img');
        img.src = `${base}/mobile.png`;
        img.style.zIndex = layer;
        img.className = 'loading mobile';
        img.onload = () => img.classList.remove('loading');
        return {node: img, ratio: noop};
      }

      case 'loop':
      case 'scroll': {
        // lit-element or Lottie needs this to be wrapped in something, so use unstyled `<div>`.
        const container = document.createElement('div');
        const options = {
          container,
          loop: (type === 'loop'),
          rendererSettings: {
            // Important; aligns SVG in center even if too small.
            preserveAspectRatio: 'xMidYMid slice',
          },
        };
        const anim = loadAnimation(`${base}/${index}.json`, options);
        const node = anim.renderer.svgElement;
        node.style.zIndex = layer;
        node.classList.add('loading');
        anim.addEventListener('DOMLoaded', () => node.classList.remove('loading'));

        anim.onEnterFrame = (e) => {
          this.dispatchEvent(new CustomEvent('anim', {
            detail: {index, currentTime: e.currentTime},
            bubbles: true,
          }));
        };

        let ratio;

        if (type === 'scroll') {
          // When scrolling, the ratio being passed sets the actual target frame.
          ratio = (v) => {
            if (v === null) {
              return;  // made hidden, do nothing for now
            }
            const frames = anim.getDuration(true);
            const frame = Math.min(frames, Math.max(0.0, frames * v));
            anim.goToAndStop(frame, true);
          };
        } else {
          // For a loop animation, just stop it when it's out of frame.
          ratio = (v) => {
            const visible = (v !== null);
            if (visible === anim.isPaused) {
              visible ? anim.play() : anim.pause();
            }
          };
        }

        return {node: container, ratio};
      }
    }

    throw new TypeError(`unsupported part type: ${type}`);
  }

  shouldUpdate(changedProperties) {
    if (changedProperties.has('ratio')) {
      this._partsCache.forEach((part) => {
        if (!part.cache) {
          part.ratio(this.ratio);
        }
      });

      // ... if only ratio was changed, no need to use lit to re-render
      if (changedProperties.size === 1) {
        return false;
      }
    }

    // If any of these three properties change, do loading-fu...
    const anyOf = ['parts', 'mode', 'load'];
    if (!anyOf.some((x) => changedProperties.has(x))) {
      return true;
    }

    let parts = [];

    // Determine parts to load. This could be empty if not lazy-loaded yet.
    if (this.load) {
      parts = this.parts ? this.parts.split(',').map((x) => x.trim()) : [];

      // In small mode, don't load anything but static-... files.
      if (this.mode === 'small') {
//        parts = parts.map((x) => x.startsWith('static-') ? x : null);
      }

      // In mobile mode, don't load anything, but push the mobile PNG at the end.
      if (this.mode === 'mobile' && !this.desktop) {
        parts = parts.map((x) => null);
        parts.push('mobile');
      }
    }

    // Now, reconcile with cache, clearing or loading as needed.
    const largest = Math.max(parts.length, this._partsCache.length);
    for (let i = 0; i < largest; ++i) {
      const want = parts[i] || null;

      if (!this._partsCache[i]) {
        this._partsCache[i] = {
          part: null,
          cache: false,
          node: null,
          ratio: noop,
        };
      }
      const c = this._partsCache[i];

      // All good, already have this part.
      if (c.part === want) {
        if (c.cache) {
          c.cache = false;
          c.ratio(this.ratio);
        }
        continue;
      }

      // Existing part doesn't match.
      if (c.part) {
        if (want === null) {
          // do nothing, just mark as cached: won't be rendered
          c.cache = true;
          c.ratio(null);  // out-of-frame
          continue;
        }
        throw new TypeError(`can't change type of modvil-module: ${want}`);
      }

      // We don't have a part, but we want it. Load it! \o/
      const {node, ratio} = this._loadPart(want, i);
      c.node = node;
      c.ratio = ratio;
      c.part = want;
      c.ratio(this.ratio);
    }

    return true;
  }

  render() {
    const mainStyle = `background-color: ${this.color || 'transparent'}`;

    // Render real parts that are not cached.
    const parts = this._partsCache.map(({node, cache}) => cache ? null : node).filter(Boolean);
    return html`
<main style=${mainStyle}>
  ${parts}
  <div class="cards">
    <slot></slot>
  </div>
</main>
    `;
  }
}


customElements.define('modvil-module', ModvilModuleConstructor);