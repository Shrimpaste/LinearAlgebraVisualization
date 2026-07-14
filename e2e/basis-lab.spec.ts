import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";

type RuntimeGuardFixture = {
  runtimeGuard: void;
};

const webglProbeWarning =
  /^\[\.WebGL-[^\]]+\]GL Driver Message \([^)]*\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/;

const test = base.extend<RuntimeGuardFixture>({
  runtimeGuard: [
    async ({ page }, use) => {
      const runtimeErrors: string[] = [];

      page.on("console", (message) => {
        if (
          message.type() === "warning" &&
          webglProbeWarning.test(message.text())
        ) {
          return;
        }
        if (message.type() === "error" || message.type() === "warning") {
          runtimeErrors.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        runtimeErrors.push(`pageerror: ${error.stack ?? error.message}`);
      });

      await use();

      expect(
        runtimeErrors,
        `Unexpected browser runtime errors:\n${runtimeErrors.join("\n\n")}`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

const modules = [
  { id: "span", label: "向量张成", heading: "向量张成" },
  { id: "transform", label: "线性变换", heading: "线性变换" },
  { id: "eigen", label: "特征系统", heading: "特征系统" },
  { id: "inner-product", label: "内积空间", heading: "内积空间" },
  { id: "determinant", label: "行列式", heading: "行列式" },
  { id: "operator", label: "谱分解", heading: "谱分解" },
  {
    id: "decomposition",
    label: "矩阵分解",
    heading: "奇异值与极分解",
  },
] as const;

function result(page: Page, key: string): Locator {
  return page
    .getByTestId("result-value")
    .and(page.locator(`[data-result="${key}"]`));
}

async function openModule(page: Page, id: string) {
  await page.goto(`/#${id}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`[data-module="${id}"]`)).toBeVisible();
  await expect(page.getByTestId("visualization-stage")).toHaveAttribute(
    "data-render-state",
    "static",
  );
}

async function setMatrix(
  page: Page,
  entries: readonly [number, number, number, number],
) {
  const cells = page.getByTestId("matrix-cell");
  await expect(cells).toHaveCount(4);
  for (let index = 0; index < entries.length; index += 1) {
    await cells.nth(index).fill(String(entries[index]));
  }
}

async function setLabeledMatrix(
  page: Page,
  label: string,
  entries: readonly [number, number, number, number],
) {
  const positions = [
    "第一行第一列",
    "第一行第二列",
    "第二行第一列",
    "第二行第二列",
  ] as const;

  for (let index = 0; index < positions.length; index += 1) {
    await page
      .getByLabel(`${label} ${positions[index]}`, { exact: true })
      .fill(String(entries[index]));
  }
}

async function setMatrixCells(
  page: Page,
  testId: string,
  entries: readonly number[],
) {
  const cells = page.getByTestId(testId);
  await expect(cells).toHaveCount(entries.length);
  for (let index = 0; index < entries.length; index += 1) {
    await cells.nth(index).fill(String(entries[index]));
  }
}

async function setComplexLabeledMatrix(
  page: Page,
  label: string,
  entries: readonly { real: number; imag: number }[],
) {
  const positions = [
    "第一行第一列",
    "第一行第二列",
    "第二行第一列",
    "第二行第二列",
  ] as const;
  expect(entries).toHaveLength(positions.length);
  for (let index = 0; index < positions.length; index += 1) {
    const entry = entries[index]!;
    await page
      .getByLabel(`${label} ${positions[index]} 实部`, { exact: true })
      .fill(String(entry.real));
    await page
      .getByLabel(`${label} ${positions[index]} 虚部`, { exact: true })
      .fill(String(entry.imag));
  }
}

function axiom(page: Page, id: string) {
  return page
    .getByTestId("axiom-check")
    .and(page.locator(`[data-axiom="${id}"]`));
}

async function expectNonblankCanvas(canvas: Locator) {
  await expect(canvas).toHaveAttribute("data-render-state", "static");
  const readStatistics = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const width = element.width;
      const height = element.height;
      if (width < 2 || height < 2) {
        return { width, height, variance: 0, colors: 0 };
      }

      const scale = Math.min(1, 160 / width, 160 / height);
      const sampleWidth = Math.max(2, Math.round(width * scale));
      const sampleHeight = Math.max(2, Math.round(height * scale));
      const sample = document.createElement("canvas");
      sample.width = sampleWidth;
      sample.height = sampleHeight;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return { width, height, variance: 0, colors: 0 };

      context.drawImage(element, 0, 0, sampleWidth, sampleHeight);
      const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      const colors = new Set<string>();
      let samples = 0;
      let mean = 0;
      let squaredDelta = 0;

      for (let y = 0; y < sampleHeight; y += 2) {
        for (let x = 0; x < sampleWidth; x += 2) {
          const offset = (y * sampleWidth + x) * 4;
          const red = pixels[offset] ?? 0;
          const green = pixels[offset + 1] ?? 0;
          const blue = pixels[offset + 2] ?? 0;
          const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          samples += 1;
          const delta = luminance - mean;
          mean += delta / samples;
          squaredDelta += delta * (luminance - mean);
          colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
        }
      }

      return {
        width,
        height,
        variance: squaredDelta / Math.max(1, samples - 1),
        colors: colors.size,
      };
    });

  await expect
    .poll(async () => (await readStatistics()).variance)
    .toBeGreaterThan(20);
  const statistics = await readStatistics();
  expect(statistics.width).toBeGreaterThan(100);
  expect(statistics.height).toBeGreaterThan(100);
  expect(statistics.variance, "canvas luminance variance").toBeGreaterThan(20);
  expect(statistics.colors, "canvas quantized color count").toBeGreaterThan(12);
}

async function webglStatistics(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!context) {
      return { width: 0, height: 0, variance: 0, colors: 0, error: -1 };
    }

    const width = context.drawingBufferWidth;
    const height = context.drawingBufferHeight;
    const scale = Math.min(1, 160 / width, 160 / height);
    const sampleWidth = Math.max(2, Math.round(width * scale));
    const sampleHeight = Math.max(2, Math.round(height * scale));
    const sample = document.createElement("canvas");
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    if (!sampleContext) {
      return { width, height, variance: 0, colors: 0, error: -1 };
    }
    sampleContext.drawImage(element, 0, 0, sampleWidth, sampleHeight);
    const pixels = sampleContext.getImageData(
      0,
      0,
      sampleWidth,
      sampleHeight,
    ).data;
    const colors = new Set<string>();
    let samples = 0;
    let mean = 0;
    let squaredDelta = 0;

    for (let y = 0; y < sampleHeight; y += 2) {
      for (let x = 0; x < sampleWidth; x += 2) {
        const offset = (y * sampleWidth + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        samples += 1;
        const delta = luminance - mean;
        mean += delta / samples;
        squaredDelta += delta * (luminance - mean);
        colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
      }
    }

    return {
      width,
      height,
      variance: squaredDelta / Math.max(1, samples - 1),
      colors: colors.size,
      error: context.getError(),
    };
  });
}

async function expectNonblankWebGLCanvas(canvas: Locator) {
  await expect(canvas).toHaveAttribute("data-render-state", "static");
  await expect
    .poll(async () => (await webglStatistics(canvas)).variance)
    .toBeGreaterThan(1);
  const statistics = await webglStatistics(canvas);
  expect(statistics.width).toBeGreaterThan(100);
  expect(statistics.height).toBeGreaterThan(100);
  expect(statistics.colors).toBeGreaterThan(8);
  expect(statistics.error).toBe(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function sampleCanvasCorner(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const dpr =
      element.clientWidth > 0 ? element.width / element.clientWidth : 1;
    const coordinate = Math.min(
      element.width - 1,
      Math.max(0, Math.round(4 * dpr)),
    );
    const sample = document.createElement("canvas");
    sample.width = 1;
    sample.height = 1;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D sample context is unavailable");
    context.drawImage(element, coordinate, coordinate, 1, 1, 0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(
      0,
      0,
      1,
      1,
    ).data;
    return { red, green, blue, alpha };
  });
}

function colorDistance(
  first: Awaited<ReturnType<typeof sampleCanvasCorner>>,
  second: Awaited<ReturnType<typeof sampleCanvasCorner>>,
) {
  return Math.hypot(
    first.red - second.red,
    first.green - second.green,
    first.blue - second.blue,
  );
}

test("all seven navigation modules render a stable, nonblank canvas", async ({
  page,
}) => {
  await openModule(page, "transform");

  for (const module of modules) {
    await page.getByRole("button", { name: module.label }).click();
    await expect(page).toHaveURL(new RegExp(`#${module.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: module.heading }),
    ).toBeVisible();
    await expect(page.locator(`[data-module="${module.id}"]`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: module.label }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "导出 PNG" })).toBeVisible();
    await expectNonblankCanvas(page.getByTestId("visualization-stage-canvas"));
  }
});

test("transform matrix edits update the exact mapped vector result", async ({
  page,
}) => {
  await openModule(page, "transform");

  await setMatrix(page, [2, 0, 0, 3]);

  await expect(result(page, "determinant")).toHaveText("6");
  await expect(result(page, "trace")).toHaveText("5");
  await expect(result(page, "rank")).toHaveText("2");
  await expect(result(page, "output")).toHaveText("(3, 3)");
  await expect(page.getByTestId("formula-readout")).toContainText(
    "T · v = (3, 3)",
  );

  const firstCell = page.getByLabel("变换矩阵 第一行第一列");
  await firstCell.selectText();
  await firstCell.pressSequentially("-");
  await expect(firstCell).toHaveValue("-");
  await firstCell.pressSequentially("2");
  await expect(firstCell).toHaveValue("-2");
  await firstCell.press("Enter");
  await expect(result(page, "determinant")).toHaveText("-6");
  await expect(result(page, "output")).toHaveText("(-3, 3)");
});

test("3x2 transform renders WebGL pixels and keeps the full timeline contract", async ({
  page,
}) => {
  await openModule(page, "transform");

  await page.getByRole("combobox", { name: "输出行数" }).selectOption("3");
  await page.getByRole("combobox", { name: "输入列数" }).selectOption("2");
  await setMatrixCells(page, "matrix-cell", [2, 0, 0, 3, 2, 3]);
  await page.getByLabel("v x 分量", { exact: true }).fill("1");
  await page.getByLabel("v y 分量", { exact: true }).fill("1");

  await expect(result(page, "output")).toHaveText("(2, 3, 5)");
  const stage = page.getByTestId("visualization-stage");
  const canvas = page.getByTestId("visualization-stage-canvas");
  const playback = page.getByTestId("visualization-stage-playback");
  const scrubber = page.getByTestId("visualization-stage-scrubber");
  await expectNonblankWebGLCanvas(canvas);

  await playback.click();
  await expect(stage).toHaveAttribute("data-playback-state", "playing");
  await playback.click();
  await expect(stage).toHaveAttribute("data-playback-state", "paused");
  await scrubber.fill("0.42");
  await expect(scrubber).toHaveValue("0.42");
  await expect(canvas).toHaveAttribute("data-progress", "0.4200");
  await page.getByRole("button", { name: "重置相机" }).click();
  await page.getByTestId("visualization-stage-rewind").click();
  await expect(scrubber).toHaveValue("0");
  await expectNoHorizontalOverflow(page);
});

test("transform inverse gating and independent domain/codomain bases stay exact", async ({
  page,
}) => {
  await openModule(page, "transform");
  await setMatrix(page, [2, 0, 0, 4]);
  await page.getByLabel("v x 分量", { exact: true }).fill("4");
  await page.getByLabel("v y 分量", { exact: true }).fill("8");

  const inverse = page.getByRole("radio", { name: "逆向 T⁻¹" });
  await expect(inverse).toBeEnabled();
  await inverse.click();
  await expect(result(page, "output")).toHaveText("(2, 2)");

  await setMatrix(page, [1, 2, 2, 4]);
  await expect(inverse).toBeDisabled();
  await expect(page.getByRole("radio", { name: "正向 T" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(result(page, "output")).toHaveText("(20, 40)");

  await setMatrix(page, [1, 0, 0, 1]);
  await page.getByRole("radio", { name: "自定义基" }).click();
  await setMatrixCells(page, "domain-basis-cell", [2, 0, 0, 1]);
  await setMatrixCells(page, "codomain-basis-cell", [1, 0, 0, 3]);
  await page.getByLabel("v x 分量", { exact: true }).fill("1.5");
  await page.getByLabel("v y 分量", { exact: true }).fill("1");
  await expect(result(page, "output")).toHaveText("(0.75, 3)");
  await expect(page.getByTestId("formula-readout")).toContainText(
    "T · v = (0.75, 3)",
  );
});

test("editable transform composition applies the first map before the second", async ({
  page,
}) => {
  await openModule(page, "transform");
  await page.getByRole("radio", { name: "顺序复合" }).click();
  await setMatrix(page, [2, 0, 0, 1]);
  await setMatrixCells(page, "composition-matrix-cell", [1, 1, 0, 1]);
  await page.getByLabel("v x 分量", { exact: true }).fill("1");
  await page.getByLabel("v y 分量", { exact: true }).fill("2");

  await expect(result(page, "output")).toHaveText("(4, 2)");
  await expect(page.getByText("标准坐标复合 T₂ ∘ T₁")).toBeVisible();
  const scrubber = page.getByTestId("visualization-stage-scrubber");
  await scrubber.fill("0.5");
  await expect(page.getByTestId("visualization-stage-canvas")).toHaveAttribute(
    "data-progress",
    "0.5000",
  );
  await expect(page.getByTestId("visualization-stage-canvas")).toHaveAttribute(
    "data-transform-output",
    "2,2",
  );
  await expectNonblankCanvas(page.getByTestId("visualization-stage-canvas"));

  await page.getByLabel("v x 分量", { exact: true }).fill("4");
  await page.getByRole("radio", { name: "逆向 T⁻¹" }).click();
  await expect(result(page, "output")).toHaveText("(1, 2)");

  await page.getByRole("combobox", { name: "输出行数" }).selectOption("3");
  await page.getByRole("combobox", { name: "输入列数" }).selectOption("3");
  await page.getByRole("radio", { name: "顺序复合" }).click();
  await expectNonblankWebGLCanvas(
    page.getByTestId("visualization-stage-canvas"),
  );
  await page.getByTestId("visualization-stage-scrubber").fill("0.5");
  await expect(page.getByTestId("visualization-stage-canvas")).toHaveAttribute(
    "data-progress",
    "0.5000",
  );
  await expect(page.getByTestId("visualization-stage-canvas")).toHaveAttribute(
    "data-transform-output",
    "8,2,0.5",
  );
});

test("determinant presets and column operations preserve signed-area rules", async ({
  page,
}) => {
  await openModule(page, "determinant");

  await page.getByRole("button", { name: "面积 ×2" }).click();
  await expect(result(page, "determinant")).toHaveText("2");
  await expect(result(page, "area")).toHaveText("2");
  await expect(result(page, "orientation")).toHaveText("正向");

  await page.getByRole("button", { name: "交换两列" }).click();
  await expect(result(page, "determinant")).toHaveText("-2");
  await expect(result(page, "area")).toHaveText("2");
  await expect(result(page, "orientation")).toHaveText("反向");

  await page.getByRole("button", { name: "a₂ += a₁" }).click();
  await expect(result(page, "determinant")).toHaveText("-2");
  await expect(result(page, "area")).toHaveText("2");
});

test("eigen complex preset reports the lack of real eigenvectors", async ({
  page,
}) => {
  await openModule(page, "eigen");

  await page.getByRole("button", { name: "纯旋转" }).click();

  await expect(result(page, "trace")).toHaveText("0");
  await expect(result(page, "determinant")).toHaveText("1");
  await expect(result(page, "discriminant")).toHaveText("-4");
  await expect(page.getByTestId("formula-readout")).toContainText("共轭复根");
  await expect(
    page.getByText("判别式小于零，实数域内没有特征向量。"),
  ).toBeVisible();
});

test("eigen basis changes use a similarity transform and reject a degenerate B", async ({
  page,
}) => {
  await openModule(page, "eigen");
  await page.getByRole("radio", { name: "自定义基" }).click();
  await setLabeledMatrix(page, "特征坐标基", [1, 1, 0, 1]);

  await expect(result(page, "eigen-basis-determinant")).toHaveText("1");
  await expect(result(page, "eigen-basis-rank")).toHaveText("2");
  await expect(result(page, "eigen-coordinate-matrix")).toHaveText(
    "[[1, 0], [1, 3]]",
  );
  await expect(result(page, "eigenvector-1-standard")).toBeVisible();
  await expect(result(page, "eigenvector-1-basis")).not.toHaveText("—");
  await expectNonblankCanvas(page.getByTestId("visualization-stage-canvas"));

  await setLabeledMatrix(page, "特征坐标基", [1, 2, 2, 4]);
  await expect(result(page, "eigen-basis-rank")).toHaveText("1");
  await expect(result(page, "eigen-coordinate-matrix")).toHaveText("—");
  await expect(
    page.getByText("B 的列向量线性相关，无法生成 [T]_B 与基坐标特征向量。"),
  ).toBeVisible();
});

test("dependent span preset is classified as a line instead of a basis", async ({
  page,
}) => {
  await openModule(page, "span");

  await page.getByRole("button", { name: "同一直线" }).click();

  await expect(result(page, "rank")).toHaveText("1");
  await expect(result(page, "determinant")).toHaveText("0");
  await expect(result(page, "classification")).toHaveText("一条直线");
  await expect(page.getByText("当前向量组不是 R² 的基。")).toBeVisible();
});

test("span vector groups expose every vector and select a stable basis", async ({
  page,
}) => {
  await openModule(page, "span");
  await page.getByRole("button", { name: "冗余生成组" }).click();

  await expect(page.getByRole("combobox", { name: "向量数量" })).toHaveValue(
    "4",
  );
  await expect(result(page, "rank")).toHaveText("2");
  await expect(result(page, "basis-indices")).toHaveText("v₂, v₄");
  await expect(result(page, "classification")).toHaveText("整个平面 R²");
  await expect(page.getByLabel("v₄ x 分量", { exact: true })).toBeVisible();
  await expectNonblankCanvas(page.getByTestId("visualization-stage-canvas"));

  await page.getByRole("combobox", { name: "向量数量" }).selectOption("6");
  await expect(page.getByLabel("v₆ y 分量", { exact: true })).toBeVisible();
});

test("inner-product metric and Gram-Schmidt mode remain synchronized", async ({
  page,
}) => {
  await openModule(page, "inner-product");

  await page
    .getByRole("combobox", { name: "内积度量" })
    .selectOption("x-weighted");
  await expect(result(page, "inner-product")).toHaveText("6.867");
  await expect(page.getByLabel("度量矩阵 第一行第一列")).toHaveValue("2.2");
  await expect(page.getByLabel("度量矩阵 第二行第二列")).toHaveValue("0.7");

  const gramSchmidt = page.getByRole("radio", { name: "Gram–Schmidt" });
  await gramSchmidt.click();
  await expect(gramSchmidt).toHaveAttribute("aria-checked", "true");
  await expect(result(page, "gram-rank")).toHaveText("2");
  await expect(
    page.getByText("当前度量有效，所有范数与投影均可计算。"),
  ).toBeVisible();

  await page.getByLabel("u x 分量", { exact: true }).fill("0");
  await page.getByLabel("u y 分量", { exact: true }).fill("0");
  await page.getByLabel("v x 分量", { exact: true }).fill("0");
  await page.getByLabel("v y 分量", { exact: true }).fill("2");
  await expect(result(page, "gram-rank")).toHaveText("1");
});

test("complex custom Gram matrices expose all four independent axiom certificates", async ({
  page,
}) => {
  await openModule(page, "inner-product");
  await page.getByRole("radio", { name: "复数 C" }).click();
  await page.getByRole("combobox", { name: "内积度量" }).selectOption("custom");
  await setComplexLabeledMatrix(page, "度量矩阵", [
    { real: 2, imag: 0 },
    { real: 0.25, imag: 0.55 },
    { real: 0.25, imag: -0.55 },
    { real: 2.4, imag: 0 },
  ]);

  for (const id of ["positive", "additivity", "homogeneity", "conjugate"]) {
    await expect(axiom(page, id)).toHaveAttribute("data-passed", "true");
  }
  await expect(page.getByTestId("formula-readout")).toContainText(
    "四条公理成立",
  );

  await page
    .getByLabel("度量矩阵 第二行第一列 虚部", { exact: true })
    .fill("0.55");
  await expect(axiom(page, "positive")).toHaveAttribute("data-passed", "false");
  await expect(axiom(page, "conjugate")).toHaveAttribute(
    "data-passed",
    "false",
  );
  await expect(axiom(page, "additivity")).toHaveAttribute(
    "data-passed",
    "true",
  );
  await expect(axiom(page, "homogeneity")).toHaveAttribute(
    "data-passed",
    "true",
  );
  await expect(page.getByTestId("formula-readout")).toContainText("G 无效");

  await page.getByRole("radio", { name: "实数 R" }).click();
  await page
    .getByRole("combobox", { name: "内积度量" })
    .selectOption("x-weighted");
  await expect(result(page, "inner-product")).toHaveText("6.867");
  await expect(axiom(page, "positive")).toHaveAttribute("data-passed", "true");
});

test("invalid custom basis blocks an unstable coordinate transform", async ({
  page,
}) => {
  await openModule(page, "transform");

  await page.getByRole("radio", { name: "自定义基" }).click();
  await setLabeledMatrix(page, "基矩阵", [1, 2, 2, 4]);

  await expect(page.getByTestId("formula-readout")).toContainText("T · v = —");
  await expect(page.getByTestId("formula-readout")).toContainText("换基不可用");
  await expect(result(page, "rank")).toHaveText("—");
  await expect(result(page, "output")).toHaveText("—");
  await expect(
    page.getByText("基向量线性相关或数值上过度病态，无法稳定建立坐标映射。"),
  ).toBeVisible();
});

test("repeated and defective eigen presets expose their distinct geometry", async ({
  page,
}) => {
  await openModule(page, "eigen");

  await page.getByRole("button", { name: "重根" }).click();
  await expect(page.getByTestId("formula-readout")).toContainText(
    "重根 · 全方向",
  );
  await expect(page.getByTestId("formula-readout")).toContainText(
    "λ = 1.4（二重）",
  );

  await page.getByRole("button", { name: "缺陷矩阵" }).click();
  await expect(page.getByTestId("formula-readout")).toContainText(
    "重根 · 单一方向",
  );
  await expect(
    page.getByText("仅有一个线性无关特征向量，矩阵不可对角化。"),
  ).toBeVisible();
});

test("invalid metric disables inner-product results", async ({ page }) => {
  await openModule(page, "inner-product");

  await page.getByRole("combobox", { name: "内积度量" }).selectOption("custom");
  await setLabeledMatrix(page, "度量矩阵", [1, 2, 2, 1]);

  await expect(page.getByTestId("formula-readout")).toContainText("G 无效");
  await expect(result(page, "inner-product")).toHaveText("未定义");
  await expect(result(page, "norm-u")).toHaveText("—");
  await expect(page.getByText("当前 G 不是对称正定矩阵。")).toBeVisible();
});

test("spectral module separates self-adjoint, normal, and non-normal operators", async ({
  page,
}) => {
  await openModule(page, "operator");

  await expect(result(page, "operator-class")).toHaveText("self-adjoint");
  await expect(page.getByTestId("formula-readout")).toContainText("A = U Λ U*");
  await expect(
    page.getByText("重构、正交与特征方程残差均已通过验证。"),
  ).toBeVisible();

  await page.getByRole("button", { name: "实旋转" }).click();
  await expect(result(page, "operator-class")).toHaveText("normal");
  await expect(page.getByTestId("formula-readout")).toContainText("A = U Λ U*");
  await expect(result(page, "reconstruction-residual")).toBeVisible();

  await page.getByRole("radio", { name: "复数 C", exact: true }).click();
  await page.getByRole("combobox", { name: "空间维数" }).selectOption("3");
  const factor = page.locator(".operator-spectrum__factor");
  await expect(factor).toBeVisible();
  const factorDimensions = await factor.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
    matrix: element.querySelector(".matrix-editor")?.getBoundingClientRect()
      .width,
  }));
  expect(factorDimensions.scroll).toBeLessThanOrEqual(
    factorDimensions.client + 1,
  );
  expect(factorDimensions.matrix ?? Infinity).toBeLessThanOrEqual(
    factorDimensions.client,
  );

  await page.getByRole("button", { name: "非 normal 剪切" }).click();
  await expect(result(page, "operator-class")).toHaveText("非 normal");
  await expect(page.getByTestId("formula-readout")).toContainText("A*A ≠ AA*");
  await expect(
    page.getByText("A*A 与 AA* 不一致，当前算子不存在酉谱分解。"),
  ).toBeVisible();
});

test("SVD and right-polar stages cover wide, tall, and rank-deficient maps", async ({
  page,
}) => {
  await openModule(page, "decomposition");

  await page.getByRole("button", { name: "宽矩阵" }).click();
  await expect(page.getByRole("combobox", { name: "输出行数" })).toHaveValue(
    "2",
  );
  await expect(page.getByRole("combobox", { name: "输入列数" })).toHaveValue(
    "3",
  );
  await expect(result(page, "rank")).toHaveText("2");
  await expect(page.getByTestId("visualization-stage-canvas")).toHaveAttribute(
    "data-playback-state",
    "playing",
  );
  await expectNonblankWebGLCanvas(
    page.getByTestId("visualization-stage-canvas"),
  );

  for (const label of ["Vᵀ 对齐", "Σ 伸缩", "U 输出"]) {
    const stage = page.getByRole("radio", { name: label });
    await stage.click();
    await expect(stage).toHaveAttribute("aria-checked", "true");
  }

  await page.getByRole("radio", { name: "右极 A = QP" }).click();
  await expect(page.getByTestId("formula-readout")).toContainText("A = Q P");
  for (const label of ["P 伸缩", "Q 定向", "QP 重构"]) {
    const stage = page.getByRole("radio", { name: label });
    await stage.click();
    await expect(stage).toHaveAttribute("aria-checked", "true");
  }

  await page.getByRole("button", { name: "高矩阵" }).click();
  await expect(page.getByRole("combobox", { name: "输出行数" })).toHaveValue(
    "3",
  );
  await expect(page.getByRole("combobox", { name: "输入列数" })).toHaveValue(
    "2",
  );
  await expectNonblankWebGLCanvas(
    page.getByTestId("visualization-stage-canvas"),
  );

  await page.getByRole("button", { name: "秩亏" }).click();
  await expect(result(page, "rank")).toHaveText("1");
  const inspector = page.getByRole("complementary", {
    name: "奇异值与极分解参数面板",
  });
  await expect(
    inspector.getByText(
      "Q 是 partial isometry；矩形或秩亏情形下该因子并不唯一。",
    ),
  ).toBeVisible();
  await expectNonblankCanvas(page.getByTestId("visualization-stage-canvas"));
});

test("zero span and determinant collapse retain their boundary semantics", async ({
  page,
}) => {
  await openModule(page, "span");
  await page.getByRole("button", { name: "两个零向量" }).click();

  await expect(result(page, "rank")).toHaveText("0");
  await expect(result(page, "classification")).toHaveText("原点");
  await expect(page.getByText("当前向量组不是 R² 的基。")).toBeVisible();

  await openModule(page, "determinant");
  await page.getByRole("button", { name: "坍缩" }).click();

  await expect(result(page, "determinant")).toHaveText("0");
  await expect(result(page, "rank")).toHaveText("1");
  await expect(result(page, "orientation")).toHaveText("无定向");
  await expect(
    page.getByText("列向量线性相关，二维面积被压缩到零。"),
  ).toBeVisible();
});

test("scene edits persist across reloads", async ({ page }) => {
  await openModule(page, "transform");
  await setMatrix(page, [2, 0, 0, 3]);
  await expect(result(page, "output")).toHaveText("(3, 3)");

  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.getByLabel("变换矩阵 第一行第一列")).toHaveValue("2");
  await expect(page.getByLabel("变换矩阵 第二行第二列")).toHaveValue("3");
  await expect(result(page, "determinant")).toHaveText("6");
  await expect(result(page, "output")).toHaveText("(3, 3)");
});

test("PNG export produces a named image with a valid IHDR", async ({
  page,
}) => {
  await openModule(page, "transform");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("basis-lab-transform.png");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const image = await readFile(downloadPath!);
  expect([...image.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  expect(image.toString("ascii", 12, 16)).toBe("IHDR");
  expect(image.readUInt32BE(16)).toBeGreaterThan(0);
  expect(image.readUInt32BE(20)).toBeGreaterThan(0);
});

test("timeline supports replay, pause, and exact scrubbing", async ({
  page,
}) => {
  await openModule(page, "transform");

  const stage = page.getByTestId("visualization-stage");
  const canvas = page.getByTestId("visualization-stage-canvas");
  const playback = page.getByTestId("visualization-stage-playback");
  const scrubber = page.getByTestId("visualization-stage-scrubber");

  await expect(scrubber).toHaveValue("1");
  await playback.click();
  await expect(stage).toHaveAttribute("data-playback-state", "playing");
  await expect(canvas).toHaveAttribute("data-render-state", "animating");

  await playback.click();
  await expect(stage).toHaveAttribute("data-playback-state", "paused");

  await scrubber.fill("0.42");
  await expect(scrubber).toHaveValue("0.42");
  await expect(canvas).toHaveAttribute("data-progress", "0.4200");
  await expect(stage).toHaveAttribute("data-render-state", "static");

  await page.getByTestId("visualization-stage-rewind").click();
  await expect(scrubber).toHaveValue("0");
  await expect(canvas).toHaveAttribute("data-progress", "0.0000");
});

test("theme toggle updates the document theme and retains core actions", async ({
  page,
}) => {
  await openModule(page, "transform");

  const canvas = page.getByTestId("visualization-stage-canvas");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const lightCorner = await sampleCanvasCorner(canvas);
  await page.getByRole("button", { name: "切换深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "切换浅色主题" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "导出 PNG" })).toBeVisible();
  await expect
    .poll(async () =>
      colorDistance(lightCorner, await sampleCanvasCorner(canvas)),
    )
    .toBeGreaterThan(80);
  const darkCorner = await sampleCanvasCorner(canvas);
  expect(darkCorner.alpha).toBe(255);
  expect(colorDistance(lightCorner, darkCorner)).toBeGreaterThan(80);
  await expectNonblankCanvas(canvas);
});

test("canvas contracts after a live desktop-to-mobile resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openModule(page, "transform");

  const canvas = page.getByTestId("visualization-stage-canvas");
  const desktopHeight = await canvas.evaluate(
    (element: HTMLCanvasElement) => element.clientHeight,
  );
  expect(desktopHeight).toBeGreaterThan(500);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => element.clientHeight),
    )
    .toBeLessThanOrEqual(390);

  const resized = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="visualization-stage-canvas"]',
    );
    if (!canvas)
      throw new Error("Visualization canvas is missing after resize");
    return {
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });

  expect(resized.canvasWidth).toBe(390);
  expect(resized.canvasHeight).toBeGreaterThanOrEqual(340);
  expect(resized.canvasHeight).toBeLessThanOrEqual(390);
  expect(resized.canvasHeight).toBeLessThan(desktopHeight - 150);
  expect(resized.documentWidth).toBeLessThanOrEqual(resized.viewportWidth + 1);
  expect(resized.bodyWidth).toBeLessThanOrEqual(resized.viewportWidth + 1);
});

test("every module avoids document-level horizontal overflow", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  for (const module of modules) {
    await openModule(page, module.id);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));

    expect(
      dimensions.document,
      `${module.id} document width at ${testInfo.project.name}`,
    ).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(
      dimensions.body,
      `${module.id} body width at ${testInfo.project.name}`,
    ).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});

test("mobile deep links reveal the active tab without changing page scroll", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");

  const activeTabPosition = (id: string) =>
    page.evaluate((sceneId) => {
      const navigation = document.querySelector<HTMLElement>(".scene-nav");
      const active = navigation?.querySelector<HTMLElement>(
        `[data-scene-id="${sceneId}"]`,
      );
      if (!navigation || !active) return null;
      const navigationRect = navigation.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      return {
        visible:
          activeRect.left >= navigationRect.left - 1 &&
          activeRect.right <= navigationRect.right + 1,
        navigationScrollLeft: navigation.scrollLeft,
        windowScrollY: window.scrollY,
      };
    }, id);

  for (const id of ["operator", "decomposition"]) {
    await openModule(page, id);
    await expect
      .poll(async () => (await activeTabPosition(id))?.visible)
      .toBe(true);
    expect((await activeTabPosition(id))?.navigationScrollLeft).toBeGreaterThan(
      0,
    );
    expect((await activeTabPosition(id))?.windowScrollY).toBe(0);
  }

  await page.evaluate(() => window.scrollTo(0, 260));
  const beforeSceneChange = await page.evaluate(() => window.scrollY);
  await page
    .getByRole("button", { name: "谱分解" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('[data-module="operator"]')).toBeVisible();
  await expect
    .poll(async () => (await activeTabPosition("operator"))?.visible)
    .toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeSceneChange);
});
