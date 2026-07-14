import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";
import { stat } from "node:fs/promises";

type RuntimeGuardFixture = {
  runtimeGuard: void;
};

const test = base.extend<RuntimeGuardFixture>({
  runtimeGuard: [
    async ({ page }, use) => {
      const runtimeErrors: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error") {
          runtimeErrors.push(`console.error: ${message.text()}`);
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
      .getByLabel(`${label} ${positions[index]}`)
      .fill(String(entries[index]));
  }
}

async function expectNonblankCanvas(canvas: Locator) {
  await expect(canvas).toHaveAttribute("data-render-state", "static");
  await expect
    .poll(async () =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const context = element.getContext("2d");
        if (!context || element.width < 2 || element.height < 2) {
          return {
            width: element.width,
            height: element.height,
            variance: 0,
            colors: 0,
          };
        }

        const pixels = context.getImageData(
          0,
          0,
          element.width,
          element.height,
        ).data;
        const quantizedColors = new Set<string>();
        let samples = 0;
        let mean = 0;
        let squaredDelta = 0;

        for (let y = 0; y < element.height; y += 8) {
          for (let x = 0; x < element.width; x += 8) {
            const offset = (y * element.width + x) * 4;
            const red = pixels[offset] ?? 0;
            const green = pixels[offset + 1] ?? 0;
            const blue = pixels[offset + 2] ?? 0;
            const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

            samples += 1;
            const delta = luminance - mean;
            mean += delta / samples;
            squaredDelta += delta * (luminance - mean);
            quantizedColors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
          }
        }

        return {
          width: element.width,
          height: element.height,
          variance: squaredDelta / Math.max(1, samples - 1),
          colors: quantizedColors.size,
        };
      }),
    )
    .toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      variance: expect.any(Number),
      colors: expect.any(Number),
    });

  const statistics = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    if (!context) return { variance: 0, colors: 0 };
    const pixels = context.getImageData(
      0,
      0,
      element.width,
      element.height,
    ).data;
    const colors = new Set<string>();
    let samples = 0;
    let mean = 0;
    let squaredDelta = 0;

    for (let y = 0; y < element.height; y += 8) {
      for (let x = 0; x < element.width; x += 8) {
        const offset = (y * element.width + x) * 4;
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
      variance: squaredDelta / Math.max(1, samples - 1),
      colors: colors.size,
    };
  });

  expect(statistics.variance, "canvas luminance variance").toBeGreaterThan(20);
  expect(statistics.colors, "canvas quantized color count").toBeGreaterThan(12);
}

async function sampleCanvasCorner(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");
    const dpr =
      element.clientWidth > 0 ? element.width / element.clientWidth : 1;
    const coordinate = Math.min(
      element.width - 1,
      Math.max(0, Math.round(4 * dpr)),
    );
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(
      coordinate,
      coordinate,
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

test("all five navigation modules render a stable, nonblank canvas", async ({
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
    "A · v = (3, 3)",
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
  await expect(
    page.getByText(/Gram–Schmidt 逐步移除已有方向分量/),
  ).toBeVisible();
  await expect(
    page.getByText("当前度量有效，所有范数与投影均可计算。"),
  ).toBeVisible();
});

test("invalid custom basis blocks an unstable coordinate transform", async ({
  page,
}) => {
  await openModule(page, "transform");

  await page.getByRole("radio", { name: "自定义基" }).click();
  await setLabeledMatrix(page, "基矩阵", [1, 2, 2, 4]);

  await expect(page.getByTestId("formula-readout")).toContainText("A · v = —");
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

test("PNG export produces a named nonempty image", async ({ page }) => {
  await openModule(page, "transform");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("basis-lab-transform.png");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(5_000);
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
