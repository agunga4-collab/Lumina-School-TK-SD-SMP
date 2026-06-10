import html2canvas from 'html2canvas';

// Helper function to convert OKLCH to RGB/RGBA (HTML2Canvas fails on OKLCH Tailwind colors)
const oklchToRgb = (l: number, c: number, h: number, a: number = 1): string => {
  try {
    const hRad = (h * Math.PI) / 180;
    const l_ = l;
    const a_ = c * Math.cos(hRad);
    const b_ = c * Math.sin(hRad);

    const l_calc = l_ + 0.3963377774 * a_ + 0.2158037573 * b_;
    const m_calc = l_ - 0.1055613458 * a_ - 0.0638541728 * b_;
    const s_calc = l_ - 0.0894841775 * a_ - 1.291485548 * b_;

    const l_3 = l_calc * l_calc * l_calc;
    const m_3 = m_calc * m_calc * m_calc;
    const s_3 = s_calc * s_calc * s_calc;

    const r = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
    const g = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
    const b = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.707614701 * s_3;

    const f = (x: number) => {
      return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    };

    const R = Math.max(0, Math.min(255, Math.round(f(r) * 255)));
    const G = Math.max(0, Math.min(255, Math.round(f(g) * 255)));
    const B = Math.max(0, Math.min(255, Math.round(f(b) * 255)));

    return a === 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${a})`;
  } catch (e) {
    return 'rgb(120, 120, 120)';
  }
};

const replaceOklchWithRgb = (str: string): string => {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/oklch\(\s*([+-]?[\d\.]+%?)\s+([+-]?[\d\.]+%?)\s+([+-]?[\d\.]+(?:deg|rad|turn)?)(?:\s*\/\s*([+-]?[\d\.]+%?))?\s*\)/g, (match, lStr, cStr, hStr, aStr) => {
    try {
      let l = parseFloat(lStr);
      if (lStr.endsWith('%')) l /= 100;
      let c = parseFloat(cStr);
      if (cStr.endsWith('%')) c /= 100;
      let h = parseFloat(hStr);
      let a = 1;
      if (aStr) {
        a = parseFloat(aStr);
        if (aStr.endsWith('%')) a /= 100;
      }
      return oklchToRgb(l, c, h, a);
    } catch (e) {
      return 'rgb(120, 120, 120)';
    }
  });
};

const oklabToRgb = (l: number, a_: number, b_: number, a: number = 1): string => {
  try {
    const l_calc = l + 0.3963377774 * a_ + 0.2158037573 * b_;
    const m_calc = l - 0.1055613458 * a_ - 0.0638541728 * b_;
    const s_calc = l - 0.0894841775 * a_ - 1.291485548 * b_;

    const l_3 = l_calc * l_calc * l_calc;
    const m_3 = m_calc * m_calc * m_calc;
    const s_3 = s_calc * s_calc * s_calc;

    const r = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
    const g = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
    const b = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.707614701 * s_3;

    const f = (x: number) => {
      return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    };

    const R = Math.max(0, Math.min(255, Math.round(f(r) * 255)));
    const G = Math.max(0, Math.min(255, Math.round(f(g) * 255)));
    const B = Math.max(0, Math.min(255, Math.round(f(b) * 255)));

    return a === 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${a})`;
  } catch (e) {
    return 'rgb(120, 120, 120)';
  }
};

const replaceOklabWithRgb = (str: string): string => {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/oklab\(\s*([+-]?[\d\.]+%?)\s+([+-]?[\d\.]+%?)\s+([+-]?[\d\.]+%?)(?:\s*\/\s*([+-]?[\d\.]+%?))?\s*\)/g, (match, lStr, aStrVal, bStrVal, aStr) => {
    try {
      let l = parseFloat(lStr);
      if (lStr.endsWith('%')) l /= 100;
      let a_val = parseFloat(aStrVal);
      if (aStrVal.endsWith('%')) a_val /= 100;
      let b_val = parseFloat(bStrVal);
      if (bStrVal.endsWith('%')) b_val /= 100;
      let a = 1;
      if (aStr) {
        a = parseFloat(aStr);
        if (aStr.endsWith('%')) a /= 100;
      }
      return oklabToRgb(l, a_val, b_val, a);
    } catch (e) {
      return 'rgb(120, 120, 120)';
    }
  });
};

export const replaceModernColorsWithRgb = (str: string): string => {
  if (!str || typeof str !== 'string') return str;
  let result = replaceOklchWithRgb(str);
  result = replaceOklabWithRgb(result);
  return result;
};

// Function in window patcher to change computed style
export const patchWindowGetComputedStyle = (win: any) => {
  if (!win) return;
  const originalGCS = win.getComputedStyle;
  win.getComputedStyle = function (elt: any, pseudoElt: any) {
    const style = originalGCS.call(win, elt, pseudoElt);
    return new Proxy(style, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop);
        if (typeof value === 'function') {
          const bound = value.bind(target);
          if (prop === 'getPropertyValue') {
            return function (propertyName: string) {
              const val = bound(propertyName);
              if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
                return replaceModernColorsWithRgb(val);
              }
              return val;
            };
          }
          return bound;
        }
        if (typeof value === 'string' && (value.includes('oklch') || value.includes('oklab'))) {
          return replaceModernColorsWithRgb(value);
        }
        return value;
      }
    });
  };
};

export const html2canvasWithModernColors = async (element: HTMLElement, options: any = {}): Promise<HTMLCanvasElement> => {
  const originalGetComputedStyle = window.getComputedStyle;
  patchWindowGetComputedStyle(window);

  const customOnClone = options.onclone;

  const patchedOptions = {
    ...options,
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      if (clonedDoc.defaultView) {
        patchWindowGetComputedStyle(clonedDoc.defaultView);
      }

      // Search style tags in clonedDoc and replace active modern color declarations
      const styles = clonedDoc.querySelectorAll('style');
      styles.forEach(style => {
        if (style.innerHTML && (style.innerHTML.includes('oklch') || style.innerHTML.includes('oklab'))) {
          style.innerHTML = replaceModernColorsWithRgb(style.innerHTML);
        }
      });

      // Recursively traverse element children to remove modern colors from style attribute override value
      if (clonedElement) {
        const allElements = clonedElement.querySelectorAll('*');
        allElements.forEach((el: any) => {
          if (el.style) {
            for (let i = 0; i < el.style.length; i++) {
              const key = el.style[i];
              const val = el.style.getPropertyValue(key);
              if (val && (val.includes('oklch') || val.includes('oklab'))) {
                el.style.setProperty(key, replaceModernColorsWithRgb(val));
              }
            }
          }
        });
      }

      if (customOnClone) {
        customOnClone(clonedDoc, clonedElement);
      }
    }
  };

  try {
    const canvas = await html2canvas(element, patchedOptions);
    return canvas;
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
  }
};
