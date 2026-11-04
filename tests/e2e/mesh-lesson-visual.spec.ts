import { expect, test } from "@playwright/test";

const widths = [320, 375, 390, 768, 1280, 1920] as const;

for (const width of widths) for (const theme of ["light", "dark"] as const) {
  test(`RUN3A mesh ${width}px ${theme}: readable diagram and intact mathematics`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    // Keep raster typography reproducible without a remote font dependency.
    await page.route("https://fonts.googleapis.com/**", route => route.abort());
    await page.goto("/ru/topics/dc/mesh-current-method/");
    await page.locator(".level-options button").first().click();
    await expect(page.locator(".research-note")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.evaluate(() => document.fonts.ready);

    const diagram = page.locator("svg.circuit");
    await expect(diagram).toHaveAttribute("aria-label", /E₁.*E₂.*I₃/s);
    const geometry = await diagram.evaluate(svgNode => {
      const svg = svgNode as SVGSVGElement;
      const transform = svg.getScreenCTM()!;
      const texts = Array.from(svg.querySelectorAll("text"));
      const boxes = texts.map(text => ({ text: text.textContent!, box: text.getBBox(),
        font: parseFloat(getComputedStyle(text).fontSize) * transform.a }));
      const overlaps: string[] = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box, b = boxes[j].box;
        if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1
          && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1) {
          overlaps.push(`${boxes[i].text}/${boxes[j].text}`);
        }
      }
      const arrowLabelOverlaps: string[] = [];
      for (const current of ["I1", "I2"]) {
        const arrow = svg.querySelector<SVGPathElement>(`[data-loop-current="${current}"]`)!;
        const label = boxes.find(value => value.text === (current === "I1" ? "I₁" : "I₂"))!;
        for (let at = 0; at <= arrow.getTotalLength(); at += 0.5) {
          const p = arrow.getPointAtLength(at), b = label.box;
          if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) {
            arrowLabelOverlaps.push(current); break;
          }
        }
      }
      const polarity = (selector: string) => {
        const text = svg.querySelector<SVGTextElement>(selector)!;
        return { text: text.textContent, y: text.getBoundingClientRect().y };
      };
      const contrast = (a: string, b: string) => {
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255)
            .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
        return (values[1] + 0.05) / (values[0] + 0.05);
      };
      const background = getComputedStyle(svg.querySelector("rect")!).fill;
      return { minFont: Math.min(...boxes.map(value => value.font)), overlaps, arrowLabelOverlaps,
        outside: boxes.filter(({ box: b }) => b.x < 0 || b.y < 0 || b.x + b.width > 360 || b.y + b.height > 340).map(b => b.text),
        minContrast: Math.min(...texts.map(text => contrast(getComputedStyle(text).fill, background))),
        leadContrast: Array.from(svg.querySelectorAll('[data-symbol="resistor"] path')).map(path => contrast(getComputedStyle(path).stroke, background)),
        e1Top: polarity('[data-polarity="e1-top-plus"]'), e1Bottom: polarity('[data-polarity="e1-bottom-minus"]'),
        e2Top: polarity('[data-polarity="e2-top-minus"]'), e2Bottom: polarity('[data-polarity="e2-bottom-plus"]'),
        branch: svg.querySelector<SVGPathElement>('[data-branch-current="I3"]')!.getAttribute("d"),
        values: texts.map(text => text.textContent).join(" ") };
    });
    expect(geometry.minFont).toBeGreaterThanOrEqual(12);
    expect(geometry.overlaps).toEqual([]);
    expect(geometry.arrowLabelOverlaps).toEqual([]);
    expect(geometry.outside).toEqual([]);
    expect(geometry.minContrast).toBeGreaterThanOrEqual(4.5);
    expect(Math.min(...geometry.leadContrast)).toBeGreaterThanOrEqual(3);
    expect(geometry.e1Top.text).toBe("+"); expect(geometry.e1Bottom.text).toBe("−");
    expect(geometry.e2Top.text).toBe("−"); expect(geometry.e2Bottom.text).toBe("+");
    expect(geometry.e1Top.y).toBeLessThan(geometry.e1Bottom.y);
    expect(geometry.e2Top.y).toBeLessThan(geometry.e2Bottom.y);
    expect(geometry.branch).toBe("M180 224V258");
    expect(geometry.values).toContain("R₁ = 4 Ω"); expect(geometry.values).toContain("R₂ = 6 Ω");
    expect(geometry.values).toContain("E₁ = 24 V"); expect(geometry.values).toContain("E₂ = 12 V");

    const typography = await page.evaluate(() => {
      const formulas = Array.from(document.querySelectorAll<HTMLElement>(".lesson-content .formula"));
      const resultAtom = document.querySelector<HTMLElement>(".result-card .mord.mathnormal")!;
      return { pageWidth: document.documentElement.scrollWidth,
        transformed: formulas.filter(el => getComputedStyle(el).textTransform !== "none").map(el => el.textContent),
        clipped: formulas.filter(el => el.scrollWidth > el.clientWidth + 2 && el.classList.contains("formula-block")).map(el => el.textContent),
        atomDisplay: getComputedStyle(resultAtom).display, atomMargin: getComputedStyle(resultAtom).marginBottom,
        noteSize: parseFloat(getComputedStyle(document.querySelector(".research-note .katex")!).fontSize),
        result: document.querySelector(".result-card annotation")!.textContent,
        power: document.querySelector("#step-5")!.textContent };
    });
    expect(typography.pageWidth).toBeLessThanOrEqual(width);
    expect(typography.transformed).toEqual([]); expect(typography.clipped).toEqual([]);
    expect(typography.atomDisplay).toBe("inline"); expect(typography.atomMargin).toBe("0px");
    expect(typography.noteSize).toBeGreaterThanOrEqual(16);
    expect(typography.result).toContain("24"); expect(typography.result).toContain("2.18");
    expect(typography.power).toContain("150.55");

    const captureStyle = await page.addStyleTag({ content: ".astro-header { visibility: hidden !important; }" });
    try {
      for (const [name, selector] of [["circuit", ".circuit-wrap"], ["equations", "#step-3"],
        ["result", ".result-card"], ["power", "#step-5"], ["research", ".research-note"]]) {
        const region = page.locator(selector);
        // Exclude the floating global header from bounded component images; the page shell is tested separately.
        const png = await region.screenshot({ animations: "disabled" });
        await testInfo.attach(`${name}-${width}-${theme}`, { body: png, contentType: "image/png" });
        // Accepted raster baselines are Windows-specific; portable visual assertions above run everywhere.
        if (process.platform === "win32") await expect(region).toHaveScreenshot(`${name}-${width}-${theme}.png`, { animations: "disabled" });
      }
    } finally { await captureStyle.evaluate(node => node.parentNode?.removeChild(node)); }
    // Level3 contains a separate long current pair; keep that existing mode readable too.
    await page.locator(".level-options button").nth(2).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const overflow = await page.locator(".formula-block").evaluateAll(nodes => nodes.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent));
    expect(overflow).toEqual([]);
  });
}
